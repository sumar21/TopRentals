// Órdenes de Trabajo — back-office hub (docs/analysis/desktop_Screen_OrdenesTrabajo.md).
// Page skeleton per DESIGN.md §4.4; filters per §4.7 pattern C (collapsible bar, never a modal).
import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Ban, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp,
  Copy, Eye, FileCheck2, NotebookText, PackageSearch, Pencil, Plus, RefreshCw, Search,
  SlidersHorizontal, UserCog, X,
} from 'lucide-react';
import { Badge, Button, Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import EmptyState from '../EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import type { Edificio, OrdenTrabajo, Unidad } from '../../services/types';
import { formatDate } from '../../utils/dates';
import { otResueltaEmail } from '../../emails/templates';
import { resolveRecipients, sendEmail } from '../../emails/send';
import { FEATURES } from '../../config/features';
import {
  canAnular, canAsignar, canBitacoras, canCerrar, canEditar, canFinalizar, canReplicar, canVerRepuestos,
  diasReales, ESTADO_OT_OPTIONS, isVisibleByDefault, monthKey, rollingMonths, TIPO_TRABAJO_TAREA_OPTIONS, truncate,
} from './otHelpers';
import NuevaEditarOTModal from './NuevaEditarOTModal';
import BitacorasModal from './BitacorasModal';
import VerRepuestosModal from './VerRepuestosModal';
import CerrarOTModal from './CerrarOTModal';
import AsignarOTModal from './AsignarOTModal';

const PAGE_SIZE = 30;

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
  const [showFilters, setShowFilters] = useState(false);
  const [draftFiltros, setDraftFiltros] = useState<OtFiltros>(EMPTY_FILTROS);
  const [appliedFiltros, setAppliedFiltros] = useState<OtFiltros>(EMPTY_FILTROS);
  const [page, setPage] = useState(0);

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
  const draftCount = draftFiltros.meses.length + draftFiltros.estados.length + draftFiltros.edificios.length + draftFiltros.tiposTrabajo.length + draftFiltros.tiposTarea.length;

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
    if (!q) return baseFiltered;
    return baseFiltered.filter((ot) => [ot.status, ot.concat_activo, ot.tipo_trabajo, ot.tipo_tarea, ot.detalle, String(ot.id)]
      .some((v) => (v ?? '').toString().toLowerCase().includes(q)));
  }, [baseFiltered, search]);

  useEffect(() => { setPage(0); }, [search, appliedFiltros]);

  const pageCount = Math.max(1, Math.ceil(searched.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = searched.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const aplicarFiltros = () => setAppliedFiltros(draftFiltros);
  const limpiarFiltros = () => { setDraftFiltros(EMPTY_FILTROS); setAppliedFiltros(EMPTY_FILTROS); };

  const openVer = (ot: OrdenTrabajo) => setFormModal({ ot, readOnly: true });
  const openEditar = (ot: OrdenTrabajo) => setFormModal({ ot, readOnly: false });
  const openNueva = () => setFormModal({ ot: null, readOnly: false });

  const RowActions = ({ ot }: { ot: OrdenTrabajo }) => {
    if (!perfil) return null;
    const editable = canEditar(ot, perfil);
    return (
      <div className="flex justify-end gap-1 flex-wrap">
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
          <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Finalizar" aria-label="Finalizar" onClick={() => setConfirmAction({ type: 'finalizar', ot })}>
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
    <div className="flex flex-col gap-4 w-full">
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
          <button onClick={() => setShowFilters((v) => !v)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${showFilters ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="h-4 w-4" /> <span className="hidden sm:inline">Filtros</span>
            {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {!compras && (
            <Button className="h-9 px-3 text-sm gap-1.5 shrink-0" onClick={openNueva}>
              <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nueva Solicitud</span>
            </Button>
          )}
        </div>
      </div>

      {showFilters && (
        <div className="mb-1 rounded-xl border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-48">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={draftFiltros.meses} onChange={(v) => setDraftFiltros((p) => ({ ...p, meses: v }))} placeholder="Todos" searchPlaceholder="Buscar mes…" />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</label>
              <MultiCombobox options={ESTADO_OT_OPTIONS} value={draftFiltros.estados} onChange={(v) => setDraftFiltros((p) => ({ ...p, estados: v }))} placeholder="Todos" searchPlaceholder="Buscar estado…" />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Edificio</label>
              <MultiCombobox options={edificioOptions} value={draftFiltros.edificios} onChange={(v) => setDraftFiltros((p) => ({ ...p, edificios: v }))} placeholder="Todos" searchPlaceholder="Buscar edificio…" />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo de trabajo</label>
              <MultiCombobox options={TIPO_TRABAJO_TAREA_OPTIONS} value={draftFiltros.tiposTrabajo} onChange={(v) => setDraftFiltros((p) => ({ ...p, tiposTrabajo: v }))} placeholder="Todos" searchPlaceholder="Buscar tipo…" />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo de tarea</label>
              <MultiCombobox options={TIPO_TRABAJO_TAREA_OPTIONS} value={draftFiltros.tiposTarea} onChange={(v) => setDraftFiltros((p) => ({ ...p, tiposTarea: v }))} placeholder="Todas" searchPlaceholder="Buscar tarea…" />
            </div>
            <Button size="sm" className="h-10" onClick={aplicarFiltros}>Filtrar</Button>
            {(activeCount > 0 || draftCount > 0) && (
              <button onClick={limpiarFiltros} className="flex h-10 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {loadError && (
        <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" /> {loadError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Órdenes de trabajo" /></div>
      ) : searched.length === 0 ? (
        <EmptyState icon={Search} title="Sin resultados" message="No hay órdenes de trabajo para los filtros seleccionados." />
      ) : (
        <>
          {/* MOBILE: una card por fila */}
          <div className="md:hidden space-y-2">
            {visible.map((ot) => (
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
                <p className="text-sm">{truncate(ot.detalle, 90)}</p>
                <p className="text-[11px] text-muted-foreground">Inicio: {formatDate(ot.fecha_inicio)}</p>
                <div className="pt-1 border-t"><RowActions ot={ot} /></div>
              </div>
            ))}
          </div>

          {/* DESKTOP: tabla ancha con scroll horizontal */}
          <Card className="hidden md:block border shadow-sm overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Torre / Depto</TableHead>
                  <TableHead>Detalle</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Tipo trabajo / tarea</TableHead>
                  <TableHead>F. inicio</TableHead>
                  <TableHead>F. asignada</TableHead>
                  <TableHead>F. cierre</TableHead>
                  <TableHead className="text-right">Días est.</TableHead>
                  <TableHead className="text-right">Días reales</TableHead>
                  <TableHead>Prioridad unidad</TableHead>
                  <TableHead>Estado</TableHead>
                  {!compras && <TableHead>Tipo</TableHead>}
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((ot) => (
                  <TableRow key={ot.id}>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">#{ot.id}</div>
                      {ot.orden_revision_id != null && <div className="text-[10px] text-muted-foreground">IDF #{ot.orden_revision_id}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div className="font-medium">{ot.torre ?? '—'}</div>
                      {ot.departamento && <div className="text-[10px] text-muted-foreground">{ot.departamento}</div>}
                    </TableCell>
                    <TableCell className="max-w-[220px]" title={ot.detalle ?? ''}>{truncate(ot.detalle)}</TableCell>
                    <TableCell><StatusBadge status={ot.prioridad} /></TableCell>
                    <TableCell className="whitespace-nowrap">
                      <div>{ot.tipo_trabajo ?? '—'}</div>
                      {ot.tipo_tarea && <div className="text-[10px] text-muted-foreground">{ot.tipo_tarea}</div>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(ot.fecha_inicio) || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(ot.fecha_asignada) || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(ot.fecha_cierre) || '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{ot.dias_estimado ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{diasReales(ot) ?? '—'}</TableCell>
                    <TableCell>{ot.tipo_prioridad ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={ot.status} /></TableCell>
                    {!compras && <TableCell><Badge variant="outline">{ot.tipo}</Badge></TableCell>}
                    <TableCell><RowActions ot={ot} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>

          {pageCount > 1 && (
            <div className="flex items-center justify-end gap-1">
              <button disabled={safePage === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:opacity-40" aria-label="Página anterior">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-sm text-muted-foreground px-1">Página {safePage + 1}/{pageCount}</span>
              <button disabled={safePage >= pageCount - 1} onClick={() => setPage((p) => p + 1)}
                className="flex h-8 w-8 items-center justify-center rounded-md border transition-colors hover:bg-muted disabled:opacity-40" aria-label="Página siguiente">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
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
