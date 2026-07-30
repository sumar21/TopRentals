// Fase 2 catalog sync — idempotent, non-destructive pull of the 7 shared "99."
// SharePoint catalog lists into their Supabase mirror tables.
//
// Reuses the migration's Graph client + column mappings as-is
// (scripts/migrate/src/{graph,mappings,resolve}.ts) but UPSERTs instead of
// truncate+insert, and soft-deactivates rows that disappeared from
// SharePoint instead of ever deleting them (these tables are FK targets with
// ON DELETE RESTRICT — a hard delete would fail or orphan children).
//
// This is the testable Node core for Fase 2; a Supabase Edge Function
// wrapper (cron-triggered) comes later and should just call syncAll().
//
// Run: node --experimental-strip-types --env-file=.env scripts/sync/catalog-sync.ts
//
// KNOWN LIMITATION — image columns are never overwritten by this sync:
// iconos_app.icono_path and perfiles_permisos.{imagen_path,imagen_no_selected_path}
// hold Supabase Storage object paths that the migration produced by decoding
// SharePoint's base64 image field and uploading it once. This sync excludes
// those columns from the upsert payload entirely, so it can never clobber a
// stored path with raw base64. Consequence: if someone changes an icon/profile
// image IN SHAREPOINT after the initial migration, that change will NOT
// propagate here — it would need a manual re-run of the migration's base64
// decode step for that row.
//
// KNOWN LIMITATION — identity sequence drift: articulos rows can also be
// created directly by the app (services/supabase/adapter.ts inserts without
// an explicit id, relying on the identity default). This sync always inserts
// with the explicit SharePoint id, so it never advances that sequence. A
// SharePoint-origin id and a later app-assigned identity id could in theory
// collide; reconciling the sequence is out of scope for this core sync.

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGraphClient, type SpItem } from '../migrate/src/graph.ts';
import { mapRow, SP_LISTS, type ListKey, type Mapping } from '../migrate/src/mappings.ts';
import * as M from '../migrate/src/mappings.ts';
import { ResolutionContext } from '../migrate/src/resolve.ts';

type Row = Record<string, unknown>;

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()]));
}

function toId(spId: string | number): number {
  const n = Number(spId);
  if (!Number.isFinite(n)) throw new Error(`SharePoint item id is not numeric: ${spId}`);
  return n;
}

interface SyncSpec {
  listKey: ListKey;
  table: string;
  mapping: Mapping[];
  /** Soft-delete column to flip to false for rows missing from SharePoint. null = no flag (iconos_app). */
  activeColumn: 'activo' | 'activa' | null;
  /** Columns mapped from SP but never sent in the upsert (image paths — see file header). */
  excludeColumns?: string[];
  /** Same shared-list filter the migration applies (perfiles_permisos: drop the other app's rows). */
  filterItem?: (item: SpItem) => boolean;
  /** Cross-list FK resolution that needs a map built from an earlier list (unidades.edificio_id). */
  resolveExtra?: (ctx: ResolutionContext, fields: Record<string, unknown>) => Row;
}

export interface SyncResult {
  table: string;
  fetched: number;
  upserted: number;
  deactivated: number;
}

async function upsertBatched(supabase: SupabaseClient, table: string, rows: Row[], batchSize = 500): Promise<void> {
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed on "${table}" (batch starting at row ${i}): ${error.message}`);
  }
}

/** Soft-deactivate: mirror rows currently active whose id is no longer in the SharePoint id set. Never deletes. */
async function deactivateMissing(
  supabase: SupabaseClient,
  table: string,
  activeColumn: string,
  currentIds: Set<number>,
): Promise<number> {
  // Safety net: an empty fetch is almost certainly a transient Graph failure, not every
  // row vanishing from SharePoint at once — never mass-deactivate off of that.
  if (currentIds.size === 0) {
    console.warn(`  ${table}: 0 items fetched from SharePoint — skipping deactivation (looks like a fetch issue, not real drift)`);
    return 0;
  }
  const { data, error } = await supabase.from(table).select('id').eq(activeColumn, true);
  if (error) throw new Error(`Fetch active ids failed on "${table}": ${error.message}`);
  const toDeactivate = (data ?? []).map((r) => r.id as number).filter((id) => !currentIds.has(id));
  if (toDeactivate.length === 0) return 0;
  const { error: updError } = await supabase.from(table).update({ [activeColumn]: false }).in('id', toDeactivate);
  if (updError) throw new Error(`Deactivate failed on "${table}": ${updError.message}`);
  return toDeactivate.length;
}

async function syncList(
  graph: ReturnType<typeof createGraphClient>,
  supabase: SupabaseClient,
  siteId: string,
  ctx: ResolutionContext,
  spec: SyncSpec,
): Promise<{ result: SyncResult; rows: Row[] }> {
  const displayName = SP_LISTS[spec.listKey];
  const listId = await graph.resolveListId(siteId, displayName);
  let items = await graph.fetchAllItems(siteId, listId);

  if (spec.filterItem) {
    const before = items.length;
    items = items.filter(spec.filterItem);
    if (before - items.length > 0) {
      console.warn(`  ${spec.table}: skipped ${before - items.length} row(s) from another app (shared "99." list)`);
    }
  }

  const rows: Row[] = items.map((item) => {
    const row: Row = { id: toId(item.id), ...mapRow(spec.mapping, item.fields) };
    if (spec.resolveExtra) Object.assign(row, spec.resolveExtra(ctx, item.fields));
    for (const col of spec.excludeColumns ?? []) delete row[col];
    return row;
  });

  await upsertBatched(supabase, spec.table, rows);

  let deactivated = 0;
  if (spec.activeColumn) {
    const currentIds = new Set(rows.map((r) => r.id as number));
    deactivated = await deactivateMissing(supabase, spec.table, spec.activeColumn, currentIds);
  }

  return { result: { table: spec.table, fetched: items.length, upserted: rows.length, deactivated }, rows };
}

export async function syncAll(
  graph: ReturnType<typeof createGraphClient>,
  supabase: SupabaseClient,
  siteUrl: string,
): Promise<SyncResult[]> {
  const siteId = await graph.resolveSiteId(siteUrl);
  const ctx = new ResolutionContext();
  const results: SyncResult[] = [];

  // edificios first — unidades resolves its edificio_id FK against edificios.nombre.
  const edificios = await syncList(graph, supabase, siteId, ctx, {
    listKey: 'edificios',
    table: 'edificios',
    mapping: M.edificios,
    activeColumn: 'activo',
  });
  results.push(edificios.result);
  for (const row of edificios.rows) {
    const nombre = row.nombre as string | null;
    if (nombre) ctx.edificioByNombre.set(nombre, row.id as number);
  }

  results.push(
    (await syncList(graph, supabase, siteId, ctx, { listKey: 'articulos', table: 'articulos', mapping: M.articulos, activeColumn: 'activo' }))
      .result,
  );
  results.push(
    (
      await syncList(graph, supabase, siteId, ctx, {
        listKey: 'frecuencias',
        table: 'frecuencias',
        mapping: M.frecuencias,
        activeColumn: 'activo',
      })
    ).result,
  );
  results.push(
    (
      await syncList(graph, supabase, siteId, ctx, {
        listKey: 'unidades',
        table: 'unidades',
        mapping: M.unidades,
        activeColumn: 'activa',
        resolveExtra: (rctx, fields) => ({
          edificio_id: rctx.resolveByMap(rctx.edificioByNombre, fields[M.unidadesResolutions[0].sp]),
        }),
      })
    ).result,
  );
  results.push(
    (
      await syncList(graph, supabase, siteId, ctx, {
        listKey: 'emailsNotificacion',
        table: 'emails_notificacion',
        mapping: M.emailsNotificacion,
        activeColumn: 'activo',
      })
    ).result,
  );
  results.push(
    (
      await syncList(graph, supabase, siteId, ctx, {
        listKey: 'perfilesPermisos',
        table: 'perfiles_permisos',
        mapping: M.perfilesPermisos,
        activeColumn: 'activo',
        excludeColumns: ['imagen_path', 'imagen_no_selected_path'],
        // Same filter the migration applies: shared "99." list, keep only this app's rows.
        filterItem: (item) => {
          const app = mapRow(M.perfilesPermisos, item.fields).aplicacion;
          return app === 'Desktop' || app === 'Mantenimiento';
        },
      })
    ).result,
  );
  results.push(
    (
      await syncList(graph, supabase, siteId, ctx, {
        listKey: 'iconosApp',
        table: 'iconos_app',
        mapping: M.iconosApp,
        activeColumn: null, // no soft-delete flag on this table
        excludeColumns: ['icono_path'],
      })
    ).result,
  );

  return results;
}

async function main(): Promise<void> {
  const env = requireEnv([
    'MS_TENANT_ID',
    'MS_CLIENT_ID',
    'MS_CLIENT_SECRET',
    'SP_SITE_URL',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]);

  const graph = createGraphClient({ tenantId: env.MS_TENANT_ID, clientId: env.MS_CLIENT_ID, clientSecret: env.MS_CLIENT_SECRET });
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  console.log(`Starting catalog sync against ${env.SP_SITE_URL}...\n`);
  const results = await syncAll(graph, supabase, env.SP_SITE_URL);

  console.log('\n=== Catalog sync summary ===');
  console.table(results);
  const deactivatedTotal = results.reduce((sum, r) => sum + r.deactivated, 0);
  if (deactivatedTotal > 0) {
    console.warn(`\n${deactivatedTotal} row(s) deactivated this run — verify this is real drift, not a mapping/id mismatch.`);
  }
}

main().catch((err) => {
  console.error('\nCatalog sync failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
