// Centralized role/module access matrix (docs/DESIGN.md §14 pattern, driven by real
// perfiles_permisos rows instead of a hardcoded switch). Shared by sidebar + router —
// never hardcode a one-off module check outside this file (CLAUDE.md "Arquitectura").
import type { AplicacionApp, Perfil, PerfilPermiso } from '../services/types.ts';

type PermisoColumn = Extract<keyof PerfilPermiso, 'admin' | 'operador' | 'tecnico' | 'recepcion' | 'compras' | 'gerencia' | 'jefe_operativo'>;

// 'Supervisor Ventilaciones' has no dedicated column in 99.ABM_ListaPermisosPerfilesV3
// (confirmed by inspecting the live list: the only role columns are Admin/Operador/
// Recepcion/Tecnico/Compras/JefeOperativo) — mapped to jefe_operativo as the closest
// existing operational-supervisor column.
// ponytail: this mapping is a best-effort inference, not confirmed business data.
const PERFIL_COLUMN: Record<Perfil, PermisoColumn> = {
  Admin: 'admin',
  Operador: 'operador',
  Tecnico: 'tecnico',
  Recepcion: 'recepcion',
  Compras: 'compras',
  Gerencia: 'gerencia', // vestigial: Gerencia is resolved by the hardcoded rule below, not this column
  'Supervisor Ventilaciones': 'jefe_operativo',
};

// Gerencia is NOT data-driven. 99.ABM_ListaPermisosPerfilesV3 has no Gerencia column, and the
// original Power App never gave it a menu (the desktop sidebar If-chain over Perfil_Usr has no
// Gerencia branch — it falls through to an empty menu). Gerencia's ONLY function is hardcoded in
// Screen_Aprobaciones: Perfil_Usr="Gerencia" is the final approver of the compras it filters by
// Status_AP="Aprobada Supervision". Ported verbatim: Gerencia sees Aprobaciones and nothing else.
const GERENCIA_MODULES = new Set(['Aprobaciones']);

/** Fail-closed: a role sees a module only if its column is explicitly 'SI'. Admin always sees everything. */
export function canAccessModule(perfil: Perfil, modulo: string, permisos: PerfilPermiso[]): boolean {
  if (perfil === 'Admin') return true;
  if (perfil === 'Gerencia') return GERENCIA_MODULES.has(modulo);
  const column = PERFIL_COLUMN[perfil];
  return permisos.some((row) => row.modulo === modulo && row.status === 'Activo' && row[column] === 'SI');
}

const DESKTOP_ROUTES: Record<string, string> = {
  Dashboard: '/dashboard',
  Home: '/home',
  Stock: '/stock',
  Compras: '/compras',
  Aprobaciones: '/aprobaciones',
  'Ordenes de Trabajo': '/ordenes-trabajo',
  Ventilaciones: '/ventilaciones',
  ABM: '/abm',
};

const MANTENIMIENTO_ROUTES: Record<string, string> = {
  Activos: '/tecnico/activos',
  OT: '/tecnico/ot',
  Ventilaciones: '/tecnico/ventilaciones',
  Stock: '/tecnico/stock',
};

export function moduleRoute(modulo: string, aplicacion: AplicacionApp = 'Desktop'): string {
  const table = aplicacion === 'Mantenimiento' ? MANTENIMIENTO_ROUTES : DESKTOP_ROUTES;
  return table[modulo] ?? '/home';
}

/**
 * The technician app is a fixed 4-spoke set. Its nav (sidebar + Home tiles) is defined HERE,
 * not derived from perfiles_permisos, because the migrated permission data can be missing the
 * Mantenimiento rows for some spokes — deriving from it dropped core modules (OT/Activos) from
 * the tech nav on real data. Access to /tecnico is already gated by canAccessTecnico
 * (Tecnico + Admin only), and every such user gets all 4 spokes.
 */
export const TECNICO_SPOKES: { modulo: string; route: string; label: string }[] = [
  { modulo: 'OT', route: '/tecnico/ot', label: 'Órdenes de Trabajo' },
  { modulo: 'Activos', route: '/tecnico/activos', label: 'Activos' },
  { modulo: 'Ventilaciones', route: '/tecnico/ventilaciones', label: 'Ventilaciones' },
  { modulo: 'Stock', route: '/tecnico/stock', label: 'Stock' },
];

/** Tecnico is confined to the mobile-first /tecnico module (blocked from desktop login entirely). */
export function isTecnicoOnly(perfil: Perfil): boolean {
  return perfil === 'Tecnico';
}

/** Everyone may reach /tecnico except back-office roles; Admin is the one exception. */
export function canAccessTecnico(perfil: Perfil): boolean {
  return perfil === 'Tecnico' || perfil === 'Admin';
}

/**
 * /dashboard stays Admin-only (route gating unchanged) — this only decides whether an Admin's
 * dashboard shows ALL buildings or is scoped to their own (usuarios.dashboard_global flag).
 */
export const canSeeGeneralDashboard = (user: { perfil: string; dashboard_global?: boolean }) => user.dashboard_global === true;
