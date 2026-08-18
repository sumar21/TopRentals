// mobile/Home Tecnico — landing/dispatcher hub for field technicians.
// docs/analysis/mobile_Home_Tecnico.md react_mapping.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wrench, ClipboardList } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Edificio, OrdenTrabajo } from '../../services/types.ts';
import { canAccessModule } from '../../utils/permissions';
import { moduleIcon } from '../../config/moduleIcons';
import { formatDate } from '../../utils/dates';
import { useBuilding } from '../../contexts/BuildingContext';
import BuildingChip from './BuildingChip';

const TILE_LABELS: Record<string, string> = {
  OT: 'Órdenes de Trabajo',
  Activos: 'Activos',
  Ventilaciones: 'Ventilaciones',
  Stock: 'Stock',
};

// Building is global now — every tile jumps straight to its route (no per-tile picker).
const TILE_ROUTES: Record<string, string> = {
  OT: '/tecnico/ot',
  Activos: '/tecnico/activos',
  Ventilaciones: '/tecnico/ventilaciones',
  Stock: '/tecnico/stock',
};

// "Tareas asignadas" mirrors PA's "Órdenes de Trabajo en Curso": every OT tied to this
// technician that is still open — matched by NOT being terminal, not by an exact 'Asignada'.
// status migrates verbatim from Status_OT, so real data may carry an "en curso"-style label
// that isn't literally 'Asignada'; keying off the terminal set catches those too.
const OT_TERMINALES = new Set(['Cerrada', 'Cerrada F', 'Cerrada V', 'Anulada']);

const HomeTecnicoView: React.FC = () => {
  const { user, permisos, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const { setSelected } = useBuilding();

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [loadingOts, setLoadingOts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const loadOts = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await api.ots.list();
      setOts(rows.filter((o) => o.tecnico_id === user.id && !OT_TERMINALES.has(o.status)));
    } catch {
      showToast('No se pudieron cargar tus órdenes de trabajo.', 'error');
      throw new Error('ots');
    }
  }, [user, showToast]);

  const loadAll = useCallback(() => {
    setLoadingOts(true);
    setLoadError(false);
    return Promise.all([api.edificios.list(), loadOts()])
      .then(([eds]) => setEdificios(eds))
      .catch(() => setLoadError(true))
      .finally(() => setLoadingOts(false));
  }, [loadOts]);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Realtime: a back-office assignment pushes the new OT to the technician's carousel
  // without a manual refresh. loadOts doesn't touch the loader, so the update is silent.
  useEffect(() => api.realtime.subscribe(['ots'], () => { void loadOts().catch(() => {}); }), [loadOts]);

  const handleOtCardClick = (ot: OrdenTrabajo) => {
    // ponytail: the OT's own building may differ from the currently selected one — sync the
    // global selection to it before jumping, so OrdenesTecnicoView (which now reads
    // useBuilding().selected instead of router state) lands on the right building's list.
    const ed = edificios.find((e) => e.nombre === ot.torre);
    if (ed) setSelected(ed);
    navigate('/tecnico/ot');
  };

  const handleTileClick = (modulo: string) => navigate(TILE_ROUTES[modulo] ?? '/tecnico');

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  const tiles = permisos
    .filter((p) => canAccessModule(user!.perfil, p.modulo, permisos))
    .sort((a, b) => a.orden - b.orden);

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <BuildingChip />
        <button
          onClick={() => setConfirmLogout(true)}
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {user?.nombre}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tus tareas asignadas</p>
      </div>

      {/* Carousel de OT asignadas */}
      {loadingOts ? (
        <div className="py-8"><Loader size="sm" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={loadAll} />
      ) : ots.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin tareas asignadas" className="p-6" />
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 snap-x">
          {ots.map((ot) => (
            <button
              key={ot.id}
              onClick={() => handleOtCardClick(ot)}
              className="shrink-0 w-64 snap-start text-left rounded-lg border bg-card p-3 shadow-sm active:scale-[0.99] transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 shrink-0 rounded-lg bg-brand/10 flex items-center justify-center">
                    <Wrench className="h-4 w-4 text-brand" />
                  </div>
                  <p className="text-sm font-semibold truncate">{ot.concat_activo ?? `${ot.torre ?? ''} - ${ot.departamento ?? ''}`}</p>
                </div>
                <StatusBadge status={ot.prioridad} />
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {formatDate(ot.fecha_asignada)} {ot.dias_estimado != null ? `| ${ot.dias_estimado} días` : ''}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Grid de módulos */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((tile) => {
          const Icon = moduleIcon(tile.modulo);
          return (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.modulo)}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Icon className="h-6 w-6 text-primary" />
              </div>
              <span className="text-sm font-semibold text-center">{TILE_LABELS[tile.modulo] ?? tile.modulo}</span>
            </button>
          );
        })}
      </div>

      {/* Logout confirm */}
      <ConfirmModal
        isOpen={confirmLogout}
        onClose={() => setConfirmLogout(false)}
        onConfirm={handleLogout}
        title="Cerrar sesión"
        description="¿Seguro que querés cerrar sesión?"
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
        variant="danger"
        icon={<LogOut className="h-6 w-6" />}
      />
    </div>
  );
};

export default HomeTecnicoView;
