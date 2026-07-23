// Ver Repuestos (Group_VerRepuestos_OT) — read-only list of parts consumed on the OT.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PackageSearch, X } from 'lucide-react';
import { Badge, Button, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import { Loader } from '../ui/Loader';
import { api } from '../../services/index';
import type { OrdenTrabajo, RepuestoOT } from '../../services/types';

export interface VerRepuestosModalProps {
  isOpen: boolean;
  onClose: () => void;
  ot: OrdenTrabajo | null;
}

const VerRepuestosModal: React.FC<VerRepuestosModalProps> = ({ isOpen, onClose, ot }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [repuestos, setRepuestos] = useState<RepuestoOT[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !ot) return;
    setLoading(true);
    api.ots.repuestos.list(ot.id).then(setRepuestos).finally(() => setLoading(false));
  }, [isOpen, ot]);

  if (!visible) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Repuestos utilizados</h2>
            {ot && <p className="text-xs text-muted-foreground">OT <span className="font-medium text-foreground">#{ot.id}</span></p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="Cerrar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader size="sm" /></div>
          ) : repuestos.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl bg-muted/5">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3"><PackageSearch className="w-7 h-7 text-muted-foreground/40" /></div>
              <p className="text-muted-foreground font-medium text-sm text-center">Sin repuestos registrados</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {repuestos.map((r) => (
                <li key={r.id} className="rounded-lg border bg-card p-3 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium truncate">{r.repuesto ?? `Artículo #${r.articulo_id ?? '?'}`}</span>
                  <Badge variant="secondary" className="shrink-0">x{r.cantidad}</Badge>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex justify-end">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default VerRepuestosModal;
