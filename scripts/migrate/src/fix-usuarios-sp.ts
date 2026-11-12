// Fixes public.usuarios against SharePoint 00.Usuarios (parity QA of the Tecnoapp migration). Production, shared live:
// ONLY targeted UPDATEs on public.usuarios by id (columns activo, validado, cumple, fecha_nac, edificio_id). Never deletes.
//
//   npm run fix:usuarios:dry     default: prints exactly what would change (old -> new), writes nothing.
//   npm run fix:usuarios         same with --apply: writes.
//
// Rules:
//  1. status: only users whose aplicacion is exactly 'Hotel' (Hotel-only, mastered by SharePoint). Encoding of the Tecnoapp:
//     ALTA -> activo+validado, PENDIENTE -> activo, not validado, INACTIVO -> neither, BAJA -> not activo, validado.
//     Written only when the DERIVED status differs (activo=true/validado=null already reads as ALTA). Users with any
//     TopRentals app are never touched (listed as "not touched" when SharePoint disagrees).
//  2. cumple (0018): filled only where NULL and SharePoint has a value. dd/MM/yyyy also fills fecha_nac when that is NULL.
//  3. edificio_id: set only where NULL, from Edificio_Usr via exact name or docs/edificios-aliases.md.
// SharePoint <-> Postgres match: usuario_app case-insensitive; logins renamed '<user>__<spId>' by the migration match by SP id.

import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createGraphClient } from './graph.ts';
import { emptyToNull } from './coerce.ts';
import * as M from './mappings.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

type Row = Record<string, unknown>;
type Status = 'ALTA' | 'PENDIENTE' | 'INACTIVO' | 'BAJA';

// ---------------------------------------------------------------------------
// Pure helpers (exercised by checks.ts)
// ---------------------------------------------------------------------------
export const STATUS_FLAGS: Record<Status, { activo: boolean; validado: boolean }> = {
  ALTA: { activo: true, validado: true },
  PENDIENTE: { activo: true, validado: false },
  INACTIVO: { activo: false, validado: false },
  BAJA: { activo: false, validado: true },
};

/** Same derivation as the Tecnoapp's rowStatus. */
export const rowStatus = (activo: boolean, validado: boolean | null): Status =>
  activo ? (validado === false ? 'PENDIENTE' : 'ALTA') : validado === false ? 'INACTIVO' : 'BAJA';

export const parseStatus = (raw: unknown): Status | null => {
  const s = emptyToNull(raw)?.toUpperCase() ?? null;
  return s && s in STATUS_FLAGS ? (s as Status) : null;
};

const pad2 = (n: string): string => n.padStart(2, '0');
// Leap year 2000 so 29/02 is a valid birthday.
const validDayMonth = (d: number, m: number): boolean => m >= 1 && m <= 12 && d >= 1 && d <= new Date(Date.UTC(2000, m, 0)).getUTCDate();

/** SharePoint birthday text -> zero-padded 'dd/MM' (+ ISO date when SharePoint kept the year). null when unparseable. */
export function parseCumple(raw: unknown): { cumple: string; fechaNac: string | null } | null {
  const s = emptyToNull(raw);
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(s);
  if (!m || !validDayMonth(Number(m[1]), Number(m[2]))) return null;
  const [, d, mo, y] = m;
  const fechaNac = y && new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d))).getUTCDate() === Number(d) ? `${y}-${pad2(mo)}-${pad2(d)}` : null;
  return { cumple: `${pad2(d)}/${pad2(mo)}`, fechaNac };
}

/** docs/edificios-aliases.md: business alias (lowercase) -> edificios.nombre. Aliases win over exact names (Jaramillo -> Hub). */
export const EDIFICIO_ALIASES: Record<string, string> = {
  esmeralda: 'Downtown',
  belgrano: 'Libertador',
  gorriti: 'Palermo Hollywood',
  hollywood: 'Palermo Hollywood',
  cabello: 'Palermo Chico',
  'godoy cruz': 'Palermo Soho',
  soho: 'Palermo Soho',
  wow: 'Nuñez',
  jaramillo: 'Hub',
};

export function resolveEdificio(spName: string, byName: Map<string, number>): number | null {
  const key = spName.trim().toLowerCase();
  const target = (EDIFICIO_ALIASES[key] ?? key).toLowerCase();
  return byName.get(target) ?? null;
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const need = (names: string[]): Record<string, string> => {
    const missing = names.filter((n) => !process.env[n]?.trim());
    if (missing.length) throw new Error(`Missing required environment variable(s): ${missing.join(', ')} (repo-root .env).`);
    return Object.fromEntries(names.map((n) => [n, process.env[n]!.trim()]));
  };
  const ms = need(['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SP_SITE_URL']);
  const env = need(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`${apply ? 'APPLY (writes UPDATEs on public.usuarios)' : 'DRY RUN (reads only, writes nothing)'} against ${ms.SP_SITE_URL}\n`);

  // ---- Postgres (read) ----
  const probe = await sb.from('usuarios').select('cumple').limit(1);
  const hasCumple = !probe.error;
  if (!hasCumple && probe.error.code !== '42703') throw new Error(`probe usuarios.cumple: ${probe.error.message}`);
  if (!hasCumple) {
    if (apply) throw new Error('usuarios.cumple does not exist: apply supabase/migrations/0018_usuarios_cumple.sql first.');
    console.log('NOTE: usuarios.cumple does not exist yet (0018 not applied); the dry run assumes it is NULL everywhere.\n');
  }
  const cols = `id, usuario_app, perfil, aplicacion, activo, validado, fecha_nac, edificio_id${hasCumple ? ', cumple' : ''}`;
  const pg: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('usuarios').select(cols).order('id').range(from, from + 999);
    if (error) throw new Error(`select usuarios: ${error.message}`);
    pg.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  const { data: edifs, error: edifErr } = await sb.from('edificios').select('id, nombre');
  if (edifErr) throw new Error(`select edificios: ${edifErr.message}`);
  const edificioByName = new Map((edifs ?? []).map((e) => [String(e.nombre).trim().toLowerCase(), Number(e.id)]));
  const edificioName = new Map((edifs ?? []).map((e) => [Number(e.id), String(e.nombre)]));

  // ---- SharePoint (read) ----
  const graph = createGraphClient({ tenantId: ms.MS_TENANT_ID, clientId: ms.MS_CLIENT_ID, clientSecret: ms.MS_CLIENT_SECRET });
  const siteId = await graph.resolveSiteId(ms.SP_SITE_URL);
  const list = (await graph.listLists(siteId)).find((l) => l.displayName === M.SP_LISTS.usuarios);
  if (!list) throw new Error(`SharePoint list not found: ${M.SP_LISTS.usuarios}`);
  const items = await graph.fetchAllItems(siteId, list.id);
  console.log(`SharePoint 00.Usuarios: ${items.length} items; public.usuarios: ${pg.length} rows\n`);

  // ---- match ----
  const byLogin = new Map<string, Row>();
  const bySpSuffix = new Map<string, Row>(); // '<login>__<spId>' rows, keyed by lowercased full login
  for (const r of pg) {
    const login = String(r.usuario_app).toLowerCase();
    (/__\d+$/.test(login) ? bySpSuffix : byLogin).set(login, r);
  }
  const loginOf = (it: { fields: Row }): string => (emptyToNull(it.fields.UsuarioApp_Usr) ?? '').toLowerCase();
  const loginCount = new Map<string, number>();
  for (const it of items) loginCount.set(loginOf(it), (loginCount.get(loginOf(it)) ?? 0) + 1);
  const claimed = new Set<number>();
  const unmatched: { spId: string; login: string }[] = [];
  const pairs: { sp: (typeof items)[number]; row: Row }[] = [];
  // Duplicated logins: the plain row belongs to the item whose id it carries (else the first one in list order).
  const ordered = [...items].sort((a, b) => Number(byLogin.get(loginOf(a))?.id === Number(a.id) ? 0 : 1) - Number(byLogin.get(loginOf(b))?.id === Number(b.id) ? 0 : 1));
  for (const it of ordered) {
    const login = loginOf(it);
    if (!login) continue;
    const row = bySpSuffix.get(`${login}__${it.id}`) ?? byLogin.get(login);
    if (!row || claimed.has(Number(row.id))) {
      unmatched.push({ spId: it.id, login });
      continue;
    }
    claimed.add(Number(row.id));
    pairs.push({ sp: it, row });
  }

  // ---- plan ----
  interface Change { id: number; user: string; column: string; from: unknown; to: unknown }
  const changes: Change[] = [];
  const patches = new Map<number, Row>();
  const notTouched: Row[] = [];
  const unparsedCumple: Row[] = [];
  const unresolvedEdificios = new Map<string, number>();
  const spEdificioCounts = new Map<string, number>();
  const add = (row: Row, column: string, to: unknown): void => {
    const id = Number(row.id);
    changes.push({ id, user: String(row.usuario_app), column, from: row[column] ?? null, to });
    patches.set(id, { ...(patches.get(id) ?? {}), [column]: to });
  };

  for (const { sp, row } of pairs) {
    const user = String(row.usuario_app);
    const f = sp.fields;

    // 1. status
    const spStatus = parseStatus(f.Status_Usr);
    const pgStatus = rowStatus(Boolean(row.activo), row.validado as boolean | null);
    if (spStatus && spStatus !== pgStatus) {
      if (row.aplicacion === 'Hotel') {
        if (row.activo !== STATUS_FLAGS[spStatus].activo) add(row, 'activo', STATUS_FLAGS[spStatus].activo);
        if (row.validado !== STATUS_FLAGS[spStatus].validado) add(row, 'validado', STATUS_FLAGS[spStatus].validado);
      } else {
        notTouched.push({ id: row.id, user, perfil: row.perfil, aplicacion: row.aplicacion, sp_status: spStatus, pg_status: pgStatus });
      }
    } else if (!spStatus && emptyToNull(f.Status_Usr)) {
      notTouched.push({ id: row.id, user, perfil: row.perfil, aplicacion: row.aplicacion, sp_status: String(f.Status_Usr), pg_status: pgStatus, note: 'unknown SP status' });
    }

    // 2. cumple (+ fecha_nac)
    const spBirthday = emptyToNull(f.field_5);
    if (spBirthday) {
      const parsed = parseCumple(spBirthday);
      if (!parsed) unparsedCumple.push({ id: row.id, user, sp_value: spBirthday });
      else {
        if (!emptyToNull(row.cumple)) add(row, 'cumple', parsed.cumple);
        if (parsed.fechaNac && row.fecha_nac == null) add(row, 'fecha_nac', parsed.fechaNac);
      }
    }

    // 3. edificio
    const spEdificio = emptyToNull(f.Edificio_Usr);
    if (spEdificio) {
      spEdificioCounts.set(spEdificio, (spEdificioCounts.get(spEdificio) ?? 0) + 1);
      const target = resolveEdificio(spEdificio, edificioByName);
      if (target == null) unresolvedEdificios.set(spEdificio, (unresolvedEdificios.get(spEdificio) ?? 0) + 1);
      else if (row.edificio_id == null) add(row, 'edificio_id', target);
    }
  }

  // ---- report ----
  console.log(`=== Changes (${changes.length} column updates on ${patches.size} users) ===`);
  console.table(
    changes.map((c) => ({
      id: c.id,
      user: c.user,
      column: c.column,
      change: c.column === 'edificio_id' ? `${c.from} -> ${c.to} (${edificioName.get(Number(c.to))})` : `${String(c.from)} -> ${String(c.to)}`,
    })),
  );
  const perColumn = new Map<string, number>();
  for (const c of changes) perColumn.set(c.column, (perColumn.get(c.column) ?? 0) + 1);
  console.log('Per column:', Object.fromEntries(perColumn));
  if (notTouched.length) {
    console.log(`\nStatus differs but NOT touched (not Hotel-only, mastered by TopRentals) or unknown: ${notTouched.length}`);
    console.table(notTouched);
  }
  if (unparsedCumple.length) {
    console.log(`\nSP birthday that does not parse as dd/MM[/yyyy] (skipped): ${unparsedCumple.length}`);
    console.table(unparsedCumple);
  }
  console.log(`\nSP Edificio_Usr values that do NOT resolve to an edificio (name or alias): ${unresolvedEdificios.size}`);
  if (unresolvedEdificios.size) console.table([...unresolvedEdificios].map(([edificio_usr, users]) => ({ edificio_usr, users })));
  console.log('SP Edificio_Usr distribution:', Object.fromEntries(spEdificioCounts));
  if (unmatched.length) {
    console.log(`\nSP users with no public.usuarios row (not handled here): ${unmatched.length}`);
    console.table(unmatched);
  }

  if (!apply) {
    console.log('\nDRY RUN: nothing was written. Re-run with --apply (npm run fix:usuarios) to write.');
    return;
  }
  let ok = 0;
  for (const [id, patch] of patches) {
    const { error } = await sb.from('usuarios').update(patch).eq('id', id);
    if (error) {
      console.error(`  id ${id}: ${error.message}`);
      process.exitCode = 1;
    } else ok++;
  }
  console.log(`\nApplied: ${ok}/${patches.size} users updated.`);
}

// Only run when executed directly (checks.ts imports the helpers).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('\nfix-usuarios failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
