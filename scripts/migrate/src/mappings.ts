// SharePoint -> Supabase column mapping tables — ONE per SharePoint list.
//
// Source of truth: docs/analysis/data_model.md. Every `sp` value below is the
// SharePoint INTERNAL field name (what the Graph API's `fields` object keys
// on), copied verbatim from the doc's '<- InternalName' annotations — NOT the
// human-readable display name you see in the SharePoint UI.
//
// 15.DetalleCompras is the one list that recycles internal names from a copy
// of 08.Stock (IDArticulo_ST really means "IDArticulo_DC" here, etc.) — every
// such entry below is commented with its real display name so this doesn't
// get "fixed" by someone matching names by eye later.
//
// FK resolution (tecnico_id, edificio_id, ...) is intentionally NOT coercion —
// it needs cross-list context (maps built while loading), so it lives in a
// separate RESOLUTIONS table per list, resolved at insert time via resolve.ts.

import {
  activoToBool,
  altaBajaToBool,
  emptyToNull,
  parseDMY,
  parseHora,
  parseNumber,
  siNoToBool,
} from './coerce.ts';

// ============================================================================
// SharePoint list display names — resolved to list ids via Graph at runtime
// (never hardcode GUIDs). Keys match the Supabase table each list feeds.
// ============================================================================
export const SP_LISTS = {
  edificios: '99.ABM_Edificios',
  articulos: '99.ABM_Articulos',
  frecuencias: '99.ABM_Frecuencias',
  unidades: '99.ABM_TipoUnidades',
  usuarios: '00.Usuarios',
  perfilesPermisos: '99.ABM_ListaPermisosPerfilesV3',
  iconosApp: '99.ABM_IconosApp',
  emailsNotificacion: '99.ABM_Emails',
  ordenesTrabajo: '07.OrdenesTrabajo',
  bitacoras: '15.Bitacoras',
  fotosBitacora: '16.FotoBitacora',
  repuestosOt: '10.RepuestosOT',
  stock: '08.Stock',
  movimientosStock: '08.MovimientoStock',
  salidasStock: '09.SalidaStock',
  compras: '14.Compras',
  detalleCompras: '15.DetalleCompras',
  aprobaciones: '16.Aprobaciones',
  ventilaciones: '19.Ventilaciones',
} as const;

export type ListKey = keyof typeof SP_LISTS;

/** The Documentos library is a drive, not a list — walked separately in graph.ts. */
export const DOCUMENTOS_LIBRARY_NAME = 'Documentos';

// ============================================================================
// Column coercion mappings
// ============================================================================
export type FieldType =
  | 'text'
  | 'number'
  | 'money'
  | 'date'
  | 'time'
  | 'bool_si_no'
  | 'bool_activo_inactivo'
  | 'bool_alta_baja'
  /** Enum/status text that already matches the PG enum label 1:1 — trim + empty->null only. */
  | 'passthrough'
  /** SharePoint system column (Created/Modified) — already ISO 8601 from Graph. */
  | 'iso';

export interface ColumnMapping {
  /** Target column in the Supabase table. */
  pg: string;
  /** SharePoint INTERNAL field name. */
  sp: string;
  type: FieldType;
}

export interface DateTimeMapping {
  kind: 'datetime';
  /** Target timestamptz column. */
  pg: string;
  /** SharePoint INTERNAL field name holding the dd/mm/yyyy date part. */
  spDate: string;
  /** SharePoint INTERNAL field name holding the HH:mm hora part. */
  spHora: string;
}

export type Mapping = ColumnMapping | DateTimeMapping;

function isDateTimeMapping(m: Mapping): m is DateTimeMapping {
  return (m as DateTimeMapping).kind === 'datetime';
}

function coerceColumn(type: FieldType, value: unknown): unknown {
  switch (type) {
    case 'text':
    case 'passthrough':
    case 'iso':
      return emptyToNull(value);
    case 'number':
      return parseNumber(value);
    case 'money':
      return parseNumber(value);
    case 'date':
      return parseDMY(value);
    case 'time':
      return parseHora(value);
    case 'bool_si_no':
      return siNoToBool(value);
    case 'bool_activo_inactivo':
      return activoToBool(value);
    case 'bool_alta_baja':
      return altaBajaToBool(value);
  }
}

/** Apply a list's column mappings to one SharePoint item's `fields` object. */
export function mapRow(mappings: Mapping[], fields: Record<string, unknown>): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  for (const m of mappings) {
    if (isDateTimeMapping(m)) {
      const date = parseDMY(fields[m.spDate]);
      row[m.pg] = date ? `${date}T${parseHora(fields[m.spHora]) ?? '00:00:00'}` : null;
    } else {
      row[m.pg] = coerceColumn(m.type, fields[m.sp]);
    }
  }
  return row;
}

// ============================================================================
// FK resolution mappings — the actual join logic lives in resolve.ts
// (ResolutionContext); this table just says WHICH sp column feeds WHICH fk,
// and via WHICH resolver.
// ============================================================================
export type ResolverKind =
  | 'concatName' // usuarios.concat_name
  | 'usuarioApp' // usuarios.usuario_app
  | 'edificioNombre' // edificios.nombre (text match)
  | 'edificioDirect' // sp value IS the edificios SP id
  | 'edificioFirst' // ';'-joined edificios SP ids -> take the first
  | 'articuloDirect' // sp value IS the articulos SP id
  | 'articuloDirty' // dirty: try Number(v) as articulos id, else articulos.codigo
  | 'unidadDirect' // sp value IS the unidades SP id
  | 'usuarioDirect' // sp value IS the usuarios SP id
  | 'otUnivoco' // sp value = ordenes_trabajo.id_univoco
  | 'otDirect' // sp value IS the ordenes_trabajo SP id (self-FK, second pass)
  | 'bitacoraUnivoco' // sp value = bitacoras.id_univoco_bitacora
  | 'compraBusinessKey' // sp value = compras.id_compra
  | 'compraDirectOrBusinessKey'; // sp value is a compras SP id; else fall back to a business-key column

export interface ResolutionMapping {
  /** Target FK column. */
  pg: string;
  /** SharePoint INTERNAL field name holding the raw join value. */
  sp: string;
  via: ResolverKind;
  /** Secondary SP column consulted by 'compraDirectOrBusinessKey' when the primary value doesn't resolve. */
  spFallback?: string;
}

// ---------------------------------------------------------------------------
// 99.ABM_Edificios
// ---------------------------------------------------------------------------
export const edificios: Mapping[] = [
  { pg: 'nombre', sp: 'Edificio_E', type: 'text' },
  { pg: 'pais', sp: 'Pais_E', type: 'text' },
  { pg: 'activo', sp: 'Status_E', type: 'bool_activo_inactivo' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
  { pg: 'updated_at', sp: 'Modified', type: 'iso' },
];
// Title dropped (unused boilerplate). zona/grupo_stock have no SP source (new columns, left null).

// ---------------------------------------------------------------------------
// 99.ABM_Articulos
// ---------------------------------------------------------------------------
export const articulos: Mapping[] = [
  { pg: 'codigo', sp: 'Codigo_AR', type: 'text' },
  { pg: 'nombre', sp: 'Articulo_AR', type: 'text' },
  { pg: 'precio_unitario', sp: 'PrecioUnitario_AR', type: 'money' },
  { pg: 'corte', sp: 'Corte_AR', type: 'text' },
  { pg: 'activo', sp: 'Status_AR', type: 'bool_activo_inactivo' },
  { pg: 'detalle', sp: 'Detalle_AR', type: 'text' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
  { pg: 'updated_at', sp: 'Modified', type: 'iso' },
];
// Concat_AR dropped (derived 'codigo - nombre').

// ---------------------------------------------------------------------------
// 99.ABM_Frecuencias
// ---------------------------------------------------------------------------
export const frecuencias: Mapping[] = [
  { pg: 'nombre', sp: 'Title', type: 'text' },
  { pg: 'dias', sp: 'field_1', type: 'number' }, // Frecuencia_FE
  { pg: 'activo', sp: 'field_2', type: 'bool_activo_inactivo' }, // Status_FE
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];

// ---------------------------------------------------------------------------
// 99.ABM_TipoUnidades
// ---------------------------------------------------------------------------
export const unidades: Mapping[] = [
  { pg: 'id_client', sp: 'Title', type: 'text' },
  { pg: 'depto', sp: 'field_1', type: 'text' }, // Depto_ABMUnid
  { pg: 'torre', sp: 'field_2', type: 'text' }, // Torre_ABMUnid
  { pg: 'tipo_depto', sp: 'field_3', type: 'text' }, // TipoDepto_ABMUnid
  { pg: 'tipo_sector', sp: 'TipoSector_ABMUnid', type: 'text' },
  { pg: 'activa', sp: 'Status_ABMUnid', type: 'bool_alta_baja' }, // only 'Alta' seen in formulas
  { pg: 'frecuencia_ventilacion_dias', sp: 'Frecuencia_ABMUnid', type: 'number' },
  { pg: 'requiere_ventilacion', sp: 'Ventilacion_ABMUnid', type: 'bool_si_no' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
  { pg: 'updated_at', sp: 'Modified', type: 'iso' },
];
export const unidadesResolutions: ResolutionMapping[] = [
  // Torre_ABMUnid (field_2) name resolved against edificios.nombre.
  { pg: 'edificio_id', sp: 'field_2', via: 'edificioNombre' },
];

// ---------------------------------------------------------------------------
// 00.Usuarios
// ---------------------------------------------------------------------------
export const usuarios: Mapping[] = [
  { pg: 'nombre', sp: 'field_1', type: 'text' }, // Nombre_Usr
  { pg: 'apellido', sp: 'field_2', type: 'text' }, // Apellido_Usr
  { pg: 'concat_name', sp: 'field_3', type: 'text' }, // ConcatName_Usr — resolution key, keep
  { pg: 'usuario_app', sp: 'UsuarioApp_Usr', type: 'text' },
  { pg: 'dni', sp: 'field_4', type: 'number' }, // DNI_Usr
  { pg: 'fecha_nac', sp: 'field_5', type: 'date' }, // FechaNac_Usr
  { pg: 'mail', sp: 'field_6', type: 'text' }, // Mail_Usr
  { pg: 'num_cel', sp: 'field_7', type: 'text' }, // NumCelNomenclado_Usr
  { pg: 'edificio_default', sp: 'EdificioDefault_Usr', type: 'text' },
  { pg: 'pais', sp: 'Pais_Usr', type: 'text' }, // Pais_U fallback handled by load.ts (pick non-null)
  { pg: 'perfil', sp: 'field_9', type: 'passthrough' }, // Perfil_Usr
  { pg: 'validado', sp: 'field_10', type: 'bool_si_no' }, // Validado_Usr
  { pg: 'wapp_default', sp: 'field_13', type: 'text' },
  { pg: 'mnt_global', sp: 'MNTGlobal_Usr', type: 'text' },
  { pg: 'aplicacion', sp: 'Aplicacion_U', type: 'text' },
  { pg: 'es_testing', sp: 'UsuarioTesting_Usr', type: 'bool_si_no' },
  { pg: 'activo', sp: 'Status_Usr', type: 'bool_alta_baja' }, // 'ALTA'/'BAJA'
  { pg: 'legacy_id_usr', sp: 'field_11', type: 'number' }, // ID_Usr
  { pg: 'created_at', sp: 'Created', type: 'iso' },
  { pg: 'updated_at', sp: 'Modified', type: 'iso' },
];
// field_8 (Password_Usr) is intentionally NOT mapped — see README "Auth" note.
/** Secondary internal name for pais — duplicate column seen in formulas; used only when Pais_Usr is empty. */
export const USUARIOS_PAIS_FALLBACK_SP = 'Pais_U';
export const usuariosResolutions: ResolutionMapping[] = [{ pg: 'edificio_id', sp: 'Edificio_Usr', via: 'edificioNombre' }];

// ---------------------------------------------------------------------------
// 99.ABM_ListaPermisosPerfilesV3
// ---------------------------------------------------------------------------
export const perfilesPermisos: Mapping[] = [
  { pg: 'modulo', sp: 'field_1', type: 'text' }, // Modulo_LPP
  { pg: 'admin', sp: 'field_2', type: 'text' },
  { pg: 'operador', sp: 'field_3', type: 'text' },
  { pg: 'recepcion', sp: 'field_4', type: 'text' },
  { pg: 'tecnico', sp: 'field_5', type: 'text' },
  { pg: 'compras', sp: 'Compras_LPP', type: 'text' },
  { pg: 'jefe_operativo', sp: 'JefeOperatico_LPP', type: 'text' },
  { pg: 'orden', sp: 'field_8', type: 'number' }, // SortByColumns_LPP
  { pg: 'imagen_path', sp: 'field_9', type: 'text' }, // Imagen_LPP — base64 -> Storage 'branding' at load
  { pg: 'imagen_no_selected_path', sp: 'field_10', type: 'text' }, // ImagenNoSelected_LPP — same
  { pg: 'aplicacion', sp: 'field_11', type: 'passthrough' }, // Aplicacion_LPP
  { pg: 'activo', sp: 'field_12', type: 'bool_activo_inactivo' }, // Status_LPP
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];

// ---------------------------------------------------------------------------
// 99.ABM_IconosApp
// ---------------------------------------------------------------------------
export const iconosApp: Mapping[] = [
  { pg: 'icono_path', sp: 'Icono_IA', type: 'text' }, // base64 -> Storage 'branding' at load
  { pg: 'app', sp: 'App_IA', type: 'text' },
  { pg: 'descripcion', sp: 'Descripcion_IA', type: 'text' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];

// ---------------------------------------------------------------------------
// 99.ABM_Emails
// ---------------------------------------------------------------------------
export const emailsNotificacion: Mapping[] = [
  { pg: 'modulo', sp: 'Modulo_E', type: 'text' },
  { pg: 'emails', sp: 'EmailConcat_E', type: 'text' },
  { pg: 'edificio', sp: 'Torre_E', type: 'text' },
  { pg: 'a_tecnolav', sp: 'ATecnolav_E', type: 'text' },
  { pg: 'activo', sp: 'Status_E', type: 'bool_activo_inactivo' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];

// ---------------------------------------------------------------------------
// 07.OrdenesTrabajo
// ---------------------------------------------------------------------------
export const ordenesTrabajo: Mapping[] = [
  { pg: 'id_univoco', sp: 'IDUnivoco_OT', type: 'text' }, // display IDUnivoco_IN
  { pg: 'status', sp: 'Status_OT', type: 'passthrough' },
  { pg: 'tipo', sp: 'Tipo_IN', type: 'passthrough' },
  { pg: 'prioridad', sp: 'Prioridad_IN', type: 'passthrough' },
  { pg: 'tipo_trabajo', sp: 'TipoTrabajo_IN', type: 'text' },
  { pg: 'tipo_tarea', sp: 'TipoTarea_IN', type: 'text' },
  { pg: 'tipo_prioridad', sp: 'RequiereParada_OT', type: 'text' }, // display TipoPrioridad_OT
  { pg: 'torre', sp: 'Torre_OT', type: 'text' },
  { pg: 'departamento', sp: 'Sector_OT', type: 'text' }, // display Departamento_OT
  { pg: 'concat_activo', sp: 'ConcatActivo_IN', type: 'text' },
  { pg: 'fecha_inicio', sp: 'FechaInicio_OT', type: 'date' },
  { pg: 'fecha_cierre', sp: 'FechaCierre_OT', type: 'date' },
  { pg: 'fecha_asignada', sp: 'FechaAsignada_IN', type: 'date' },
  { pg: 'dias_estimado', sp: 'DiasEstimado_IN', type: 'number' },
  { pg: 'personas_requeridas', sp: 'PersonasRequeridas_IN', type: 'number' },
  { pg: 'detalle', sp: 'Detalle_IN', type: 'text' },
  { pg: 'observaciones', sp: 'Observaciones_IN', type: 'text' },
  { pg: 'obs_resuelto', sp: 'ObservacionesResuelto_IN', type: 'text' },
  { pg: 'obs_asignacion', sp: 'ObservacionesAsignacion_IN', type: 'text' },
  { pg: 'obs_cierre', sp: 'ObservacionesCierre_IN', type: 'text' },
  { pg: 'problema', sp: 'Problema_OT', type: 'text' },
  { pg: 'desde', sp: 'Desde_IN', type: 'text' },
  { pg: 'version_app', sp: 'Version_IN', type: 'text' },
  { pg: 'hora', sp: 'Hora_IN', type: 'time' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];
// FechaMesAno_IN/FechaMes_IN dropped (derived from dates).
export const ordenesTrabajoResolutions: ResolutionMapping[] = [
  { pg: 'unidad_id', sp: 'IDActivo_OT', via: 'unidadDirect' },
  { pg: 'tecnico_id', sp: 'Tecnico_IN', via: 'concatName' },
  { pg: 'asignador_id', sp: 'Asignador_OT', via: 'concatName' },
  { pg: 'user_carga_id', sp: 'UserCarga_IN', via: 'usuarioApp' },
  // Self-FK — resolved in a second UPDATE pass once every OT row has an id (see load.ts).
  { pg: 'orden_revision_id', sp: 'IDRevision_IN', via: 'otDirect' },
];

// ---------------------------------------------------------------------------
// 15.Bitacoras
// ---------------------------------------------------------------------------
export const bitacoras: Mapping[] = [
  { pg: 'id_univoco_bitacora', sp: 'IDUnivocoBitacora_BC', type: 'text' },
  { pg: 'descripcion', sp: 'DescripcionBitacora_BC', type: 'text' },
  { pg: 'version_app', sp: 'Version_BC', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'FechaBitacora_BC', spHora: 'Hora_BC' },
];
export const bitacorasResolutions: ResolutionMapping[] = [
  { pg: 'orden_trabajo_id', sp: 'IDOrden_BC', via: 'otUnivoco' },
  { pg: 'usuario_id', sp: 'User_BC', via: 'concatName' },
];

// ---------------------------------------------------------------------------
// 16.FotoBitacora
// ---------------------------------------------------------------------------
export const fotosBitacora: Mapping[] = [
  { pg: 'foto_path', sp: 'Foto_FB', type: 'text' }, // base64 -> Storage 'bitacoras' at load
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];
export const fotosBitacoraResolutions: ResolutionMapping[] = [
  { pg: 'orden_trabajo_id', sp: 'IDUnivocoOT_FB', via: 'otUnivoco' },
  { pg: 'bitacora_id', sp: 'IDBitacora_FB', via: 'bitacoraUnivoco' },
];

// ---------------------------------------------------------------------------
// 10.RepuestosOT
// ---------------------------------------------------------------------------
export const repuestosOt: Mapping[] = [
  { pg: 'repuesto', sp: 'Repuesto_ROT', type: 'text' },
  { pg: 'cantidad', sp: 'Cantidad_ROT', type: 'number' },
  { pg: 'edificio', sp: 'Edificio_ROT', type: 'text' },
  { pg: 'activo', sp: 'Status_ROT', type: 'bool_activo_inactivo' },
  { pg: 'version_app', sp: 'VersionApp_ROT', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_ROT', spHora: 'Hora_ROT' },
];
// MesAño_ROT dropped.
export const repuestosOtResolutions: ResolutionMapping[] = [
  { pg: 'orden_trabajo_id', sp: 'IDUnivoco_ROT', via: 'otUnivoco' },
  { pg: 'articulo_id', sp: 'IDArticulo_ROT', via: 'articuloDirect' },
  { pg: 'usuario_id', sp: 'Usuario_ROT', via: 'concatName' },
];

// ---------------------------------------------------------------------------
// 08.Stock
// ---------------------------------------------------------------------------
export const stock: Mapping[] = [
  { pg: 'id_univoco', sp: 'IDUnivoco_ST', type: 'text' },
  { pg: 'cantidad', sp: 'Cantidad_ST', type: 'number' },
  { pg: 'precio_unitario', sp: 'PrecioUnitario_ST', type: 'money' },
  { pg: 'condicion_corte', sp: 'CondicionCorte_ST', type: 'number' },
  { pg: 'activo', sp: 'Status_ST', type: 'bool_activo_inactivo' },
  { pg: 'ultima_mod', sp: 'UltimaMod_ST', type: 'text' },
  { pg: 'desde', sp: 'Desde_ST', type: 'text' },
  { pg: 'version_app', sp: 'VersionApp_ST', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_ST', spHora: 'Hora_ST' },
];
// Codigo_ST/Articulo_ST/ConcatArt_ST dropped (denorm copies of articulos).
export const stockResolutions: ResolutionMapping[] = [
  { pg: 'articulo_id', sp: 'IDArticulo_ST', via: 'articuloDirect' },
  { pg: 'usuario_id', sp: 'Usuario_ST', via: 'concatName' },
];
/** stock_edificios junction is built by splitting this SP column on ';' — see resolve.ts#splitEdificioIds. */
export const STOCK_EDIFICIO_SP_FIELD = 'IDEdificio_ST';

// ---------------------------------------------------------------------------
// 08.MovimientoStock (append-only audit trail)
// ---------------------------------------------------------------------------
export const movimientosStock: Mapping[] = [
  { pg: 'articulo_raw', sp: 'IDArticulo_MS', type: 'text' }, // kept verbatim regardless of resolution outcome
  { pg: 'concat_articulo', sp: 'ConcatArticulo_MS', type: 'text' },
  { pg: 'articulo', sp: 'Articulo_MS', type: 'text' },
  { pg: 'cant_anterior', sp: 'CantAnterior_MS', type: 'number' },
  { pg: 'cant_posterior', sp: 'CantPosterior_MS', type: 'number' },
  { pg: 'costo_anterior', sp: 'CostoAnterior_MS', type: 'money' },
  { pg: 'costo_posterior', sp: 'CostoPosterior_MS', type: 'money' },
  { pg: 'stock_min_anterior', sp: 'StockMinAnterior_MS', type: 'number' },
  { pg: 'stock_min_posterior', sp: 'StockMinPosterior_MS', type: 'number' },
  { pg: 'edificio_raw', sp: 'IDEdificio_MS', type: 'text' },
  { pg: 'edificio', sp: 'Edificio_MS', type: 'text' },
  { pg: 'edificio_traslado', sp: 'EdificioTraslado_MS', type: 'text' },
  { pg: 'desde', sp: 'Desde_MS', type: 'text' },
  { pg: 'tipo_movimiento', sp: 'TipoMovimiento_MS', type: 'text' },
  { pg: 'cantidad', sp: 'Cantidad_MS', type: 'number' },
  // ASSUMPTION: data_model.md never gives this column's internal name explicitly for
  // this list. Inferred from the sibling 08.* lists' 'VersionApp_XX' convention
  // (Stock -> VersionApp_ST, RepuestosOT -> VersionApp_ROT). Verify against the real
  // list on first dry-run; if wrong this column just comes back null, nothing breaks.
  { pg: 'version_app', sp: 'VersionApp_MS', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_MS', spHora: 'Hora_MS' },
];
// Status_MS dropped (always the literal 'Null').
export const movimientosStockResolutions: ResolutionMapping[] = [
  { pg: 'articulo_id', sp: 'IDArticulo_MS', via: 'articuloDirty' },
  { pg: 'edificio_id', sp: 'IDEdificio_MS', via: 'edificioFirst' },
  { pg: 'usuario_id', sp: 'Usuario_MS', via: 'concatName' },
];

// ---------------------------------------------------------------------------
// 09.SalidaStock
// ---------------------------------------------------------------------------
export const salidasStock: Mapping[] = [
  { pg: 'concat_articulo', sp: 'ConcatArt_SS', type: 'text' },
  { pg: 'tipo', sp: 'Tipo_SS', type: 'passthrough' },
  { pg: 'fecha_salida', sp: 'FechaSalida_SS', type: 'date' },
  { pg: 'fecha_reingreso', sp: 'FechaReingreso_SS', type: 'date' },
  { pg: 'uso', sp: 'Uso_SS', type: 'text' },
  { pg: 'centro_de_costo', sp: 'CentroDeCosto_SS', type: 'text' },
  { pg: 'cantidad', sp: 'Cantidad_SS', type: 'number' },
  { pg: 'version_app', sp: 'Version_SS', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_SS', spHora: 'Hora_SS' },
];
// FechaMes_SS/FechaAno_SS dropped.
export const salidasStockResolutions: ResolutionMapping[] = [
  { pg: 'articulo_id', sp: 'IDArticulo_SS', via: 'articuloDirect' },
  { pg: 'tecnico_id', sp: 'Tecnico_SS', via: 'concatName' },
  { pg: 'usuario_id', sp: 'User_SS', via: 'usuarioApp' },
];

// ---------------------------------------------------------------------------
// 14.Compras
// ---------------------------------------------------------------------------
export const compras: Mapping[] = [
  { pg: 'id_compra', sp: 'IDCompra_C', type: 'text' },
  // display 'UsuarioCompra_C' — the requester chosen in a combobox; plain text
  // column in the schema (no FK), unlike UsuarioCompra_C below.
  { pg: 'usuario_compra', sp: 'UsuarioCompra_C0', type: 'text' },
  { pg: 'urgencia', sp: 'UrgenciaPedido_C', type: 'text' },
  { pg: 'observacion', sp: 'Observacion_C', type: 'text' },
  { pg: 'obs_recibir', sp: 'ObsRecibir_C', type: 'text' },
  { pg: 'fecha', sp: 'Fecha_C', type: 'date' },
  { pg: 'cantidad_total', sp: 'CantidadTotal_C', type: 'number' },
  { pg: 'monto_total', sp: 'MontoTotal_C', type: 'money' },
  { pg: 'status', sp: 'Status_C', type: 'passthrough' },
  { pg: 'cargo', sp: 'Cargo_C', type: 'text' }, // legacy, read once in UI
  { pg: 'sector_pedido', sp: 'SectorPedido_C', type: 'text' }, // legacy, never written
  // ASSUMPTION: internal name not given explicitly by data_model.md for this list;
  // inferred from the majority 'Version_XX' convention (Version_IN/_BC/_SS/_AP).
  { pg: 'version_app', sp: 'Version_C', type: 'text' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];
// Hora_C folds into created_at; MesAño_C dropped.
export const comprasResolutions: ResolutionMapping[] = [
  // display 'Usuario_C' — the creator, resolved by concat_name (distinct from usuario_compra above).
  { pg: 'usuario_id', sp: 'UsuarioCompra_C', via: 'concatName' },
];

// ---------------------------------------------------------------------------
// 15.DetalleCompras — recycled internal names from a copy of 08.Stock.
// Every recycled entry is flagged; map by the DISPLAY name in the comment,
// never rename the `sp` key to match the display name.
// ---------------------------------------------------------------------------
export const detalleCompras: Mapping[] = [
  { pg: 'id_univoco', sp: 'IDUnivoco_DC', type: 'text' },
  { pg: 'articulo', sp: 'Articulo_ST', type: 'text' }, // RECYCLED — display Articulo_DC
  { pg: 'edificio', sp: 'Edificio_DC', type: 'text' }, // not recycled
  { pg: 'cantidad', sp: 'Cantidad_ST', type: 'number' }, // RECYCLED — display Cantidad_DC
  { pg: 'recibido', sp: 'Recibido_DC', type: 'number' }, // not recycled
  { pg: 'costo_unitario', sp: 'PrecioUnitario_ST', type: 'money' }, // RECYCLED — display CostoUnitario_DC
  { pg: 'cant_min', sp: 'CantMin_DC', type: 'number' }, // not recycled
  { pg: 'costo_total', sp: 'CondicionCorte_ST', type: 'money' }, // RECYCLED — display CostoTotal_DC
  { pg: 'activo', sp: 'Status_ST', type: 'bool_activo_inactivo' }, // RECYCLED — display Status_DC
  // ASSUMPTION: internal name not given explicitly; inferred from the majority
  // 'Version_XX' convention, same caveat as compras.version_app above.
  { pg: 'version_app', sp: 'Version_DC', type: 'text' },
  { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_DC', spHora: 'Hora_DC' },
];
export const detalleComprasResolutions: ResolutionMapping[] = [
  { pg: 'compra_id', sp: 'IDCompra_DC', via: 'compraBusinessKey' },
  { pg: 'articulo_id', sp: 'IDArticulo_ST', via: 'articuloDirect' }, // RECYCLED — display IDArticulo_DC
  { pg: 'edificio_id', sp: 'IDEdificio_DC', via: 'edificioDirect' }, // not recycled
  { pg: 'usuario_id', sp: 'Usuario_DC', via: 'concatName' },
];

// ---------------------------------------------------------------------------
// 16.Aprobaciones
// ---------------------------------------------------------------------------
export const aprobaciones: Mapping[] = [
  { pg: 'status', sp: 'Status_AP', type: 'passthrough' },
  { pg: 'fecha', sp: 'Fecha_AP', type: 'date' },
  { pg: 'urgencia', sp: 'Urgencia_AP', type: 'text' },
  { pg: 'tecnico', sp: 'Tecnico_AP', type: 'text' },
  { pg: 'obs_compra', sp: 'Obscompra_AP', type: 'text' },
  { pg: 'fecha_aprobada', sp: 'FechaAprobada_AP', type: 'date' },
  { pg: 'obs_rechazo', sp: 'ObsRechazo_AP', type: 'text' },
  { pg: 'cantidad', sp: 'Cantidad_AP', type: 'number' },
  { pg: 'monto', sp: 'Monto_AP', type: 'money' },
  { pg: 'sector', sp: 'Sector_AP', type: 'text' },
  { pg: 'version_app', sp: 'Version_AP', type: 'text' },
  { pg: 'hora', sp: 'Hora_AP', type: 'time' },
  { pg: 'created_at', sp: 'Created', type: 'iso' },
];
// FechaMesAño*/FechaAño* derived columns dropped.
export const aprobacionesResolutions: ResolutionMapping[] = [
  // IDCompra_A is redundant with IDCompra_AP (both compras SP id) — only one is needed.
  // IDUnivoco_AP (compras.id_compra business key) is the fallback when the SP id doesn't resolve.
  { pg: 'compra_id', sp: 'IDCompra_AP', via: 'compraDirectOrBusinessKey', spFallback: 'IDUnivoco_AP' },
  { pg: 'user_gen_id', sp: 'UserGen_AP', via: 'usuarioApp' },
  { pg: 'user_aprob_id', sp: 'User_AP', via: 'usuarioApp' },
];

// ---------------------------------------------------------------------------
// 19.Ventilaciones
// ---------------------------------------------------------------------------
export const ventilaciones: Mapping[] = [
  { pg: 'estado', sp: 'field_1', type: 'passthrough' }, // Estado_VE
  { pg: 'direccion_edificio', sp: 'field_2', type: 'text' }, // DireccionEdificio_VE
  { pg: 'edificio', sp: 'field_3', type: 'text' }, // Edificio_VE
  { pg: 'habitacion', sp: 'field_5', type: 'text' }, // Habitacion_VE
  { pg: 'frecuencia_dias', sp: 'field_6', type: 'number' }, // Frecuencia_VE — value copy, not FK
  { pg: 'fecha_ultima', sp: 'field_7', type: 'date' }, // FechaUltima_VE
  { pg: 'proxima_limpieza', sp: 'field_8', type: 'date' }, // ProximaLimpieza_VE
  { pg: 'fecha_programada', sp: 'field_11', type: 'date' }, // FechaProgramada_VE
  { pg: 'obs_adelanto', sp: 'field_12', type: 'text' },
  { pg: 'obs_resuelto', sp: 'field_13', type: 'text' },
  { pg: 'version_asignado', sp: 'field_18', type: 'text' },
  { pg: 'version_resuelto', sp: 'field_23', type: 'text' },
  { pg: 'es_incidente', sp: 'field_24', type: 'bool_si_no' }, // EsIncidente_VE
  { pg: 'orden', sp: 'field_25', type: 'number' }, // Orden_VE
  { kind: 'datetime', pg: 'fecha_asignado', spDate: 'field_16', spHora: 'field_17' },
  { kind: 'datetime', pg: 'fecha_finalizacion', spDate: 'field_19', spHora: 'field_22' },
];
// field_9/10/14/20/21 dropped (derived month/year strings + Asignado_VE denorm name, no column for it).
// foto_path has no SP source (new column for finalizar_ventilacion()) — left null on migrated rows.
export const ventilacionesResolutions: ResolutionMapping[] = [
  { pg: 'unidad_id', sp: 'field_4', via: 'unidadDirect' }, // IDHabitacion_VE
  { pg: 'asignado_id', sp: 'field_15', via: 'usuarioDirect' }, // IDAsignado_VE
];
