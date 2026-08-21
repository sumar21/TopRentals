// mobile/Detalle Activos — read-only OT history for a chosen unit. No writes.
// docs/analysis/mobile_Detalle_Activos.md react_mapping.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, ClipboardList, Building2, FileText, Wrench } from 'lucide-react';
import { Button, Badge } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useBuilding } from '../../contexts/BuildingContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { OrdenTrabajo, RepuestoOT, Unidad, Usuario } from '../../services/types.ts';
import { capitalizeFirst } from '../../utils/strings.ts';
import { formatDate } from '../../utils/dates';
import { BottomSheet, groupRepuestos } from './shared';
import BuildingChip from './BuildingChip';

type ActiveSheet = 'filter' | 'obs' | 'repuestos' | null;

const ActivosView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { selected, openPicker, loading: buildingLoading } = useBuilding();

  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [filterUnidadId, setFilterUnidadId] = useState(''); // '' = todas las unidades del edificio
  const [selectedOt, setSelectedOt] = useState<OrdenTrabajo | null>(null);
  const [repuestosSel, setRepuestosSel] = useState<RepuestoOT[]>([]);

  const loadInit = () => {
    setLoadError(false);
    return Promise.all([api.unidades.list(), api.usuarios.list()])
      .then(([uns, us]) => { setUnidades(uns); setUsuarios(us); })
      .catch(() => { showToast('No se pudieron cargar las unidades.', 'error'); setLoadError(true); });
  };

  useEffect(() => {
    loadInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // #11: el edificio (global) ya alcanza para ver algo — antes hacía falta elegir edificio Y
  // unidad. El historial completo del edificio se carga solo; la unidad queda como recorte opcional.
  const loadOts = useCallback(async (edificioId: number, edificioNombre: string) => {
    setLoading(true); setLoadError(false);
    try {
      const rows = await api.ots.list();
      const idsUnidad = new Set(unidades.filter((u) => u.edificio_id === edificioId).map((u) => u.id));
      // Match por unidad (preciso) O por torre = nombre del edificio (robusto). En la data migrada
      // el `unidad_id` de la OT puede no haberse resuelto (FK por matching), pero `torre` viene como
      // texto directo — mismo criterio que OrdenesTecnicoView, así no se pierden OTs del edificio.
      setOts(
        rows
          .filter((o) => (o.unidad_id != null && idsUnidad.has(o.unidad_id)) || (o.torre != null && o.torre === edificioNombre))
          .sort((a, b) => b.id - a.id), // #12: más nuevas primero
      );
    } catch {
      showToast('No se pudo cargar el historial de órdenes de trabajo.', 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [unidades, showToast]);

  useEffect(() => {
    // Sin guard por `unidades`: el match por torre funciona aunque las unidades no hayan cargado
    // todavía (o falten en la data); cuando cargan, el efecto re-corre y suma el match por unidad.
    if (!selected) return;
    void loadOts(selected.id, selected.nombre);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, unidades]);

  // Cambiar de edificio (chip global) descarta el recorte por unidad del edificio anterior.
  useEffect(() => { setFilterUnidadId(''); }, [selected]);

  const unidadOptions = useMemo(
    () => unidades
      .filter((u) => u.edificio_id === selected?.id)
      .sort((a, b) => (a.depto ?? '').localeCompare(b.depto ?? ''))
      .map((u) => ({ value: String(u.id), label: u.depto ?? `Unidad ${u.id}` })),
    [unidades, selected],
  );
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u.concat_name])), [usuarios]);
  const visible = useMemo(() => {
    if (!filterUnidadId) return ots;
    const id = Number(filterUnidadId);
    return ots.filter((o) => o.unidad_id === id);
  }, [ots, filterUnidadId]);

  const openObs = (ot: OrdenTrabajo) => { setSelectedOt(ot); setActiveSheet('obs'); };
  const openRepuestos = async (ot: OrdenTrabajo) => {
    setSelectedOt(ot);
    setActiveSheet('repuestos');
    try {
      setRepuestosSel(await api.ots.repuestos.list(ot.id));
    } catch {
      showToast('No se pudieron cargar los repuestos.', 'error');
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" title="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Activos</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <BuildingChip />
          {selected && (
            <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => setActiveSheet('filter')}>
              <Filter className="h-3.5 w-3.5" />Filtrar
            </Button>
          )}
        </div>
      </div>

      {buildingLoading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : !selected ? (
        <div className="space-y-3">
          <EmptyState icon={Building2} title="Elegí un edificio" message="Seleccioná un edificio para ver el historial de órdenes de trabajo de sus activos." />
          <Button className="w-full" onClick={openPicker}>Elegí un edificio</Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={() => loadOts(selected.id, selected.nombre)} />
      ) : visible.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin órdenes de trabajo" message="Este edificio no tiene órdenes de trabajo registradas." />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((ot) => (
            <div key={ot.id} className="rounded-xl border bg-card p-3.5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2.5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{ot.torre} - {ot.departamento}{ot.problema ? ` | ${ot.problema}` : ''}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {usuariosMap.get(ot.tecnico_id ?? -1) ?? 'Sin técnico asignado'} · {formatDate(ot.fecha_asignada ?? ot.fecha_inicio ?? ot.created_at) || 'Sin fecha'}
                    </p>
                  </div>
                </div>
                <StatusBadge status={ot.status} />
              </div>
              <div className="mt-2.5 flex items-center gap-1.5 border-t pt-2.5">
                <button onClick={() => openObs(ot)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                  <FileText className="h-3.5 w-3.5" />Ver observación
                </button>
                <button onClick={() => openRepuestos(ot)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                  <Wrench className="h-3.5 w-3.5" />Ver repuestos
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtrar — recorte opcional por unidad sobre el historial ya cargado del edificio. */}
      <BottomSheet
        isOpen={activeSheet === 'filter'}
        onClose={() => setActiveSheet(null)}
        title="Filtrar por unidad"
        subtitle={selected?.nombre}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => { setFilterUnidadId(''); setActiveSheet(null); }}>Ver todas</Button>
            <Button className="flex-1" onClick={() => setActiveSheet(null)}>Cerrar</Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Unidad</label>
          <Select value={filterUnidadId} onChange={setFilterUnidadId} options={unidadOptions} placeholder="Todas las unidades" />
        </div>
      </BottomSheet>

      {/* Ver observación */}
      <BottomSheet
        isOpen={activeSheet === 'obs'}
        onClose={() => setActiveSheet(null)}
        title="Observación del incidente"
        subtitle={selectedOt?.concat_activo ?? undefined}
        footer={<Button className="flex-1" onClick={() => setActiveSheet(null)}>Cerrar</Button>}
      >
        <div className="min-h-[6rem] rounded-lg border bg-muted/20 px-3 py-2.5">
          <p className="text-sm whitespace-pre-wrap">{capitalizeFirst(selectedOt?.detalle) || 'Sin observaciones.'}</p>
        </div>
      </BottomSheet>

      {/* Ver repuestos */}
      <BottomSheet isOpen={activeSheet === 'repuestos'} onClose={() => setActiveSheet(null)} title="Repuestos" subtitle={selectedOt?.concat_activo ?? undefined}>
        {repuestosSel.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin repuestos asignados.</p>
        ) : (
          <div className="space-y-2">
            {groupRepuestos(repuestosSel).map((g) => (
              <div key={g.key} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                <span className="text-sm">{g.nombre}</span>
                <Badge>{g.cantidad}</Badge>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};

export default ActivosView;
