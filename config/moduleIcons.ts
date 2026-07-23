// Modulo (perfiles_permisos.modulo) -> lucide-react icon. Single source for sidebar +
// mobile nav so we never mix icon libraries (docs/DESIGN.md rule of gold #1).
import { Building2, CheckSquare, ClipboardList, Package, Settings, ShoppingCart, Wind, type LucideIcon, Home } from 'lucide-react';

export const MODULE_ICONS: Record<string, LucideIcon> = {
  Home: Home,
  Stock: Package,
  Compras: ShoppingCart,
  Aprobaciones: CheckSquare,
  'Ordenes de Trabajo': ClipboardList,
  OT: ClipboardList, // Mantenimiento (mobile) alias for the same module
  Ventilaciones: Wind,
  ABM: Settings,
  Activos: Building2,
};

export function moduleIcon(modulo: string): LucideIcon {
  return MODULE_ICONS[modulo] ?? Home;
}
