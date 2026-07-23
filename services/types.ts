// Domain types for TopRentals. Field names match docs/analysis/data_model.md column
// names EXACTLY (snake_case) so a future supabase-js adapter needs zero field mapping.
// PKs are `number`. Dates are ISO strings ('YYYY-MM-DD' or full timestamptz).

// ---------------------------------------------------------------------------
// Enums (docs/analysis/data_model.md "## Enums")
// ---------------------------------------------------------------------------

export type EstadoOT = 'Pendiente' | 'Asignada' | 'Cerrada' | 'Cerrada F' | 'Cerrada V' | 'Anulada';
export type TipoOT = 'ORDEN DE TRABAJO' | 'SOLICITUD OT';
export type Prioridad = 'Alta' | 'Media' | 'Baja';
export type EstadoUsuario = 'ALTA' | 'BAJA';
export type Perfil =
  | 'Admin'
  | 'Tecnico'
  | 'Gerencia'
  | 'Compras'
  | 'Supervisor Ventilaciones'
  | 'Recepcion'
  | 'Operador';
// data_model.md's enum list omits 'Anulada', but desktop_Screen_Compras.md confirms
// Status_C is set to it by the Anular Compra flow — included here as ground truth.
export type EstadoCompra = 'Pendiente' | 'Aprobacion' | 'Aprobada' | 'Rechazada' | 'Recibida' | 'En proceso' | 'Anulada';
export type EstadoAprobacion =
  | 'Pendiente'
  | 'Aprobada Supervision'
  | 'Aprobada'
  | 'Rechazada'
  | 'Recibida'
  | 'En Aprobacion';
export type EstadoVentilacion = 'Pendiente' | 'Programada' | 'Asignada' | 'Realizada' | 'Eliminada';
export type TipoSalidaStock = 'ASIGNACION' | 'CONSUMIBLE' | 'DEVOLUCION' | 'TRASLADO' | 'DEVUELTO';
export type EstadoActivo = 'Activo' | 'Inactivo';
// detalle_compras.status has a wider open set than the generic estado_activo flag
// (desktop_Screen_Compras.md statuses: Activo, Inactivo, Anulado, No Recibido).
export type EstadoDetalleCompra = 'Activo' | 'Inactivo' | 'Anulado' | 'No Recibido';
export type EstadoAlta = 'Alta' | 'Baja';
export type AplicacionApp = 'Desktop' | 'Mantenimiento';

// Helper: shape of a create-payload for entities with an identity PK + timestamps.
export type NewEntity<T> = Omit<T, 'id' | 'created_at' | 'updated_at'>;

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

export interface Usuario {
  id: number;
  auth_user_id: string | null;
  nombre: string;
  apellido: string;
  concat_name: string; // "Apellido, Nombre" — join key used across OT/stock/ventilaciones
  usuario_app: string; // login
  dni: number | null;
  fecha_nac: string | null;
  mail: string | null;
  num_cel: string | null;
  edificio_id: number | null;
  edificio_default: string | null;
  pais: string | null;
  perfil: Perfil;
  validado: boolean;
  wapp_default: string | null;
  mnt_global: string | null;
  aplicacion: string | null;
  es_testing: boolean;
  status: EstadoUsuario;
  legacy_id_usr: number | null;
  created_at: string;
  updated_at: string;
}

export interface Edificio {
  id: number;
  nombre: string;
  pais: string | null;
  status: EstadoActivo;
  // Not in the original SharePoint model (open question in data_model.md) — added so the
  // mock can express the real-world zona/grupo_stock groupings without hardcoded name lists.
  zona: string | null;
  grupo_stock: string | null;
  created_at: string;
  updated_at: string;
}

export interface Articulo {
  id: number;
  codigo: string | null;
  nombre: string;
  precio_unitario: number | null;
  corte: number | null; // stock_minimo (see data_model.md open questions)
  status: EstadoActivo;
  detalle: string | null;
  created_at: string;
  updated_at: string;
}

export interface Unidad {
  id: number;
  id_client: string | null;
  depto: string | null;
  torre: string | null;
  edificio_id: number | null;
  tipo_depto: string | null;
  tipo_sector: string | null;
  status: EstadoAlta;
  frecuencia_ventilacion_dias: number | null;
  requiere_ventilacion: boolean;
  created_at: string;
  updated_at: string;
}

export interface Frecuencia {
  id: number;
  nombre: string;
  dias: number;
  status: EstadoActivo;
}

/** perfiles_permisos row — one per (modulo, aplicacion). Recommended v2 schema per data_model.md. */
export interface PerfilPermiso {
  id: number;
  modulo: string; // 'Home' | 'Stock' | 'Compras' | 'Aprobaciones' | 'Ordenes de Trabajo' | 'Ventilaciones' | 'ABM' | 'Activos' | 'OT'
  admin: 'SI' | 'NO';
  operador: 'SI' | 'NO';
  tecnico: 'SI' | 'NO';
  recepcion: 'SI' | 'NO';
  compras: 'SI' | 'NO';
  gerencia: 'SI' | 'NO';
  jefe_operativo: 'SI' | 'NO';
  orden: number;
  imagen_path: string | null;
  imagen_no_selected_path: string | null;
  aplicacion: AplicacionApp;
  status: EstadoActivo;
}

export interface EmailNotificacion {
  id: number;
  modulo: string; // 'OT' | 'Compra' | 'Aprobaciones'
  emails: string | null; // semicolon-joined
  edificio: string | null;
  a_tecnolav: string | null;
  status: EstadoActivo;
}

export interface OrdenTrabajo {
  id: number;
  id_univoco: string;
  status: EstadoOT;
  tipo: TipoOT;
  prioridad: Prioridad;
  tipo_trabajo: string | null;
  tipo_tarea: string | null;
  tipo_prioridad: string | null;
  unidad_id: number | null;
  torre: string | null;
  departamento: string | null;
  concat_activo: string | null;
  tecnico_id: number | null;
  asignador_id: number | null;
  user_carga_id: number | null;
  fecha_inicio: string | null;
  fecha_cierre: string | null;
  fecha_asignada: string | null;
  dias_estimado: number | null;
  personas_requeridas: number | null;
  detalle: string | null;
  observaciones: string | null;
  obs_resuelto: string | null;
  obs_asignacion: string | null;
  obs_cierre: string | null;
  orden_revision_id: number | null;
  problema: string | null;
  desde: 'Desktop' | 'Mobile' | null;
  version_app: string | null;
  hora: string | null;
  created_at: string;
}

export interface Bitacora {
  id: number;
  orden_trabajo_id: number;
  id_univoco_bitacora: string;
  descripcion: string | null;
  fecha: string;
  usuario_id: number | null;
  version_app: string | null;
}

export interface FotoBitacora {
  id: number;
  orden_trabajo_id: number | null;
  bitacora_id: number | null;
  foto_path: string;
  created_at: string;
}

export interface RepuestoOT {
  id: number;
  orden_trabajo_id: number;
  articulo_id: number | null;
  repuesto: string | null;
  cantidad: number;
  edificio: string | null;
  usuario_id: number | null;
  fecha: string;
  status: EstadoActivo;
  version_app: string | null;
}

/** stock table (one row per article per stock pool — pools can span >1 edificio via stock_edificios). */
export interface StockRow {
  id: number;
  id_univoco: string | null;
  articulo_id: number;
  cantidad: number;
  precio_unitario: number | null;
  condicion_corte: number | null;
  status: EstadoActivo;
  usuario_id: number | null;
  fecha: string;
  ultima_mod: string | null;
  desde: string | null;
  version_app: string | null;
}

/** stock <-> edificios junction (NEW table, see data_model.md). */
export interface StockEdificio {
  stock_id: number;
  edificio_id: number;
}

/** Append-only audit trail. Every stock mutation writes one of these. */
export interface MovimientoStock {
  id: number;
  articulo_id: number | null;
  articulo_raw: string | null;
  concat_articulo: string | null;
  articulo: string | null;
  cant_anterior: number | null;
  cant_posterior: number | null;
  costo_anterior: number | null;
  costo_posterior: number | null;
  stock_min_anterior: number | null;
  stock_min_posterior: number | null;
  edificio_id: number | null;
  edificio_raw: string | null;
  edificio: string | null;
  edificio_traslado: string | null;
  desde: string | null;
  tipo_movimiento: string; // open set: 'Nuevo' | 'Editado' | 'Asignacion Repuesto' | tipo_salida_stock value
  cantidad: number | null;
  usuario_id: number | null;
  fecha: string;
  version_app: string | null;
}

export interface SalidaStock {
  id: number;
  articulo_id: number | null;
  /** Stock row actually debited — the ONLY safe target to credit back on edit/devolución.
   *  Null on legacy rows migrated from SharePoint (no such column there). */
  stock_id: number | null;
  concat_articulo: string | null;
  tecnico_id: number | null;
  tipo: TipoSalidaStock;
  fecha_salida: string | null;
  fecha_reingreso: string | null;
  uso: string | null;
  centro_de_costo: string | null;
  cantidad: number;
  usuario_id: number | null;
  fecha: string;
  version_app: string | null;
}

export interface Compra {
  id: number;
  id_compra: string;
  usuario_id: number | null;
  usuario_compra: string | null;
  urgencia: 'Baja' | 'Media' | 'Alta' | null;
  observacion: string | null;
  obs_recibir: string | null;
  fecha: string;
  cantidad_total: number | null;
  monto_total: number | null;
  status: EstadoCompra;
  cargo: string | null;
  sector_pedido: string | null;
  version_app: string | null;
  created_at: string;
}

export interface DetalleCompra {
  id: number;
  compra_id: number;
  id_univoco: string | null;
  articulo_id: number | null;
  articulo: string | null;
  edificio_id: number | null;
  edificio: string | null;
  cantidad: number;
  recibido: number | null;
  costo_unitario: number | null;
  cant_min: number | null;
  costo_total: number | null;
  status: EstadoDetalleCompra;
  usuario_id: number | null;
  fecha: string;
  version_app: string | null;
}

export interface Aprobacion {
  id: number;
  compra_id: number;
  status: EstadoAprobacion;
  fecha: string;
  urgencia: string | null;
  tecnico: string | null;
  obs_compra: string | null;
  fecha_aprobada: string | null;
  obs_rechazo: string | null;
  user_gen_id: number | null;
  user_aprob_id: number | null;
  cantidad: number | null;
  monto: number | null;
  sector: string | null;
  version_app: string | null;
  hora: string | null;
}

export interface Ventilacion {
  id: number;
  estado: EstadoVentilacion;
  unidad_id: number | null;
  direccion_edificio: string | null;
  edificio: string | null;
  habitacion: string | null;
  frecuencia_dias: number | null;
  fecha_ultima: string | null;
  proxima_limpieza: string | null;
  fecha_programada: string | null;
  obs_adelanto: string | null;
  obs_resuelto: string | null;
  asignado_id: number | null;
  fecha_asignado: string | null;
  version_asignado: string | null;
  fecha_finalizacion: string | null;
  version_resuelto: string | null;
  es_incidente: boolean;
  orden: number | null;
}

export interface Documento {
  id: number;
  nombre: string;
  storage_path: string;
  carpeta: 'Ordenes' | 'Compras' | 'Bitacoras';
  orden_trabajo_id: number | null;
  compra_id: number | null;
  content_type: string | null;
  created_at: string;
}
