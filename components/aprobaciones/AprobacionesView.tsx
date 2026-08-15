// Aprobaciones — purchase-approval queue (DESIGN.md §4.4 standard page skeleton).
// Queue is role-scoped per spec: Gerencia -> 'Aprobada Supervision'; Admin -> that +
// 'Pendiente'; everyone else -> 'Pendiente' only.
import React, { useEffect, useMemo, useState } from 'react';
import { Check, ClipboardList, Eye, Pencil, Search, X as XIcon } from 'lucide-react';
import { Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { FilterPopover } from '../ui/FilterPopover';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import ConfirmModal from '../ConfirmModal';
import { useToast } from '../ui/Toast';
import { useAuth } from '../../contexts/AuthContext';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { formatDate } from '../../utils/dates';
import { api } from '../../services/index.ts';
import type { Aprobacion, EstadoAprobacion, Perfil } from '../../services/types.ts';
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

// Estados alcanzables en esta cola (paridad con cmbox_estado_AP de PA): En Aprobacion
// y Recibida no se escriben ni filtran acá, se omiten.
const ESTADO_OPTIONS: { value: EstadoAprobacion; label: string }[] = [
  { value: 'Pendiente', label: 'Pendiente' },
  { value: 'Aprobada Supervision', label: 'Aprobada supervisión' },
  { value: 'Aprobada', label: 'Aprobada' },
  { value: 'Rechazada', label: 'Rechazada' },
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
  const [usuariosById, setUsuariosById] = useState<Map<number, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [q, setQ] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [mesFilter, setMesFilter] = useState<string[]>([]);

  const [detalleCompraId, setDetalleCompraId] = useState<number | null>(null);
  const [editTarget, setEditTarget] = useState<Aprobacion | null>(null);
  const [rechazarTarget, setRechazarTarget] = useState<Aprobacion | null>(null);
  const [aprobarTarget, setAprobarTarget] = useState<Aprobacion | null>(null);

  const load = (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(false);
    return Promise.all([api.aprobaciones.list(), api.usuarios.list()])
      .then(([aps, usuarios]) => {
        setAprobaciones(user ? scopeAprobaciones(user.perfil, aps) : []);
        // PA's "Usuario" column renders UserGen_AP = the login username, not the full name.
        setUsuariosById(new Map(usuarios.map((u) => [u.id, u.usuario_app])));
      })
      .catch(() => { showToast('No se pudieron cargar las aprobaciones.', 'error'); setLoadError(true); })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [user?.id]);
  // Live updates: silent refetch whenever an aprobación changes in the backend.
  useEffect(() => api.realtime.subscribe(['aprobaciones'], () => { void load(true); }), []);

  // PA parity: lbl_idCompra_AP renders IDCompra_A — the raw Compras id stamped on the aprobacion (= compra_id).
  const idCompraLabel = (a: Aprobacion) => `#${a.compra_id}`;

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
  }, [aprobaciones, estadoFilter, mesFilter, q]);

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
        {canApprove(user.perfil, a.status) && (
          <button title="Aprobar" aria-label="Aprobar compra" onClick={() => setAprobarTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-center">
            <Check className="h-4 w-4" />
          </button>
        )}
        {canReject(user.perfil, a.status) && (
          <button title="Rechazar" aria-label="Rechazar compra" onClick={() => setRechazarTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
            <XIcon className="h-4 w-4" />
          </button>
        )}
        {canEdit(a.status) && (
          <button title="Editar" aria-label="Editar renglones de la compra" onClick={() => setEditTarget(a)} className="h-8 w-8 rounded-md text-muted-foreground hover:text-primary hover:bg-accent flex items-center justify-center">
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 w-full md:h-full md:min-h-0">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Mis aprobaciones</h1>
          <p className="text-sm text-muted-foreground mt-1">Cola de solicitudes de compra pendientes de aprobación.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <FilterPopover
            activeCount={activeFilterCount}
            clearLabel="Limpiar"
            onClear={() => { setEstadoFilter([]); setMesFilter([]); }}
          >
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={mesFilter} onChange={setMesFilter} placeholder="Todos" searchPlaceholder="Buscar mes…" className="w-full" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Estado</label>
              <MultiCombobox options={ESTADO_OPTIONS} value={estadoFilter} onChange={setEstadoFilter} placeholder="Todos" searchPlaceholder="Buscar estado…" className="w-full" />
            </div>
          </FilterPopover>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando…" subtext="Aprobaciones" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No hay solicitudes pendientes" message="Las compras enviadas a aprobación van a aparecer acá." />
      ) : (
        <>
          <div className="md:hidden space-y-2">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-lg border bg-card p-3 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-sm whitespace-nowrap">N° {idCompraLabel(a)}</p>
                    <p className="text-xs text-muted-foreground">{a.tecnico ?? '—'}</p>
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{formatDate(a.fecha)}</span>
                  <StatusBadge status={a.urgencia ?? ''} />
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Cant. {a.cantidad ?? 0}</span>
                  <span className="font-semibold tabular-nums whitespace-nowrap">$ {maskFromNumber(a.monto ?? 0)}</span>
                </div>
                <div className="mt-2 pt-2 border-t">{renderActions(a)}</div>
              </div>
            ))}
          </div>
          <Card className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 border shadow-sm overflow-hidden">
            <Table wrapperClassName="h-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Urgencia</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Compra</TableHead>
                  <TableHead>Usuario</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell><StatusBadge status={a.status} /></TableCell>
                    <TableCell className="text-sm">{formatDate(a.fecha)}</TableCell>
                    <TableCell><StatusBadge status={a.urgencia ?? ''} /></TableCell>
                    <TableCell className="text-sm">{a.tecnico ?? '—'}</TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{idCompraLabel(a)}</TableCell>
                    <TableCell className="text-sm">{a.user_gen_id != null ? usuariosById.get(a.user_gen_id) ?? '—' : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.cantidad ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold whitespace-nowrap">$ {maskFromNumber(a.monto ?? 0)}</TableCell>
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
