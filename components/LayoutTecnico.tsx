// Technician module shell — responsive (DESIGN.md §4.5). Desktop gets a persistent
// sidebar + wide content (mirrors the back-office Layout); mobile keeps the phone-first
// hub-and-spoke where each view owns its own header/back button. <TooltipHost/> once here.
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LogOut, Monitor, Moon, Sun } from 'lucide-react';
import { cn } from './ui/UIComponents';
import { TooltipHost } from './ui/Tooltip';
import ConfirmModal from './ConfirmModal';
import EdificioPicker from './tecnico/EdificioPicker';
import BuildingChip from './tecnico/BuildingChip';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { useBuilding } from '../contexts/BuildingContext';
import { canAccessModule, moduleRoute } from '../utils/permissions';
import { moduleIcon, moduleLabel } from '../config/moduleIcons';

interface TecnicoNav { modulo: string; route: string; label: string }

// Nicer sidebar labels for the mantenimiento module keys (moduleLabel is the fallback).
const TECNICO_LABELS: Record<string, string> = {
  Home: 'Inicio',
  OT: 'Órdenes de Trabajo',
  Stock: 'Stock',
  Ventilaciones: 'Ventilaciones',
  Activos: 'Activos',
};

const LayoutTecnico = () => {
  const { user, permisos, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { edificios, selected, setSelected, pickerOpen, closePicker } = useBuilding();
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Only mantenimiento modules the user can access — the `/tecnico` route filter drops
  // back-office modules that leak in for Admin (who passes canAccessModule for everything).
  const entries = useMemo<TecnicoNav[]>(() => {
    if (!user) return [];
    const seen = new Set<string>();
    const mods: TecnicoNav[] = [];
    for (const row of [...permisos].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))) {
      if (!canAccessModule(user.perfil, row.modulo, permisos)) continue;
      const route = moduleRoute(row.modulo, 'Mantenimiento');
      if (!route.startsWith('/tecnico') || seen.has(route)) continue;
      seen.add(route);
      mods.push({ modulo: row.modulo, route, label: TECNICO_LABELS[row.modulo] ?? moduleLabel(row.modulo) });
    }
    return [{ modulo: 'Home', route: '/tecnico', label: 'Inicio' }, ...mods];
  }, [user, permisos]);

  const doLogout = () => { logout(); navigate('/login', { replace: true }); };

  return (
    <div className="tecnico-theme min-h-dvh bg-secondary/30 md:flex md:h-screen md:bg-background">
      {/* Desktop sidebar — hidden on mobile; each view owns its own mobile header/nav. */}
      <aside className="hidden w-60 shrink-0 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <img src="/logo.png" alt="Top Rentals" className="h-8 w-8 shrink-0 rounded-md" />
          <span className="truncate text-sm font-bold tracking-tight">Top Rentals</span>
        </div>
        <div className="border-b px-4 py-3">
          <BuildingChip className="w-full" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {entries.map((entry) => {
            const Icon = moduleIcon(entry.modulo);
            return (
              <NavLink
                key={entry.route}
                to={entry.route}
                end={entry.route === '/tecnico'}
                className={({ isActive }) =>
                  cn(
                    'group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium transition-all',
                    isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )
                }
              >
                <Icon className="mr-3 h-4 w-4 shrink-0" />
                <span className="truncate">{entry.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="space-y-1 border-t p-3">
          {user && (
            <div className="mb-1 flex items-center gap-2.5 rounded-lg bg-secondary/50 px-2.5 py-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                {`${user.nombre?.[0] ?? ''}${user.apellido?.[0] ?? ''}`.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold leading-tight">{user.nombre} {user.apellido}</p>
                <p className="truncate text-xs text-muted-foreground leading-tight">{user.perfil}</p>
              </div>
            </div>
          )}
          <button
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground"
          >
            {theme === 'dark' ? <Moon className="mr-3 h-4 w-4 shrink-0" /> : <Sun className="mr-3 h-4 w-4 shrink-0" />}
            {theme === 'dark' ? 'Modo oscuro' : 'Modo claro'}
          </button>
          {user?.perfil === 'Admin' && (
            <button
              onClick={() => navigate('/home')}
              title="Volver al escritorio"
              aria-label="Volver al escritorio"
              className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-accent hover:text-accent-foreground"
            >
              <Monitor className="mr-3 h-4 w-4 shrink-0" /> Escritorio
            </button>
          )}
          <button
            onClick={() => setConfirmLogout(true)}
            className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-destructive/10"
          >
            <LogOut className="mr-3 h-4 w-4 shrink-0" /> Cerrar sesión
          </button>
        </div>
      </aside>

      {/* Content: mobile keeps the phone column (white); desktop uses the remaining width. */}
      <main className="md:flex-1 md:overflow-y-auto md:bg-secondary/30">
        <div className="mx-auto w-full max-w-md bg-background md:max-w-6xl md:bg-transparent">
          <Outlet />
        </div>
      </main>

      <TooltipHost />
      <EdificioPicker
        isOpen={pickerOpen}
        onClose={closePicker}
        edificios={edificios}
        selected={selected}
        onSelect={setSelected}
        onLogout={doLogout}
        forced={selected == null}
      />
      <ConfirmModal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={doLogout}
        title="Cerrar sesión"
        description="¿Estás seguro de que querés salir de la aplicación?"
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
        variant="danger"
        icon={<LogOut className="h-6 w-6" />}
      />
    </div>
  );
};

export default LayoutTecnico;
