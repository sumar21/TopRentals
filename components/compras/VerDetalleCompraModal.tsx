// Ver Detalle de Compra — read-only modal (DESIGN.md §4.1), shared by Compras
// ("ver detalle" row action) and Aprobaciones ("ver detalle" row action, same data).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Button, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, useModalAnimation } from '../ui/UIComponents';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { backdropClose } from '../ui/backdropClose';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { formatDate } from '../../utils/dates';
import { api } from '../../services/index.ts';
import type { CompraConDetalle } from '../../services/api.ts';

interface VerDetalleCompraModalProps {
  isOpen: boolean;
  onClose: () => void;
  compraId: number | null;
}

const VerDetalleCompraModal: React.FC<VerDetalleCompraModalProps> = ({ isOpen, onClose, compraId }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [loading, setLoading] = useState(false);
  const [compra, setCompra] = useState<CompraConDetalle | null>(null);

  useEffect(() => {
    if (!isOpen || compraId == null) return;
    let cancelled = false;
    setLoading(true);
    setCompra(null);
    api.compras.get(compraId).then((row) => { if (!cancelled) setCompra(row); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, compraId]);

  if (!visible) return null;

  const activas = compra?.detalle.filter((d) => d.status === 'Activo') ?? [];
  const lineas = activas.length > 0 ? activas : (compra?.detalle ?? []);
  const showRecibido = compra?.status === 'Recibida';

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Detalle de compra</h2>
            {compra && <p className="text-xs text-muted-foreground">{compra.id_compra}</p>}
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading || !compra ? (
            <div className="flex items-center justify-center py-16"><Loader size="md" text="Cargando…" /></div>
          ) : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                <div><p className="text-[11px] uppercase text-muted-foreground">Fecha</p><p className="font-medium">{formatDate(compra.fecha)}</p></div>
                <div><p className="text-[11px] uppercase text-muted-foreground">Estado</p><StatusBadge status={compra.status} /></div>
                <div><p className="text-[11px] uppercase text-muted-foreground">Usuario</p><p className="font-medium">{compra.usuario_compra ?? '—'}</p></div>
                <div><p className="text-[11px] uppercase text-muted-foreground">Urgencia</p><StatusBadge status={compra.urgencia ?? ''} /></div>
              </div>
              <div>
                <p className="text-[11px] uppercase text-muted-foreground mb-1">Observación</p>
                <p className="text-sm">{compra.observacion || 'No hay observación cargada.'}</p>
              </div>
              {compra.obs_recibir && (
                <div>
                  <p className="text-[11px] uppercase text-muted-foreground mb-1">Notas de recepción</p>
                  <p className="text-sm">{compra.obs_recibir}</p>
                </div>
              )}

              {/* Mobile: line items as cards (table doesn't fit at 375px). */}
              <div className="sm:hidden space-y-2">
                {lineas.map((d) => (
                  <div key={d.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium">{d.articulo ?? '—'}</p>
                      <p className="text-sm font-semibold tabular-nums shrink-0">$ {maskFromNumber(d.costo_total ?? 0)}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{d.edificio ?? '—'}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Cant. {d.cantidad}{showRecibido ? ` · Recib. ${d.recibido ?? '—'}` : ''}</span>
                      <span>$ {maskFromNumber(d.costo_unitario ?? 0)} c/u</span>
                    </div>
                  </div>
                ))}
              </div>
              {/* Tablet/desktop: full table. */}
              <div className="hidden sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">Cantidad</TableHead>
                      {showRecibido && <TableHead className="text-right">Recibido</TableHead>}
                      <TableHead>Edificio</TableHead>
                      <TableHead>Artículo</TableHead>
                      <TableHead className="text-right">Costo unit.</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lineas.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="text-right tabular-nums">{d.cantidad}</TableCell>
                        {showRecibido && <TableCell className="text-right tabular-nums">{d.recibido ?? '—'}</TableCell>}
                        <TableCell className="text-sm">{d.edificio ?? '—'}</TableCell>
                        <TableCell className="text-sm">{d.articulo ?? '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">$ {maskFromNumber(d.costo_unitario ?? 0)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">$ {maskFromNumber(d.costo_total ?? 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cerrar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default VerDetalleCompraModal;
