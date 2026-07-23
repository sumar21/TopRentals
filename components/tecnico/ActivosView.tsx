// mobile/Detalle Activos — read-only OT history for a chosen unit. No writes.
// docs/analysis/mobile_Detalle_Activos.md react_mapping.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Filter, ClipboardList, Building2 } from 'lucide-react';
import { Button, Badge } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Edificio, OrdenTrabajo, RepuestoOT, Unidad, Usuario } from '../../services/types.ts';
import { BottomSheet } from './shared';

type ActiveSheet = 'filter' | 'obs' | 'repuestos' | null;

const ActivosView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [appliedUnidad, setAppliedUnidad] = useState<Unidad | null>(null);
  const [loading, setLoading] = useState(false);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [filterEdificioId, setFilterEdificioId] = useState('');
  const [filterUnidadId, setFilterUnidadId] = useState('');
  const [selectedOt, setSelectedOt] = useState<OrdenTrabajo | null>(null);
  const [repuestosSel, setRepuestosSel] = useState<RepuestoOT[]>([]);

  useEffect(() => {
    Promise.all([api.edificios.list(), api.unidades.list(), api.usuarios.list()])
      .then(([eds, uns, us]) => { setEdificios(eds); setUnidades(uns); setUsuarios(us); })
      .catch(() => showToast('No se pudieron cargar los edificios.', 'error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edificioOptions = useMemo(
    () => edificios.filter((e) => e.status === 'Activo').sort((a, b) => a.nombre.localeCompare(b.nombre)).map((e) => ({ value: String(e.id), label: e.nombre })),
    [edificios],
  );
  const unidadOptions = useMemo(
    () => unidades
      .filter((u) => String(u.edificio_id) === filterEdificioId && u.status === 'Alta')
      .sort((a, b) => (a.depto ?? '').localeCompare(b.depto ?? ''))
      .map((u) => ({ value: String(u.id), label: u.depto ?? `Unidad ${u.id}` })),
    [unidades, filterEdificioId],
  );
  const usuariosMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u.concat_name])), [usuarios]);

  const handleAceptarFiltro = async () => {
    const unidad = unidades.find((u) => String(u.id) === filterUnidadId);
    if (!unidad) return;
    setLoading(true);
    try {
      const rows = await api.ots.list();
      setOts(rows.filter((o) => o.unidad_id === unidad.id));
      setAppliedUnidad(unidad);
      setActiveSheet(null);
    } catch {
      showToast('No se pudo cargar el historial de la unidad.', 'error');
    } finally {
      setLoading(false);
    }
  };

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
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Activos</h1>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={() => { setFilterEdificioId(appliedUnidad ? String(appliedUnidad.edificio_id ?? '') : ''); setFilterUnidadId(appliedUnidad ? String(appliedUnidad.id) : ''); setActiveSheet('filter'); }}>
          <Filter className="h-3.5 w-3.5" />Filtrar
        </Button>
      </div>

      {!appliedUnidad ? (
        <EmptyState icon={Building2} title="Elegí un edificio y una unidad" message="Usá 'Filtrar' para ver el historial de órdenes de trabajo de un activo." />
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : ots.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin órdenes de trabajo" message="Esta unidad no tiene órdenes de trabajo registradas." />
      ) : (
        <div className="space-y-2">
          {ots.map((ot) => (
            <div key={ot.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold truncate">{ot.torre} - {ot.departamento} {ot.problema ? `| ${ot.problema}` : ''}</p>
                <StatusBadge status={ot.status} />
              </div>
              <p className="text-xs text-muted-foreground">{usuariosMap.get(ot.tecnico_id ?? -1) ?? 'Sin técnico asignado'}</p>
              <div className="flex items-center gap-4 pt-1">
                <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => openObs(ot)}>Ver observación</button>
                <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => openRepuestos(ot)}>Ver repuestos</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filtrar */}
      <BottomSheet
        isOpen={activeSheet === 'filter'}
        onClose={() => setActiveSheet(null)}
        title="Filtrar activos"
        footer={<Button className="flex-1" disabled={!filterUnidadId} onClick={handleAceptarFiltro}>Aceptar</Button>}
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio</label>
          <Select value={filterEdificioId} onChange={(v) => { setFilterEdificioId(v); setFilterUnidadId(''); }} options={edificioOptions} placeholder="Seleccioná un edificio" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Unidad</label>
          <Select value={filterUnidadId} onChange={setFilterUnidadId} options={unidadOptions} placeholder="Seleccioná una unidad" disabled={!filterEdificioId} />
        </div>
      </BottomSheet>

      {/* Ver observación */}
      <BottomSheet isOpen={activeSheet === 'obs'} onClose={() => setActiveSheet(null)} title="Observación del incidente" subtitle={selectedOt?.concat_activo ?? undefined}>
        <p className="text-sm whitespace-pre-wrap">{selectedOt?.detalle || 'Sin observaciones.'}</p>
      </BottomSheet>

      {/* Ver repuestos */}
      <BottomSheet isOpen={activeSheet === 'repuestos'} onClose={() => setActiveSheet(null)} title="Repuestos" subtitle={selectedOt?.concat_activo ?? undefined}>
        {repuestosSel.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin repuestos asignados.</p>
        ) : (
          <div className="space-y-2">
            {repuestosSel.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                <span className="text-sm">{r.repuesto}</span>
                <Badge>{r.cantidad}</Badge>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>
    </div>
  );
};

export default ActivosView;
