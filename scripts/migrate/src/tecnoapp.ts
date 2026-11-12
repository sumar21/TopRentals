// Tecnoapp SharePoint -> Supabase (tables: supabase/migrations/0016_tecnoapp.sql). Plain async main, no framework.
//
// HARD RULE: this script NEVER deletes or updates anything in Supabase (production, main, is live on the same database).
// It only INSERTS rows that are not there yet:
//   * typed tables:        INSERT ... ON CONFLICT (id) DO NOTHING            (id = SharePoint item id)
//   * sharepoint_archivo:  INSERT ... ON CONFLICT (lista, sp_id) DO NOTHING
//   * users (--users):     INSERT only the usuario_app values that do not exist yet; existing users are never touched.
// So it is re-runnable: each run adds only the SharePoint items that Supabase does not have yet. No TRUNCATE, no DELETE,
// no identity reset. It talks to Supabase through the service-role REST client only (no SQL connection at all).
// Every SharePoint field no typed column takes goes to the table's `extra` jsonb (column added by 0017), so nothing is lost.
// The identities of the 15 tables are moved to >= 1000000 by supabase/migrations/0017_tecnoapp_id_range.sql, so rows the
// Tecnoapp creates on Supabase never collide with the SharePoint item ids that keep arriving until the cutover.
//
//   npm run migrate:tecnoapp:dry          reads SharePoint and (read-only) Supabase; writes NOTHING.
//   npm run migrate:tecnoapp              inserts the missing rows of the 14 typed tables + sharepoint_archivo.
//   npm run migrate:tecnoapp -- --users   separate step: additive users sync (+ provision_auth_user for active users).

import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { createGraphClient, type SpItem } from './graph.ts';
import { emptyToNull } from './coerce.ts';
import * as M from './mappings.ts';
import {
  ARCHIVE_TABLE,
  TECNOAPP_TABLES,
  mapTecnoappRow,
  rejectionsToCsv,
  type Rejection,
  type TableSpec,
} from './tecnoapp-mappings.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

const OUT_DIR = path.resolve(here, '../out');

/** Same alias as services/supabase/adapter.ts and provision-auth.ts: login email derived from usuario_app. */
const aliasFor = (usuarioApp: string): string =>
  `${usuarioApp.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@users.toprentals.internal`;

/** public.perfil_usuario (supabase/schema.sql). */
const PERFILES = ['Admin', 'Tecnico', 'Gerencia', 'Compras', 'Supervisor Ventilaciones', 'Recepcion', 'Operador'];

type Row = Record<string, unknown>;
type Supabase = ReturnType<typeof createClient>;

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) throw new Error(`Missing required environment variable(s): ${missing.join(', ')} (repo-root .env).`);
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()]));
}

/** PostgrestError is not an Error instance. */
const errorText = (err: unknown): string =>
  err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String(err.message) : JSON.stringify(err);

const chunks = <T>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

/** Runs `fn` over `items` with at most `size` in flight (Graph and PostgREST are happy with a handful). */
async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

// ---------------------------------------------------------------------------
// Supabase (service role): read what is already there, insert what is missing
// ---------------------------------------------------------------------------
/** All rows of `table` (columns `cols`), keyset-paged by id (PostgREST caps a response at 1000 rows). READ ONLY. */
async function selectAll(sb: Supabase, table: string, cols: string): Promise<Row[] | null> {
  const out: Row[] = [];
  let last = 0;
  for (;;) {
    const { data, error } = await sb.from(table).select(cols).gt('id', last).order('id').limit(1000);
    if (error) {
      // Table not created yet (0016 not applied): nothing in it.
      if (['42P01', 'PGRST205'].includes(error.code)) return null;
      throw new Error(`select ${table}: ${error.message}`);
    }
    const rows = data as unknown as Row[];
    out.push(...rows);
    if (rows.length < 1000) return out;
    last = Number(rows[rows.length - 1].id);
  }
}

/** INSERT ... ON CONFLICT (...) DO NOTHING in batches. Never updates an existing row. */
async function insertMissing(sb: Supabase, table: string, rows: Row[], onConflict: string, batchSize: number): Promise<void> {
  for (const batch of chunks(rows, batchSize)) {
    const { error } = await sb.from(table).upsert(batch, { onConflict, ignoreDuplicates: true });
    if (error) throw new Error(`insert ${table}: ${error.message}`);
  }
}

// ---------------------------------------------------------------------------
// Plan: SharePoint items -> rows, minus what Supabase already has
// ---------------------------------------------------------------------------
interface TypedPlan { spec: TableSpec; spItems: number; existing: number; rows: Row[]; rejections: Rejection[]; missingTable: boolean }
interface ArchivePlan { list: string; spItems: number; existing: number; rows: Row[] }

async function planTyped(sb: Supabase, spec: TableSpec, items: SpItem[]): Promise<TypedPlan> {
  const existingRows = await selectAll(sb, spec.table, 'id');
  const have = new Set((existingRows ?? []).map((r) => Number(r.id)));
  const rejections: Rejection[] = [];
  // Only the missing items are mapped: rows already in Supabase are never rewritten, so their values do not matter here.
  const rows = items.filter((i) => !have.has(Number(i.id))).map((i) => mapTecnoappRow(spec, i, rejections));
  return { spec, spItems: items.length, existing: have.size, rows, rejections, missingTable: existingRows === null };
}

interface NewUser {
  row: Row; // columns of public.usuarios (no id: the identity assigns it)
  password: string | null;
  usuarioApp: string;
  perfil: string;
  aplicacion: string | null;
  statusRaw: string | null;
  edificioNombre: string | null; // Edificio_Usr, resolved to edificios.id on insert
  skip: string | null; // reason this user is not inserted
}

function planUsers(items: SpItem[], existingLogins: Set<string>): NewUser[] {
  const out: NewUser[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const row = M.mapRow(M.usuarios, item.fields);
    if (!row.pais) row.pais = emptyToNull(item.fields[M.USUARIOS_PAIS_FALLBACK_SP]);
    const usuarioApp = (row.usuario_app as string | null) ?? '';
    const lower = usuarioApp.toLowerCase();
    if (!usuarioApp || existingLogins.has(lower)) continue;
    const password = emptyToNull(item.fields.field_8); // Password_Usr
    let skip: string | null = null;
    if (seen.has(lower)) skip = 'duplicated usuario_app in SharePoint';
    else if (!password) skip = 'no password (field_8)';
    seen.add(lower);
    // perfil is NOT NULL: same default as the original usuarios migration (load.ts).
    if (row.perfil == null) row.perfil = 'Operador';
    if (!PERFILES.includes(row.perfil as string)) skip ??= `perfil "${row.perfil}" is not in perfil_usuario`;
    out.push({
      row: { ...row, password_seed: password },
      password,
      usuarioApp,
      perfil: String(row.perfil),
      aplicacion: (row.aplicacion as string | null) ?? null,
      statusRaw: emptyToNull(item.fields.Status_Usr),
      edificioNombre: emptyToNull(item.fields.Edificio_Usr),
      skip,
    });
  }
  return out;
}

async function syncUsers(sb: Supabase, users: NewUser[]): Promise<void> {
  const edificios = new Map<string, number>(
    ((await selectAll(sb, 'edificios', 'id, nombre')) ?? []).map((r) => [r.nombre as string, Number(r.id)]),
  );
  let inserted = 0;
  let provisioned = 0;
  const errors: string[] = [];
  for (const u of users) {
    if (u.skip) continue;
    try {
      const row = { ...u.row, edificio_id: edificios.get(u.edificioNombre ?? '') ?? null }; // like usuariosResolutions
      const { data, error: insErr } = await sb.from('usuarios').insert(row).select('id').single();
      if (insErr) throw insErr;
      inserted++;
      // Same rule as the original backfill: only active users get an auth account.
      if (row.activo === false) continue;
      const { error } = await sb.rpc('provision_auth_user', {
        p_usuario_id: Number(data.id),
        p_email: aliasFor(u.usuarioApp),
        p_password: u.password,
        p_usuario_app: u.usuarioApp,
      });
      if (error) throw error;
      provisioned++;
    } catch (err) {
      errors.push(`${u.usuarioApp}: ${errorText(err)}`);
    }
  }
  console.log(`\nUsers: inserted=${inserted} auth-provisioned=${provisioned} errors=${errors.length}`);
  if (errors.length) {
    console.log('  ' + errors.join('\n  '));
    process.exitCode = 1;
  }
}

function printUsers(users: NewUser[]): void {
  const toInsert = users.filter((u) => !u.skip);
  console.log(`\n=== Users that would be inserted (usuario_app not in public.usuarios): ${toInsert.length} ===`);
  console.table(toInsert.map((u) => ({ usuario_app: u.usuarioApp, perfil: u.perfil, aplicacion: u.aplicacion, status: u.statusRaw })));
  const skipped = users.filter((u) => u.skip);
  if (skipped.length) {
    console.log(`Skipped (${skipped.length}):`);
    console.table(skipped.map((u) => ({ usuario_app: u.usuarioApp, perfil: u.perfil, aplicacion: u.aplicacion, status: u.statusRaw, reason: u.skip })));
  }
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const usersOnly = argv.includes('--users');

  const ms = requireEnv(['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SP_SITE_URL']);
  const env = requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']);
  const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const graph = createGraphClient({ tenantId: ms.MS_TENANT_ID, clientId: ms.MS_CLIENT_ID, clientSecret: ms.MS_CLIENT_SECRET });
  const siteId = await graph.resolveSiteId(ms.SP_SITE_URL);
  const allLists = await graph.listLists(siteId);
  const listId = new Map(allLists.map((l) => [l.displayName, l.id]));
  const fetchList = async (name: string): Promise<SpItem[]> => {
    const id = listId.get(name);
    if (!id) throw new Error(`SharePoint list not found by displayName: "${name}"`);
    return graph.fetchAllItems(siteId, id);
  };

  console.log(`${dryRun ? 'DRY RUN (reads only, writes nothing)' : usersOnly ? 'LIVE users sync (insert only)' : 'LIVE load (insert only, ON CONFLICT DO NOTHING)'} against ${ms.SP_SITE_URL}\n`);

  // ---- users step (separate): reads public.usuarios, writes only on --users ---------------------------------
  if (usersOnly || dryRun) {
    const existing = new Set(((await selectAll(sb, 'usuarios', 'id, usuario_app')) ?? []).map((r) => String(r.usuario_app).toLowerCase()));
    const users = planUsers(await fetchList(M.SP_LISTS.usuarios), existing);
    printUsers(users);
    if (usersOnly && !dryRun) {
      await syncUsers(sb, users);
      return;
    }
  }

  // ---- typed tables: SharePoint items minus what Supabase already has ------------------------------------------
  const typed = await pool(TECNOAPP_TABLES, 4, async (spec) => {
    const plan = await planTyped(sb, spec, await fetchList(spec.list));
    console.log(`  read ${spec.list}: ${plan.spItems} items, ${plan.rows.length} to insert`);
    return plan;
  });

  // ---- archive: every other genuine list of the site (no hidden/system lists, no document libraries, nothing
  // TopRentals migrates itself via SP_LISTS, nothing in the 14 typed tables) ------------------------------------
  const taken = new Set<string>([...Object.values(M.SP_LISTS), ...TECNOAPP_TABLES.map((s) => s.list)]);
  const archiveLists = allLists.filter((l) => !l.hidden && l.template === 'genericList' && !taken.has(l.displayName));
  const archivedRows = await selectAll(sb, ARCHIVE_TABLE, 'id, lista, sp_id');
  const archived = new Set((archivedRows ?? []).map((r) => `${r.lista}\u0000${r.sp_id}`));
  const archive: ArchivePlan[] = await pool(archiveLists, 4, async (l) => {
    const items = await fetchList(l.displayName);
    const rows = items
      .filter((i) => !archived.has(`${l.displayName}\u0000${Number(i.id)}`))
      .map((i) => ({ lista: l.displayName, sp_id: Number(i.id), fields: i.fields }));
    return { list: l.displayName, spItems: items.length, existing: items.length - rows.length, rows };
  });

  // ---- report ----------------------------------------------------------------------------------------------------
  const rejections = typed.flatMap((t) => t.rejections);
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'tecnoapp-rejections.csv'), rejectionsToCsv(rejections), 'utf8');

  console.log('\n=== Typed tables ===');
  console.table(
    typed.map((t) => ({
      table: t.spec.table,
      list: t.spec.list,
      sp_items: t.spItems,
      already_in_supabase: t.existing,
      would_insert: t.rows.length,
      rejected_values: t.rejections.length,
      ...(t.missingTable ? { note: 'TABLE MISSING (apply 0016)' } : {}),
    })),
  );
  const byColumn = new Map<string, number>();
  for (const r of rejections) byColumn.set(`${r.list} / ${r.column}`, (byColumn.get(`${r.list} / ${r.column}`) ?? 0) + 1);
  if (byColumn.size) {
    console.log('Rejected values by column (stored as NULL; raw values in out/tecnoapp-rejections.csv):');
    console.table([...byColumn].map(([column, count]) => ({ column, count })));
  }
  console.log(`\n=== Archive (${ARCHIVE_TABLE}) ===`);
  console.table(archive.map((a) => ({ list: a.list, sp_items: a.spItems, already_in_supabase: a.existing, would_insert: a.rows.length })));
  // What lands in `extra` (every SharePoint field no typed column takes): distinct keys per table, to eyeball.
  console.log('\n=== Keys that land in `extra` (key: rows that have it) ===');
  for (const t of typed) {
    const keys = new Map<string, number>();
    for (const r of t.rows) for (const k of Object.keys((r.extra as Record<string, unknown> | null) ?? {})) keys.set(k, (keys.get(k) ?? 0) + 1);
    console.log(`${t.spec.table}: ${keys.size ? [...keys].map(([k, n]) => `${k}(${n})`).join(', ') : '(none)'}`);
  }
  console.log(`\nRejections: ${rejections.length} -> ${path.join(OUT_DIR, 'tecnoapp-rejections.csv')}`);

  if (dryRun) {
    console.log('\nDRY RUN: nothing was written.');
    return;
  }

  for (const t of typed) {
    await insertMissing(sb, t.spec.table, t.rows, 'id', 500);
    console.log(`  inserted ${t.rows.length} into ${t.spec.table}`);
  }
  for (const a of archive) {
    await insertMissing(sb, ARCHIVE_TABLE, a.rows, 'lista,sp_id', 100);
    console.log(`  archived ${a.rows.length} from ${a.list}`);
  }
  console.log('\nDone (insert only; existing rows untouched).');
}

main().catch((err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
