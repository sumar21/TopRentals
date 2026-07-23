// Screen_SalidasStock port — outbound-stock ledger. See docs/analysis/desktop_Screen_SalidasStock.md.
// Filters follow DESIGN.md §4.7 golden rule: a collapsible inline bar, never a modal.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Loader2, Pencil, PackageSearch, Save, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button, Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import { Loader } from '../ui/Loader';
import { StatusBadge } from '../ui/StatusBadge';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import ConfirmModal from '../ConfirmModal';
import { api } from '../../services/index.ts';
import { useAuth } from '../../contexts/AuthContext';
import type { SalidaStock, Usuario } from '../../services/types.ts';
import { formatDate } from '../../utils/dates';

const TIPO_OPTIONS = [
  { label: 'Consumible', value: 'CONSUMIBLE' },
  { label: 'Asignación', value: 'ASIGNACION' },
  { label: 'Devolución', value: 'DEVOLUCION' },
  { label: 'Devuelto', value: 'DEVUELTO' },
  // BUG FIX (desktop_Screen_SalidasStock.md): TRASLADO was missing from the PA filter combo —
  // transfer rows could never be isolated. Included here.
  { label: 'Traslado', value: 'TRASLADO' },
];

/** Last 12 months (current first), as 'YYYY-MM' keys — used for the mes filter. */
function last12Months(): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    out.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
  }
  return out;
}
const mesKeyOf = (iso: string | null) => (iso ? iso.slice(0, 7) : '');

const SalidasStockView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [salidas, setSalidas] = useState<SalidaStock[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [meses, setMeses] = useState<string[]>([]);
  const [tipos, setTipos] = useState<string[]>([]);
  const [tecnicoIds, setTecnicoIds] = useState<string[]>([]);
  const [editTarget, setEditTarget] = useState<SalidaStock | null>(null);
  const [devolucionTarget, setDevolucionTarget] = useState<SalidaStock | null>(null);

  const reload = () => api.stock.salidas().then(setSalidas);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    return Promise.all([api.stock.salidas(), api.usuarios.list()])
      .then(([s, u]) => { setSalidas(s); setUsuarios(u); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const confirmarDevolucion = async () => {
    if (!devolucionTarget || !user) return;
    try {
      await api.stock.confirmarDevolucion({ salida_id: devolucionTarget.id, usuario_id: user.id });
      await reload();
      showToast('Devolución confirmada: el stock fue reingresado.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo confirmar la devolución.', 'error');
    }
  };

  const tecnicosById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const tecnicoOptions = useMemo(
    () => usuarios.filter((u) => u.perfil === 'Tecnico').map((u) => ({ label: u.concat_name, value: String(u.id) })),
    [usuarios],
  );
  const mesOptions = useMemo(() => last12Months(), []);

  const activeCount = meses.length + tipos.length + tecnicoIds.length;
  const clearFilters = () => { setMeses([]); setTipos([]); setTecnicoIds([]); };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return salidas
      .filter((s) => meses.length === 0 || meses.includes(mesKeyOf(s.fecha_salida)))
      // Independent predicates (PA bug: two of four nested Ifs referenced técnico's
      // SelectedItems where tipo's was intended, silently mis-filtering by type — not ported).
      .filter((s) => tipos.length === 0 || tipos.includes(s.tipo))
      .filter((s) => tecnicoIds.length === 0 || (s.tecnico_id != null && tecnicoIds.includes(String(s.tecnico_id))))
      .filter((s) => {
        if (!q) return true;
        const tecnico = s.tecnico_id != null ? tecnicosById.get(s.tecnico_id)?.concat_name ?? '' : '';
        const haystack = `${tecnico} ${s.tipo} ${s.concat_articulo ?? ''} ${s.centro_de_costo ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (b.fecha_salida ?? '').localeCompare(a.fecha_salida ?? ''));
  }, [salidas, meses, tipos, tecnicoIds, search, tecnicosById]);

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate('/stock')} aria-label="Volver a Stock">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold tracking-tight">Salidas de Stock</h1>
            <p className="text-sm text-muted-foreground mt-1">Historial de despachos, consumos, traslados y devoluciones</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar técnico, tipo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={cn(
              'flex shrink-0 items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors h-9',
              showFilters ? 'border-brand/30 bg-brand/[0.06] text-brand' : 'bg-background text-muted-foreground hover:text-foreground',
            )}
          >
            <SlidersHorizontal className="h-4 w-4 text-brand" /> Filtros
            {activeCount > 0 && <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{activeCount}</span>}
            {showFilters ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="rounded-xl border bg-muted/20 p-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-full sm:w-52">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={meses} onChange={setMeses} placeholder="Todos" searchPlaceholder="Buscar mes…" />
            </div>
            <div className="w-full sm:w-44">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Tipo</label>
              <MultiCombobox options={TIPO_OPTIONS} value={tipos} onChange={setTipos} placeholder="Todos" searchPlaceholder="Buscar tipo…" />
            </div>
            <div className="w-full sm:w-48">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Técnico</label>
              <MultiCombobox options={tecnicoOptions} value={tecnicoIds} onChange={setTecnicoIds} placeholder="Todos" searchPlaceholder="Buscar técnico…" />
            </div>
            {activeCount > 0 && (
              <button onClick={clearFilters} className="flex h-10 items-center gap-1 rounded-md px-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando salidas…" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Sin resultados" message="No hay salidas de stock que coincidan con la búsqueda/filtros." />
      ) : (
        <>
          {/* MOBILE */}
          <div className="md:hidden space-y-2">
            {visible.map((s) => {
              const tecnico = s.tecnico_id != null ? tecnicosById.get(s.tecnico_id)?.concat_name : null;
              const puedeDevolver = s.tipo === 'DEVOLUCION' && !s.fecha_reingreso;
              const puedeEditar = !s.fecha_reingreso;
              return (
                <div key={s.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{s.concat_articulo ?? '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{formatDate(s.fecha_salida)} · {tecnico ?? '—'}</div>
                    </div>
                    <StatusBadge status={s.tipo} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><div className="text-muted-foreground">Cantidad</div><div className="font-semibold tabular-nums">{s.cantidad}</div></div>
                    <div><div className="text-muted-foreground">Centro de costo</div><div className="font-medium">{s.centro_de_costo ?? '—'}</div></div>
                  </div>
                  <div className="flex justify-end gap-1 pt-2 border-t">
                    <RowActions puedeEditar={puedeEditar} puedeDevolver={puedeDevolver} onEditar={() => setEditTarget(s)} onDevolver={() => setDevolucionTarget(s)} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* DESKTOP */}
          <Card className="hidden md:block border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Centro de costo</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => {
                  const tecnico = s.tecnico_id != null ? tecnicosById.get(s.tecnico_id)?.concat_name : null;
                  const puedeDevolver = s.tipo === 'DEVOLUCION' && !s.fecha_reingreso;
                  const puedeEditar = !s.fecha_reingreso;
                  return (
                    <TableRow key={s.id}>
                      <TableCell><StatusBadge status={s.tipo} /></TableCell>
                      <TableCell>{formatDate(s.fecha_salida)}</TableCell>
                      <TableCell>{tecnico ?? '—'}</TableCell>
                      <TableCell>{s.concat_articulo ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.cantidad}</TableCell>
                      <TableCell>{s.centro_de_costo ?? '—'}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <RowActions puedeEditar={puedeEditar} puedeDevolver={puedeDevolver} onEditar={() => setEditTarget(s)} onDevolver={() => setDevolucionTarget(s)} />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      <EditarSalidaModal
        salida={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={async () => {
          await reload();
          setEditTarget(null);
        }}
        usuarioId={user?.id ?? 0}
      />

      <ConfirmModal
        isOpen={devolucionTarget != null}
        onClose={() => setDevolucionTarget(null)}
        onConfirm={confirmarDevolucion}
        title="Confirmar devolución"
        description={`Se reingresan ${devolucionTarget?.cantidad ?? ''} unidades de ${devolucionTarget?.concat_articulo ?? 'el artículo'} al stock.`}
        confirmText="Confirmar"
        cancelText="Cancelar"
        icon={<CheckCircle2 className="h-6 w-6" />}
      />
    </div>
  );
};

const RowActions: React.FC<{ puedeEditar: boolean; puedeDevolver: boolean; onEditar: () => void; onDevolver: () => void }> = ({
  puedeEditar,
  puedeDevolver,
  onEditar,
  onDevolver,
}) => (
  <>
    {puedeEditar && (
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEditar} title="Editar cantidad" aria-label="Editar cantidad">
        <Pencil className="h-4 w-4" />
      </Button>
    )}
    {puedeDevolver && (
      <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={onDevolver} title="Confirmar devolución" aria-label="Confirmar devolución">
        <CheckCircle2 className="h-4 w-4" />
      </Button>
    )}
  </>
);

/** Edit the quantity of an existing salida — re-adjusts stock by the delta (DESIGN.md §4.1 modal). */
const EditarSalidaModal: React.FC<{ salida: SalidaStock | null; onClose: () => void; onSaved: () => Promise<void>; usuarioId: number }> = ({
  salida,
  onClose,
  onSaved,
  usuarioId,
}) => {
  const { showToast } = useToast();
  const { visible, overlayClass, modalClass } = useModalAnimation(salida != null);
  const [cantidad, setCantidad] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (salida) setCantidad(String(salida.cantidad));
  }, [salida]);

  if (!visible) return null;
  const parsed = Number(cantidad);
  const valid = Number.isFinite(parsed) && parsed > 0;

  const save = async () => {
    if (!salida || !valid) return;
    setSaving(true);
    try {
      await api.stock.editarSalida({ salida_id: salida.id, cantidad: parsed, usuario_id: usuarioId });
      await onSaved();
      showToast('Cantidad actualizada. El stock fue reajustado.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo actualizar la salida.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Editar salida</h2>
            <p className="text-xs text-muted-foreground">
              {salida?.concat_articulo} · <span className="font-medium text-foreground">{salida?.tipo}</span>
            </p>
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad</label>
          <Input autoFocus inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))} />
          {!valid && cantidad !== '' && (
            <p className="mt-1 text-xs text-red-600" role="alert">Ingresá una cantidad mayor a cero.</p>
          )}
        </div>
        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={!valid || saving} className="min-w-[140px] w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SalidasStockView;
