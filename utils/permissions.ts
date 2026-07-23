// Centralized role/module access matrix (docs/DESIGN.md §14 pattern, driven by real
// perfiles_permisos rows instead of a hardcoded switch). Shared by sidebar + router —
// never hardcode a one-off module check outside this file (CLAUDE.md "Arquitectura").
import type { AplicacionApp, Perfil, PerfilPermiso } from '../services/types.ts';

type PermisoColumn = Extract<keyof PerfilPermiso, 'admin' | 'operador' | 'tecnico' | 'recepcion' | 'compras' | 'gerencia' | 'jefe_operativo'>;

// 'Supervisor Ventilaciones' has no dedicated column in 99.ABM_ListaPermisosPerfilesV3
// (see data_model.md open questions) — mapped to jefe_operativo as the closest existing
// operational-supervisor column.
// ponytail: this mapping is a best-effort inference, not confirmed business data — revisit
// once the real per-role LPP cell values are inspected (data_model.md open question).
const PERFIL_COLUMN: Record<Perfil, PermisoColumn> = {
  Admin: 'admin',
  Operador: 'operador',
  Tecnico: 'tecnico',
  Recepcion: 'recepcion',
  Compras: 'compras',
  Gerencia: 'gerencia',
  'Supervisor Ventilaciones': 'jefe_operativo',
};

/** Fail-closed: a role sees a module only if its column is explicitly 'SI'. Admin always sees everything. */
export function canAccessModule(perfil: Perfil, modulo: string, permisos: PerfilPermiso[]): boolean {
  if (perfil === 'Admin') return true;
  const column = PERFIL_COLUMN[perfil];
  return permisos.some((row) => row.modulo === modulo && row.status === 'Activo' && row[column] === 'SI');
}

const DESKTOP_ROUTES: Record<string, string> = {
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

/** Tecnico is confined to the mobile-first /tecnico module (blocked from desktop login entirely). */
export function isTecnicoOnly(perfil: Perfil): boolean {
  return perfil === 'Tecnico';
}

/** Everyone may reach /tecnico except back-office roles; Admin is the one exception. */
export function canAccessTecnico(perfil: Perfil): boolean {
  return perfil === 'Tecnico' || perfil === 'Admin';
}
