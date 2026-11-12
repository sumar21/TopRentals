// Tecnoapp ("Hotel") SharePoint lists -> typed Supabase tables (supabase/migrations/0016_tecnoapp.sql).
//
// Source of truth for the columns: the ORD/OTP/INV/... constants in the Tecnoapp's server/routes/*.ts.
// Every `sp` below is the SharePoint INTERNAL name (the key of Graph's `fields`), weird ones included:
//   IDUnivico_INV (typo), Mesa_x00f1_o (RS), *_OP (20.OrdenReproceso_OR), Status (ASQ), SinBlancos_O (= ConBlancos).
// SharePoint is all text, so each column carries the type the Postgres column gets; a non-empty value that
// does not parse becomes NULL and is reported as a rejection.
//
// The `0016` SQL columns and this table must match: `npm run check` compares them.
// Every SharePoint field that is not mapped here is kept in the table's `extra` jsonb (0017), minus system noise.
// The loader (tecnoapp.ts) only ever INSERTS (ON CONFLICT DO NOTHING); it never deletes or updates anything.

import { emptyToNull, parseDMY, parseNumber } from './coerce.ts';

export type ColType =
  | 'text'
  | 'date' // text 'dd/MM/yyyy' -> date
  | 'numeric' // text/number -> numeric
  | 'timestamptz' // ISO 8601 from Graph (SharePoint DateTime columns, Created)
  | 'timestamptz_dmy_hm'; // text 'dd/MM/yyyy HH:mm' (Argentina, UTC-3 all year) -> timestamptz

export interface Col {
  pg: string;
  sp: string;
  type: ColType;
}

export interface TableSpec {
  table: string;
  /** SharePoint list displayName. */
  list: string;
  cols: Col[];
}

const t = (pg: string, sp: string): Col => ({ pg, sp, type: 'text' });
const d = (pg: string, sp: string): Col => ({ pg, sp, type: 'date' });
const n = (pg: string, sp: string): Col => ({ pg, sp, type: 'numeric' });
const ts = (pg: string, sp: string): Col => ({ pg, sp, type: 'timestamptz' });
const tsDmyHm = (pg: string, sp: string): Col => ({ pg, sp, type: 'timestamptz_dmy_hm' });

export const TECNOAPP_TABLES: TableSpec[] = [
  // ---------------------------------------------------------------- catalogs
  {
    table: 'tipo_prendas',
    list: '99.ABM_TipoPrendas',
    cols: [
      t('nombre', 'field_1'), // TipoPrenda_TP
      t('segmento', 'field_2'), // Segmento_TP
      n('peso_grms', 'field_3'), // PesoGrms_TP
      t('edificio', 'field_4'), // ClienteUsuario_TP
      n('codigo_art', 'field_6'), // CódigoArt_TP
      n('num_orden', 'field_7'), // NumOrden_TP
    ],
  },
  {
    table: 'articulos_inventario',
    list: '99.ABM_ArticulosInventario',
    cols: [
      t('nombre', 'field_1'), // Articulo_ABMInv
      t('segmento', 'field_2'), // Segmento_ABMInv
      t('edificios', 'Edificio_ABMInv'), // free text, ',' and ';' mixed: "Downtown, Palermo Chico; Hub"
      n('cant_teorica', 'CantidadTeorica_ABMInv'),
      n('precio_unitario', 'PrecioUnitario_ABMInv'),
    ],
  },
  {
    table: 'calendario_orden_lavado',
    list: '99.ABM_CalendarioOrdenLavado',
    cols: [
      t('titulo', 'Title'), // 'OL' (orden de lavado) | 'INV' (corte de inventario)
      t('edificio', 'Edificio_COL'),
      n('dia', 'Dia_COL'),
      t('lunes', 'Lunes_COL'),
      t('martes', 'Martes_COL'),
      t('miercoles', 'Miercoles_COL'),
      t('jueves', 'Jueves_COL'),
      t('viernes', 'Viernes_COL'),
      t('sabado', 'Sabado_COL'),
      t('domingo', 'Domingo_COL'),
    ],
  },
  {
    table: 'segmentos_metricas',
    list: '99.ABM_SegmentosMetricas',
    cols: [
      t('segmento', 'Segmento_SM'),
      n('num_orden', 'NumOrden_SM'),
      t('perfil', 'Perfil_SM'),
    ],
  },
  {
    table: 'acceso_sin_qr',
    list: '99.ABM_AccederSinQr',
    cols: [
      t('edificio', 'Edificio_ASQ'),
      t('status', 'Status'), // display Status_ASQ, internal is plain "Status"
    ],
  },
  {
    table: 'permisos_menu_hotel',
    list: '99.ABM_ListaPermisosPerfilesV2',
    cols: [
      t('modulo', 'Modulo_LPP'),
      t('admin', 'Admin_LPP'), // 'SI' | 'NO' per profile column
      t('operador', 'Operador_LPP'),
      t('tecnico', 'Tecnico_LPP'),
      t('recepcion', 'Recepcion_LPP'),
      t('supervision', 'Supervision_LPP'),
      t('gerente', 'Gerente_LPP'),
      t('compras', 'Compras_LPP'),
      n('orden', 'SortByColumns_LPP'),
      t('aplicacion', 'Aplicacion_LPP'), // 'Hotel' | 'Desktop' | 'Mantenimiento'
      t('status', 'Status_LPP'), // 'Activo' | 'Inactivo'
    ],
  },
  // -------------------------------------------------------------- operational
  {
    table: 'ordenes_limpieza',
    list: '11.Ordenes',
    cols: [
      t('title', 'Title'),
      t('usuario', 'Usuario_O'),
      d('fecha', 'Fecha_O'),
      t('hora', 'Hora_O'),
      t('edificio', 'Edificio_O'),
      t('habitacion', 'Habitacion_O'),
      t('tipo_ingreso', 'TipoIngreso_O'),
      n('prendas', 'Prendas_O'), // display PrendasUnivocas_O: number of lines
      n('unidades', 'Unidades_O'), // display TotalBlanco_O: sum of quantities
      t('hs_acceso', 'HsAcceso_O'),
      t('hs_salida', 'HsSalida_O'),
      t('input_habit', 'InputHabit_O'),
      t('version_app', 'VersionApp_O'),
      t('mes_anio', 'MesA_x00f1_o_O'), // MesAño_O 'MM/yyyy'
      t('id_univoco', 'IDUnivoco_O'),
      n('total_desperfectos', 'TotalDesperfectos_O'),
      t('con_blancos', 'SinBlancos_O'), // display ConBlancos_O: 'SI' | 'NO' (the internal name says the opposite)
      t('motivo', 'Motivo_O'),
      t('observaciones', 'Observaciones_O'),
      t('status', 'Status_O'),
      t('estado_hab', 'EstadoHab_O'),
    ],
  },
  {
    table: 'ordenes_limpieza_detalle',
    list: '01.OT_Parcial',
    cols: [
      t('title', 'Title'),
      t('cliente', 'field_1'), // ClienteNombre_OTP (building)
      t('usuario', 'field_2'), // Usuario_OTP
      d('fecha', 'field_3'), // Fecha_OTP
      t('hora', 'field_4'), // Hs_OTP
      t('habitacion', 'field_5'), // Habitacion_OTP
      t('tipo_prenda', 'field_6'), // TipoPrenda_OTP
      n('cantidad', 'field_7'), // Cantidad_OTP
      n('volumen_kgs', 'field_8'), // VolumenKgs_OTP
      t('id_nomenc_conso', 'field_9'), // IDNomencOTConso_OTP
      t('hs_acceso', 'field_10'), // HsAcceso_OTP
      t('hs_salida', 'field_11'), // HsSalida_OTP
      t('codigo_nomenclador', 'field_13'), // CodigoNomenclador_OTP: 'Libre' | 'Ocupada'
      t('tipo_ingreso', 'TipoIngreso_OTP'),
      ts('fecha_date_format', 'FechaDateFormat_OTP'),
      t('version_app', 'VersionApp_OTP'),
      t('input_habit', 'InputHabit_OTP'),
      t('edificio', 'Edificio_OTP'),
      ts('fecha_hora_concat', 'FechaHoraConcat_OTP'),
      t('id_univoco', 'IDUnivoco_OTP'),
      t('motivo', 'Motivo_OTP'),
      t('observaciones', 'Observaciones_OTP'),
      t('status', 'Status_OTP'),
      t('mes_anio', 'MesA_x00f1_o_OTP'),
    ],
  },
  {
    table: 'inventarios',
    list: '02.Inventarios',
    cols: [
      t('cliente', 'field_1'), // ClienteNombre_INV
      t('usuario', 'field_2'), // Usuario_INV
      d('fecha', 'field_3'), // Fecha_INV
      t('hora', 'field_4'), // Hs_INV
      t('habitacion', 'field_5'), // Habitacion_INV
      t('articulo', 'field_6'), // Articulo_INV
      n('cantidad', 'field_7'), // Cantidad_INV
      t('edificio', 'field_8'), // Torre_INV (building name)
      t('tipo_depto', 'field_9'), // TipoDepto_INV
      t('nr', 'NR_INV'),
      t('hs_acceso', 'HsAcceso_INV'),
      t('hs_salida', 'HsSalida_INV'),
      t('segmento', 'SegmentoArt_INV'),
      t('version_app', 'VersionApp_INV'),
      t('id_univoco', 'IDUnivico_INV'), // typo in the internal name (display IDUnivoco_INV)
      t('input', 'Input_INV'),
    ],
  },
  {
    table: 'habitaciones_inventariadas',
    list: '03.RegHabInventariadas',
    cols: [
      t('title', 'Title'),
      t('usuario', 'Usuario_RHI'),
      t('habitacion', 'Habitacion_RHI'),
      d('fecha', 'Fecha_RHI'),
      t('hora', 'Hs_RHI'),
      t('input', 'Input_RHI'),
      t('version_app', 'VersionApp_RHI'),
      n('vajilla_cant', 'VajillaCant_RHI'),
      n('electro_cant', 'ElectroCant_RHI'),
      n('elem_cocina_cant', 'ElemCocinaCant_RHI'),
      t('mes', 'Mes_RHI'), // 'mm'
      t('id_univoco', 'IDUnivoco_RHI'),
      t('edificio', 'Edificio_RHI'),
    ],
  },
  {
    table: 'ordenes_lavado',
    list: '12.OrdenesLav',
    cols: [
      t('title', 'Title'),
      t('usuario', 'Usuario_CRL'),
      t('edificio', 'Edificio_CRL'),
      d('fecha', 'Fecha_CRL'),
      t('hora', 'Hora_CRL'),
      t('version_app', 'VersionApp_CRL'),
      t('tipo_de_orden', 'TipoDeOrden_CRL'),
      n('cantidad_total_prendas', 'CantidadTotalPrendas_CRL'),
      tsDmyHm('fecha_hora_desde', 'FechaHoraDesde_CRL'),
      tsDmyHm('fecha_hora_hasta', 'FechaHoraHasta_CRL'),
      t('status', 'Status_CRL'),
      t('id_univoco', 'IDUnivoco_CRL'),
      t('mes_anio', 'MesA_x00f1_o_CRL'),
    ],
  },
  {
    table: 'ordenes_lavado_detalle',
    list: '10.ResumenConsolidadoTotalEdif',
    cols: [
      t('title', 'Title'),
      t('tipo_prenda', 'TipoPrenda_RS'),
      n('cantidad', 'Cantidad_RS'),
      t('version_app', 'VersionApp_RS'),
      t('usuario', 'Usuario_RS'),
      d('fecha', 'Fecha_RS'),
      t('hora', 'Hora_RS'),
      t('id_univoco', 'IDUnivoco_RS'),
      t('edificio', 'Edificio_RS'),
      ts('fecha_format_day', 'FechaFormatDay_RS'),
      ts('fecha_hora_concat', 'FechaHoraConcat_RS'),
      t('margen_de_cierre', 'MargenDeCierre_RS'), // text '{desde} a {hasta}'
      t('status', 'Status_RS'),
      t('mes_anio', 'Mesa_x00f1_o'), // typo in the internal name (display MesAño_RS)
    ],
  },
  {
    table: 'ordenes_reproceso',
    list: '20.OrdenReproceso_OR',
    cols: [
      t('title', 'Title'),
      d('fecha', 'Fecha_OR'),
      t('hora', 'Hora_OP'), // display Hora_OR
      t('fecha_mes', 'FechaMes_OP'), // display FechaMes_OR
      t('usuario', 'Usuario_OP'),
      t('edificio', 'Edificio_OP'),
      t('tipo_prenda', 'TipoPrenda_OP'),
      n('cantidad', 'Cantidad_OP'),
      t('version_app', 'VersionApp_OR'),
      t('id_univoco', 'IDUnivoco_OR'),
      t('status', 'Status_OR'),
    ],
  },
  {
    table: 'uso_metricas',
    list: '07.UsoMetricas',
    cols: [
      t('usuario', 'Usr_UM'),
      d('fecha', 'Fecha_UM'),
      t('hora', 'Hs_UM'),
      t('version', 'Version_UM'),
      t('metrica', 'Metrica_UM'),
    ],
  },
];

export const ARCHIVE_TABLE = 'sharepoint_archivo';

/**
 * Graph `fields` keys that are SharePoint plumbing, not data: OData annotations, `_`-prefixed system columns
 * (_UIVersionString, _ComplianceFlags, _IsRecord, _ModerationStatus, ...), content type, attachments, link/edit helpers,
 * folder counters, app author/editor. Modified, AuthorLookupId and EditorLookupId are NOT noise: they land in `extra`.
 * `id` (the primary key) and `Created` (created_at) are already stored in their own columns.
 */
const SYSTEM_NOISE =
  /^(@|_)|^(id|Created|ContentType|Attachments|Edit|LinkTitle|LinkTitleNoMenu|ItemChildCount|FolderChildCount|DocIcon|AppAuthorLookupId|AppEditorLookupId)$/;

/** Every non-empty SharePoint field that no typed column takes, untouched; null when there is none. */
export function extraFields(spec: TableSpec, fields: Record<string, unknown>): Record<string, unknown> | null {
  const mapped = new Set(spec.cols.map((c) => c.sp));
  const extra: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (mapped.has(key) || SYSTEM_NOISE.test(key)) continue;
    if (value === null || value === undefined || value === '') continue;
    extra[key] = value;
  }
  return Object.keys(extra).length > 0 ? extra : null;
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/** ISO 8601 (what Graph returns for DateTime columns) -> normalized UTC ISO string. null if not a date. */
export function parseIsoTimestamp(value: unknown): string | null {
  const s = emptyToNull(value);
  if (!s || !/^\d{4}-\d{2}-\d{2}T/.test(s)) return null;
  const date = new Date(s);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** 'dd/MM/yyyy HH:mm' (Argentina, UTC-3 with no DST) -> ISO string with -03:00 offset. null on anything else. */
export function parseDmyHm(value: unknown): string | null {
  const s = emptyToNull(value);
  if (!s) return null;
  const m = /^(\d{2}\/\d{2}\/\d{4}) (\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const date = parseDMY(m[1]);
  const h = Number(m[2]);
  const min = Number(m[3]);
  if (!date || h > 23 || min > 59) return null;
  return `${date}T${String(h).padStart(2, '0')}:${m[3]}:00-03:00`;
}

function coerce(type: ColType, raw: unknown): unknown {
  switch (type) {
    case 'text':
      return emptyToNull(raw);
    case 'date':
      return parseDMY(raw);
    case 'numeric':
      return parseNumber(raw);
    case 'timestamptz':
      return parseIsoTimestamp(raw);
    case 'timestamptz_dmy_hm':
      return parseDmyHm(raw);
  }
}

export interface Rejection {
  list: string;
  spId: string;
  column: string; // SharePoint internal name
  raw: string;
}

/**
 * One SharePoint item -> one row (explicit `id` = the SharePoint item id, plus created_at from `Created`).
 * A value that is non-empty but does not parse is NULL in the row and pushed to `rejections`.
 */
export function mapTecnoappRow(
  spec: TableSpec,
  item: { id: string; fields: Record<string, unknown> },
  rejections: Rejection[],
): Record<string, unknown> {
  const row: Record<string, unknown> = { id: Number(item.id) };
  for (const col of spec.cols) {
    const raw = item.fields[col.sp];
    const value = coerce(col.type, raw);
    if (value === null && emptyToNull(raw) !== null) {
      rejections.push({ list: spec.list, spId: item.id, column: col.sp, raw: String(raw) });
    }
    row[col.pg] = value;
  }
  // column added by 0017: the SharePoint fields no typed column takes (nothing is lost at the cutover)
  row.extra = extraFields(spec, item.fields);
  // NOT NULL in the table: jsonb_populate_recordset does not apply defaults to a missing key.
  row.created_at = parseIsoTimestamp(item.fields.Created) ?? new Date().toISOString();
  return row;
}

/**
 * Has the SharePoint item been modified since it was migrated? `stored` is what Supabase keeps (extra->>'Modified', or
 * fields->>'Modified' in the archive), `spModified` the item's current `Modified`. An item with no `Modified` is left alone.
 */
export function modifiedChanged(stored: unknown, spModified: unknown): boolean {
  const sp = emptyToNull(spModified);
  if (!sp) return false;
  return emptyToNull(stored) !== sp;
}

/** Rows with an id at or above this were created by the app on Supabase: the SharePoint sync never touches them. */
export const APP_ID_FLOOR = 1_000_000;

export function rejectionsToCsv(rejections: Rejection[]): string {
  const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = rejections.map((r) => [r.list, r.spId, r.column, r.raw].map(esc).join(','));
  return ['list,sp_id,column,raw_value', ...lines].join('\n') + '\n';
}
