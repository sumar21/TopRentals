// Supabase DataApi adapter — Fase 1: auth.login + every READ (tramo 1) and every
// MUTATION (tramo 2) implemented against the real backend.
//
// UI never imports supabase-js directly (CLAUDE.md "Arquitectura") — only this file
// (via services/index.ts) talks to getSupabase(). Row shapes come back from PostgREST
// as `any`; services/supabase/rows.ts does the numeric/boolean coercion into domain types.
//
// Mutation strategy (see supabase/rpc.sql for the transactional half):
//   - Multi-table / transactional ops call one plpgsql RPC (getSupabase().rpc(...)) that
//     mirrors the matching services/mock/adapter.ts method 1:1, then this file re-selects
//     the affected row(s) and maps them through rows.ts to return the domain object.
//   - Single-table ops write directly via .from(table).insert()/.update()...select().
//   - services/types.ts field names match column names exactly EXCEPT where a domain
//     status enum is folded into a boolean flag on that table (see schema notes in
//     rows.ts) — those methods translate the enum<->boolean at the edge, inline below.
import type { CompraConDetalle, DataApi, RealtimeTopic, StockRowWithEdificios } from '../api.ts';
import type { Articulo, Compra } from '../types.ts';
import {
  aprobacionFromDb,
  articuloFromDb,
  bitacoraFromDb,
  compraFromDb,
  detalleCompraFromDb,
  documentoFromDb,
  edificioFromDb,
  emailNotificacionFromDb,
  frecuenciaFromDb,
  movimientoStockFromDb,
  ordenTrabajoFromDb,
  perfilPermisoFromDb,
  repuestoOTFromDb,
  salidaStockFromDb,
  stockFromDb,
  unidadFromDb,
  usuarioFromDb,
  ventilacionFromDb,
} from './rows.ts';
import { getSupabase } from './client.ts';
import { todayISO } from '../../utils/dates.ts';

// Domain topic -> Postgres table for Realtime subscriptions. The tables must also be in
// the `supabase_realtime` publication (supabase/migrations/0003_realtime_publication.sql).
const REALTIME_TABLES: Record<RealtimeTopic, string> = {
  ots: 'ordenes_trabajo',
  stock: 'stock',
  movimientos: 'movimientos_stock',
  salidas: 'salidas_stock',
  compras: 'compras',
  aprobaciones: 'aprobaciones',
  ventilaciones: 'ventilaciones',
  articulos: 'articulos',
  usuarios: 'usuarios',
  edificios: 'edificios',
  unidades: 'unidades',
};
// Monotonic so parallel subscriptions (several mounted views) never share a channel name.
let realtimeChannelSeq = 0;

// auth.users has no real mailbox for most usuarios, so login goes through a synthetic
// email alias built from usuario_app. MUST match scripts/migrate/provision-auth.ts's
// aliasFor EXACTLY — that script is what created these auth.users rows.
const ALIAS_DOMAIN = 'users.toprentals.internal';
const aliasFor = (usuarioApp: string) =>
  `${usuarioApp.normalize('NFKD').toLowerCase().replace(/[^a-z0-9._-]/g, '')}@${ALIAS_DOMAIN}`;

// PostgREST caps a single response at db-max-rows (1000 on Supabase), so a bare
// .select('*') silently returns only the first 1000 rows ordered by id — which, for
// ordenes_trabajo (4140 rows), drops every recent/open OT and leaves the board empty.
// Paginate in 1000-row batches to return the full set, matching the mock adapter.
// ponytail: this fetches every row client-side (the app filters in memory). Fine at
// current volumes; if a table grows large, push the filter server-side instead.
const PAGE_ROWS = 1000;
async function selectAll<T>(table: string, mapper: (row: any) => T): Promise<T[]> {
  const sb = getSupabase();
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await sb.from(table).select('*').order('id', { ascending: true }).range(from, from + PAGE_ROWS - 1);
    if (error) throw error;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_ROWS) break;
  }
  return rows.map(mapper);
}

async function selectOne<T>(table: string, id: number, mapper: (row: any) => T): Promise<T | null> {
  const { data, error } = await getSupabase().from(table).select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapper(data) : null;
}

/** Like selectOne, but for right-after-an-RPC re-selects where the row is known to exist. */
async function selectOneRequired<T>(table: string, id: number, mapper: (row: any) => T): Promise<T> {
  const { data, error } = await getSupabase().from(table).select('*').eq('id', id).single();
  if (error) throw error;
  return mapper(data);
}

/** Server-side SharePoint write-back (Fase 3, supabase/functions/sharepoint-write) — the MS
 *  Graph client secret can't reach the browser, so every SharePoint write goes through here. */
async function invokeSharePointWrite<T = unknown>(action: string, payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await getSupabase().functions.invoke('sharepoint-write', { body: { action, payload } });
  if (error) throw error;
  return data as T;
}

async function selectStockWithEdificios(id: number): Promise<StockRowWithEdificios> {
  const sb = getSupabase();
  const [{ data: stockRow, error: err1 }, { data: linkRows, error: err2 }] = await Promise.all([
    sb.from('stock').select('*').eq('id', id).single(),
    sb.from('stock_edificios').select('edificio_id').eq('stock_id', id),
  ]);
  if (err1) throw err1;
  if (err2) throw err2;
  const row = stockFromDb(stockRow);
  return { ...row, edificio_ids: (linkRows ?? []).map((r: any) => Number(r.edificio_id)) };
}

async function selectCompraConDetalle(id: number): Promise<CompraConDetalle> {
  const sb = getSupabase();
  const { data: compraRow, error: err1 } = await sb.from('compras').select('*').eq('id', id).single();
  if (err1) throw err1;
  const { data: detalleRows, error: err2 } = await sb.from('detalle_compras').select('*').eq('compra_id', id);
  if (err2) throw err2;
  return { ...compraFromDb(compraRow), detalle: (detalleRows ?? []).map(detalleCompraFromDb) };
}

/** Mirrors mock ots.crear/replicar's `(OT)-TR-<id><yyyymmdd><hhmmss>` format — needs the
 *  real row id, which only exists after insert, hence the insert-then-rename pattern below. */
function otIdUnivoco(id: number): string {
  const now = new Date();
  const day = now.toISOString().slice(0, 10).replace(/-/g, '');
  const time = now.toISOString().slice(11, 19).replace(/:/g, '');
  return `(OT)-TR-${String(id).padStart(3, '0')}${day}${time}`;
}

export function createSupabaseAdapter(): DataApi {
  const api: DataApi = {
    auth: {
      async login(usuario, password) {
        const sb = getSupabase();
        const { data: authData, error: authError } = await sb.auth.signInWithPassword({
          email: aliasFor(usuario),
          password,
        });
        if (authError || !authData?.user) throw new Error('Usuario o contraseña incorrectos.');

        const { data: byAuthId, error: err1 } = await sb
          .from('usuarios')
          .select('*')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();
        if (err1) throw err1;

        let row = byAuthId;
        if (!row) {
          const { data: byUsuarioApp, error: err2 } = await sb
            .from('usuarios')
            .select('*')
            .eq('usuario_app', usuario)
            .maybeSingle();
          if (err2) throw err2;
          row = byUsuarioApp;
        }
        if (!row) throw new Error('No se encontró el perfil de usuario asociado a esta cuenta.');
        return usuarioFromDb(row);
      },
      // demoUsers omitted on purpose — mock-only quick-access panel, hides on real backends.
    },

    usuarios: {
      list: () => selectAll('usuarios', usuarioFromDb),
      get: (id) => selectOne('usuarios', id, usuarioFromDb),
      async crear(input) {
        // usuarios is SELECT-only for authenticated → write via the DEFINER RPC (this closes the
        // raw-UPDATE path to perfil/activo; per-perfil authz still lives client-side). See supabase/rpc.sql.
        const { status, ...rest } = input;
        const payload = { ...rest, activo: status === 'ALTA' };
        const { data, error } = await getSupabase().rpc('usuario_crear', { p_payload: payload });
        if (error) throw error;
        return selectOneRequired('usuarios', Number(data), usuarioFromDb);
      },
      async actualizar(id, patch) {
        const { status, ...rest } = patch;
        const p_patch: Record<string, unknown> = { ...rest };
        if (status !== undefined) p_patch.activo = status === 'ALTA';
        const { error } = await getSupabase().rpc('usuario_actualizar', { p_id: id, p_patch });
        if (error) throw error;
        return selectOneRequired('usuarios', id, usuarioFromDb);
      },
      async eliminar(id) {
        // Soft-delete like the mock: Status_Usr -> 'BAJA' (activo=false), nothing else touched.
        const { error } = await getSupabase().rpc('usuario_eliminar', { p_id: id });
        if (error) throw error;
      },
    },

    edificios: {
      list: () => selectAll('edificios', edificioFromDb),
    },

    articulos: {
      list: () => selectAll('articulos', articuloFromDb),
      async crear(input) {
        // SharePoint first: the app-created article must carry its real SharePoint id, so the
        // mirror insert below is explicit (id: spId) instead of relying on the local sequence —
        // this closes the id-collision limitation between app-created and migrated articulos.
        const { status, corte, ...rest } = input;
        const { id: spId } = await invokeSharePointWrite<{ id: number }>('articulo-upsert', {
          codigo: rest.codigo,
          nombre: rest.nombre,
          precio_unitario: rest.precio_unitario,
          corte,
          status,
          detalle: rest.detalle,
        });
        // articulos is a SELECT-only catalog → mirror insert via DEFINER RPC (explicit id = SP id).
        const { error } = await getSupabase().rpc('articulo_insert_mirror', {
          p_id: spId,
          p_codigo: rest.codigo ?? null,
          p_nombre: rest.nombre,
          p_precio: rest.precio_unitario ?? null,
          p_corte: corte == null ? null : String(corte), // schema column is text, not numeric
          p_activo: status === 'Activo',
          p_detalle: rest.detalle ?? null,
        });
        if (error) throw error;
        return selectOneRequired<Articulo>('articulos', spId, articuloFromDb);
      },
      async actualizar(id, patch) {
        // SharePoint first: 99.ABM_Articulos always gets the FULL current record (patch merged
        // onto the row as it stands today), since the write-back contract writes every SP column
        // on every call — a partial patch alone would blank out the fields it doesn't touch.
        // If this throws, the mirror below is never touched.
        const { data: currentRow, error: errCurrent } = await getSupabase().from('articulos').select('*').eq('id', id).single();
        if (errCurrent) throw errCurrent;
        const merged = { ...articuloFromDb(currentRow), ...patch };
        await invokeSharePointWrite('articulo-upsert', {
          sp_id: id,
          codigo: merged.codigo,
          nombre: merged.nombre,
          precio_unitario: merged.precio_unitario,
          corte: merged.corte,
          status: merged.status,
          detalle: merged.detalle,
        });
        // Multi-table: cascades precio_unitario/condicion_corte to every active stock
        // row of this article (see supabase/rpc.sql articulos_actualizar for why).
        const { data, error } = await getSupabase().rpc('articulos_actualizar', { p_id: id, p_patch: patch });
        if (error) throw error;
        return selectOneRequired<Articulo>('articulos', Number(data), articuloFromDb);
      },
    },

    unidades: {
      list: () => selectAll('unidades', unidadFromDb),
    },

    frecuencias: {
      list: () => selectAll('frecuencias', frecuenciaFromDb),
    },

    emailsNotificacion: {
      list: () => selectAll('emails_notificacion', emailNotificacionFromDb),
      async enviar(to, subject, html) {
        await invokeSharePointWrite('send-mail', { to, subject, html });
      },
    },

    perfilesPermisos: {
      list: () => selectAll('perfiles_permisos', perfilPermisoFromDb),
    },

    stock: {
      async list() {
        const sb = getSupabase();
        const [{ data: stockRows, error: stockErr }, { data: linkRows, error: linkErr }] = await Promise.all([
          // PA reads stock as Filter('08.Stock', Status_ST = "Activo") — deactivated rows never appear.
          sb.from('stock').select('*').eq('activo', true),
          sb.from('stock_edificios').select('*'),
        ]);
        if (stockErr) throw stockErr;
        if (linkErr) throw linkErr;
        return (stockRows ?? []).map((r: any): StockRowWithEdificios => {
          const row = stockFromDb(r);
          const edificio_ids = (linkRows ?? [])
            .filter((se: any) => Number(se.stock_id) === row.id)
            .map((se: any) => Number(se.edificio_id));
          return { ...row, edificio_ids };
        });
      },

      async agregar({ articulo_id, edificio_id, cantidad, precio_unitario, usuario_id }) {
        const { data, error } = await getSupabase().rpc('stock_agregar', {
          p_articulo_id: articulo_id,
          p_edificio_id: edificio_id,
          p_cantidad: cantidad,
          p_precio_unitario: precio_unitario,
          p_usuario_id: usuario_id,
        });
        if (error) throw error;
        return selectStockWithEdificios(Number(data));
      },

      async salida(input) {
        const { data, error } = await getSupabase().rpc('stock_salida', {
          p_stock_id: input.stock_id,
          p_edificio_id: input.edificio_id,
          p_tipo: input.tipo,
          p_cantidad: input.cantidad,
          p_tecnico_id: input.tecnico_id,
          p_uso: input.uso,
          p_centro_de_costo: input.centro_de_costo,
          p_usuario_id: input.usuario_id,
          p_edificio_destino_id: input.edificio_destino_id ?? null,
          p_fecha_salida: input.fecha_salida ?? null,
        });
        if (error) throw error;
        return selectOneRequired('salidas_stock', Number(data), salidaStockFromDb);
      },

      async editar({ stock_id, cantidad, precio_unitario, condicion_corte, usuario_id }) {
        const { data, error } = await getSupabase().rpc('stock_editar', {
          p_stock_id: stock_id,
          p_cantidad: cantidad,
          p_precio_unitario: precio_unitario,
          p_condicion_corte: condicion_corte,
          p_usuario_id: usuario_id,
        });
        if (error) throw error;
        return selectStockWithEdificios(Number(data));
      },

      async editarSalida({ salida_id, cantidad, usuario_id }) {
        const { data, error } = await getSupabase().rpc('stock_editar_salida', {
          p_salida_id: salida_id,
          p_cantidad: cantidad,
          p_usuario_id: usuario_id,
        });
        if (error) throw error;
        return selectOneRequired('salidas_stock', Number(data), salidaStockFromDb);
      },

      async confirmarDevolucion({ salida_id, usuario_id }) {
        const { data, error } = await getSupabase().rpc('stock_confirmar_devolucion', {
          p_salida_id: salida_id,
          p_usuario_id: usuario_id,
        });
        if (error) throw error;
        return selectOneRequired('salidas_stock', Number(data), salidaStockFromDb);
      },

      movimientos: () => selectAll('movimientos_stock', movimientoStockFromDb),
      salidas: () => selectAll('salidas_stock', salidaStockFromDb),
    },

    compras: {
      list: () => selectAll('compras', compraFromDb),
      async get(id) {
        const sb = getSupabase();
        const { data: compraRow, error: err1 } = await sb.from('compras').select('*').eq('id', id).maybeSingle();
        if (err1) throw err1;
        if (!compraRow) return null;
        const { data: detalleRows, error: err2 } = await sb.from('detalle_compras').select('*').eq('compra_id', id);
        if (err2) throw err2;
        const result: CompraConDetalle = { ...compraFromDb(compraRow), detalle: (detalleRows ?? []).map(detalleCompraFromDb) };
        return result;
      },
      async crear(input, lineas) {
        const { data, error } = await getSupabase().rpc('compras_crear', { p_compra: input, p_lineas: lineas });
        if (error) throw error;
        return selectCompraConDetalle(Number(data));
      },
      async actualizar(id, patch, lineas) {
        const { data, error } = await getSupabase().rpc('compras_actualizar', {
          p_id: id,
          p_patch: patch,
          p_lineas: lineas ?? null,
        });
        if (error) throw error;
        return selectCompraConDetalle(Number(data));
      },
      async enviarAprobacion(id, usuario_gen_id) {
        const { data, error } = await getSupabase().rpc('compras_enviar_aprobacion', { p_id: id, p_user_gen_id: usuario_gen_id });
        if (error) throw error;
        return selectOneRequired('aprobaciones', Number(data), aprobacionFromDb);
      },
      async recibir(id, lineas, obs_recibir) {
        const { data, error } = await getSupabase().rpc('compras_recibir', {
          p_id: id,
          p_lineas: lineas,
          p_obs_recibir: obs_recibir,
        });
        if (error) throw error;
        return selectCompraConDetalle(Number(data));
      },
      async anular(id) {
        const { data, error } = await getSupabase().rpc('compras_anular', { p_id: id });
        if (error) throw error;
        return selectOneRequired<Compra>('compras', Number(data), compraFromDb);
      },
    },

    aprobaciones: {
      list: () => selectAll('aprobaciones', aprobacionFromDb),
      async aprobar(id, user_aprob_id) {
        const { data, error } = await getSupabase().rpc('aprobaciones_aprobar', { p_id: id, p_user_aprob_id: user_aprob_id });
        if (error) throw error;
        return selectOneRequired('aprobaciones', Number(data), aprobacionFromDb);
      },
      async rechazar(id, motivo, user_aprob_id) {
        const { data, error } = await getSupabase().rpc('aprobaciones_rechazar', {
          p_id: id,
          p_motivo: motivo,
          p_user_aprob_id: user_aprob_id,
        });
        if (error) throw error;
        return selectOneRequired('aprobaciones', Number(data), aprobacionFromDb);
      },
      async editar(id, lineas, header) {
        const { data, error } = await getSupabase().rpc('aprobaciones_editar', {
          p_id: id,
          p_lineas: lineas,
          p_header: header ?? null,
        });
        if (error) throw error;
        return selectOneRequired('aprobaciones', Number(data), aprobacionFromDb);
      },
    },

    ots: {
      list: () => selectAll('ordenes_trabajo', ordenTrabajoFromDb),
      get: (id) => selectOne('ordenes_trabajo', id, ordenTrabajoFromDb),
      async crear(input) {
        const sb = getSupabase();
        const { id_univoco: _ignored, ...rest } = input;
        // id_univoco embeds the row's own id — insert a unique placeholder first,
        // then rename it once the real id exists (mirrors mock ots.crear()).
        const { data: inserted, error: err1 } = await sb
          .from('ordenes_trabajo')
          .insert({ ...rest, id_univoco: crypto.randomUUID() })
          .select()
          .single();
        if (err1) throw err1;
        const id = Number(inserted.id);
        const { data, error: err2 } = await sb
          .from('ordenes_trabajo')
          .update({ id_univoco: otIdUnivoco(id) })
          .eq('id', id)
          .select()
          .single();
        if (err2) throw err2;
        return ordenTrabajoFromDb(data);
      },
      async actualizar(id, patch) {
        const { data, error } = await getSupabase().from('ordenes_trabajo').update(patch).eq('id', id).select().single();
        if (error) throw error;
        return ordenTrabajoFromDb(data);
      },
      async anular(id) {
        const { data, error } = await getSupabase()
          .from('ordenes_trabajo')
          .update({ status: 'Anulada' })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return ordenTrabajoFromDb(data);
      },
      async cerrar(id, tipo, opts) {
        // RPC (no direct update): closing an OT also spills its consumed repuestos into
        // salidas_stock — multi-table + idempotent, so it must be atomic. See ot_cerrar in rpc.sql.
        const sb = getSupabase();
        const { error } = await sb.rpc('ot_cerrar', { p_id: id, p_tipo: tipo });
        if (error) throw error;
        // ot_cerrar stamps fecha_cierre = today; overwrite with the user-entered date +
        // closure observations via a normal update (keeps the RPC signature untouched).
        const patch: Record<string, unknown> = {};
        if (opts?.fecha_cierre) patch.fecha_cierre = opts.fecha_cierre;
        if (opts?.obs_cierre !== undefined) patch.obs_cierre = opts.obs_cierre;
        if (Object.keys(patch).length) {
          const { error: updErr } = await sb.from('ordenes_trabajo').update(patch).eq('id', id);
          if (updErr) throw updErr;
        }
        return selectOneRequired('ordenes_trabajo', id, ordenTrabajoFromDb);
      },
      async finalizar(id, tecnico_id) {
        const { error } = await getSupabase().rpc('ot_finalizar', { p_id: id, p_tecnico_id: tecnico_id ?? null });
        if (error) throw error;
        return selectOneRequired('ordenes_trabajo', id, ordenTrabajoFromDb);
      },
      async replicar(id) {
        const sb = getSupabase();
        const { data: original, error: err1 } = await sb.from('ordenes_trabajo').select('*').eq('id', id).single();
        if (err1) throw err1;
        const { id: _oldId, id_univoco: _oldUnivoco, created_at: _oldCreatedAt, ...rest } = original;
        const { data: inserted, error: err2 } = await sb
          .from('ordenes_trabajo')
          .insert({
            ...rest,
            id_univoco: crypto.randomUUID(),
            status: 'Pendiente',
            orden_revision_id: Number(original.id),
            // PA replicar re-stamps FechaInicio_OT=Today() and leaves asignador + closure notes blank.
            fecha_inicio: new Date().toISOString().slice(0, 10),
            fecha_cierre: null,
            fecha_asignada: null,
            tecnico_id: null,
            asignador_id: null,
            obs_resuelto: null,
            obs_asignacion: null,
            obs_cierre: null,
          })
          .select()
          .single();
        if (err2) throw err2;
        const newId = Number(inserted.id);
        const { data, error: err3 } = await sb
          .from('ordenes_trabajo')
          .update({ id_univoco: otIdUnivoco(newId) })
          .eq('id', newId)
          .select()
          .single();
        if (err3) throw err3;
        return ordenTrabajoFromDb(data);
      },

      bitacoras: {
        async list(orden_trabajo_id) {
          const { data, error } = await getSupabase().from('bitacoras').select('*').eq('orden_trabajo_id', orden_trabajo_id);
          if (error) throw error;
          return (data ?? []).map(bitacoraFromDb);
        },
        async crear({ orden_trabajo_id, descripcion, usuario_id, foto_path }) {
          const { data, error } = await getSupabase().rpc('ot_bitacora_crear', {
            p_orden_trabajo_id: orden_trabajo_id,
            p_descripcion: descripcion,
            p_usuario_id: usuario_id,
            p_foto_path: foto_path ?? null,
          });
          if (error) throw error;
          return selectOneRequired('bitacoras', Number(data), bitacoraFromDb);
        },
      },

      repuestos: {
        async list(orden_trabajo_id) {
          const { data, error } = await getSupabase()
            .from('repuestos_ot')
            .select('*')
            .eq('orden_trabajo_id', orden_trabajo_id)
            .eq('activo', true);
          if (error) throw error;
          return (data ?? []).map(repuestoOTFromDb);
        },
        async asignarRepuesto({ orden_trabajo_id, articulo_id, edificio_id, cantidad, usuario_id }) {
          const { data, error } = await getSupabase().rpc('ot_asignar_repuesto', {
            p_orden_trabajo_id: orden_trabajo_id,
            p_articulo_id: articulo_id,
            p_edificio_id: edificio_id,
            p_cantidad: cantidad,
            p_usuario_id: usuario_id,
          });
          if (error) throw error;
          return selectOneRequired('repuestos_ot', Number(data), repuestoOTFromDb);
        },
        async quitar(id) {
          // Single-table (repuestos_ot only) — no transaction needed, unlike asignarRepuesto.
          const { error } = await getSupabase().from('repuestos_ot').update({ activo: false }).eq('id', id);
          if (error) throw error;
        },
      },
    },

    ventilaciones: {
      list: () => selectAll('ventilaciones', ventilacionFromDb),
      async crear(input) {
        const sb = getSupabase();
        const { data, error } = await sb.from('ventilaciones').insert(input).select().single();
        if (error) throw error;
        const row = ventilacionFromDb(data);
        if (row.unidad_id != null) {
          // PA parity: creating a schedule flags the unit as under ventilation control.
          // unidades is a SELECT-only catalog → flip the flag via DEFINER RPC.
          const { error: err2 } = await sb.rpc('unidad_set_ventilacion', { p_unidad_id: row.unidad_id, p_requiere: true });
          if (err2) throw err2;
          // Mirror the flag to SharePoint (unidad_id === the unit's SharePoint id, ids are preserved).
          await invokeSharePointWrite('unidad-ventilacion', { unidad_id: row.unidad_id, requiere_ventilacion: true });
        }
        return row;
      },
      async programar(id, fecha_programada) {
        const { data, error } = await getSupabase()
          .from('ventilaciones')
          .update({ fecha_programada, estado: 'Programada', orden: 2 })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return ventilacionFromDb(data);
      },
      async asignar({ id, tecnico_id, proxima_limpieza, frecuencia_dias }) {
        const sb = getSupabase();
        const patch: Record<string, unknown> = {
          estado: 'Asignada',
          asignado_id: tecnico_id,
          proxima_limpieza,
          fecha_asignado: new Date().toISOString(),
          orden: 3,
        };
        if (frecuencia_dias != null) patch.frecuencia_dias = frecuencia_dias;
        const { data, error } = await sb.from('ventilaciones').update(patch).eq('id', id).select().single();
        if (error) throw error;
        const row = ventilacionFromDb(data);
        if (frecuencia_dias != null && row.unidad_id != null) {
          // unidades is a SELECT-only catalog → update the frequency via DEFINER RPC.
          const { error: err2 } = await sb.rpc('unidad_set_frecuencia', { p_unidad_id: row.unidad_id, p_dias: frecuencia_dias });
          if (err2) throw err2;
        }
        if (row.unidad_id != null) {
          // Mirror to SharePoint (unidad_id === the unit's SharePoint id, ids are preserved).
          await invokeSharePointWrite('unidad-ventilacion', {
            unidad_id: row.unidad_id,
            requiere_ventilacion: true,
            ...(frecuencia_dias != null ? { frecuencia_dias } : {}),
          });
        }
        return row;
      },
      async finalizar({ id, obs_resuelto, usuario_id, foto_path }) {
        void usuario_id; // mock parity: no per-user audit column on ventilaciones (kept for API symmetry)
        const sb = getSupabase();
        const { data: newId, error } = await sb.rpc('finalizar_ventilacion', {
          p_id: id,
          p_obs: obs_resuelto,
          p_foto_path: foto_path ?? null,
        });
        if (error) throw error;
        const [{ data: cerradaRow, error: err1 }, { data: siguienteRow, error: err2 }] = await Promise.all([
          sb.from('ventilaciones').select('*').eq('id', id).single(),
          sb.from('ventilaciones').select('*').eq('id', Number(newId)).single(),
        ]);
        if (err1) throw err1;
        if (err2) throw err2;
        return { cerrada: ventilacionFromDb(cerradaRow), siguiente: ventilacionFromDb(siguienteRow) };
      },
      async adelantar({ id, obs_adelanto }) {
        const { data, error } = await getSupabase()
          .from('ventilaciones')
          .update({ proxima_limpieza: todayISO(), obs_adelanto, es_incidente: true })
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return ventilacionFromDb(data);
      },
      async eliminar(id) {
        const sb = getSupabase();
        const { data: row, error: err1 } = await sb.from('ventilaciones').select('id, unidad_id').eq('id', id).maybeSingle();
        if (err1) throw err1;
        if (!row) return; // mock parity: silent no-op if not found
        const { error: err2 } = await sb.from('ventilaciones').update({ estado: 'Eliminada' }).eq('id', id);
        if (err2) throw err2;
        if (row.unidad_id != null) {
          // unidades is a SELECT-only catalog → flip the flag via DEFINER RPC.
          const { error: err3 } = await sb.rpc('unidad_set_ventilacion', { p_unidad_id: row.unidad_id, p_requiere: false });
          if (err3) throw err3;
          // Mirror to SharePoint (unidad_id === the unit's SharePoint id, ids are preserved).
          await invokeSharePointWrite('unidad-ventilacion', { unidad_id: row.unidad_id, requiere_ventilacion: false });
        }
      },
    },

    documentos: {
      async list(filter) {
        let q = getSupabase().from('documentos').select('*');
        if (filter.orden_trabajo_id !== undefined) q = q.eq('orden_trabajo_id', filter.orden_trabajo_id);
        if (filter.compra_id !== undefined) q = q.eq('compra_id', filter.compra_id);
        const { data, error } = await q;
        if (error) throw error;
        return (data ?? []).map(documentoFromDb);
      },
    },

    realtime: {
      subscribe(topics, onChange) {
        const sb = getSupabase();
        const tables = [...new Set(topics.map((t) => REALTIME_TABLES[t]).filter(Boolean))];
        if (tables.length === 0) return () => {};
        // A single write often emits several row events; coalesce them into one refetch.
        let timer: ReturnType<typeof setTimeout> | null = null;
        const fire = () => { if (timer) clearTimeout(timer); timer = setTimeout(onChange, 250); };
        const channel = sb.channel(`rt-${realtimeChannelSeq++}`);
        for (const table of tables) {
          channel.on('postgres_changes', { event: '*', schema: 'public', table }, fire);
        }
        channel.subscribe();
        return () => { if (timer) clearTimeout(timer); void sb.removeChannel(channel); };
      },
    },
  };

  return api;
}
