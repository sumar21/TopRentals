// Compras — back-office purchasing list (DESIGN.md §4.4 standard page skeleton).
// Default view = open purchases (Pendiente/Aprobacion/Aprobada); the filter bar can
// pull in the rest (Recibida/Rechazada/Anulada) via the Estado multi-select.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronDown, ChevronUp, Eye, FileCheck2, FileText, Pencil, PlusCircle, Search,
  SendHorizonal, ShoppingCart, SlidersHorizontal, XCircle,
} from 'lucide-react';
import {
  Button, Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useModalAnimation,
} from '../ui/UIComponents';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import ConfirmModal from '../ConfirmModal';
import { backdropClose } from '../ui/backdropClose';
import { useToast } from '../ui/Toast';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { formatDate } from '../../utils/dates';
import { api } from '../../services/index.ts';
import type { Compra, Usuario } from '../../services/types.ts';
import { compraEnviadaAprobacionEmail, type CompraLineaEmail } from '../../emails/templates.ts';
import { resolveRecipients, sendEmail, type RecipientRow } from '../../emails/send.ts';
import CompraFormModal, { type CompraFormValues } from './CompraFormModal';
import VerDetalleCompraModal from './VerDetalleCompraModal';
import RecibirCompraModal from './RecibirCompraModal';

const ESTADOS_ABIERTOS: Compra['status'][] = ['Pendiente', 'Aprobacion', 'Aprobada'];
const ESTADO_OPTIONS: { value: Compra['status']; label: string }[] = [
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'Aprobacion', label: 'En aprobación' },
  { value: 'Aprobada', label: 'Aprobada' },
  { value: 'Recibida', label: 'Recibida' },
  { value: 'Rechazada', label: 'Rechazada' },
  { value: 'Anulada', label: 'Anulada' },
];

const mesLabel = (isoMonth: string) => {
  const [y, m] = isoMonth.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** DESIGN.md §4.1 minimal viewer modal — phase 1: no Storage backend yet. */
const DocumentoModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  if (!visible) return null;
  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col`}>
        <div className="px-6 py-4 border-b bg-secondary/20"><h2 className="text-lg font-bold tracking-tight">Documento adjunto</h2></div>
        <div className="p-6">
          <EmptyState icon={FileText} title="Documentos disponibles con el backend definitivo" />
        </div>
        <div className="p-4 border-t bg-muted/20 flex justify-end"><Button variant="outline" onClick={onClose}>Cerrar</Button></div>
      </div>
    </div>,
    document.body,
  );
};

const ComprasView: React.FC = () => {
  const { showToast } = useToast();

  const [compras, setCompras] = useState<Compra[]>([]);
  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [mesFilter, setMesFilter] = useState<string[]>([]);
  const [tecnicoFilter, setTecnicoFilter] = useState<string[]>([]);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | undefined>(undefined);
  const [detalleId, setDetalleId] = useState<number | null>(null);
  const [recibirId, setRecibirId] = useState<number | null>(null);
  const [documentoOpen, setDocumentoOpen] = useState(false);
  const [enviarTarget, setEnviarTarget] = useState<Compra | null>(null);
  const [anularTarget, setAnularTarget] = useState<Compra | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    return Promise.all([api.compras.list(), api.usuarios.list()])
      .then(([c, u]) => { setCompras(c); setTecnicos(u.filter((x) => x.perfil === 'Tecnico')); })
      .catch(() => { showToast('No se pudieron cargar las compras.', 'error'); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const mesOptions = useMemo(() => {
    const meses = [...new Set(compras.map((c) => c.fecha.slice(0, 7)))].sort().reverse();
    return meses.map((m) => ({ value: m, label: mesLabel(m) }));
  }, [compras]);
  const tecnicoOptions = useMemo(() => tecnicos.map((t) => ({ value: String(t.id), label: t.concat_name })), [tecnicos]);

  const filtered = useMemo(() => {
    const estados = estadoFilter.length > 0 ? estadoFilter : ESTADOS_ABIERTOS;
    const query = q.trim().toLowerCase();
    return compras
      .filter((c) => estados.includes(c.status))
      .filter((c) => mesFilter.length === 0 || mesFilter.includes(c.fecha.slice(0, 7)))
      .filter((c) => tecnicoFilter.length === 0 || tecnicoFilter.includes(String(c.usuario_id)))
      .filter((c) => !query || c.id_compra.toLowerCase().includes(query) || (c.usuario_compra ?? '').toLowerCase().includes(query))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [compras, estadoFilter, mesFilter, tecnicoFilter, q]);

  const activeFilterCount = estadoFilter.length + mesFilter.length + tecnicoFilter.length;

  const openCreate = () => { setEditingId(undefined); setFormOpen(true); };
  const openEdit = (id: number) => { setEditingId(id); setFormOpen(true); };

  const handleFormSubmit = async (values: CompraFormValues) => {
    if (editingId != null) {
      await api.compras.actualizar(editingId, {
        usuario_id: values.usuario_id,
        usuario_compra: values.usuario_compra,
        urgencia: values.urgencia,
        observacion: values.observacion || null,
      }, values.lineas);
      showToast('Compra actualizada correctamente.', 'success');
    } else {
      await api.compras.crear({
        id_compra: '',
        usuario_id: values.usuario_id,
        usuario_compra: values.usuario_compra,
        urgencia: values.urgencia,
        observacion: values.observacion || null,
        obs_recibir: null,
        fecha: new Date().toISOString().slice(0, 10),
        cantidad_total: 0,
        monto_total: 0,
        status: 'Pendiente',
        cargo: null,
        sector_pedido: null,
        version_app: null,
      }, values.lineas);
      showToast('Compra creada correctamente.', 'success');
    }
    await load();
  };

  const handleEnviarAprobacion = async () => {
    if (!enviarTarget) return;
    try {
      await api.compras.enviarAprobacion(enviarTarget.id);
      const detalle = await api.compras.get(enviarTarget.id);
      if (detalle) {
        const lineas: CompraLineaEmail[] = detalle.detalle.filter((d) => d.status === 'Activo')
          .map((d) => ({ edificio: d.edificio ?? '', articulo: d.articulo ?? '', cantidad: d.cantidad, costo_unitario: d.costo_unitario ?? 0, costo_total: d.costo_total ?? 0 }));
        const emailRows = await api.emailsNotificacion.list();
        const recipients: RecipientRow[] = emailRows.filter((r) => r.status === 'Activo').map((r) => ({ modulo: r.modulo, emails: r.emails ?? '' }));
        const email = compraEnviadaAprobacionEmail(enviarTarget.id_compra, lineas, enviarTarget.usuario_compra ?? '');
        await sendEmail(resolveRecipients('Compra', recipients), email);
      }
      showToast('Compra enviada a aprobación.', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo enviar la compra a aprobación.', 'error');
    }
  };

  const handleAnular = async () => {
    if (!anularTarget) return;
    try {
      await api.compras.anular(anularTarget.id);
      showToast('Compra anulada.', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo anular la compra.', 'error');
    }
  };

  const renderActions = (c: Compra) => (
    <div className="flex justify-end gap-1">
      {c.status === 'Pendiente' && (
        <button title="Editar" aria-label="Editar compra" onClick={() => openEdit(c.id)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
          <Pencil className="h-4 w-4" />
        </button>
      )}
      <button title="Ver detalle" aria-label="Ver detalle de la compra" onClick={() => setDetalleId(c.id)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
        <Eye className="h-4 w-4" />
      </button>
      {c.status === 'Pendiente' && (
        <button title="Enviar a aprobación" aria-label="Enviar a aprobación" onClick={() => setEnviarTarget(c)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center">
          <SendHorizonal className="h-4 w-4" />
        </button>
      )}
      {c.status === 'Pendiente' && (
        <button title="Anular" aria-label="Anular compra" onClick={() => setAnularTarget(c)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
          <XCircle className="h-4 w-4" />
        </button>
      )}
      {c.status === 'Aprobada' && (
        <button title="Recibir" aria-label="Recibir compra" onClick={() => setRecibirId(c.id)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center">
          <FileCheck2 className="h-4 w-4" />
        </button>
      )}
      {c.status === 'Recibida' && (
        <button title="Ver documento" aria-label="Ver documento adjunto" onClick={() => setDocumentoOpen(true)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
          <FileText className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Compras</h1>
          <p className="text-sm text-muted-foreground mt-1">Solicitudes de compra y su estado de aprobación.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <button onClick={() => setShowFilters((v) => !v)}
            className={`flex shrink-0 items-center gap-2 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${showFilters ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground'}`}>
            <SlidersHorizontal className="h-4 w-4" /> Filtros
            {activeFilterCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <Button onClick={openCreate} className="h-9 px-3 text-sm gap-1.5 shrink-0">
            <PlusCircle className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Nueva Compra</span>
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-48">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={mesFilter} onChange={setMesFilter} placeholder="Todos" searchPlaceholder="Buscar mes…" />
            </div>
            <div className="w-full sm:w-52">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</label>
              <MultiCombobox options={ESTADO_OPTIONS} value={estadoFilter} onChange={setEstadoFilter} placeholder="Abiertas (default)" searchPlaceholder="Buscar estado…" />
            </div>
            <div className="w-full sm:w-52">
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Técnico</label>
              <MultiCombobox options={tecnicoOptions} value={tecnicoFilter} onChange={setTecnicoFilter} placeholder="Todos" searchPlaceholder="Buscar técnico…" />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setEstadoFilter([]); setMesFilter([]); setTecnicoFilter([]); }} className="h-10 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Limpiar</button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Solicitudes de compra" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShoppingCart} title="No hay compras para mostrar" message="Probá cambiar los filtros o crear una compra nueva." />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {filtered.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">{c.id_compra}</p>
                    <p className="text-xs text-muted-foreground">{c.usuario_compra ?? '—'}</p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(c.fecha)}</span>
                  <StatusBadge status={c.urgencia ?? ''} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Cant. {c.cantidad_total ?? 0}</span>
                  <span className="font-semibold tabular-nums">$ {maskFromNumber(c.monto_total ?? 0)}</span>
                </div>
                <div className="mt-2 pt-2 border-t">{renderActions(c)}</div>
              </div>
            ))}
          </div>
          <Card className="hidden md:block border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Monto total</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell><StatusBadge status={c.status} /></TableCell>
                    <TableCell className="text-sm font-medium">{c.id_compra}</TableCell>
                    <TableCell className="text-sm">{c.usuario_compra ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={c.urgencia ?? ''} /></TableCell>
                    <TableCell className="text-sm">{formatDate(c.fecha)}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.cantidad_total ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">$ {maskFromNumber(c.monto_total ?? 0)}</TableCell>
                    <TableCell>{renderActions(c)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <CompraFormModal
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        title={editingId != null ? 'Editar compra' : 'Nueva compra'}
        compraId={editingId}
        onSubmit={handleFormSubmit}
      />
      <VerDetalleCompraModal isOpen={detalleId != null} onClose={() => setDetalleId(null)} compraId={detalleId} />
      <RecibirCompraModal isOpen={recibirId != null} onClose={() => setRecibirId(null)} compraId={recibirId} onReceived={load} />
      <DocumentoModal isOpen={documentoOpen} onClose={() => setDocumentoOpen(false)} />
      <ConfirmModal
        isOpen={!!enviarTarget}
        onClose={() => setEnviarTarget(null)}
        onConfirm={handleEnviarAprobacion}
        title="Enviar a aprobación"
        description={`¿Enviar la compra ${enviarTarget?.id_compra ?? ''} al circuito de aprobación?`}
        confirmText="Enviar"
        cancelText="Cancelar"
      />
      <ConfirmModal
        isOpen={!!anularTarget}
        onClose={() => setAnularTarget(null)}
        onConfirm={handleAnular}
        title="Anular compra"
        description={`¿Anular la compra ${anularTarget?.id_compra ?? ''}? Esta acción no se puede deshacer.`}
        confirmText="Anular"
        cancelText="Cancelar"
        variant="danger"
      />
    </div>
  );
};

export default ComprasView;
