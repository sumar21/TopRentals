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
  Articulo, Edificio, EmailNotificacion, Frecuencia, PerfilPermiso, Unidad, Usuario,
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
