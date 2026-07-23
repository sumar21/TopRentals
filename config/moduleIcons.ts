// Modulo (perfiles_permisos.modulo) -> lucide-react icon. Single source for sidebar +
// mobile nav so we never mix icon libraries (docs/DESIGN.md rule of gold #1).
import { Building2, CheckSquare, ClipboardList, Fan, Package, Settings, ShoppingCart, type LucideIcon, Home } from 'lucide-react';

export const MODULE_ICONS: Record<string, LucideIcon> = {
  Home: Home,
  Stock: Package,
  Compras: ShoppingCart,
  Aprobaciones: CheckSquare,
  'Ordenes de Trabajo': ClipboardList,
  OT: ClipboardList, // Mantenimiento (mobile) alias for the same module
  Ventilaciones: Fan,
  ABM: Settings,
  Activos: Building2,
};

export function moduleIcon(modulo: string): LucideIcon {
  return MODULE_ICONS[modulo] ?? Home;
}

// Display label overrides for the sidebar/nav. The `modulo` value stays the
// permission/route key (e.g. 'ABM'); only the human-facing label differs —
// PA shows this screen as "Configuración", not its list name.
const MODULE_LABELS: Record<string, string> = {
  ABM: 'Configuración',
  Aprobaciones: 'Mis aprobaciones',
};

export function moduleLabel(modulo: string): string {
  return MODULE_LABELS[modulo] ?? modulo;
}
