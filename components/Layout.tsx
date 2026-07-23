// Back-office app shell — DESIGN.md §4.5: collapsible aside on desktop, fixed
// header + left drawer on mobile, <TooltipHost/> mounted once here.
import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ChevronLeft, LogOut, Menu, X } from 'lucide-react';
import { cn, Avatar, AvatarFallback } from './ui/UIComponents';
import { TooltipHost } from './ui/Tooltip';
import ConfirmModal from './ConfirmModal';
import { useAuth } from '../contexts/AuthContext';
import { canAccessModule, moduleRoute } from '../utils/permissions';
import { moduleIcon, moduleLabel } from '../config/moduleIcons';

interface NavEntry {
  modulo: string;
  route: string;
}

const NavItem = ({ entry, collapsed, onClick }: { entry: NavEntry; collapsed: boolean; onClick?: () => void }) => {
  const Icon = moduleIcon(entry.modulo);
  return (
    <NavLink
      to={entry.route}
      onClick={onClick}
      title={collapsed ? moduleLabel(entry.modulo) : undefined}
      className={({ isActive }) =>
        cn(
          'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all w-full',
          isActive ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
          collapsed && 'justify-center',
        )
      }
    >
      <Icon className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-3')} />
      {!collapsed && <span className="truncate">{moduleLabel(entry.modulo)}</span>}
    </NavLink>
  );
};

const Layout = () => {
  const { user, permisos, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const entries = useMemo<NavEntry[]>(() => {
    if (!user) return [];
    return permisos
      .filter((row) => canAccessModule(user.perfil, row.modulo, permisos))
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
      .map((row) => ({ modulo: row.modulo, route: moduleRoute(row.modulo, 'Desktop') }));
  }, [user, permisos]);

  const activeModule = entries.find((e) => location.pathname.startsWith(e.route))?.modulo ?? 'TopRentals';
  const initials = user ? `${user.nombre?.[0] ?? ''}${user.apellido?.[0] ?? ''}`.toUpperCase() || 'TR' : 'TR';

  const doLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const nav = (onItemClick?: () => void, isCollapsed = false) => (
    <nav className="flex-1 space-y-1 overflow-y-auto p-3">
      {entries.map((entry) => (
        <NavItem key={entry.modulo} entry={entry} collapsed={isCollapsed} onClick={onItemClick} />
      ))}
    </nav>
  );

  return (
    <div className="flex h-screen bg-background text-foreground">
      {/* Aside desktop */}
      <aside className={cn('hidden md:flex flex-col border-r bg-card transition-all duration-300 ease-in-out z-20', collapsed ? 'w-16' : 'w-64')}>
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <img src="/logo.png" alt="TopRentals" className="h-8 w-8 rounded-md shrink-0" />
          {!collapsed && <span className="text-sm font-bold tracking-tight truncate">TopRentals</span>}
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
            className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted"
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
          </button>
        </div>
        {nav(undefined, collapsed)}
        <div className="border-t p-3">
          <button
            onClick={() => setConfirmLogout(true)}
            title={collapsed ? 'Cerrar sesión' : undefined}
            className={cn(
              'group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-all w-full text-destructive hover:bg-red-50',
              collapsed && 'justify-center',
            )}
          >
            <LogOut className={cn('h-4 w-4 shrink-0', !collapsed && 'mr-3')} />
            {!collapsed && 'Cerrar sesión'}
          </button>
        </div>
      </aside>

      {/* Header mobile fijo */}
      <header className="fixed inset-x-0 top-0 z-20 flex h-16 items-center gap-3 border-b bg-card px-4 md:hidden">
        <button onClick={() => setDrawerOpen(true)} aria-label="Abrir menú" className="rounded-md p-2 text-muted-foreground hover:bg-muted">
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-sm font-bold tracking-tight">{moduleLabel(activeModule)}</span>
        <div className="ml-auto">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-brand/10 text-brand text-xs font-semibold">{initials}</AvatarFallback>
          </Avatar>
        </div>
      </header>

      {/* Drawer mobile izquierdo */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 md:hidden" onClick={() => setDrawerOpen(false)}>
          <div className="drawer-enter-left flex h-full w-72 max-w-[85vw] flex-col bg-card" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center gap-2 border-b px-4">
              <img src="/logo.png" alt="TopRentals" className="h-8 w-8 rounded-md" />
              <span className="text-sm font-bold tracking-tight">TopRentals</span>
              <button onClick={() => setDrawerOpen(false)} aria-label="Cerrar menú" className="ml-auto rounded-md p-1.5 text-muted-foreground hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
            {nav(() => setDrawerOpen(false))}
            <div className="border-t p-3">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setConfirmLogout(true);
                }}
                className="group flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-destructive transition-all hover:bg-red-50"
              >
                <LogOut className="mr-3 h-4 w-4" /> Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main */}
      <main className="mt-16 flex-1 overflow-y-auto bg-secondary/30 p-3 md:mt-0 md:p-8">
        <Outlet />
      </main>

      <TooltipHost />
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

export default Layout;
