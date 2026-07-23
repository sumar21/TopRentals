// Aprobaciones — purchase-approval queue (DESIGN.md §4.4 standard page skeleton).
// Queue is role-scoped per spec: Gerencia -> 'Aprobada Supervision'; Admin -> that +
// 'Pendiente'; everyone else -> 'Pendiente' only.
import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Check, ClipboardList, Eye, Pencil, Search, SlidersHorizontal, X as XIcon } from 'lucide-react';
import { Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import ConfirmModal from '../ConfirmModal';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { formatDate } from '../../utils/dates';
import { api } from '../../services/index.ts';
import type { Aprobacion, Compra, EstadoAprobacion, Perfil } from '../../services/types.ts';
import { compraAprobadaEmail, type CompraLineaEmail } from '../../emails/templates.ts';
import { resolveRecipients, sendEmail, type RecipientRow } from '../../emails/send.ts';
import CompraFormModal, { type CompraFormValues } from '../compras/CompraFormModal';
import VerDetalleCompraModal from '../compras/VerDetalleCompraModal';
import RechazarModal from './RechazarModal';

/** Spec role_logic: which statuses each profile's queue includes. */
function scopeAprobaciones(perfil: Perfil, rows: Aprobacion[]): Aprobacion[] {
  if (perfil === 'Gerencia') return rows.filter((r) => r.status === 'Aprobada Supervision');
  if (perfil === 'Admin') return rows.filter((r) => r.status === 'Aprobada Supervision' || r.status === 'Pendiente');
  return rows.filter((r) => r.status === 'Pendiente');
}

const REJECTABLE: EstadoAprobacion[] = ['Pendiente', 'Aprobada Supervision'];
const canReject = (perfil: Perfil, status: EstadoAprobacion) => REJECTABLE.includes(status) && (perfil === 'Gerencia' || perfil === 'Admin');
const canApprove = (perfil: Perfil, status: EstadoAprobacion) => REJECTABLE.includes(status) && (perfil === 'Gerencia' || perfil === 'Admin' || perfil === 'Compras');
const canEdit = (status: EstadoAprobacion) => status === 'Pendiente';

const ESTADO_OPTIONS: { value: EstadoAprobacion; label: string }[] = [
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'En Aprobacion', label: 'En aprobación' },
  { value: 'Aprobada Supervision', label: 'Aprobada supervisión' },
  { value: 'Aprobada', label: 'Aprobada' },
  { value: 'Rechazada', label: 'Rechazada' },
  { value: 'Recibida', label: 'Recibida' },
];

const mesLabel = (isoMonth: string) => {
  const [y, m] = isoMonth.split('-');
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

const AprobacionesView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [aprobaciones, setAprobaciones] = useState<Aprobacion[]>([]);
  const [comprasById, setComprasById] = useState<Map<number, Compra>>(new Map());
  const [loading, setLoading] = useState(true);

  const [q, setQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [mesFilter, setMesFilter] = useState<string[]>([]);

  const [detalleCompraId, setDetalleCompraId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Aprobacion | null>(null);
  const [rechazarTarget, setRechazarTarget] = useState<Aprobacion | null>(null);
  const [aprobarTarget, setAprobarTarget] = useState<Aprobacion | null>(null);

  const load = () => {
    setLoading(true);
    return Promise.all([api.aprobaciones.list(), api.compras.list()])
      .then(([aps, compras]) => {
        setAprobaciones(user ? scopeAprobaciones(user.perfil, aps) : []);
        setComprasById(new Map(compras.map((c) => [c.id, c])));
      })
      .catch(() => showToast('No se pudieron cargar las aprobaciones.', 'error'))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [user?.id]);

  const idCompraLabel = (a: Aprobacion) => comprasById.get(a.compra_id)?.id_compra ?? `#${a.compra_id}`;

  const mesOptions = useMemo(() => {
    const meses = [...new Set(aprobaciones.map((a) => a.fecha.slice(0, 7)))].sort().reverse();
    return meses.map((m) => ({ value: m, label: mesLabel(m) }));
  }, [aprobaciones]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return aprobaciones
      .filter((a) => estadoFilter.length === 0 || estadoFilter.includes(a.status))
      .filter((a) => mesFilter.length === 0 || mesFilter.includes(a.fecha.slice(0, 7)))
      .filter((a) => !query || a.status.toLowerCase().includes(query) || idCompraLabel(a).toLowerCase().includes(query))
      .sort((a, b) => (a.fecha < b.fecha ? 1 : -1));
  }, [aprobaciones, estadoFilter, mesFilter, q, comprasById]);

  const activeFilterCount = estadoFilter.length + mesFilter.length;

  const handleAprobar = async () => {
    if (!aprobarTarget || !user) return;
    try {
      await api.aprobaciones.aprobar(aprobarTarget.id, user.id);
      const compra = await api.compras.get(aprobarTarget.compra_id);
      if (compra) {
        const lineas: CompraLineaEmail[] = compra.detalle.filter((d) => d.status === 'Activo')
          .map((d) => ({ edificio: d.edificio ?? '', articulo: d.articulo ?? '', cantidad: d.cantidad, costo_unitario: d.costo_unitario ?? 0, costo_total: d.costo_total ?? 0 }));
        const emailRows = await api.emailsNotificacion.list();
        const recipients: RecipientRow[] = emailRows.filter((r) => r.status === 'Activo').map((r) => ({ modulo: r.modulo, emails: r.emails ?? '' }));
        const email = compraAprobadaEmail(compra.id_compra, lineas, user.concat_name);
        await sendEmail(resolveRecipients('Aprobaciones', recipients), email);
      }
      showToast('Compra aprobada.', 'success');
      await load();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo aprobar la compra.', 'error');
    }
  };

  const handleRechazar = async (motivo: string) => {
    if (!rechazarTarget || !user) return;
    await api.aprobaciones.rechazar(rechazarTarget.id, motivo, user.id);
    showToast('Compra rechazada.', 'success');
    await load();
  };

  const handleEditSubmit = async (values: CompraFormValues) => {
    if (!editTarget) return;
    await api.aprobaciones.editar(editTarget.id, values.lineas);
    showToast('Compra actualizada.', 'success');
    await load();
  };

  const renderActions = (a: Aprobacion) => {
    if (!user) return null;
    return (
      <div className="flex justify-end gap-1">
        <button title="Ver detalle" aria-label="Ver detalle de la compra" onClick={() => setDetalleCompraId(a.compra_id)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
          <Eye className="h-4 w-4" />
        </button>
        {canEdit(a.status) && (
          <button title="Editar" aria-label="Editar renglones de la compra" onClick={() => setEditTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
            <Pencil className="h-4 w-4" />
          </button>
        )}
        {canReject(user.perfil, a.status) && (
          <button title="Rechazar" aria-label="Rechazar compra" onClick={() => setRechazarTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
            <XIcon className="h-4 w-4" />
          </button>
        )}
        {canApprove(user.perfil, a.status) && (
          <button title="Aprobar" aria-label="Aprobar compra" onClick={() => setAprobarTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 flex items-center justify-center">
            <Check className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Aprobaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Cola de solicitudes de compra pendientes de aprobación.</p>
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
              <MultiCombobox options={ESTADO_OPTIONS} value={estadoFilter} onChange={setEstadoFilter} placeholder="Todos" searchPlaceholder="Buscar estado…" />
            </div>
            {activeFilterCount > 0 && (
              <button onClick={() => { setEstadoFilter([]); setMesFilter([]); }} className="h-10 rounded-md px-3 text-xs font-medium text-muted-foreground hover:text-foreground">Limpiar</button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Aprobaciones" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No hay solicitudes pendientes" message="Las compras enviadas a aprobación van a aparecer acá." />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm">N° {idCompraLabel(a)}</p>
                    <p className="text-xs text-muted-foreground">{a.tecnico ?? '—'}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(a.fecha)}</span>
                  <StatusBadge status={a.urgencia ?? ''} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Cant. {a.cantidad ?? 0} · {a.sector ?? 'Sin sector'}</span>
                  <span className="font-semibold tabular-nums">{maskFromNumber(a.monto ?? 0)}</span>
                </div>
                <div className="mt-2 pt-2 border-t">{renderActions(a)}</div>
              </div>
            ))}
          </div>
          <Card className="hidden md:block border shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>N° Compra</TableHead>
                  <TableHead>Usuario gen.</TableHead>
                  <TableHead>Sector</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="text-sm">{formatDate(a.fecha)}</TableCell>
                    <TableCell className="text-sm font-medium">{idCompraLabel(a)}</TableCell>
                    <TableCell className="text-sm">{a.tecnico ?? '—'}</TableCell>
                    <TableCell className="text-sm">{a.sector ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={a.urgencia ?? ''} /></TableCell>
                    <TableCell className="text-right tabular-nums">{a.cantidad ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{maskFromNumber(a.monto ?? 0)}</TableCell>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell>{renderActions(a)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <VerDetalleCompraModal isOpen={detalleCompraId != null} onClose={() => setDetalleCompraId(null)} compraId={detalleCompraId} />

      <CompraFormModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title={`Editar renglones — ${editTarget ? idCompraLabel(editTarget) : ''}`}
        compraId={editTarget?.compra_id}
        headerEditable={false}
        onSubmit={handleEditSubmit}
      />

      <RechazarModal
        isOpen={!!rechazarTarget}
        onClose={() => setRechazarTarget(null)}
        idCompraLabel={rechazarTarget ? idCompraLabel(rechazarTarget) : ''}
        onConfirm={handleRechazar}
      />

      <ConfirmModal
        isOpen={!!aprobarTarget}
        onClose={() => setAprobarTarget(null)}
        onConfirm={handleAprobar}
        title="Aprobar compra"
        description={`¿Aprobar la compra ${aprobarTarget ? idCompraLabel(aprobarTarget) : ''}?`}
        confirmText="Aprobar"
        cancelText="Cancelar"
      />
    </div>
  );
};

export default AprobacionesView;
