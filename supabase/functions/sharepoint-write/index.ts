// SharePoint write-back (Fase 3). Runs server-side because the MS Graph client secret
// can't reach the browser. `verify_jwt` stays on (Supabase default) — only authenticated
// app users can invoke this function.
//
// Body: { action: 'articulo-upsert' | 'unidad-ventilacion', payload: {...} }
// HTTP shape (token -> resolve site -> resolve list -> create/update) is the exact
// pattern proven against 99.ABM_Articulos — see _shared/sp-graph.ts. Do not invent a
// different auth or endpoint shape.
import { createGraphClient, GraphError, type GraphClient } from '../_shared/sp-graph.ts';

const SP_LIST_ARTICULOS = '99.ABM_Articulos';
const SP_LIST_UNIDADES = '99.ABM_TipoUnidades';

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function graphErrorResponse(err: unknown): Response {
  if (err instanceof GraphError) return jsonResponse({ error: err.message }, 502);
  return jsonResponse({ error: err instanceof Error ? err.message : String(err) }, 500);
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

Deno.serve(async (req) => {
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
      default:
        return jsonResponse({ error: `Accion desconocida: ${body.action}` }, 400);
    }
  } catch (err) {
    return graphErrorResponse(err);
  }
});
