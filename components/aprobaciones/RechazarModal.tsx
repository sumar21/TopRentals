// Rechazar Aprobación — required-reason modal (DESIGN.md §4.1). Not a ConfirmModal
// because it needs a mandatory Textarea before the confirm action enables.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Save, X } from 'lucide-react';
import { Button, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';

interface RechazarModalProps {
  isOpen: boolean;
  onClose: () => void;
  idCompraLabel: string;
  onConfirm: (motivo: string) => Promise<void>;
}

const RechazarModal: React.FC<RechazarModalProps> = ({ isOpen, onClose, idCompraLabel, onConfirm }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (isOpen) { setMotivo(''); setError(''); } }, [isOpen]);

  if (!visible) return null;

  const handleConfirm = async () => {
    if (!motivo.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onConfirm(motivo.trim());
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo rechazar la compra.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Rechazar compra</h2>
            <p className="text-xs text-muted-foreground">{idCompraLabel}</p>
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-3">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Motivo del rechazo<span className="text-destructive ml-0.5">*</span>
          </label>
          <textarea rows={4} maxLength={500} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button variant="destructive" onClick={handleConfirm} disabled={saving || !motivo.trim()} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Rechazar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default RechazarModal;
