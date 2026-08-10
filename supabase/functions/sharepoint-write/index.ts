// Server-side Graph proxy for TopRentals (Fase 3): SharePoint write-back PLUS outbound
// mail. Runs server-side because the MS Graph client secret can't reach the browser.
// `verify_jwt` stays on (Supabase default) — only authenticated app users can invoke this
// function. Kept the name `sharepoint-write` (renaming would change the deploy target
// already handed to ops) even though it now also sends mail.
//
// Body: { action: 'articulo-upsert' | 'unidad-ventilacion' | 'send-mail', payload: {...} }
// HTTP shape (token -> resolve site -> resolve list -> create/update) is the exact
// pattern proven against 99.ABM_Articulos — see _shared/sp-graph.ts. Do not invent a
// different auth or endpoint shape.
import { createGraphClient, GraphError, type GraphClient } from '../_shared/sp-graph.ts';

const SP_LIST_ARTICULOS = '99.ABM_Articulos';
const SP_LIST_UNIDADES = '99.ABM_TipoUnidades';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

// CORS: the app calls this from the browser via supabase.functions.invoke, so every response —
// including the preflight OPTIONS and the error paths — must carry these headers, or the browser
// blocks the response and supabase-js surfaces it as "Failed to send a request to the Edge Function".
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function graphErrorResponse(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  // Log the full Graph/Azure error — the HTTP body alone isn't captured in Supabase's function
  // logs, so without this line a 502/500 is opaque. This is what tells us the REAL status: 403
  // (permission) vs 400 (bad request/field) vs a sender-mailbox problem vs a token failure.
  console.error('[sharepoint-write] Graph call failed:', message);
  if (err instanceof GraphError) return jsonResponse({ error: message }, 502);
  return jsonResponse({ error: message }, 500);
}

/** Resolves the Graph client + site + list id needed to write to `displayName`. Fresh per call — no
 * cross-request caching, so a renamed/moved list is picked up without redeploying the function. */
async function resolveList(displayName: string): Promise<{ siteId: string; listId: string; graph: GraphClient }> {
  const graph = createGraphClient({
    tenantId: requireEnv('MS_TENANT_ID'),
    clientId: requireEnv('MS_CLIENT_ID'),
    clientSecret: requireEnv('MS_CLIENT_SECRET'),
  });
  const siteId = await graph.resolveSiteId(requireEnv('SP_SITE_URL'));
  const listId = await graph.resolveListId(siteId, displayName);
  return { siteId, listId, graph };
}

interface ArticuloUpsertPayload {
  sp_id?: number;
  codigo: string | null;
  nombre: string;
  precio_unitario: number | null;
  corte: number | null;
  status: 'Activo' | 'Inactivo';
  detalle: string | null;
}

function validateArticuloUpsert(payload: unknown): ArticuloUpsertPayload | null {
  if (!isRecord(payload)) return null;
  const { sp_id, codigo, nombre, precio_unitario, corte, status, detalle } = payload;
  if (typeof nombre !== 'string' || !nombre.trim()) return null;
  if (status !== 'Activo' && status !== 'Inactivo') return null;
  if (sp_id !== undefined && typeof sp_id !== 'number') return null;
  if (codigo !== undefined && codigo !== null && typeof codigo !== 'string') return null;
  if (precio_unitario !== undefined && precio_unitario !== null && typeof precio_unitario !== 'number') return null;
  if (corte !== undefined && corte !== null && typeof corte !== 'number') return null;
  if (detalle !== undefined && detalle !== null && typeof detalle !== 'string') return null;
  return {
    sp_id,
    codigo: codigo ?? null,
    nombre,
    precio_unitario: precio_unitario ?? null,
    corte: corte ?? null,
    status,
    detalle: detalle ?? null,
  };
}

async function handleArticuloUpsert(rawPayload: unknown): Promise<Response> {
  const payload = validateArticuloUpsert(rawPayload);
  if (!payload) return jsonResponse({ error: 'payload invalido para articulo-upsert' }, 400);

  const fields: Record<string, unknown> = {
    Codigo_AR: payload.codigo,
    Articulo_AR: payload.nombre,
    // PA: Concat_AR = txt_Nro_ART & " - " & txt_nombre_ART. Drives SharePoint's own article
    // search and the per-article document-folder path — the Hotel app relies on it, so it must
    // never be left blank when this app creates/edits an article.
    Concat_AR: `${payload.codigo ?? ''} - ${payload.nombre}`,
    PrecioUnitario_AR: payload.precio_unitario == null ? null : String(payload.precio_unitario),
    Corte_AR: payload.corte == null ? null : String(payload.corte),
    Status_AR: payload.status,
    Detalle_AR: payload.detalle,
  };

  const { siteId, listId, graph } = await resolveList(SP_LIST_ARTICULOS);
  if (payload.sp_id != null) {
    await graph.updateItem(siteId, listId, payload.sp_id, fields);
    return jsonResponse({ id: payload.sp_id });
  }
  const created = await graph.createItem(siteId, listId, { ...fields, Title: '[sumar]' });
  return jsonResponse({ id: Number(created.id) });
}

interface UnidadVentilacionPayload {
  unidad_id: number;
  requiere_ventilacion: boolean;
  frecuencia_dias?: number;
}

function validateUnidadVentilacion(payload: unknown): UnidadVentilacionPayload | null {
  if (!isRecord(payload)) return null;
  const { unidad_id, requiere_ventilacion, frecuencia_dias } = payload;
  if (typeof unidad_id !== 'number') return null;
  if (typeof requiere_ventilacion !== 'boolean') return null;
  if (frecuencia_dias !== undefined && typeof frecuencia_dias !== 'number') return null;
  return { unidad_id, requiere_ventilacion, frecuencia_dias };
}

async function handleUnidadVentilacion(rawPayload: unknown): Promise<Response> {
  const payload = validateUnidadVentilacion(rawPayload);
  if (!payload) return jsonResponse({ error: 'payload invalido para unidad-ventilacion' }, 400);

  const fields: Record<string, unknown> = {
    Ventilacion_ABMUnid: payload.requiere_ventilacion ? 'SI' : 'NO',
  };
  if (payload.frecuencia_dias !== undefined) fields.Frecuencia_ABMUnid = payload.frecuencia_dias;

  const { siteId, listId, graph } = await resolveList(SP_LIST_UNIDADES);
  await graph.updateItem(siteId, listId, payload.unidad_id, fields);
  return jsonResponse({ ok: true });
}

interface SendMailPayload {
  to: string[];
  subject: string;
  html: string;
}

function validateSendMail(payload: unknown): SendMailPayload | null {
  if (!isRecord(payload)) return null;
  const { to, subject, html } = payload;
  if (!Array.isArray(to) || !to.every((v) => typeof v === 'string')) return null;
  if (typeof subject !== 'string') return null;
  if (typeof html !== 'string') return null;
  return { to, subject, html };
}

/** NOTIFICATIONS_BCC is optional, ';' or ',' separated. */
function bccFromEnv(): string[] {
  const raw = Deno.env.get('NOTIFICATIONS_BCC');
  if (!raw) return [];
  return raw
    .split(/[;,]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

async function handleSendMail(rawPayload: unknown): Promise<Response> {
  const payload = validateSendMail(rawPayload);
  if (!payload) return jsonResponse({ error: 'payload invalido para send-mail' }, 400);

  const bcc = bccFromEnv();
  if (payload.to.length === 0 && bcc.length === 0) return jsonResponse({ ok: true });

  const graph = createGraphClient({
    tenantId: requireEnv('MS_TENANT_ID'),
    clientId: requireEnv('MS_CLIENT_ID'),
    clientSecret: requireEnv('MS_CLIENT_SECRET'),
  });
  await graph.sendMail(requireEnv('MAIL_SENDER'), payload.to, bcc, payload.subject, payload.html);
  return jsonResponse({ ok: true });
}

Deno.serve(async (req) => {
  // CORS preflight — the browser sends OPTIONS before the real POST; answer it with the CORS
  // headers (204, no body). Without this the preflight got a 405 and the POST was never sent.
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'Body JSON invalido' }, 400);
  }
  if (!isRecord(body) || typeof body.action !== 'string') {
    return jsonResponse({ error: 'Body debe incluir { action, payload }' }, 400);
  }

  try {
    switch (body.action) {
      case 'articulo-upsert':
        return await handleArticuloUpsert(body.payload);
      case 'unidad-ventilacion':
        return await handleUnidadVentilacion(body.payload);
      case 'send-mail':
        return await handleSendMail(body.payload);
      default:
        return jsonResponse({ error: `Accion desconocida: ${body.action}` }, 400);
    }
  } catch (err) {
    return graphErrorResponse(err);
  }
});
