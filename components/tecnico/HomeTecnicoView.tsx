// mobile/Home Tecnico — landing/dispatcher hub for field technicians.
// docs/analysis/mobile_Home_Tecnico.md react_mapping.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, RefreshCw, Wrench, ClipboardList } from 'lucide-react';
import { Button } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Edificio, OrdenTrabajo } from '../../services/types.ts';
import { canAccessModule } from '../../utils/permissions';
import { moduleIcon } from '../../config/moduleIcons';
import { formatDate } from '../../utils/dates';
import { BottomSheet, zonaKey, grupoStockKey, edificioOptions } from './shared';

const TILE_LABELS: Record<string, string> = {
  OT: 'Órdenes de Trabajo',
  Activos: 'Activos',
  Ventilaciones: 'Ventilaciones',
  Stock: 'Stock',
};

type ActiveSheet = 'logout' | 'towerPicker' | 'stockPicker' | null;

const HomeTecnicoView: React.FC = () => {
  const { user, permisos, logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [loadingOts, setLoadingOts] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [pickerTarget, setPickerTarget] = useState<'ot' | 've' | null>(null);
  const [pickerValue, setPickerValue] = useState('');

  const loadOts = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await api.ots.list();
      setOts(rows.filter((o) => o.tecnico_id === user.id && o.status === 'Asignada'));
    } catch {
      showToast('No se pudieron cargar tus órdenes de trabajo.', 'error');
    }
  }, [user, showToast]);

  useEffect(() => {
    let cancelled = false;
    setLoadingOts(true);
    Promise.all([api.edificios.list(), loadOts()])
      .then(([eds]) => { if (!cancelled) setEdificios(eds); })
      .finally(() => { if (!cancelled) setLoadingOts(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadOts();
    setRefreshing(false);
  };

  const closeSheet = () => { setActiveSheet(null); setPickerTarget(null); setPickerValue(''); };

  const handleOtCardClick = (ot: OrdenTrabajo) => {
    const ed = edificios.find((e) => e.nombre === ot.torre);
    navigate('/tecnico/ot', ed ? { state: { zona: zonaKey(ed), edificioNombre: ed.nombre } } : undefined);
  };

  const handleTileClick = (modulo: string) => {
    switch (modulo) {
      case 'Activos':
        navigate('/tecnico/activos');
        return;
      case 'OT':
        setPickerTarget('ot');
        setActiveSheet('towerPicker');
        return;
      case 'Ventilaciones':
        setPickerTarget('ve');
        setActiveSheet('towerPicker');
        return;
      case 'Stock':
        setActiveSheet('stockPicker');
        return;
      default:
        return;
    }
  };

  const handleTowerAccept = () => {
    const ed = edificios.find((e) => String(e.id) === pickerValue);
    if (!ed) return;
    const state = { zona: zonaKey(ed), edificioNombre: ed.nombre };
    navigate(pickerTarget === 've' ? '/tecnico/ventilaciones' : '/tecnico/ot', { state });
    closeSheet();
  };

  const handleStockAccept = () => {
    const ed = edificios.find((e) => String(e.id) === pickerValue);
    if (!ed) return;
    navigate('/tecnico/stock', { state: { grupo: grupoStockKey(ed), edificioNombre: ed.nombre, edificioId: ed.id } });
    closeSheet();
  };

  const handleLogout = async () => {
    logout();
    navigate('/login');
  };

  const tiles = permisos
    .filter((p) => canAccessModule(user!.perfil, p.modulo, permisos))
    .sort((a, b) => a.orden - b.orden);

  const towerOptions = edificioOptions(edificios.filter((e) => e.status === 'Activo'), zonaKey);
  const stockOptions = edificioOptions(edificios.filter((e) => e.status === 'Activo'), grupoStockKey);

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setActiveSheet('logout')}
          aria-label="Cerrar sesión"
          className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors"
        >
          <LogOut className="h-5 w-5" />
        </button>
        <button
          onClick={handleRefresh}
          aria-label="Actualizar"
          disabled={refreshing}
          className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {user?.nombre}</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Tus tareas asignadas</p>
      </div>

      {/* Carousel de OT asignadas */}
      {loadingOts ? (
        <div className="py-8"><Loader size="sm" /></div>
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
      <div className="grid grid-cols-2 gap-3">
        {tiles.map((tile) => {
          const Icon = moduleIcon(tile.modulo);
          return (
            <button
              key={tile.id}
              onClick={() => handleTileClick(tile.modulo)}
              className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 shadow-sm active:scale-[0.98] transition-all"
            >
              <div className="h-12 w-12 rounded-full bg-brand/10 flex items-center justify-center">
                <Icon className="h-6 w-6 text-brand" />
              </div>
              <span className="text-sm font-semibold text-center">{TILE_LABELS[tile.modulo] ?? tile.modulo}</span>
            </button>
          );
        })}
      </div>

      {/* Logout confirm */}
      <ConfirmModal
        isOpen={activeSheet === 'logout'}
        onClose={closeSheet}
        onConfirm={handleLogout}
        title="Cerrar sesión"
        description="¿Seguro que querés cerrar sesión?"
        confirmText="Cerrar sesión"
        cancelText="Cancelar"
        variant="danger"
        icon={<LogOut className="h-6 w-6" />}
      />

      {/* Tower picker (OT / Ventilaciones) */}
      <BottomSheet
        isOpen={activeSheet === 'towerPicker'}
        onClose={closeSheet}
        title="Elegí el edificio"
        subtitle={pickerTarget === 've' ? 'Ventilaciones' : 'Órdenes de trabajo'}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={closeSheet}>Cancelar</Button>
            <Button className="flex-1" disabled={!pickerValue} onClick={handleTowerAccept}>Aceptar</Button>
          </>
        }
      >
        <Select value={pickerValue} onChange={setPickerValue} options={towerOptions} placeholder="Seleccioná un edificio" />
      </BottomSheet>

      {/* Stock picker */}
      <BottomSheet
        isOpen={activeSheet === 'stockPicker'}
        onClose={closeSheet}
        title="Elegí el edificio"
        subtitle="Stock"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={closeSheet}>Cancelar</Button>
            <Button className="flex-1" disabled={!pickerValue} onClick={handleStockAccept}>Aceptar</Button>
          </>
        }
      >
        <Select value={pickerValue} onChange={setPickerValue} options={stockOptions} placeholder="Seleccioná un edificio" />
      </BottomSheet>
    </div>
  );
};

export default HomeTecnicoView;
