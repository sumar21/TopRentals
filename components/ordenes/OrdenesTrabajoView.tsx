// Órdenes de Trabajo — back-office hub (docs/analysis/desktop_Screen_OrdenesTrabajo.md).
// Page skeleton per DESIGN.md §4.4; filters per §4.7 pattern C (collapsible bar, never a modal).
import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban, CheckCircle2,
  Copy, Eye, FileCheck2, NotebookText, PackageSearch, Pencil, Plus, RefreshCw, Search,
  UserCog,
} from 'lucide-react';
import { Button, Card, cn, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { FilterPopover } from '../ui/FilterPopover';
import { StatusBadge } from '../ui/StatusBadge';
import { CategoriaBadge } from '../ui/CategoriaBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import EmptyState from '../EmptyState';
import LoadErrorState from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import type { Edificio, OrdenTrabajo, Unidad } from '../../services/types';
import { formatDate } from '../../utils/dates';
import { capitalizeFirst } from '../../utils/strings';
import { otResueltaEmail } from '../../emails/templates';
import { resolveRecipients, sendEmail } from '../../emails/send';
import { FEATURES } from '../../config/features';
import {
  canAnular, canAsignar, canBitacoras, canCerrar, canEditar, canFinalizar, canReplicar, canVerRepuestos,
  diasReales, ESTADO_OT_OPTIONS, isVisibleByDefault, monthKey, rollingMonths, TIPO_TAREA_OPTIONS, TIPO_TRABAJO_FILTRO_OPTIONS, truncate,
} from './otHelpers';
import NuevaEditarOTModal from './NuevaEditarOTModal';
import BitacorasModal from './BitacorasModal';
import VerRepuestosModal from './VerRepuestosModal';
import CerrarOTModal from './CerrarOTModal';
import AsignarOTModal from './AsignarOTModal';

// Etiqueta corta del tipo para la grilla (color sigue por el valor completo en CategoriaBadge).
// Normalizamos a minúscula/trim como categoriaColor: el valor real viene en mayúsculas
// ('ORDEN DE TRABAJO', 'SOLICITUD OT'), así que un match por casing exacto no servía.
const tipoCorto = (tipo: string | null | undefined): string => {
  const k = (tipo ?? '').trim().toLowerCase();
  if (k === 'orden de trabajo') return 'OT';
  if (k === 'solicitud ot') return 'Sol OT';
  return (tipo ?? '').trim();
};

// Excel-style frozen leading columns (Estado · Tipo · ID · ID F). Fixed widths so the cumulative
// `left` offsets line up; the trailing columns — incl. Acciones — scroll underneath. Acciones was
// pinned before but it's wide (8 icon buttons); moving it to the end and into the scroll zone frees
// the frozen prefix and cuts horizontal scroll. Tipo se angostó (etiquetas "OT"/"Sol OT") → los
// offsets left de ID / ID F se recalculan en cadena.
const FZ_TH = 'sticky z-20 bg-muted'; // header wins the top-left corner (opaque over scrolling cells)
const FZ_TD = 'sticky z-[5] bg-card group-hover:bg-muted'; // fully opaque (incl. hover) so scrolled cells never bleed through
const FZ_COL = {
  estado: 'left-0 w-[104px] min-w-[104px] max-w-[104px]',
  tipo: 'left-[104px] w-[84px] min-w-[84px] max-w-[84px]',
  id: 'left-[188px] w-[60px] min-w-[60px] max-w-[60px]',
  idf: 'left-[248px] w-[68px] min-w-[68px] max-w-[68px] border-r border-border',
};

interface OtFiltros { meses: string[]; estados: string[]; edificios: string[]; tiposTrabajo: string[]; tiposTarea: string[]; }
const EMPTY_FILTROS: OtFiltros = { meses: [], estados: [], edificios: [], tiposTrabajo: [], tiposTarea: [] };

type ConfirmAction = { type: 'anular' | 'replicar' | 'finalizar'; ot: OrdenTrabajo };

const OrdenesTrabajoView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [draftFiltros, setDraftFiltros] = useState<OtFiltros>(EMPTY_FILTROS);
  const [appliedFiltros, setAppliedFiltros] = useState<OtFiltros>(EMPTY_FILTROS);

  const [formModal, setFormModal] = useState<{ ot: OrdenTrabajo | null; readOnly: boolean } | null>(null);
  const [bitacorasOt, setBitacorasOt] = useState<OrdenTrabajo | null>(null);
  const [repuestosOt, setRepuestosOt] = useState<OrdenTrabajo | null>(null);
  const [cerrarOt, setCerrarOt] = useState<OrdenTrabajo | null>(null);
  const [asignarOt, setAsignarOt] = useState<OrdenTrabajo | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const perfil = user?.perfil;
  const compras = perfil === 'Compras';

  const load = () => {
    setLoadError('');
    return Promise.all([api.ots.list(), api.edificios.list(), api.unidades.list()])
      .then(([o, e, u]) => { setOts(o); setEdificios(e); setUnidades(u); })
      .catch(() => setLoadError('No se pudieron cargar las órdenes de trabajo.'));
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);
  // Live updates: silent refetch whenever an OT changes in the backend.
  useEffect(() => api.realtime.subscribe(['ots'], () => { void load(); }), []);

  const handleRefresh = () => { setRefreshing(true); load().finally(() => setRefreshing(false)); };

  const upsertOt = (saved: OrdenTrabajo) => setOts((prev) => {
    const exists = prev.some((o) => o.id === saved.id);
    return exists ? prev.map((o) => (o.id === saved.id ? saved : o)) : [saved, ...prev];
  });

  // Fire-and-forget resolution email — the OT-close toast never waits on this (task brief).
  async function sendResolutionEmail(ot: OrdenTrabajo) {
    try {
      const [usuariosList, repuestos, emailRows] = await Promise.all([
        api.usuarios.list(), api.ots.repuestos.list(ot.id), api.emailsNotificacion.list(),
      ]);
      const tecnico = usuariosList.find((u) => u.id === ot.tecnico_id);
      const email = otResueltaEmail({
        nroOT: ot.id,
        activo: ot.concat_activo ?? [ot.torre, ot.departamento].filter(Boolean).join(' - '),
        tipoTrabajo: ot.tipo_trabajo,
        tipoTarea: ot.tipo_tarea,
        diasEstimados: ot.dias_estimado,
        diasUtilizados: diasReales(ot) ?? 0,
        repuestos: repuestos.map((r) => ({ repuesto: r.repuesto ?? '', cantidad: r.cantidad })),
        tecnico: tecnico?.concat_name ?? 'No asignado',
      });
      const recipients = resolveRecipients('OT', emailRows.map((r) => ({ modulo: r.modulo, emails: r.emails ?? '' })));
      await sendEmail(recipients, email);
    } catch (e) {
      console.warn('[ordenes] no se pudo enviar el email de resolución', e);
    }
  }

  const handleConfirm = async () => {
    if (!confirmAction) return;
    const { type, ot } = confirmAction;
    try {
      if (type === 'anular') {
        const saved = await api.ots.anular(ot.id);
        upsertOt(saved);
        showToast('Orden de trabajo anulada.', 'success');
      } else if (type === 'replicar') {
        const saved = await api.ots.replicar(ot.id);
        upsertOt(saved);
        showToast('Orden de trabajo replicada.', 'success');
      } else {
        const saved = await api.ots.finalizar(ot.id);
        upsertOt(saved);
        showToast('Orden de trabajo finalizada.', 'success');
        void sendResolutionEmail(saved);
      }
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo completar la acción.', 'error');
    }
  };

  const mesOptions = useMemo(() => rollingMonths(12), []);
  const edificioOptions = useMemo(() => edificios.filter((e) => e.status === 'Activo').map((e) => ({ label: e.nombre, value: e.nombre })), [edificios]);
  const activeCount = appliedFiltros.meses.length + appliedFiltros.estados.length + appliedFiltros.edificios.length + appliedFiltros.tiposTrabajo.length + appliedFiltros.tiposTarea.length;

  const baseFiltered = useMemo(() => {
    if (activeCount === 0) return ots.filter(isVisibleByDefault);
    return ots.filter((ot) => {
      if (appliedFiltros.meses.length && !(ot.fecha_inicio && appliedFiltros.meses.includes(monthKey(ot.fecha_inicio)))) return false;
      if (appliedFiltros.estados.length && !appliedFiltros.estados.includes(ot.status)) return false;
      if (appliedFiltros.edificios.length && !(ot.torre && appliedFiltros.edificios.includes(ot.torre))) return false;
      if (appliedFiltros.tiposTrabajo.length && !(ot.tipo_trabajo && appliedFiltros.tiposTrabajo.includes(ot.tipo_trabajo))) return false;
      if (appliedFiltros.tiposTarea.length && !(ot.tipo_tarea && appliedFiltros.tiposTarea.includes(ot.tipo_tarea))) return false;
      return true;
    });
  }, [ots, appliedFiltros, activeCount]);

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = !q
      ? baseFiltered
      : baseFiltered.filter((ot) => [ot.status, ot.concat_activo, ot.tipo_trabajo, ot.tipo_tarea, ot.detalle, String(ot.id)]
          .some((v) => (v ?? '').toString().toLowerCase().includes(q)));
    // PA parity: SortByColumns(CollectOT,"ID",SortOrder.Descending)
    return [...rows].sort((a, b) => b.id - a.id);
  }, [baseFiltered, search]);

  const aplicarFiltros = () => setAppliedFiltros(draftFiltros);
  const limpiarFiltros = () => { setDraftFiltros(EMPTY_FILTROS); setAppliedFiltros(EMPTY_FILTROS); };

  const openVer = (ot: OrdenTrabajo) => setFormModal({ ot, readOnly: true });
  // PA shows the pencil for any non-Anulada OT but locks the fields (DisplayMode.Disabled) for
  // Cerrada V/F. Mirror it: open read-only for those terminal states, fully editable otherwise.
  const openEditar = (ot: OrdenTrabajo) => setFormModal({ ot, readOnly: ot.status === 'Cerrada V' || ot.status === 'Cerrada F' });
  const openNueva = () => setFormModal({ ot: null, readOnly: false });

  const RowActions = ({ ot }: { ot: OrdenTrabajo }) => {
    if (!perfil) return null;
    const editable = canEditar(ot, perfil);
    return (
      <div className="flex items-center justify-start gap-0.5 flex-nowrap">
        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title={editable ? 'Editar' : 'Ver detalle'} aria-label={editable ? 'Editar' : 'Ver detalle'}
          onClick={() => (editable ? openEditar(ot) : openVer(ot))}>
          {editable ? <Pencil className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
        {canVerRepuestos(ot) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Ver repuestos" aria-label="Ver repuestos" onClick={() => setRepuestosOt(ot)}>
            <PackageSearch className="h-4 w-4" />
          </Button>
        )}
        {canBitacoras(perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Bitácoras" aria-label="Bitácoras" onClick={() => setBitacorasOt(ot)}>
            <NotebookText className="h-4 w-4" />
          </Button>
        )}
        {canAsignar(ot, perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Asignar" aria-label="Asignar" onClick={() => setAsignarOt(ot)}>
            <UserCog className="h-4 w-4" />
          </Button>
        )}
        {canCerrar(ot, perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Cerrar" aria-label="Cerrar" onClick={() => setCerrarOt(ot)}>
            <FileCheck2 className="h-4 w-4" />
          </Button>
        )}
        {canFinalizar(ot, perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40" title="Finalizar" aria-label="Finalizar" onClick={() => setConfirmAction({ type: 'finalizar', ot })}>
            <CheckCircle2 className="h-4 w-4" />
          </Button>
        )}
        {canReplicar(ot, perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" title="Replicar" aria-label="Replicar" onClick={() => setConfirmAction({ type: 'replicar', ot })}>
            <Copy className="h-4 w-4" />
          </Button>
        )}
        {canAnular(ot, perfil) && (
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10" title="Anular" aria-label="Anular" onClick={() => setConfirmAction({ type: 'anular', ot })}>
            <Ban className="h-4 w-4" />
          </Button>
        )}
      </div>
    );
  };

  if (!user) return null;

  return (
    <div className="flex flex-col gap-4 w-full md:h-full md:min-h-0">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Órdenes de Trabajo</h1>
          <p className="text-sm text-muted-foreground mt-1">{searched.length} orden{searched.length === 1 ? '' : 'es'} de trabajo</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" title="Actualizar" aria-label="Actualizar" onClick={handleRefresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          <FilterPopover activeCount={activeCount} onClear={limpiarFiltros}>
            <div className="w-full">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={draftFiltros.meses} onChange={(v) => setDraftFiltros((p) => ({ ...p, meses: v }))} placeholder="Todos" searchPlaceholder="Buscar mes…" className="w-full" />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</label>
              <MultiCombobox options={ESTADO_OT_OPTIONS} value={draftFiltros.estados} onChange={(v) => setDraftFiltros((p) => ({ ...p, estados: v }))} placeholder="Todos" searchPlaceholder="Buscar estado…" className="w-full" />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edificio</label>
              <MultiCombobox options={edificioOptions} value={draftFiltros.edificios} onChange={(v) => setDraftFiltros((p) => ({ ...p, edificios: v }))} placeholder="Todos" searchPlaceholder="Buscar edificio…" className="w-full" />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo de trabajo</label>
              <MultiCombobox options={TIPO_TRABAJO_FILTRO_OPTIONS} value={draftFiltros.tiposTrabajo} onChange={(v) => setDraftFiltros((p) => ({ ...p, tiposTrabajo: v }))} placeholder="Todos" searchPlaceholder="Buscar tipo…" className="w-full" />
            </div>
            <div className="w-full">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo de tarea</label>
              <MultiCombobox options={TIPO_TAREA_OPTIONS} value={draftFiltros.tiposTarea} onChange={(v) => setDraftFiltros((p) => ({ ...p, tiposTarea: v }))} placeholder="Todas" searchPlaceholder="Buscar tarea…" className="w-full" />
            </div>
            <Button size="sm" className="w-full" onClick={aplicarFiltros}>Filtrar</Button>
          </FilterPopover>
          {!compras && (
            <Button className="h-9 px-3 text-sm gap-1.5 shrink-0" onClick={openNueva}>
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nueva Solicitud</span>
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Órdenes de trabajo" /></div>
      ) : loadError ? (
        <LoadErrorState message={loadError} onRetry={load} />
      ) : searched.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" message="No hay órdenes de trabajo para los filtros seleccionados." />
      ) : (
        <>
          {/* MOBILE: una card por fila */}
          <div className="md:hidden space-y-2">
            {searched.map((ot) => (
              <div key={ot.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-sm">#{ot.id}</span>
                      {ot.orden_revision_id != null && <span className="text-[10px] text-muted-foreground">IDF #{ot.orden_revision_id}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{ot.concat_activo ?? '—'}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <StatusBadge status={ot.status} />
                    <StatusBadge status={ot.prioridad} />
                  </div>
                </div>
                <p className="text-sm">{truncate(capitalizeFirst(ot.detalle), 90)}</p>
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>{ot.tipo_trabajo ?? '—'} · {ot.tipo_tarea ?? '—'}</span>
                  <span>· Días: {ot.dias_estimado ?? '—'} est. / {diasReales(ot) ?? '—'} real</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Inicio: {formatDate(ot.fecha_inicio) || '—'}{ot.fecha_cierre && ` · Cierre: ${formatDate(ot.fecha_cierre)}`}
                </p>
                <div className="pt-1 border-t"><RowActions ot={ot} /></div>
              </div>
            ))}
          </div>

          {/* DESKTOP: tabla ancha con scroll horizontal — columnas 1:1 con gal_incidentes (PA).
              min-w fuerza el ancho natural para que el contenedor del kit haga scroll en vez de clippear. */}
          <Card className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 border shadow-sm overflow-hidden">
            <Table className="min-w-[1240px]" wrapperClassName="h-full">
              {/* Columnas: fijas (Estado · Tipo · ID · ID F) + scroll (Detalle · Ubicación · Prioridad ·
                  Requiere parada · F. inicio · Trabajo/Tarea · Asignada · Cierre · Acciones).
                  Campos apareados en una sola columna apilada (torre/depto, trabajo/tarea,
                  fecha+días est., fecha+días real) para achicar el scroll horizontal. */}
              <TableHeader>
                <TableRow>
                  <TableHead className={cn(FZ_TH, FZ_COL.estado)}>Estado</TableHead>
                  <TableHead className={cn(FZ_TH, FZ_COL.tipo)}>Tipo</TableHead>
                  <TableHead className={cn(FZ_TH, FZ_COL.id)}>ID</TableHead>
                  <TableHead className={cn(FZ_TH, FZ_COL.idf, 'whitespace-nowrap')}>ID F</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead className="whitespace-nowrap">Torre</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead className="whitespace-nowrap">Requiere parada</TableHead>
                  <TableHead className="whitespace-nowrap">F. inicio</TableHead>
                  <TableHead className="whitespace-nowrap">Trabajo / Tarea</TableHead>
                  <TableHead className="whitespace-nowrap">Asignada</TableHead>
                  <TableHead className="whitespace-nowrap">Cierre</TableHead>
                  <TableHead className="whitespace-nowrap">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searched.map((ot) => (
                  <TableRow key={ot.id} className="group">
                    <TableCell className={cn(FZ_TD, FZ_COL.estado)}><StatusBadge status={ot.status} /></TableCell>
                    <TableCell className={cn(FZ_TD, FZ_COL.tipo)}><CategoriaBadge value={ot.tipo} label={tipoCorto(ot.tipo)} /></TableCell>
                    <TableCell className={cn(FZ_TD, FZ_COL.id, 'whitespace-nowrap font-medium')}>#{ot.id}</TableCell>
                    <TableCell className={cn(FZ_TD, FZ_COL.idf, 'whitespace-nowrap text-muted-foreground')}>{ot.orden_revision_id != null ? `#${ot.orden_revision_id}` : '—'}</TableCell>
                    {/* Detalle: columna ancha, 2 renglones con clamp — más texto legible sin agrandar la fila (ya son 2 líneas por las columnas apiladas). */}
                    <TableCell className="w-[380px] min-w-[320px] max-w-[420px] align-middle"><span className="line-clamp-2 whitespace-normal leading-snug" title={ot.detalle ?? ''}>{capitalizeFirst(ot.detalle) || '—'}</span></TableCell>
                    <TableCell className="whitespace-nowrap align-middle">
                      <div className="leading-tight">
                        <div className="font-medium">{ot.torre ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">Depto: {ot.departamento ?? '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell><StatusBadge status={ot.prioridad} /></TableCell>
                    <TableCell className="whitespace-nowrap"><CategoriaBadge value={ot.tipo_prioridad} /></TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(ot.fecha_inicio) || '—'}</TableCell>
                    <TableCell className="align-middle">
                      <div className="flex flex-col items-start gap-1">
                        <CategoriaBadge value={ot.tipo_trabajo} />
                        <CategoriaBadge value={ot.tipo_tarea} />
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-middle">
                      <div className="leading-tight">
                        <div>{formatDate(ot.fecha_asignada) || '—'}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{ot.dias_estimado != null ? `${ot.dias_estimado} días est.` : '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap align-middle">
                      <div className="leading-tight">
                        <div>{formatDate(ot.fecha_cierre) || '—'}</div>
                        <div className="text-xs text-muted-foreground tabular-nums">{diasReales(ot) != null ? `${diasReales(ot)} días real` : '—'}</div>
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap"><RowActions ot={ot} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <NuevaEditarOTModal
        isOpen={!!formModal}
        onClose={() => setFormModal(null)}
        ot={formModal?.ot ?? null}
        readOnly={formModal?.readOnly ?? false}
        edificios={edificios}
        unidades={unidades}
        onSaved={upsertOt}
      />
      <BitacorasModal isOpen={!!bitacorasOt} onClose={() => setBitacorasOt(null)} ot={bitacorasOt} />
      <VerRepuestosModal isOpen={!!repuestosOt} onClose={() => setRepuestosOt(null)} ot={repuestosOt} />
      <CerrarOTModal isOpen={!!cerrarOt} onClose={() => setCerrarOt(null)} ot={cerrarOt} onSaved={upsertOt} />
      {FEATURES.asignarOTDesktop && (
        <AsignarOTModal isOpen={!!asignarOt} onClose={() => setAsignarOt(null)} ot={asignarOt} edificios={edificios} onSaved={upsertOt} />
      )}

      <ConfirmModal
        isOpen={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        onConfirm={handleConfirm}
        variant={confirmAction?.type === 'anular' ? 'danger' : 'default'}
        title={confirmAction?.type === 'anular' ? 'Anular orden de trabajo' : confirmAction?.type === 'replicar' ? 'Replicar orden de trabajo' : 'Finalizar orden de trabajo'}
        description={
          confirmAction?.type === 'anular' ? `Se anulará la OT #${confirmAction.ot.id}. Esta acción no se puede deshacer.`
            : confirmAction?.type === 'replicar' ? `Se creará una nueva OT pendiente vinculada a la OT #${confirmAction.ot.id}.`
            : `Se finalizará la OT #${confirmAction?.ot.id} y se notificará por email a los destinatarios configurados.`
        }
        confirmText={confirmAction?.type === 'anular' ? 'Anular' : confirmAction?.type === 'replicar' ? 'Replicar' : 'Finalizar'}
        cancelText="Cancelar"
      />
    </div>
  );
};

export default OrdenesTrabajoView;
