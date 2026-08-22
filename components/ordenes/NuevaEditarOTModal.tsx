// Nueva/Editar Solicitud (Group_NuevaOT) — DESIGN.md §4.1 canonical form modal.
// Also doubles as the read-only "Ver detalle" view (Compras, or any non-Pendiente OT)
// via the `readOnly` prop, to avoid a second near-identical modal component.
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, FileText, Loader2, Paperclip, Save, Upload, X } from 'lucide-react';
import { Button, useModalAnimation } from '../ui/UIComponents';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { NumberInput } from '../ui/NumberInput';
import { backdropClose } from '../ui/backdropClose';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import { APP_VERSION } from '../../config/appVersion';
import { todayISO } from '../../utils/dates';
import type { Documento, Edificio, OrdenTrabajo, Unidad } from '../../services/types';
import { OCUPACION_OPTIONS, PRIORIDAD_OPTIONS, TIPO_TAREA_OPTIONS, TIPO_TRABAJO_OPTIONS } from './otHelpers';

interface StagedPhoto { id: string; file: File; url: string; }

export interface NuevaEditarOTModalProps {
  isOpen: boolean;
  onClose: () => void;
  ot: OrdenTrabajo | null; // null = alta
  readOnly?: boolean;
  edificios: Edificio[];
  unidades: Unidad[];
  onSaved: (ot: OrdenTrabajo) => void;
}

const NuevaEditarOTModal: React.FC<NuevaEditarOTModalProps> = ({ isOpen, onClose, ot, readOnly = false, edificios, unidades, onSaved }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [fechaInicio, setFechaInicio] = useState('');
  const [edificioId, setEdificioId] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [prioridad, setPrioridad] = useState('Media');
  const [tipoPrioridad, setTipoPrioridad] = useState('Media');
  const [tipoTrabajo, setTipoTrabajo] = useState('');
  const [tipoTarea, setTipoTarea] = useState('');
  const [diasEstimado, setDiasEstimado] = useState('');
  const [personasRequeridas, setPersonasRequeridas] = useState('');
  const [detalle, setDetalle] = useState('');
  const [fotos, setFotos] = useState<StagedPhoto[]>([]);
  const [savedDocs, setSavedDocs] = useState<{ doc: Documento; url: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    if (ot) {
      const unidad = ot.unidad_id != null ? unidades.find((u) => u.id === ot.unidad_id) : undefined;
      setFechaInicio((ot.fecha_inicio ?? '').slice(0, 10));
      setEdificioId(unidad?.edificio_id != null ? String(unidad.edificio_id) : String(edificios.find((e) => e.nombre === ot.torre)?.id ?? ''));
      setUnidadId(ot.unidad_id != null ? String(ot.unidad_id) : '');
      setPrioridad(ot.prioridad);
      setTipoPrioridad(ot.tipo_prioridad ?? '');
      setTipoTrabajo(ot.tipo_trabajo ?? '');
      setTipoTarea(ot.tipo_tarea ?? '');
      setDiasEstimado(ot.dias_estimado != null ? String(ot.dias_estimado) : '');
      setPersonasRequeridas(ot.personas_requeridas != null ? String(ot.personas_requeridas) : '');
      setDetalle(ot.detalle ?? '');
    } else {
      setFechaInicio(new Date().toISOString().slice(0, 10));
      setEdificioId('');
      setUnidadId('');
      setPrioridad('Media');
      setTipoPrioridad('');
      setTipoTrabajo('');
      setTipoTarea('');
      setDiasEstimado('');
      setPersonasRequeridas('');
      setDetalle('');
    }
    setFotos([]);
  }, [isOpen, ot, edificios, unidades]);

  // Staged photos are uploaded to Storage on create (handleSubmit → api.documentos.crear,
  // carpeta 'Ordenes', attached to the new OT). This effect just revokes the preview object URLs.
  useEffect(() => () => fotos.forEach((f) => URL.revokeObjectURL(f.url)), [fotos]);

  // Documentos YA subidos de esta OT: se leen y se firman (bucket privado) para poder verlos.
  useEffect(() => {
    if (!isOpen || !ot) { setSavedDocs([]); return; }
    let cancelled = false;
    api.documentos.list({ orden_trabajo_id: ot.id })
      .then((rows) => Promise.all(rows.map(async (d) => ({ doc: d, url: await api.documentos.url(d.storage_path) }))))
      .then((withUrls) => { if (!cancelled) setSavedDocs(withUrls); })
      .catch(() => { if (!cancelled) setSavedDocs([]); });
    return () => { cancelled = true; };
  }, [isOpen, ot]);

  const edificioOptions = useMemo(() => edificios.filter((e) => e.status === 'Activo').map((e) => ({ label: e.nombre, value: String(e.id) })), [edificios]);
  const unidadOptions = useMemo(
    () => unidades.filter((u) => String(u.edificio_id ?? '') === edificioId && u.status === 'Alta').map((u) => ({ label: `${u.torre ?? ''} - ${u.depto ?? u.id_client ?? u.id}`, value: String(u.id) })),
    [unidades, edificioId],
  );

  const isValid = fechaInicio && edificioId && unidadId && prioridad && tipoTrabajo && tipoTarea && diasEstimado && personasRequeridas && detalle.trim();

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const next = Array.from(files).map((file) => ({ id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, url: URL.createObjectURL(file) }));
    setFotos((prev) => [...prev, ...next]);
  };
  const removeFoto = (id: string) => setFotos((prev) => {
    const found = prev.find((f) => f.id === id);
    if (found) URL.revokeObjectURL(found.url);
    return prev.filter((f) => f.id !== id);
  });

  const handleSave = async () => {
    if (!isValid || !user) return;
    setSaving(true);
    setError('');
    try {
      const unidad = unidades.find((u) => u.id === Number(unidadId));
      const payload = {
        status: ot?.status ?? ('Asignada' as const),
        tipo: ot?.tipo ?? ('ORDEN DE TRABAJO' as const),
        prioridad: prioridad as OrdenTrabajo['prioridad'],
        tipo_trabajo: tipoTrabajo,
        tipo_tarea: tipoTarea,
        tipo_prioridad: tipoPrioridad || null,
        unidad_id: unidad?.id ?? null,
        torre: unidad?.torre ?? null,
        departamento: unidad?.depto ?? null,
        concat_activo: unidad ? `${unidad.torre ?? ''} - ${unidad.depto ?? ''}` : null,
        tecnico_id: ot?.tecnico_id ?? null,
        // PA create stamps Asignador_OT + FechaAsignada_IN (status is 'Asignada' from the start); edit keeps them.
        asignador_id: ot ? ot.asignador_id : user.id,
        user_carga_id: ot?.user_carga_id ?? user.id,
        fecha_inicio: fechaInicio,
        fecha_cierre: ot?.fecha_cierre ?? null,
        // Agendado a futuro: si la fecha elegida es posterior a hoy, se estampa en fecha_asignada y la OT
        // queda oculta para el técnico hasta ese día (utils/tecnico otAgendadaVisible). Caso normal → hoy.
        fecha_asignada: ot ? ot.fecha_asignada : (fechaInicio > todayISO() ? fechaInicio : todayISO()),
        dias_estimado: Number(diasEstimado),
        personas_requeridas: Number(personasRequeridas),
        detalle,
        observaciones: ot?.observaciones ?? null,
        obs_resuelto: ot?.obs_resuelto ?? null,
        obs_asignacion: ot?.obs_asignacion ?? null,
        obs_cierre: ot?.obs_cierre ?? null,
        orden_revision_id: ot?.orden_revision_id ?? null,
        problema: ot?.problema ?? null,
        desde: 'Desktop' as const,
        version_app: ot?.version_app ?? APP_VERSION,
        hora: ot?.hora ?? null,
        id_univoco: ot?.id_univoco ?? '',
      };
      const saved = ot ? await api.ots.actualizar(ot.id, payload) : await api.ots.crear(payload);
      showToast(ot ? 'Orden de trabajo actualizada.' : 'Orden de trabajo creada.', 'success');
      // Persist staged photos to Storage (only on create). Best-effort: a failed upload never undoes the OT.
      if (!ot && fotos.length) {
        const results = await Promise.allSettled(
          fotos.map((f) => api.documentos.crear({ file: f.file, nombre: f.file.name, carpeta: 'Ordenes', orden_trabajo_id: saved.id })),
        );
        const failed = results.filter((r) => r.status === 'rejected').length;
        if (failed) showToast(`${failed} foto(s) no se pudieron subir.`, 'error');
      }
      onSaved(saved);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo guardar la orden de trabajo.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;
  const title = readOnly ? 'Detalle de la Orden de Trabajo' : ot ? 'Editar Solicitud' : 'Nueva Solicitud';

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 h-[100dvh] ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-4xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90dvh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            {ot && <p className="text-xs text-muted-foreground">OT <span className="font-medium text-foreground">#{ot.id}</span></p>}
          </div>
          <button onClick={saving ? undefined : onClose} className="p-2 hover:bg-secondary rounded-full transition-colors" title="Cerrar" aria-label="Cerrar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha Incidente *</label>
              <DatePicker value={fechaInicio} onChange={setFechaInicio} disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Torre *</label>
              <Select value={edificioId} onChange={(v) => { setEdificioId(v); setUnidadId(''); }} options={edificioOptions} placeholder="Seleccionar…" disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Departamento *</label>
              <Select value={unidadId} onChange={setUnidadId} options={unidadOptions} placeholder={edificioId ? 'Seleccionar…' : 'Elegí una torre primero'} disabled={readOnly || !edificioId} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Prioridad</label>
              <Select value={prioridad} onChange={setPrioridad} options={PRIORIDAD_OPTIONS} disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Requiere parada de equipo</label>
              <Select value={tipoPrioridad} onChange={setTipoPrioridad} options={OCUPACION_OPTIONS} placeholder="Seleccionar…" disabled={readOnly} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de trabajo *</label>
              <Select value={tipoTrabajo} onChange={setTipoTrabajo} options={TIPO_TRABAJO_OPTIONS} placeholder="Seleccionar…" disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo de tarea *</label>
              <Select value={tipoTarea} onChange={setTipoTarea} options={TIPO_TAREA_OPTIONS} placeholder="Seleccionar…" disabled={readOnly} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Días estimados *</label>
              <NumberInput min={0} value={diasEstimado} onChange={(e) => setDiasEstimado(e.target.value)} disabled={readOnly} placeholder="Ej: 3" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Personas necesarias *</label>
              <NumberInput min={0} value={personasRequeridas} onChange={(e) => setPersonasRequeridas(e.target.value)} disabled={readOnly} placeholder="Ej: 2" />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Detalle *</label>
            <textarea rows={3} maxLength={1000} value={detalle} onChange={(e) => setDetalle(e.target.value)} disabled={readOnly}
              placeholder="Describí el problema o la tarea…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none disabled:opacity-50" />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> {readOnly ? 'Archivos adjuntos' : 'Adjuntar archivos'}</label>
            {/* Adjuntos ya subidos (galería read-only, siempre visible). Bucket privado → signed URL. */}
            {savedDocs.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-2">
                {savedDocs.map(({ doc, url }) =>
                  (doc.content_type ?? '').startsWith('image/') ? (
                    <a key={doc.id} href={url} target="_blank" rel="noopener noreferrer" className="block active:scale-95 transition-transform">
                      <img src={url} alt={doc.nombre} loading="lazy" className="h-16 w-16 rounded-md object-cover border" />
                    </a>
                  ) : (
                    <a key={doc.id} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted/40 transition-colors">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate max-w-[10rem]">{doc.nombre}</span>
                    </a>
                  ),
                )}
              </div>
            ) : readOnly ? (
              <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>
            ) : null}
            {!readOnly && (
              <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
                className="flex flex-col items-center justify-center gap-1.5 h-24 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
                <input type="file" accept="image/*" multiple onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }} className="hidden" />
                <Upload className="w-5 h-5 text-muted-foreground/50" />
                <span className="text-xs text-muted-foreground">Arrastrá o hacé click</span>
              </label>
            )}
            {fotos.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {fotos.map((f) => (
                  <div key={f.id} className="relative">
                    <img src={f.url} alt={f.file.name} className="h-16 w-16 rounded-md object-cover border" />
                    {!readOnly && (
                      <button type="button" onClick={() => removeFoto(f.id)} title={`Quitar ${f.file.name}`} aria-label={`Quitar ${f.file.name}`}
                        className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">{readOnly ? 'Cerrar' : 'Cancelar'}</Button>
          {!readOnly && (
            <Button onClick={handleSave} disabled={!isValid || saving} className="min-w-[140px] w-full sm:w-auto gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} {ot ? 'Guardar' : 'Agregar'}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default NuevaEditarOTModal;
