// Bitácoras (Group_PopUpBitacoras + Group_AgregarBitacora) — journal viewer with an
// inline "Agregar" sub-form, per DESIGN.md §4.1.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, NotebookText, Plus, Upload, X } from 'lucide-react';
import { Button, useModalAnimation } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import { Loader } from '../ui/Loader';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import type { Bitacora, OrdenTrabajo } from '../../services/types';
import { formatDate } from '../../utils/dates';
import { fileToCompressedDataUrl } from './otHelpers';

export interface BitacorasModalProps {
  isOpen: boolean;
  onClose: () => void;
  ot: OrdenTrabajo | null;
}

const BitacorasModal: React.FC<BitacorasModalProps> = ({ isOpen, onClose, ot }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [bitacoras, setBitacoras] = useState<Bitacora[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // ponytail: DataApi.ots.bitacoras.list() returns only Bitacora rows — there is no
  // endpoint that joins back the FotoBitacora row created alongside an entry, so a
  // saved photo can't be re-fetched after a reload. Photos are shown only for entries
  // added in this session (kept in `sessionFotos` below). Upgrade path: extend
  // ots.bitacoras.list() to embed foto_path once the real backend lands (services/*
  // is out of scope for this module).
  const [sessionFotos, setSessionFotos] = useState<Record<number, string>>({});
  const [lightbox, setLightbox] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [descripcion, setDescripcion] = useState('');
  const [fotoUrl, setFotoUrl] = useState('');
  const [compressing, setCompressing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen || !ot) return;
    setError('');
    setShowForm(false);
    setDescripcion('');
    setFotoUrl('');
    setSessionFotos({});
    setLoading(true);
    api.ots.bitacoras.list(ot.id).then(setBitacoras).catch(() => setError('No se pudieron cargar las bitácoras.')).finally(() => setLoading(false));
  }, [isOpen, ot]);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setCompressing(true);
    const dataUrl = await fileToCompressedDataUrl(file);
    setFotoUrl(dataUrl);
    setCompressing(false);
  };

  const handleAgregar = async () => {
    if (!ot || !user || !descripcion.trim()) return;
    setSaving(true);
    try {
      const nueva = await api.ots.bitacoras.crear({ orden_trabajo_id: ot.id, descripcion: descripcion.trim(), usuario_id: user.id, foto_path: fotoUrl || undefined });
      setBitacoras((prev) => [nueva, ...prev]);
      if (fotoUrl) setSessionFotos((prev) => ({ ...prev, [nueva.id]: fotoUrl }));
      setDescripcion('');
      setFotoUrl('');
      setShowForm(false);
      showToast('Bitácora agregada.', 'success');
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo agregar la bitácora.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Bitácoras</h2>
            {ot && <p className="text-xs text-muted-foreground">OT <span className="font-medium text-foreground">#{ot.id}</span></p>}
          </div>
          <button onClick={saving ? undefined : onClose} className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="Cerrar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader size="sm" /></div>
          ) : bitacoras.length === 0 && !showForm ? (
            <div className="flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl bg-muted/5">
              <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3"><NotebookText className="w-7 h-7 text-muted-foreground/40" /></div>
              <p className="text-muted-foreground font-medium text-sm text-center">Sin bitácoras registradas</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {bitacoras.map((b) => (
                <li key={b.id} className="rounded-lg border bg-card p-3 flex gap-3">
                  {sessionFotos[b.id] && (
                    <button type="button" onClick={() => setLightbox(sessionFotos[b.id])} className="shrink-0">
                      <img src={sessionFotos[b.id]} alt="" className="h-12 w-12 rounded-md object-cover border" />
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-muted-foreground">{formatDate(b.fecha)}</p>
                    <p className="text-sm mt-0.5 break-words">{b.descripcion}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {showForm && (
            <div className="rounded-lg border bg-muted/10 p-3 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Descripción *</label>
                <textarea rows={3} maxLength={500} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} autoFocus
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Foto (opcional)</label>
                {fotoUrl ? (
                  <div className="flex items-center gap-3 rounded-lg border border-input bg-muted/20 p-2.5">
                    <img src={fotoUrl} alt="" className="h-12 w-12 rounded-md object-cover border shrink-0" />
                    <button type="button" onClick={() => setFotoUrl('')} aria-label="Quitar foto"
                      className="h-8 w-8 rounded-md border border-input flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 ml-auto">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
                    <input type="file" accept="image/*" onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }} className="hidden" disabled={compressing} />
                    {compressing ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> : <Upload className="w-4 h-4 text-muted-foreground/50" />}
                    <span className="text-xs text-muted-foreground">Arrastrá o hacé click</span>
                  </label>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
                <Button size="sm" onClick={handleAgregar} disabled={!descripcion.trim() || saving} className="gap-2">
                  {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Guardar
                </Button>
              </div>
            </div>
          )}
        </div>

        {!showForm && (
          <div className="p-4 border-t bg-muted/20 flex justify-end">
            <Button onClick={() => setShowForm(true)} className="gap-2"><Plus className="h-4 w-4" /> Agregar</Button>
          </div>
        )}
      </div>

      {lightbox && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded-lg" />
        </div>,
        document.body,
      )}
    </div>,
    document.body,
  );
};

export default BitacorasModal;
