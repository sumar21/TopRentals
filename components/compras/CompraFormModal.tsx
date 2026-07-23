// Nueva/Editar Compra modal (DESIGN.md §4.1 recipe). Shared: Compras uses it to
// crear/actualizar a compra; Aprobaciones reuses it (headerEditable=false) to edit
// only the line items of a still-Pendiente compra, since api.aprobaciones.editar()
// only accepts `lineas` — it never touches the compra header fields.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { Button, Combobox, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useModalAnimation } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { MoneyInput } from '../ui/MoneyInput';
import { Loader } from '../ui/Loader';
import { backdropClose } from '../ui/backdropClose';
import { maskFromNumber, parseMoney } from '../../utils/formatMoneyInput';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../services/index.ts';
import type { Articulo, Edificio, Usuario } from '../../services/types.ts';
import type { CompraLineaInput } from '../../services/api.ts';

export interface CompraFormValues {
  usuario_id: number;
  usuario_compra: string;
  urgencia: 'Baja' | 'Media' | 'Alta';
  edificio_id: number;
  observacion: string;
  lineas: CompraLineaInput[];
}

interface CartLine {
  key: string;
  articulo_id: number;
  articulo_nombre: string;
  cantidad: number;
  costo: string; // masked money string
}

interface CompraFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** When set, preloads that compra's header + active lines. Omit to start blank. */
  compraId?: number;
  /** false = header fields render read-only (Aprobaciones edit only ever writes lines). */
  headerEditable?: boolean;
  onSubmit: (values: CompraFormValues) => Promise<void>;
}

const URGENCIA_OPTIONS = [
  { value: 'Baja', label: 'Baja' },
  { value: 'Media', label: 'Media' },
  { value: 'Alta', label: 'Alta' },
];

/** Building select is only editable for Admin/Compras (spec role_logic) — everyone else gets it locked to their own edificio. */
const canEditBuilding = (perfil: string) => perfil === 'Admin' || perfil === 'Compras';

let lineSeq = 0;
const nextLineKey = () => `line-${++lineSeq}`;

const CompraFormModal: React.FC<CompraFormModalProps> = ({ isOpen, onClose, title, compraId, headerEditable = true, onSubmit }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { user } = useAuth();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);

  const [solicitanteId, setSolicitanteId] = useState('');
  const [solicitanteNombre, setSolicitanteNombre] = useState('');
  const [urgencia, setUrgencia] = useState<'Baja' | 'Media' | 'Alta'>('Media');
  const [edificioId, setEdificioId] = useState('');
  const [observacion, setObservacion] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);

  const [nuevoArticuloId, setNuevoArticuloId] = useState('');
  const [nuevaCantidad, setNuevaCantidad] = useState('1');
  const [nuevoCosto, setNuevoCosto] = useState('');

  // Reset + preload every time the modal opens.
  useEffect(() => {
    if (!isOpen || !user) return;
    let cancelled = false;
    setError('');
    setNuevoArticuloId(''); setNuevaCantidad('1'); setNuevoCosto('');
    setLoading(true);
    Promise.all([
      api.usuarios.list(),
      api.edificios.list(),
      api.articulos.list(),
      compraId != null ? api.compras.get(compraId) : Promise.resolve(null),
    ]).then(([us, eds, arts, existing]) => {
      if (cancelled) return;
      setUsuarios(us);
      setEdificios(eds);
      setArticulos(arts.filter((a) => a.status === 'Activo'));
      if (existing) {
        setSolicitanteId(String(existing.usuario_id ?? ''));
        setSolicitanteNombre(existing.usuario_compra ?? '');
        setUrgencia((existing.urgencia as 'Baja' | 'Media' | 'Alta') ?? 'Media');
        setObservacion(existing.observacion ?? '');
        const activas = existing.detalle.filter((d) => d.status === 'Activo');
        setEdificioId(String(activas[0]?.edificio_id ?? user.edificio_id ?? ''));
        setCart(activas.map((d) => ({
          key: nextLineKey(),
          articulo_id: d.articulo_id ?? 0,
          articulo_nombre: d.articulo ?? '',
          cantidad: d.cantidad,
          costo: maskFromNumber(d.costo_unitario ?? 0),
        })));
      } else {
        setSolicitanteId(user.perfil === 'Admin' ? String(user.id) : '');
        setSolicitanteNombre(user.perfil === 'Admin' ? user.concat_name : '');
        setUrgencia('Media');
        setObservacion('');
        setEdificioId(String(user.edificio_id ?? ''));
        setCart([]);
      }
    }).catch(() => { if (!cancelled) setError('No se pudo cargar la información de la compra.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, compraId, user]);

  if (!visible || !user) return null;

  const requesterOptions = useMemo(() => {
    const base = usuarios.filter((u) => u.perfil === 'Tecnico' || (user.perfil === 'Admin' && u.id === user.id));
    if (solicitanteId && !base.some((u) => String(u.id) === solicitanteId)) {
      const current = usuarios.find((u) => String(u.id) === solicitanteId);
      if (current) base.push(current);
    }
    return base.map((u) => ({ value: String(u.id), label: u.concat_name }));
  }, [usuarios, user, solicitanteId]);

  const edificioOptions = useMemo(() => edificios.map((e) => ({ value: String(e.id), label: e.nombre })), [edificios]);
  const articuloOptions = useMemo(() => articulos.map((a) => ({ value: String(a.id), label: a.nombre })), [articulos]);

  const buildingLocked = !canEditBuilding(user.perfil);
  const total = useMemo(() => cart.reduce((sum, l) => sum + l.cantidad * parseMoney(l.costo), 0), [cart]);

  const handleSelectArticulo = (value: string) => {
    setNuevoArticuloId(value);
    const art = articulos.find((a) => String(a.id) === value);
    setNuevoCosto(maskFromNumber(art?.precio_unitario ?? 0));
  };

  const addLine = () => {
    const art = articulos.find((a) => String(a.id) === nuevoArticuloId);
    const cantidad = parseInt(nuevaCantidad, 10);
    if (!art || !Number.isFinite(cantidad) || cantidad <= 0) return;
    setCart((prev) => [...prev, { key: nextLineKey(), articulo_id: art.id, articulo_nombre: art.nombre, cantidad, costo: nuevoCosto || maskFromNumber(art.precio_unitario ?? 0) }]);
    setNuevoArticuloId(''); setNuevaCantidad('1'); setNuevoCosto('');
  };

  const updateLine = (key: string, patch: Partial<CartLine>) =>
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setCart((prev) => prev.filter((l) => l.key !== key));

  const canSubmit = !!solicitanteId && !!edificioId && cart.length > 0 && !saving && !loading;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const lineas: CompraLineaInput[] = cart.map((l) => ({
        articulo_id: l.articulo_id,
        edificio_id: Number(edificioId),
        cantidad: l.cantidad,
        costo_unitario: parseMoney(l.costo),
      }));
      const solicitante = usuarios.find((u) => String(u.id) === solicitanteId);
      await onSubmit({
        usuario_id: Number(solicitanteId),
        usuario_compra: solicitante?.concat_name ?? solicitanteNombre,
        urgencia,
        edificio_id: Number(edificioId),
        observacion,
        lineas,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la compra.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {!headerEditable && <p className="text-xs text-muted-foreground">Solo se pueden editar los renglones de esta solicitud.</p>}
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader size="md" text="Cargando…" /></div>
          ) : (
            <>
              {error && (
                <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Solicitante</label>
                  {headerEditable ? (
                    <Select value={solicitanteId} onChange={setSolicitanteId} options={requesterOptions} placeholder="Seleccionar técnico…" />
                  ) : (
                    <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted text-sm text-muted-foreground">{solicitanteNombre || '—'}</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Urgencia</label>
                  {headerEditable ? (
                    <Select value={urgencia} onChange={(v) => setUrgencia(v as 'Baja' | 'Media' | 'Alta')} options={URGENCIA_OPTIONS} />
                  ) : (
                    <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted text-sm text-muted-foreground">{urgencia}</div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio</label>
                  {headerEditable && !buildingLocked ? (
                    <Select value={edificioId} onChange={setEdificioId} options={edificioOptions} placeholder="Seleccionar edificio…" />
                  ) : (
                    <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted text-sm text-muted-foreground">
                      {edificioOptions.find((o) => o.value === edificioId)?.label ?? '—'}
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Artículos</h3>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_100px_140px_auto] gap-2 items-end p-3 bg-secondary/20 rounded-lg border border-border/50">
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Artículo</label>
                    <Combobox options={articuloOptions} value={nuevoArticuloId} onChange={handleSelectArticulo} placeholder="Buscar artículo…" searchPlaceholder="Buscar…" />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Cantidad</label>
                    <Input type="number" min={1} value={nuevaCantidad} onChange={(e) => setNuevaCantidad(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground mb-1 block">Costo unit.</label>
                    <MoneyInput value={nuevoCosto} onChange={setNuevoCosto} />
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={addLine} disabled={!nuevoArticuloId} className="gap-1.5">
                    <Plus className="h-4 w-4" /> Agregar línea
                  </Button>
                </div>

                {cart.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Todavía no agregaste artículos.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Artículo</TableHead>
                        <TableHead className="w-24 text-right">Cant.</TableHead>
                        <TableHead className="w-36 text-right">Costo unit.</TableHead>
                        <TableHead className="w-36 text-right">Total</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cart.map((l) => (
                        <TableRow key={l.key}>
                          <TableCell className="text-sm">{l.articulo_nombre}</TableCell>
                          <TableCell className="text-right">
                            <Input type="number" min={1} value={l.cantidad} onChange={(e) => updateLine(l.key, { cantidad: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="h-8 w-20 text-right ml-auto" />
                          </TableCell>
                          <TableCell className="text-right">
                            <MoneyInput value={l.costo} onChange={(v) => updateLine(l.key, { costo: v })} className="h-8 w-28 text-right ml-auto" />
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium tabular-nums">$ {maskFromNumber(l.cantidad * parseMoney(l.costo))}</TableCell>
                          <TableCell>
                            <button type="button" aria-label="Quitar línea" onClick={() => removeLine(l.key)} className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
                {cart.length > 0 && (
                  <div className="flex justify-end text-sm font-bold font-mono text-brand">Total: $ {maskFromNumber(total)}</div>
                )}
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Observación</label>
                <textarea rows={3} maxLength={1000} value={observacion} onChange={(e) => setObservacion(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CompraFormModal;
