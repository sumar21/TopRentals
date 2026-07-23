// Recibir Compra modal (DESIGN.md §4.1 + §6.9 dropzone). Per-line received qty +
// mark-not-received toggle, receipt file staged client-side only, notes, submit
// performs the stock intake via api.compras.recibir (atomic in the adapter).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Save, Trash2, Upload, X, XCircle } from 'lucide-react';
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useModalAnimation } from '../ui/UIComponents';
import { Loader } from '../ui/Loader';
import { backdropClose } from '../ui/backdropClose';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import { resolveRecipients, sendEmail, type RecipientRow } from '../../emails/send.ts';
import { compraRecibidaEmail, type CompraRecibidaLinea } from '../../emails/templates.ts';
import type { CompraConDetalle } from '../../services/api.ts';

interface RecibirCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  compraId: number | null;
  onReceived: () => void;
}

interface LineState {
  detalle_id: number;
  articulo: string;
  cantidad: number;
  recibidoInput: string;
  noRecibido: boolean;
}

const RecibirCompraModal: React.FC<RecibirCompraModalProps> = ({ isOpen, onClose, compraId, onReceived }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [compra, setCompra] = useState<CompraConDetalle | null>(null);
  const [lines, setLines] = useState<LineState[]>([]);
  const [obs, setObs] = useState('');
  const [comprobante, setComprobante] = useState<{ name: string; dataUrl: string } | null>(null);

  useEffect(() => {
    if (!isOpen || compraId == null) return;
    let cancelled = false;
    setLoading(true); setError(''); setObs(''); setComprobante(null);
    api.compras.get(compraId).then((row) => {
      if (cancelled || !row) return;
      setCompra(row);
      const activas = row.detalle.filter((d) => d.status === 'Activo');
      setLines(activas.map((d) => ({ detalle_id: d.id, articulo: d.articulo ?? '—', cantidad: d.cantidad, recibidoInput: String(d.cantidad), noRecibido: false })));
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, compraId]);

  if (!visible) return null;

  const updateLine = (id: number, patch: Partial<LineState>) =>
    setLines((prev) => prev.map((l) => (l.detalle_id === id ? { ...l, ...patch } : l)));

  const toggleNoRecibido = (id: number) =>
    setLines((prev) => prev.map((l) => (l.detalle_id === id ? { ...l, noRecibido: !l.noRecibido } : l)));

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setComprobante({ name: file.name, dataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!compra || !user) return;
    setSaving(true);
    setError('');
    try {
      const lineas = lines.map((l) => ({ detalle_id: l.detalle_id, recibido: l.noRecibido ? 0 : Math.max(0, parseInt(l.recibidoInput, 10) || 0) }));
      const updated = await api.compras.recibir(compra.id, lineas, obs);
      const emailLineas: CompraRecibidaLinea[] = updated.detalle
        .filter((d) => d.status === 'Activo')
        .map((d) => ({ edificio: d.edificio ?? '', articulo: d.articulo ?? '', cantidad: d.cantidad, costo_unitario: d.costo_unitario ?? 0, costo_total: d.costo_total ?? 0, recibido: d.recibido }));
      const emailRows = await api.emailsNotificacion.list();
      const recipients: RecipientRow[] = emailRows.filter((r) => r.status === 'Activo').map((r) => ({ modulo: r.modulo, emails: r.emails ?? '' }));
      const email = compraRecibidaEmail(compra.id_compra, emailLineas, obs || null, user.concat_name);
      await sendEmail(resolveRecipients('Compra', recipients), email);
      showToast('Compra recibida correctamente.', 'success');
      onReceived();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo registrar la recepción.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Recibir compra</h2>
            {compra && <p className="text-xs text-muted-foreground">{compra.id_compra}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading || !compra ? (
            <div className="flex items-center justify-center py-16"><Loader size="md" text="Cargando…" /></div>
          ) : (
            <>
              {error && (
                <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" /> {error}
                </div>
              )}

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Artículo</TableHead>
                    <TableHead className="text-right">Pedido</TableHead>
                    <TableHead className="text-right w-32">Recibido</TableHead>
                    <TableHead className="w-32 text-center">No recibido</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.detalle_id}>
                      <TableCell className="text-sm">{l.articulo}</TableCell>
                      <TableCell className="text-right tabular-nums">{l.cantidad}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} max={l.cantidad} disabled={l.noRecibido} value={l.noRecibido ? 0 : l.recibidoInput}
                          onChange={(e) => updateLine(l.detalle_id, { recibidoInput: e.target.value })} className="h-8 w-20 text-right ml-auto" />
                      </TableCell>
                      <TableCell className="text-center">
                        <button type="button" onClick={() => toggleNoRecibido(l.detalle_id)} aria-label={l.noRecibido ? 'Marcar como recibido' : 'Marcar como no recibido'}
                          className={`p-1.5 rounded-md transition-colors ${l.noRecibido ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:bg-muted'}`}>
                          <XCircle className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Comprobante (foto o PDF)</label>
                {comprobante ? (
                  <div className="flex items-center gap-3 rounded-lg border border-input bg-muted/20 p-2.5">
                    <span className="text-sm truncate flex-1">{comprobante.name}</span>
                    <button type="button" aria-label="Quitar comprobante" onClick={() => setComprobante(null)} className="h-8 w-8 rounded-md border border-input hover:text-destructive hover:bg-destructive/10 flex items-center justify-center">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
                    className="flex flex-col items-center justify-center gap-1.5 h-24 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
                    <input type="file" accept="image/*,application/pdf" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} className="hidden" />
                    <Upload className="w-5 h-5 text-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground">Arrastrá o hacé click para adjuntar</span>
                  </label>
                )}
                {/* ponytail: staged client-side only — no Storage backend yet. Upgrade path: upload
                    to a bucket on submit and persist the resulting path via services/documentos. */}
                <p className="text-[11px] text-muted-foreground/70 mt-1">El comprobante se adjunta cuando el backend de almacenamiento esté definido.</p>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Notas de recepción</label>
                <textarea rows={3} maxLength={1000} value={obs} onChange={(e) => setObs(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || loading || !compra} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Confirmar recepción
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RecibirCompraModal;
