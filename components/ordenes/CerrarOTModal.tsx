// Cerrar OT (Group_CerrarOT) — sets a closure sub-status ('Cerrada V' / 'Cerrada F')
// with a date, independent from Finalizar/Resolver (which sets 'Cerrada' + email).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Save, X } from 'lucide-react';
import { Button, useModalAnimation } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { backdropClose } from '../ui/backdropClose';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import type { EstadoOT, OrdenTrabajo } from '../../services/types';
import { formatDate, todayISO } from '../../utils/dates';

const TIPO_CIERRE_OPTIONS = [{ label: 'Cerrada V', value: 'Cerrada V' }, { label: 'Cerrada F', value: 'Cerrada F' }];

export interface CerrarOTModalProps {
  isOpen: boolean;
  onClose: () => void;
  ot: OrdenTrabajo | null;
  onSaved: (ot: OrdenTrabajo) => void;
}

const CerrarOTModal: React.FC<CerrarOTModalProps> = ({ isOpen, onClose, ot, onSaved }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { showToast } = useToast();
  const [tipoCierre, setTipoCierre] = useState<Extract<EstadoOT, 'Cerrada V' | 'Cerrada F'>>('Cerrada V');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setTipoCierre('Cerrada V');
    setError('');
  }, [isOpen]);

  const handleSave = async () => {
    if (!ot) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.ots.cerrar(ot.id, tipoCierre);
      showToast(`Orden de trabajo cerrada (${tipoCierre}).`, 'success');
      onSaved(saved);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo cerrar la orden de trabajo.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Cerrar Orden de Trabajo</h2>
            {ot && <p className="text-xs text-muted-foreground">OT <span className="font-medium text-foreground">#{ot.id}</span></p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="Cerrar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de cierre *</label>
            <Select value={tipoCierre} onChange={(v) => setTipoCierre(v as typeof tipoCierre)} options={TIPO_CIERRE_OPTIONS} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha de cierre</label>
            {/* ponytail: DataApi.ots.cerrar() no acepta una fecha — el mock/adapter siempre
               usa la fecha de hoy. Se muestra solo informativo en vez de un Input editable
               que no tendría efecto (evita un campo engañoso). */}
            <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted text-sm font-medium text-muted-foreground">{formatDate(todayISO())}</div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CerrarOTModal;
