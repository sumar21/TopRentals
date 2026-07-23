// Supabase-side load: wipe, batched inserts with explicit (preserved) ids,
// sequence fixups, FK resolution glue, and Storage uploads.
//
// Insert order (FK-safe, matches data_model.md's "## Migration" section):
//   1  edificios            8  emails_notificacion    15 compras
//   2  articulos            9  ordenes_trabajo (pass1) 16 detalle_compras
//   3  frecuencias         10 ordenes_trabajo (pass2) 17 aprobaciones
//   4  unidades               [orden_revision_id UPDATE] 18 bitacoras
//   5  usuarios            11 stock                   19 fotos_bitacora
//   6  perfiles_permisos   12 stock_edificios          20 repuestos_ot
//   7  iconos_app          13 movimientos_stock        21 ventilaciones
//                          14 salidas_stock            22 documentos + Storage

import pgModule from 'pg';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GraphClient, SpItem } from './graph.ts';
import { ResolutionContext } from './resolve.ts';
import {
  mapRow,
  SP_LISTS,
  STOCK_EDIFICIO_SP_FIELD,
  USUARIOS_PAIS_FALLBACK_SP,
  type ListKey,
  type Mapping,
  type ResolutionMapping,
} from './mappings.ts';
import * as M from './mappings.ts';
import { emptyToNull } from './coerce.ts';

const { Client: PgClient } = pgModule;

// ============================================================================
// Types
// ============================================================================
export interface LoadEnv {
  siteUrl: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
  supabaseDbUrl: string;
}

export interface LoadOptions {
  dryRun: boolean;
  skipFiles: boolean;
}

export interface TableProgress {
  table: string;
  rowsRead: number;
  rowsInserted: number;
  unresolved: number;
}

interface Row {
  [column: string]: unknown;
}

// Storage buckets — must match supabase/storage-buckets.sql exactly.
const BUCKETS = {
  ordenes: 'ordenes',
  compras: 'compras',
  bitacoras: 'bitacoras',
  ventilaciones: 'ventilaciones',
  articulos: 'articulos',
  branding: 'branding',
} as const;

// TRUNCATE order from data_model.md's "## Migration" section (child -> parent;
// RESTART IDENTITY CASCADE makes exact ordering unnecessary but this is the
// documented, reviewable list).
const TRUNCATE_TABLES = [
  'documentos',
  'fotos_bitacora',
  'bitacoras',
  'repuestos_ot',
  'aprobaciones',
  'detalle_compras',
  'compras',
  'salidas_stock',
  'movimientos_stock',
  'stock_edificios',
  'stock',
  'ventilaciones',
  'ordenes_trabajo',
  'perfiles_permisos',
  'emails_notificacion',
  'iconos_app',
  'usuarios',
  'unidades',
  'frecuencias',
  'articulos',
  'edificios',
] as const;

// ============================================================================
// Small helpers
// ============================================================================
function toId(spId: string | number): number {
  const n = Number(spId);
  if (!Number.isFinite(n)) throw new Error(`SharePoint item id is not numeric: ${spId}`);
  return n;
}

function resolveFk(
  ctx: ResolutionContext,
  list: string,
  spId: string | number,
  fields: Record<string, unknown>,
  r: ResolutionMapping,
): number | null {
  const raw = fields[r.sp];
  let resolved: number | null;
  switch (r.via) {
    case 'concatName':
      resolved = ctx.resolveByMap(ctx.userByConcatName, raw);
      break;
    case 'usuarioApp':
      resolved = ctx.resolveByMap(ctx.userByUsuarioApp, raw);
      break;
    case 'edificioNombre':
      resolved = ctx.resolveByMap(ctx.edificioByNombre, raw);
      break;
    case 'edificioDirect':
      resolved = ctx.resolveDirectId(ctx.edificioIds, raw);
      break;
    case 'edificioFirst':
      resolved = ctx.resolveEdificioFirst(raw);
      break;
    case 'articuloDirect':
      resolved = ctx.resolveDirectId(ctx.articuloIds, raw);
      break;
    case 'articuloDirty':
      resolved = ctx.resolveArticuloDirty(raw);
      break;
    case 'unidadDirect':
      resolved = ctx.resolveDirectId(ctx.unidadIds, raw);
      break;
    case 'usuarioDirect':
      resolved = ctx.resolveDirectId(ctx.usuarioIds, raw);
      break;
    case 'otUnivoco':
      resolved = ctx.resolveByMap(ctx.otByUnivoco, raw);
      break;
    case 'otDirect':
      resolved = ctx.resolveDirectId(ctx.otIds, raw);
      break;
    case 'bitacoraUnivoco':
      resolved = ctx.resolveByMap(ctx.bitacoraByUnivoco, raw);
      break;
    case 'compraBusinessKey':
      resolved = ctx.resolveByMap(ctx.compraByBusinessKey, raw);
      break;
    case 'compraDirectOrBusinessKey':
      resolved = ctx.resolveCompra(raw, r.spFallback ? fields[r.spFallback] : undefined);
      break;
  }
  if (resolved === null && raw != null && String(raw).trim() !== '') {
    ctx.report(list, spId, r.pg, raw);
  }
  return resolved;
}

function applyResolutions(
  ctx: ResolutionContext,
  list: string,
  spId: string | number,
  fields: Record<string, unknown>,
  resolutions: ResolutionMapping[],
): Row {
  const out: Row = {};
  for (const r of resolutions) out[r.pg] = resolveFk(ctx, list, spId, fields, r);
  return out;
}

/** base64 (optionally 'data:<mime>;base64,' prefixed) -> Buffer + detected content-type. */
function decodeBase64Image(raw: string): { buffer: Buffer; contentType: string | null } {
  const match = /^data:([^;]+);base64,(.*)$/s.exec(raw);
  if (match) return { buffer: Buffer.from(match[2], 'base64'), contentType: match[1] };
  return { buffer: Buffer.from(raw, 'base64'), contentType: null };
}

// ============================================================================
// Load orchestrator
// ============================================================================
export async function migrate(
  graph: GraphClient,
  env: LoadEnv,
  options: LoadOptions,
  onProgress: (p: TableProgress) => void,
): Promise<{ ctx: ResolutionContext }> {
  const commit = !options.dryRun;
  const ctx = new ResolutionContext();

  const supabase: SupabaseClient | null = commit
    ? createClient(env.supabaseUrl, env.supabaseServiceRoleKey, { auth: { persistSession: false } })
    : null;
  const pg = commit ? new PgClient({ connectionString: env.supabaseDbUrl }) : null;
  if (pg) await pg.connect();

  const listIdCache = new Map<string, string>();
  const siteId = await graph.resolveSiteId(env.siteUrl);

  async function fetchList(listKey: ListKey): Promise<SpItem[]> {
    const displayName = SP_LISTS[listKey];
    let listId = listIdCache.get(displayName);
    if (!listId) {
      listId = await graph.resolveListId(siteId, displayName);
      listIdCache.set(displayName, listId);
    }
    return graph.fetchAllItems(siteId, listId);
  }

  async function insertBatched(table: string, rows: Row[], batchSize = 500): Promise<void> {
    if (!commit || !supabase) return;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await supabase.from(table).insert(batch);
      if (error) throw new Error(`Insert failed on "${table}" (batch starting at row ${i}): ${error.message}`);
    }
  }

  async function fixSequence(table: string): Promise<void> {
    if (!commit || !pg) return;
    await pg.query(
      `SELECT setval(pg_get_serial_sequence($1, 'id'), COALESCE((SELECT MAX(id) FROM ${quoteIdent(table)}), 1), ` +
        `(SELECT MAX(id) FROM ${quoteIdent(table)}) IS NOT NULL)`,
      [table],
    );
  }

  function quoteIdent(name: string): string {
    return `"${name.replace(/"/g, '""')}"`;
  }

  async function uploadFile(bucket: string, objectPath: string, data: Buffer, contentType?: string | null): Promise<void> {
    if (options.skipFiles || !supabase) return;
    const { error } = await supabase.storage
      .from(bucket)
      .upload(objectPath, data, { contentType: contentType ?? undefined, upsert: true });
    if (error) throw new Error(`Storage upload failed (${bucket}/${objectPath}): ${error.message}`);
  }

  /**
   * beforeInsert hook: uploads every non-empty base64 `columns` value to `bucket`
   * and rewrites the column to the resulting object path — runs before insert,
   * so the row is written to Postgres exactly once with the final path already
   * in place. On --skip-files (or dry-run) the column becomes null instead of
   * shipping raw base64 into a column meant to hold a path.
   *
   * ponytail: branding/permission images aren't audit-critical like OT photos,
   * so there's no *_raw fallback column for them (none exists in the schema) —
   * skipping just drops the image; re-upload manually post-cutover if needed.
   */
  function base64BeforeInsert(bucket: string, table: string, columns: string[]) {
    return async (rows: Row[]): Promise<void> => {
      for (const row of rows) {
        const id = row.id as number;
        for (const column of columns) {
          const raw = row[column] as string | null;
          if (!raw) continue;
          if (options.skipFiles) {
            row[column] = null;
            continue;
          }
          const { buffer, contentType } = decodeBase64Image(raw);
          const objectPath = `${table}/${id}/${column}`;
          await uploadFile(bucket, objectPath, buffer, contentType);
          row[column] = objectPath;
        }
      }
    };
  }

  /**
   * Generic list loader: fetch -> map -> resolve FKs -> (optional row fixups) -> insert.
   * Returns items+rows for callers that need raw fields or built values afterwards.
   * `beforeInsert` runs on the fully-built rows array before anything hits the DB —
   * use it for cross-column fixups (e.g. usuarios' Pais_Usr/Pais_U fallback).
   */
  async function loadList(
    listKey: ListKey,
    pgTable: string,
    mapping: Mapping[],
    resolutions: ResolutionMapping[],
    beforeInsert?: (rows: Row[], items: SpItem[]) => void | Promise<void>,
  ): Promise<{ items: SpItem[]; rows: Row[] }> {
    const items = await fetchList(listKey);
    const rows: Row[] = items.map((item) => {
      const spId = toId(item.id);
      const row: Row = { id: spId, ...mapRow(mapping, item.fields) };
      Object.assign(row, applyResolutions(ctx, SP_LISTS[listKey], spId, item.fields, resolutions));
      return row;
    });
    if (beforeInsert) await beforeInsert(rows, items);
    await insertBatched(pgTable, rows);
    await fixSequence(pgTable);
    onProgress({ table: pgTable, rowsRead: items.length, rowsInserted: commit ? rows.length : 0, unresolved: ctx.unresolved.length });
    return { items, rows };
  }

  try {
    if (commit && pg) await pg.query(`TRUNCATE ${TRUNCATE_TABLES.map(quoteIdent).join(', ')} RESTART IDENTITY CASCADE`);

    // ---- 1-3: base catalogs --------------------------------------------
    const edificiosRes = await loadList('edificios', 'edificios', M.edificios, []);
    for (const row of edificiosRes.rows) {
      ctx.edificioIds.add(row.id as number);
      const nombre = row.nombre as string | null;
      if (nombre) ctx.edificioByNombre.set(nombre, row.id as number);
    }

    const articulosRes = await loadList('articulos', 'articulos', M.articulos, []);
    for (const row of articulosRes.rows) {
      ctx.articuloIds.add(row.id as number);
      const codigo = row.codigo as string | null;
      if (codigo) ctx.articuloByCodigo.set(codigo, row.id as number);
    }

    await loadList('frecuencias', 'frecuencias', M.frecuencias, []);

    // ---- 4: unidades (needs edificios) ---------------------------------
    const unidadesRes = await loadList('unidades', 'unidades', M.unidades, M.unidadesResolutions);
    for (const row of unidadesRes.rows) ctx.unidadIds.add(row.id as number);

    // ---- 5: usuarios (needs edificios; Pais_Usr/Pais_U fallback) -------
    const usuariosRes = await loadList('usuarios', 'usuarios', M.usuarios, M.usuariosResolutions, (rows, items) => {
      // Pais_Usr/Pais_U fallback: fill row.pais from Pais_U only when Pais_Usr came back
      // empty. Runs BEFORE insertBatched, so the fallback value actually reaches the DB.
      for (let i = 0; i < rows.length; i++) {
        if (!rows[i].pais) {
          const fallback = emptyToNull(items[i].fields[USUARIOS_PAIS_FALLBACK_SP]);
          if (fallback) rows[i].pais = fallback;
        }
      }
    });
    for (const row of usuariosRes.rows) {
      ctx.usuarioIds.add(row.id as number);
      const concatName = row.concat_name as string | null;
      if (concatName) ctx.userByConcatName.set(concatName, row.id as number);
      const usuarioApp = row.usuario_app as string | null;
      if (usuarioApp) ctx.userByUsuarioApp.set(usuarioApp, row.id as number);
    }

    // ---- 6-8: remaining catalogs ----------------------------------------
    await loadList(
      'perfilesPermisos',
      'perfiles_permisos',
      M.perfilesPermisos,
      [],
      base64BeforeInsert(BUCKETS.branding, 'perfiles_permisos', ['imagen_path', 'imagen_no_selected_path']),
    );
    await loadList('iconosApp', 'iconos_app', M.iconosApp, [], base64BeforeInsert(BUCKETS.branding, 'iconos_app', ['icono_path']));
    await loadList('emailsNotificacion', 'emails_notificacion', M.emailsNotificacion, []);

    // ---- 9-10: ordenes_trabajo, two passes for the self-FK --------------
    const otResolutionsPass1 = M.ordenesTrabajoResolutions.filter((r) => r.pg !== 'orden_revision_id');
    const otRes = await loadList('ordenesTrabajo', 'ordenes_trabajo', M.ordenesTrabajo, otResolutionsPass1);
    for (const row of otRes.rows) {
      ctx.otIds.add(row.id as number);
      const univoco = row.id_univoco as string | null;
      if (univoco) ctx.otByUnivoco.set(univoco, row.id as number);
    }
    await resolveOrdenRevisionPass(otRes);

    // ---- 11-12: stock + stock_edificios ---------------------------------
    const stockRes = await loadList('stock', 'stock', M.stock, M.stockResolutions);
    const stockEdificiosRows: Row[] = [];
    for (let i = 0; i < stockRes.items.length; i++) {
      const stockId = stockRes.rows[i].id as number;
      const rawEdificios = stockRes.items[i].fields[STOCK_EDIFICIO_SP_FIELD];
      for (const edificioId of ctx.splitEdificioIds(rawEdificios)) {
        stockEdificiosRows.push({ stock_id: stockId, edificio_id: edificioId });
      }
      if (rawEdificios != null && String(rawEdificios).trim() !== '' && ctx.splitEdificioIds(rawEdificios).length === 0) {
        ctx.report('08.Stock', stockRes.items[i].id, 'stock_edificios', rawEdificios);
      }
    }
    await insertBatched('stock_edificios', stockEdificiosRows);
    onProgress({
      table: 'stock_edificios',
      rowsRead: stockEdificiosRows.length,
      rowsInserted: commit ? stockEdificiosRows.length : 0,
      unresolved: 0,
    });

    // ---- 13-14: audit trails ---------------------------------------------
    await loadList('movimientosStock', 'movimientos_stock', M.movimientosStock, M.movimientosStockResolutions);
    await loadList('salidasStock', 'salidas_stock', M.salidasStock, M.salidasStockResolutions);

    // ---- 15: compras -------------------------------------------------------
    const comprasRes = await loadList('compras', 'compras', M.compras, M.comprasResolutions);
    for (const row of comprasRes.rows) {
      ctx.compraIds.add(row.id as number);
      const idCompra = row.id_compra as string | null;
      if (idCompra) ctx.compraByBusinessKey.set(idCompra, row.id as number);
    }

    // ---- 16-17: purchase details + approvals ------------------------------
    await loadList('detalleCompras', 'detalle_compras', M.detalleCompras, M.detalleComprasResolutions);
    await loadList('aprobaciones', 'aprobaciones', M.aprobaciones, M.aprobacionesResolutions);

    // ---- 18: bitacoras (needs ordenes_trabajo) -----------------------------
    const bitacorasRes = await loadList('bitacoras', 'bitacoras', M.bitacoras, M.bitacorasResolutions);
    for (const row of bitacorasRes.rows) {
      const univocoBitacora = row.id_univoco_bitacora as string | null;
      if (univocoBitacora) ctx.bitacoraByUnivoco.set(univocoBitacora, row.id as number);
    }

    // ---- 19-20: fotos + repuestos -------------------------------------------
    await loadList(
      'fotosBitacora',
      'fotos_bitacora',
      M.fotosBitacora,
      M.fotosBitacoraResolutions,
      base64BeforeInsert(BUCKETS.bitacoras, 'fotos_bitacora', ['foto_path']),
    );
    await loadList('repuestosOt', 'repuestos_ot', M.repuestosOt, M.repuestosOtResolutions);

    // ---- 21: ventilaciones ---------------------------------------------------
    await loadList('ventilaciones', 'ventilaciones', M.ventilaciones, M.ventilacionesResolutions);

    // ---- 22: Documentos library + Storage -------------------------------------
    await loadDocumentos();
  } finally {
    if (pg) await pg.end();
  }

  return { ctx };

  // --------------------------------------------------------------------------
  // ordenes_trabajo pass 2: resolve the self-FK now that every OT row has an
  // id, then apply it with one batched UPDATE (unnest arrays) instead of one
  // UPDATE per row.
  // --------------------------------------------------------------------------
  async function resolveOrdenRevisionPass(otRes: { items: SpItem[]; rows: Row[] }): Promise<void> {
    const resolution = M.ordenesTrabajoResolutions.find((r) => r.pg === 'orden_revision_id');
    if (!resolution) return;
    const ids: number[] = [];
    const revisionIds: number[] = [];
    for (let i = 0; i < otRes.items.length; i++) {
      const resolved = resolveFk(ctx, SP_LISTS.ordenesTrabajo, otRes.items[i].id, otRes.items[i].fields, resolution);
      if (resolved != null) {
        ids.push(otRes.rows[i].id as number);
        revisionIds.push(resolved);
      }
    }
    if (ids.length === 0 || !commit || !pg) return;
    await pg.query(
      `UPDATE ordenes_trabajo AS o SET orden_revision_id = v.revision_id
       FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::bigint[]) AS revision_id) AS v
       WHERE o.id = v.id`,
      [ids, revisionIds],
    );
  }

  // --------------------------------------------------------------------------
  // Documentos library: walk every drive on the site, classify each file by
  // its top-level folder (Ordenes|Compras|Bitacoras), resolve the parent
  // orden_trabajo/compra by the folder-name join, upload to the matching
  // bucket, and insert one documentos row per file.
  //
  // ASSUMPTION (data_model.md open question #7 leaves this ambiguous): the
  // 'Bitacoras' Documentos subfolder is OT-scoped (like 'Ordenes'), so both
  // resolve orden_trabajo_id the same way; only 'Compras' resolves compra_id.
  // Bucket name mirrors the folder name 1:1 (ordenes/compras/bitacoras).
  // --------------------------------------------------------------------------
  async function loadDocumentos(): Promise<void> {
    const drives = await graph.listDrives(siteId);
    const rows: Row[] = [];
    let unresolvedBefore = ctx.unresolved.length;

    for (const drive of drives) {
      const files = await graph.listDriveItemsRecursive(drive.id);
      for (const file of files) {
        const segments = file.parentPath.split('/').filter(Boolean);
        const carpetaRaw = segments[0] ?? '';
        const folderKey = segments[1] ?? '';
        const carpeta = ['Ordenes', 'Compras', 'Bitacoras'].includes(carpetaRaw) ? carpetaRaw : null;
        const bucket = carpeta ? carpeta.toLowerCase() : null;

        let ordenTrabajoId: number | null = null;
        let compraId: number | null = null;
        if (carpeta === 'Ordenes' || carpeta === 'Bitacoras') {
          const idOrdenes = (file.listItemFields?.['IDOrdenes'] as string | undefined) ?? folderKey;
          ordenTrabajoId = ctx.resolveByMap(ctx.otByUnivoco, idOrdenes);
          if (ordenTrabajoId === null && idOrdenes) ctx.report('Documentos', file.id, 'orden_trabajo_id', idOrdenes);
        } else if (carpeta === 'Compras') {
          compraId = ctx.resolveDirectId(ctx.compraIds, folderKey);
          if (compraId === null && folderKey) ctx.report('Documentos', file.id, 'compra_id', folderKey);
        }

        const targetId = ordenTrabajoId ?? compraId;
        const objectPath = bucket
          ? `${bucket}/${targetId ?? `_unresolved/${folderKey || 'root'}`}/${file.name}`
          : `_unclassified/${file.parentPath}/${file.name}`;

        if (!options.skipFiles && bucket) {
          const buffer = await graph.downloadDriveItemContent(drive.id, file.id);
          await uploadFile(bucket, objectPath, buffer, file.mimeType);
        }

        rows.push({
          nombre: file.name,
          storage_path: objectPath,
          carpeta,
          orden_trabajo_id: ordenTrabajoId,
          compra_id: compraId,
          content_type: file.mimeType,
          created_at: file.createdDateTime ?? new Date().toISOString(),
        });
      }
    }

    await insertBatched('documentos', rows);
    await fixSequence('documentos');
    onProgress({
      table: 'documentos',
      rowsRead: rows.length,
      rowsInserted: commit ? rows.length : 0,
      unresolved: ctx.unresolved.length - unresolvedBefore,
    });
  }
}

// ============================================================================
// auth.users creation is EXPLICITLY SKIPPED for this cutover.
//
// TODO (password migration is paused, see README.md "Auth"): once the client
// decides the password policy (forced reset vs one-time seed), implement this
// to call supabase.auth.admin.createUser({ email, email_confirm: true,
// password: <random>, user_metadata: { usuario_app } }) per active usuarios
// row, then UPDATE usuarios.auth_user_id = <new auth user id>. Do NOT carry
// SharePoint's Password_Usr forward as-is (plain text, insecure).
// ============================================================================
export async function createAuthUsersTODO(): Promise<never> {
  throw new Error('createAuthUsersTODO: not implemented — password migration is paused, see README.md.');
}
