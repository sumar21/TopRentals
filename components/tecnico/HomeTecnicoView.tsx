// mobile/Home Tecnico — landing/dispatcher hub for field technicians.
// docs/analysis/mobile_Home_Tecnico.md react_mapping.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Wrench, ClipboardList, Fan, AlertTriangle, Loader2 } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Edificio, OrdenTrabajo } from '../../services/types.ts';
import { canAccessModule, moduleRoute } from '../../utils/permissions';
import { moduleIcon } from '../../config/moduleIcons';
import { formatDate } from '../../utils/dates';
import { useBuilding } from '../../contexts/BuildingContext';
import BuildingChip from './BuildingChip';
import { edificioIdsEnGrupoStock, torresEnZona, zonaKey } from './shared';

const TILE_LABELS: Record<string, string> = {
  OT: 'Órdenes de Trabajo',
  Activos: 'Activos',
  Ventilaciones: 'Ventilaciones',
  Stock: 'Stock',
};

// Subtítulos de los tiles de módulo (estilo referencia: ícono + título + aclaración).
const TILE_SUBTITLES: Record<string, string> = {
  OT: 'Tareas del edificio',
  Activos: 'Máquinas y unidades',
  Ventilaciones: 'Mantenimiento programado',
  Stock: 'Repuestos disponibles',
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
  const { edificios: edificiosGlobal, selected, setSelected } = useBuilding();

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [loadingOts, setLoadingOts] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Mini-cards de pulso del edificio seleccionado (ventilaciones pendientes + bajo stock).
  const [ventPend, setVentPend] = useState(0);
  const [bajoStock, setBajoStock] = useState(0);
  const [loadingStats, setLoadingStats] = useState(false);

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

  // Mini-cards de pulso: ventilaciones pendientes/programadas + bajo stock del edificio
  // seleccionado. Mismos helpers/predicados que VentilacionesTecnicoView/StockTecnicoView/HomeAlerts.
  useEffect(() => {
    if (!selected) { setVentPend(0); setBajoStock(0); return; }
    let cancelled = false;
    setLoadingStats(true);
    const towers = torresEnZona(edificiosGlobal, zonaKey(selected));
    const poolIds = edificioIdsEnGrupoStock(edificiosGlobal, selected.id);
    Promise.all([api.ventilaciones.list(), api.stock.list()])
      .then(([vents, stock]) => {
        if (cancelled) return;
        setVentPend(vents.filter((v) => towers.includes(v.edificio ?? '') && (v.estado === 'Pendiente' || v.estado === 'Programada')).length);
        setBajoStock(stock.filter((s) => s.edificio_ids.some((id) => poolIds.includes(id)) && s.cantidad > 0 && s.condicion_corte != null && s.cantidad < s.condicion_corte).length);
      })
      .catch(() => { if (!cancelled) { setVentPend(0); setBajoStock(0); } })
      .finally(() => { if (!cancelled) setLoadingStats(false); });
    return () => { cancelled = true; };
  }, [selected, edificiosGlobal]);

  const handleOtCardClick = (ot: OrdenTrabajo) => {
    // ponytail: the OT's own building may differ from the currently selected one — sync the
    // global selection to it before jumping, so OrdenesTecnicoView (which now reads
    // useBuilding().selected instead of router state) lands on the right building's list.
    const ed = edificios.find((e) => e.nombre === ot.torre);
    if (ed) setSelected(ed);
    navigate('/tecnico/ot');
  };

  const handleTileClick = (modulo: string) => navigate(moduleRoute(modulo, 'Mantenimiento'));

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  // Solo módulos de la app técnica (Mantenimiento). Sin este filtro, Admin —que pasa
  // canAccessModule para todo— veía tiles de módulos Desktop (Home/Compras/Aprobaciones/ABM)
  // que no tienen vista acá y no navegaban a nada. Mismo criterio que el sidebar de LayoutTecnico.
  const tiles = permisos
    .filter((p) => p.aplicacion === 'Mantenimiento' && canAccessModule(user!.perfil, p.modulo, permisos))
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

      {/* Mini-cards de pulso del edificio seleccionado */}
      {selected && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => navigate('/tecnico/ventilaciones')}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm active:scale-[0.98] transition-all text-left"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <Fan className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              {loadingStats ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-bold tabular-nums">{ventPend}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">Ventilaciones pendientes</p>
            </div>
          </button>
          <button
            onClick={() => navigate('/tecnico/stock')}
            className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm active:scale-[0.98] transition-all text-left"
          >
            <div className="h-10 w-10 shrink-0 rounded-full bg-primary/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              {loadingStats ? (
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <p className="text-2xl font-bold tabular-nums">{bajoStock}</p>
              )}
              <p className="text-xs text-muted-foreground truncate">Bajo stock</p>
            </div>
          </button>
        </div>
      )}

      {/* Carousel de OT asignadas */}
      {loadingOts ? (
        <div className="py-8"><Loader size="sm" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={loadAll} />
      ) : ots.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin tareas asignadas" message="No tenés órdenes de trabajo en curso." className="p-6" />
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

      {/* Grid de módulos — estilo referencia: 2 columnas, ícono + título + aclaración. */}
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = moduleIcon(tile.modulo);
          return (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.modulo)}
              className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 shadow-sm active:scale-[0.98] transition-all text-left"
            >
              <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 w-full">
                <p className="text-sm font-bold truncate">{TILE_LABELS[tile.modulo] ?? tile.modulo}</p>
                <p className="text-xs text-muted-foreground truncate">{TILE_SUBTITLES[tile.modulo] ?? ''}</p>
              </div>
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
