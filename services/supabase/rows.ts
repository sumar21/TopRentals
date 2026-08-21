// Maps raw Supabase/PostgREST rows -> domain types (services/types.ts).
//
// Two mismatches force this layer (verified against supabase/schema.sql):
//   1. Soft-delete flags are folded into boolean `activo` / `activa`, but the domain
//      types keep the legacy string enums (status: 'Activo'|'Inactivo' | 'Alta'|'Baja'
//      | 'ALTA'|'BAJA'). The boolean->string value set differs PER entity.
//   2. PostgREST returns `numeric` columns as strings (to preserve precision), and
//      `articulos.corte` is stored as text — both need coercion to number|null.
//
// React/DOM-free on purpose: exercised by scripts/checks/run.ts under plain node.
// ponytail: delete this file if schema.sql is refactored to expose the enum shapes
// directly (e.g. generated columns) — until then the adapter reads go through here.
import type {
  Aprobacion, Articulo, Bitacora, Compra, DetalleCompra, Documento, Edificio,
  EmailNotificacion, Frecuencia, MovimientoStock, OrdenTrabajo, PerfilPermiso,
  RepuestoOT, SalidaStock, StockRow, Unidad, Usuario, Ventilacion,
} from '../types.ts';

type Row = Record<string, any>;

// PostgREST numeric/text -> number|null (empty string and null both become null).
const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
// Postgres boolean can arrive as true / 't' / 'true'; anything else (incl. null) is false.
const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true';
const si = (v: unknown): 'SI' | 'NO' => (v === 'SI' ? 'SI' : 'NO');

export const edificioFromDb = (r: Row): Edificio => ({
  id: Number(r.id),
  nombre: r.nombre,
  pais: r.pais ?? null,
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
  zona: r.zona ?? null,
  grupo_stock: r.grupo_stock ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at ?? '',
});

export const articuloFromDb = (r: Row): Articulo => ({
  id: Number(r.id),
  codigo: r.codigo ?? null,
  nombre: r.nombre,
  precio_unitario: num(r.precio_unitario),
  corte: num(r.corte), // schema: text -> number|null
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
  detalle: r.detalle ?? null,
  created_at: r.created_at,
  updated_at: r.updated_at ?? '',
});

export const unidadFromDb = (r: Row): Unidad => ({
  id: Number(r.id),
  id_client: r.id_client ?? null,
  depto: r.depto ?? null,
  torre: r.torre ?? null,
  edificio_id: r.edificio_id == null ? null : Number(r.edificio_id),
  tipo_depto: r.tipo_depto ?? null,
  tipo_sector: r.tipo_sector ?? null,
  status: bool(r.activa) ? 'Alta' : 'Baja', // schema column is `activa`, values Alta/Baja
  frecuencia_ventilacion_dias: num(r.frecuencia_ventilacion_dias),
  requiere_ventilacion: bool(r.requiere_ventilacion),
  created_at: r.created_at,
  updated_at: r.updated_at ?? '',
});

export const frecuenciaFromDb = (r: Row): Frecuencia => ({
  id: Number(r.id),
  nombre: r.nombre ?? '',
  dias: Number(r.dias),
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
});

export const emailNotificacionFromDb = (r: Row): EmailNotificacion => ({
  id: Number(r.id),
  modulo: r.modulo,
  emails: r.emails ?? null,
  edificio: r.edificio ?? null,
  a_tecnolav: r.a_tecnolav ?? null,
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
});

export const perfilPermisoFromDb = (r: Row): PerfilPermiso => ({
  id: Number(r.id),
  modulo: r.modulo,
  admin: si(r.admin),
  operador: si(r.operador),
  tecnico: si(r.tecnico),
  recepcion: si(r.recepcion),
  compras: si(r.compras),
  // schema.sql has NO `gerencia` column (open item with the schema owner). Until it's
  // added, this reads undefined -> 'NO' (fail-closed), matching utils/permissions.ts.
  gerencia: si(r.gerencia),
  jefe_operativo: si(r.jefe_operativo),
  orden: num(r.orden) ?? 0,
  imagen_path: r.imagen_path ?? null,
  imagen_no_selected_path: r.imagen_no_selected_path ?? null,
  aplicacion: r.aplicacion,
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
});

export const usuarioFromDb = (r: Row): Usuario => ({
  id: Number(r.id),
  auth_user_id: r.auth_user_id ?? null,
  nombre: r.nombre ?? '',
  apellido: r.apellido ?? '',
  concat_name: r.concat_name ?? '',
  usuario_app: r.usuario_app,
  dni: num(r.dni),
  fecha_nac: r.fecha_nac ?? null,
  mail: r.mail ?? null,
  num_cel: r.num_cel ?? null,
  edificio_id: r.edificio_id == null ? null : Number(r.edificio_id),
  edificio_default: r.edificio_default ?? null,
  pais: r.pais ?? null,
  perfil: r.perfil,
  validado: bool(r.validado),
  wapp_default: r.wapp_default ?? null,
  mnt_global: r.mnt_global ?? null,
  aplicacion: r.aplicacion ?? null,
  es_testing: bool(r.es_testing),
  status: bool(r.activo) ? 'ALTA' : 'BAJA', // Usuario uses ALTA/BAJA, not Activo/Inactivo
  legacy_id_usr: num(r.legacy_id_usr),
  created_at: r.created_at,
  updated_at: r.updated_at ?? '',
});

// ---- operational entities (ordenes_trabajo..documentos) ----
// Same two mismatches as above, plus: ordenes_trabajo/compras/aprobaciones carry a real
// Postgres enum `status` column (passthrough, no boolean folding) and ventilaciones uses
// `estado` instead of `status` — everything else here is boolean-flag-to-string or
// numeric-string coercion exactly like the catalog mappers above.

export const ordenTrabajoFromDb = (r: Row): OrdenTrabajo => ({
  id: Number(r.id),
  id_univoco: r.id_univoco,
  status: r.status,
  tipo: r.tipo,
  prioridad: r.prioridad,
  tipo_trabajo: r.tipo_trabajo ?? null,
  tipo_tarea: r.tipo_tarea ?? null,
  tipo_prioridad: r.tipo_prioridad ?? null,
  unidad_id: r.unidad_id == null ? null : Number(r.unidad_id),
  torre: r.torre ?? null,
  departamento: r.departamento ?? null,
  concat_activo: r.concat_activo ?? null,
  tecnico_id: r.tecnico_id == null ? null : Number(r.tecnico_id),
  asignador_id: r.asignador_id == null ? null : Number(r.asignador_id),
  user_carga_id: r.user_carga_id == null ? null : Number(r.user_carga_id),
  fecha_inicio: r.fecha_inicio ?? null,
  fecha_cierre: r.fecha_cierre ?? null,
  fecha_asignada: r.fecha_asignada ?? null,
  dias_estimado: num(r.dias_estimado),
  personas_requeridas: num(r.personas_requeridas),
  detalle: r.detalle ?? null,
  observaciones: r.observaciones ?? null,
  obs_resuelto: r.obs_resuelto ?? null,
  obs_asignacion: r.obs_asignacion ?? null,
  obs_cierre: r.obs_cierre ?? null,
  orden_revision_id: r.orden_revision_id == null ? null : Number(r.orden_revision_id),
  problema: r.problema ?? null,
  desde: r.desde ?? null,
  version_app: r.version_app ?? null,
  hora: r.hora ?? null,
  created_at: r.created_at,
});

export const bitacoraFromDb = (r: Row): Bitacora => ({
  id: Number(r.id),
  orden_trabajo_id: Number(r.orden_trabajo_id),
  id_univoco_bitacora: r.id_univoco_bitacora,
  descripcion: r.descripcion ?? null,
  fecha: r.fecha,
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  version_app: r.version_app ?? null,
});

export const repuestoOTFromDb = (r: Row): RepuestoOT => ({
  id: Number(r.id),
  orden_trabajo_id: Number(r.orden_trabajo_id),
  articulo_id: r.articulo_id == null ? null : Number(r.articulo_id),
  repuesto: r.repuesto ?? null,
  cantidad: num(r.cantidad) ?? 0, // schema column is nullable; domain requires a number
  edificio: r.edificio ?? null,
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  fecha: r.fecha,
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
  version_app: r.version_app ?? null,
});

export const stockFromDb = (r: Row): StockRow => ({
  id: Number(r.id),
  id_univoco: r.id_univoco ?? null,
  articulo_id: Number(r.articulo_id),
  cantidad: Number(r.cantidad), // schema: NOT NULL DEFAULT 0
  precio_unitario: num(r.precio_unitario),
  condicion_corte: num(r.condicion_corte),
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  fecha: r.fecha,
  ultima_mod: r.ultima_mod ?? null,
  desde: r.desde ?? null,
  version_app: r.version_app ?? null,
});

export const movimientoStockFromDb = (r: Row): MovimientoStock => ({
  id: Number(r.id),
  articulo_id: r.articulo_id == null ? null : Number(r.articulo_id),
  articulo_raw: r.articulo_raw ?? null,
  concat_articulo: r.concat_articulo ?? null,
  articulo: r.articulo ?? null,
  cant_anterior: num(r.cant_anterior),
  cant_posterior: num(r.cant_posterior),
  costo_anterior: num(r.costo_anterior),
  costo_posterior: num(r.costo_posterior),
  stock_min_anterior: num(r.stock_min_anterior),
  stock_min_posterior: num(r.stock_min_posterior),
  edificio_id: r.edificio_id == null ? null : Number(r.edificio_id),
  edificio_raw: r.edificio_raw ?? null,
  edificio: r.edificio ?? null,
  edificio_traslado: r.edificio_traslado ?? null,
  desde: r.desde ?? null,
  tipo_movimiento: r.tipo_movimiento,
  cantidad: num(r.cantidad),
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  fecha: r.fecha,
  version_app: r.version_app ?? null,
});

export const salidaStockFromDb = (r: Row): SalidaStock => ({
  id: Number(r.id),
  articulo_id: r.articulo_id == null ? null : Number(r.articulo_id),
  stock_id: r.stock_id == null ? null : Number(r.stock_id),
  edificio_destino_id: r.edificio_destino_id == null ? null : Number(r.edificio_destino_id),
  concat_articulo: r.concat_articulo ?? null,
  tecnico_id: r.tecnico_id == null ? null : Number(r.tecnico_id),
  tipo: r.tipo,
  fecha_salida: r.fecha_salida ?? null,
  fecha_reingreso: r.fecha_reingreso ?? null,
  uso: r.uso ?? null,
  centro_de_costo: r.centro_de_costo ?? null,
  cantidad: num(r.cantidad) ?? 0, // schema column is nullable; domain requires a number
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  fecha: r.fecha,
  version_app: r.version_app ?? null,
});

export const compraFromDb = (r: Row): Compra => ({
  id: Number(r.id),
  id_compra: r.id_compra,
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  usuario_compra: r.usuario_compra ?? null,
  urgencia: r.urgencia ?? null,
  observacion: r.observacion ?? null,
  obs_recibir: r.obs_recibir ?? null,
  fecha: r.fecha,
  cantidad_total: num(r.cantidad_total),
  monto_total: num(r.monto_total),
  status: r.status,
  cargo: r.cargo ?? null,
  sector_pedido: r.sector_pedido ?? null,
  version_app: r.version_app ?? null,
  created_at: r.created_at,
});

export const detalleCompraFromDb = (r: Row): DetalleCompra => ({
  id: Number(r.id),
  compra_id: Number(r.compra_id),
  id_univoco: r.id_univoco ?? null,
  articulo_id: r.articulo_id == null ? null : Number(r.articulo_id),
  articulo: r.articulo ?? null,
  edificio_id: r.edificio_id == null ? null : Number(r.edificio_id),
  edificio: r.edificio ?? null,
  cantidad: num(r.cantidad) ?? 0, // schema column is nullable; domain requires a number
  recibido: num(r.recibido),
  costo_unitario: num(r.costo_unitario),
  cant_min: num(r.cant_min),
  costo_total: num(r.costo_total),
  // schema only has a boolean `activo` flag — the domain's wider enum ('Anulado' |
  // 'No Recibido', written by mutations not yet ported) collapses to Activo/Inactivo
  // on read until those write paths (and a matching schema column) exist.
  status: bool(r.activo) ? 'Activo' : 'Inactivo',
  usuario_id: r.usuario_id == null ? null : Number(r.usuario_id),
  fecha: r.fecha,
  version_app: r.version_app ?? null,
});

export const aprobacionFromDb = (r: Row): Aprobacion => ({
  id: Number(r.id),
  compra_id: Number(r.compra_id),
  status: r.status,
  fecha: r.fecha,
  urgencia: r.urgencia ?? null,
  tecnico: r.tecnico ?? null,
  obs_compra: r.obs_compra ?? null,
  fecha_aprobada: r.fecha_aprobada ?? null,
  obs_rechazo: r.obs_rechazo ?? null,
  user_gen_id: r.user_gen_id == null ? null : Number(r.user_gen_id),
  user_aprob_id: r.user_aprob_id == null ? null : Number(r.user_aprob_id),
  cantidad: num(r.cantidad),
  monto: num(r.monto),
  sector: r.sector ?? null,
  version_app: r.version_app ?? null,
  hora: r.hora ?? null,
});

export const ventilacionFromDb = (r: Row): Ventilacion => ({
  id: Number(r.id),
  estado: r.estado,
  unidad_id: r.unidad_id == null ? null : Number(r.unidad_id),
  direccion_edificio: r.direccion_edificio ?? null,
  edificio: r.edificio ?? null,
  habitacion: r.habitacion ?? null,
  frecuencia_dias: num(r.frecuencia_dias),
  fecha_ultima: r.fecha_ultima ?? null,
  proxima_limpieza: r.proxima_limpieza ?? null,
  fecha_programada: r.fecha_programada ?? null,
  obs_adelanto: r.obs_adelanto ?? null,
  obs_resuelto: r.obs_resuelto ?? null,
  asignado_id: r.asignado_id == null ? null : Number(r.asignado_id),
  fecha_asignado: r.fecha_asignado ?? null,
  version_asignado: r.version_asignado ?? null,
  fecha_finalizacion: r.fecha_finalizacion ?? null,
  version_resuelto: r.version_resuelto ?? null,
  foto_path: r.foto_path ?? null,
  es_incidente: bool(r.es_incidente),
  orden: num(r.orden),
});

export const documentoFromDb = (r: Row): Documento => ({
  id: Number(r.id),
  nombre: r.nombre,
  storage_path: r.storage_path,
  carpeta: r.carpeta,
  orden_trabajo_id: r.orden_trabajo_id == null ? null : Number(r.orden_trabajo_id),
  compra_id: r.compra_id == null ? null : Number(r.compra_id),
  content_type: r.content_type ?? null,
  created_at: r.created_at,
});
