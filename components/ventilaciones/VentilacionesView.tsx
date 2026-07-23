// Ventilaciones — programación y seguimiento de limpieza de ductos por unidad.
// See docs/analysis/desktop_Screen_Ventilaciones.md. Horizonte por defecto: <=90 días
// (paridad con el DateDiff de la PA original); el filtro de mes permite ampliarlo.
import React, { useEffect, useMemo, useState } from 'react';
import { Search, SlidersHorizontal, ChevronDown, ChevronUp, Plus, Trash2, Eye, UserCheck, TriangleAlert, Wind } from 'lucide-react';
import { api } from '../../services/index.ts';
import type { Edificio, Frecuencia, Perfil, Unidad, Usuario, Ventilacion } from '../../services/types.ts';
import { Card, Table, TableHeader, TableBody, TableRow, TableHead, TableCell, Button, Input } from '../ui/UIComponents';
import { CategoryMultiSelect } from '../ui/CategoryMultiSelect';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import ConfirmModal from '../ConfirmModal';
import { useAuth } from '../../contexts/AuthContext';
import { formatDate } from '../../utils/dates.ts';
import { FEATURES } from '../../config/features.ts';
import { CrearVentilacionModal, AsignarVentilacionModal, DetalleVentilacionModal } from './VentilacionesModals';

const HORIZONTE_DIAS = 90;
const ESTADOS: Ventilacion['estado'][] = ['Pendiente', 'Asignada', 'Programada', 'Realizada'];

/** Admin + 'Supervisor Ventilaciones' — gate ad-hoc del dominio (no encaja en canAccessModule). */
const puedeGestionar = (perfil: Perfil) => perfil === 'Admin' || perfil === 'Supervisor Ventilaciones';

function fechaRelevante(v: Ventilacion): string | null {
  return v.fecha_programada ?? v.proxima_limpieza ?? v.fecha_finalizacion ?? null;
}
function diasHasta(iso: string): number {
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const fecha = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Math.round((fecha.getTime() - hoy.getTime()) / 86400000);
}
function mesLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
function ultimosMeses(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return mesLabel(d.toISOString());
  });
}

const VentilacionesView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [frecuencias, setFrecuencias] = useState<Frecuencia[]>([]);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [mesesSel, setMesesSel] = useState<string[]>([]);
  const [estadosSel, setEstadosSel] = useState<string[]>([]);
  const [edificiosSel, setEdificiosSel] = useState<string[]>([]);

  const [crearOpen, setCrearOpen] = useState(false);
  const [asignarTarget, setAsignarTarget] = useState<Ventilacion | null>(null);
  const [detalleTarget, setDetalleTarget] = useState<Ventilacion | null>(null);
  const [eliminarTarget, setEliminarTarget] = useState<Ventilacion | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [ventRows, edRows, uniRows, freqRows, userRows] = await Promise.all([
        api.ventilaciones.list(),
        api.edificios.list(),
        api.unidades.list(),
        api.frecuencias.list(),
        api.usuarios.list(),
      ]);
      setVentilaciones(ventRows);
      setEdificios(edRows);
      setUnidades(uniRows);
      setFrecuencias(freqRows);
      setTecnicos(userRows.filter((u) => u.perfil === 'Tecnico' && u.status === 'ALTA'));
    } catch {
      showToast('No se pudieron cargar las ventilaciones.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edificioOpts = useMemo(() => [...new Set(ventilaciones.map((v) => v.edificio).filter((e): e is string => !!e))].sort(), [ventilaciones]);
  const mesesOpts = useMemo(() => ultimosMeses(12), []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return ventilaciones.filter((v) => {
      if (q && !`${v.edificio ?? ''} ${v.habitacion ?? ''} ${v.estado}`.toLowerCase().includes(q)) return false;
      if (estadosSel.length > 0 && !estadosSel.includes(v.estado)) return false;
      if (edificiosSel.length > 0 && !edificiosSel.includes(v.edificio ?? '')) return false;
      const rel = fechaRelevante(v);
      if (mesesSel.length > 0) return rel ? mesesSel.includes(mesLabel(rel)) : false;
      // sin filtro de mes: horizonte por defecto (paridad con la PA original)
      return rel ? diasHasta(rel) <= HORIZONTE_DIAS : true;
    });
  }, [ventilaciones, search, estadosSel, edificiosSel, mesesSel]);

  const activeFilterCount = mesesSel.length + estadosSel.length + edificiosSel.length;

  const handleEliminar = async () => {
    if (!eliminarTarget) return;
    try {
      await api.ventilaciones.eliminar(eliminarTarget.id);
      showToast('Ventilación eliminada.', 'success');
      load();
    } catch {
      showToast('No se pudo eliminar la ventilación.', 'error');
    }
  };

  const renderAcciones = (v: Ventilacion) => {
    const canManage = user && puedeGestionar(user.perfil);
    return (
      <div className="flex justify-end gap-1">
        {FEATURES.asignarVentilacionDesktop && canManage && (
          <Button variant="ghost" size="icon" aria-label="Asignar" title="Asignar" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setAsignarTarget(v)}>
            <UserCheck className="h-4 w-4" />
          </Button>
        )}
        {v.estado === 'Realizada' && (
          <Button variant="ghost" size="icon" aria-label="Ver detalle" title="Ver detalle" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setDetalleTarget(v)}>
            <Eye className="h-4 w-4" />
          </Button>
        )}
        {canManage && v.estado === 'Pendiente' && (
          <Button variant="ghost" size="icon" aria-label="Eliminar" title="Eliminar" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={() => setEliminarTarget(v)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  const canCreate = user && puedeGestionar(user.perfil);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Ventilaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Limpieza recurrente de ductos por unidad.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <button type="button" onClick={() => setShowFilters((v) => !v)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${showFilters ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
            {activeFilterCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {canCreate && (
            <Button className="h-9 px-3 text-sm gap-1.5 shrink-0" onClick={() => setCrearOpen(true)}>
              <Plus className="h-3.5 w-3.5" /><span className="hidden sm:inline">Agregar</span>
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <CategoryMultiSelect categories={mesesOpts} selected={mesesSel} onChange={setMesesSel} label="Mes" clearLabel="Limpiar mes" />
            <CategoryMultiSelect categories={ESTADOS} selected={estadosSel} onChange={setEstadosSel} label="Estado" clearLabel="Limpiar estado" />
            <CategoryMultiSelect categories={edificioOpts} selected={edificiosSel} onChange={setEdificiosSel} label="Edificio" clearLabel="Limpiar edificio" />
            {activeFilterCount > 0 && (
              <button onClick={() => { setMesesSel([]); setEstadosSel([]); setEdificiosSel([]); }} className="text-xs font-medium text-muted-foreground hover:text-foreground">Limpiar todo</button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Ventilaciones" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Wind} title="Sin ventilaciones para mostrar" message="Ajustá la búsqueda o los filtros." />
      ) : (
        <>
          {/* MOBILE */}
          <div className="md:hidden space-y-2">
            {filtered.map((v) => (
              <div key={v.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <StatusBadge status={v.estado} />
                    {v.es_incidente && (
                      <span title="La fecha fue adelantada por un Técnico">
                        <TriangleAlert className="h-3.5 w-3.5 text-amber-600" aria-label="Incidente" />
                      </span>
                    )}
                  </div>
                  {renderAcciones(v)}
                </div>
                <p className="text-sm font-medium mt-2">{v.edificio || '-'} · {v.habitacion || '-'}</p>
                <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  <p>Última limpieza: {formatDate(v.fecha_ultima) || '-'}</p>
                  <p>Próxima/Programada: {formatDate(v.fecha_programada ?? v.proxima_limpieza) || '-'}</p>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP */}
          <Card className="hidden md:block border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Habitación</TableHead>
                  <TableHead>Última limpieza</TableHead>
                  <TableHead>Próxima/Programada</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((v) => (
                  <TableRow key={v.id}>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={v.estado} />
                        {v.es_incidente && (
                          <span title="La fecha fue adelantada por un Técnico">
                            <TriangleAlert className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-label="Incidente" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{v.edificio || '-'}</TableCell>
                    <TableCell>{v.habitacion || '-'}</TableCell>
                    <TableCell>{formatDate(v.fecha_ultima) || '-'}</TableCell>
                    <TableCell>{formatDate(v.fecha_programada ?? v.proxima_limpieza) || '-'}</TableCell>
                    <TableCell>{renderAcciones(v)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <CrearVentilacionModal isOpen={crearOpen} onClose={() => setCrearOpen(false)} onCreated={() => { load(); showToast('Ventilación creada.', 'success'); }}
        edificios={edificios} unidades={unidades} frecuencias={frecuencias} />

      {asignarTarget && (
        <AsignarVentilacionModal isOpen={!!asignarTarget} onClose={() => setAsignarTarget(null)}
          onSaved={() => { load(); showToast('Ventilación asignada.', 'success'); }}
          ventilacion={asignarTarget} tecnicos={tecnicos} frecuencias={frecuencias} />
      )}

      <DetalleVentilacionModal isOpen={!!detalleTarget} onClose={() => setDetalleTarget(null)} ventilacion={detalleTarget} />

      <ConfirmModal
        isOpen={!!eliminarTarget}
        onClose={() => setEliminarTarget(null)}
        onConfirm={handleEliminar}
        title="¿Eliminar ventilación?"
        description={`Se eliminará la ventilación pendiente de ${eliminarTarget?.edificio ?? ''} · ${eliminarTarget?.habitacion ?? ''}. Esta acción no se puede deshacer.`}
        confirmText="Eliminar"
        cancelText="Cancelar"
        variant="danger"
        icon={<Trash2 className="h-6 w-6" />}
      />
    </div>
  );
};

export default VentilacionesView;
