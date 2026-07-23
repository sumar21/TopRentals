// Modals for VentilacionesView. See docs/analysis/desktop_Screen_Ventilaciones.md
// "modals" + "react_mapping" — the 6 legacy full-screen popups collapse into the
// kit's one Modal recipe (DESIGN.md §4.1).
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, Loader2, AlertCircle, FileImage } from 'lucide-react';
import { Button, useModalAnimation } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { backdropClose } from '../ui/backdropClose';
import { api } from '../../services/index.ts';
import type { Edificio, Frecuencia, Unidad, Usuario, Ventilacion } from '../../services/types.ts';
import { addDays, formatDate, todayISO } from '../../utils/dates.ts';

// ─────────────────────────────────────────────────────────────────────────
// Crear Ventilación — edificio -> habitación (cascada) -> frecuencia -> fecha inicio
// ─────────────────────────────────────────────────────────────────────────
interface CrearVentilacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
  edificios: Edificio[];
  unidades: Unidad[];
  frecuencias: Frecuencia[];
}

export const CrearVentilacionModal: React.FC<CrearVentilacionModalProps> = ({ isOpen, onClose, onCreated, edificios, unidades, frecuencias }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [edificioId, setEdificioId] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [frecuenciaId, setFrecuenciaId] = useState('');
  const [fechaInicio, setFechaInicio] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Default de frecuencia = 90 días (paridad con PA: DefaultSelectedItems: =["90"]).
      const f90 = frecuencias.find((f) => f.dias === 90);
      setEdificioId(''); setUnidadId(''); setFrecuenciaId(f90 ? String(f90.id) : ''); setFechaInicio(todayISO()); setError(null);
    }
  }, [isOpen, frecuencias]);

  if (!visible) return null;

  const edificioOptions = edificios.filter((e) => e.status === 'Activo').map((e) => ({ value: String(e.id), label: e.nombre }));
  const unidadOptions = unidades
    .filter((u) => u.status === 'Alta' && !u.requiere_ventilacion && String(u.edificio_id) === edificioId)
    .map((u) => ({ value: String(u.id), label: [u.depto, u.tipo_depto].filter(Boolean).join(' · ') || `Unidad #${u.id}` }));
  const frecuenciaOptions = frecuencias.filter((f) => f.status === 'Activo').map((f) => ({ value: String(f.id), label: `${f.dias} días` }));

  const canSave = !!edificioId && !!unidadId && !!frecuenciaId && !!fechaInicio;

  const handleSave = async () => {
    const edificio = edificios.find((e) => String(e.id) === edificioId);
    const unidad = unidades.find((u) => String(u.id) === unidadId);
    const frecuencia = frecuencias.find((f) => String(f.id) === frecuenciaId);
    if (!edificio || !unidad || !frecuencia) return;
    setSaving(true);
    setError(null);
    try {
      await api.ventilaciones.crear({
        // ORIGINAL BUG (docs/analysis/desktop_Screen_Ventilaciones.md data_writes): la PA original
        // seteaba Estado_VE:"Asignada" al crear, sin técnico ni fecha asignados. Se corrige a
        // 'Pendiente' (consistente con el ciclo que crea ventilaciones.finalizar()).
        estado: 'Pendiente',
        unidad_id: unidad.id,
        direccion_edificio: null,
        edificio: edificio.nombre,
        habitacion: unidad.depto,
        frecuencia_dias: frecuencia.dias,
        fecha_ultima: fechaInicio,
        proxima_limpieza: addDays(fechaInicio, frecuencia.dias),
        fecha_programada: null,
        obs_adelanto: null,
        obs_resuelto: null,
        asignado_id: null,
        fecha_asignado: null,
        version_asignado: null,
        fecha_finalizacion: null,
        version_resuelto: null,
        es_incidente: false,
        orden: 4,
      });
      onCreated();
      onClose();
    } catch {
      setError('No se pudo crear la ventilación. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Nueva ventilación</h2>
            <p className="text-xs text-muted-foreground">Programar limpieza recurrente de una unidad</p>
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio<span className="text-destructive ml-0.5">*</span></label>
              <Select value={edificioId} onChange={(v) => { setEdificioId(v); setUnidadId(''); }} options={edificioOptions} placeholder="Elegí un edificio" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Habitación<span className="text-destructive ml-0.5">*</span></label>
              <Select value={unidadId} onChange={setUnidadId} options={unidadOptions} placeholder={edificioId ? 'Elegí una habitación' : 'Elegí un edificio primero'} disabled={!edificioId} />
              {edificioId && unidadOptions.length === 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">Todas las unidades de este edificio ya tienen ventilación asignada.</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Frecuencia<span className="text-destructive ml-0.5">*</span></label>
              <Select value={frecuenciaId} onChange={setFrecuenciaId} options={frecuenciaOptions} placeholder="Elegí una frecuencia" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha de inicio<span className="text-destructive ml-0.5">*</span></label>
              <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="min-w-[140px] w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Asignar Ventilación — BUILD COMPLETE pero sin punto de entrada visible:
// el ícono de fila que la abre solo se renderiza si FEATURES.asignarVentilacionDesktop
// (hoy false), igual que en la Power App original (img_asignar_GVE con Visible
// hardcodeado a false). Ver VentilacionesView.tsx.
// ─────────────────────────────────────────────────────────────────────────
interface AsignarVentilacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  ventilacion: Ventilacion;
  tecnicos: Usuario[];
  frecuencias: Frecuencia[];
}

export const AsignarVentilacionModal: React.FC<AsignarVentilacionModalProps> = ({ isOpen, onClose, onSaved, ventilacion, tecnicos, frecuencias }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const defaultTecnico = tecnicos.find((t) => t.edificio_default === ventilacion.edificio)?.id;
  const [fecha, setFecha] = useState(ventilacion.proxima_limpieza ?? todayISO());
  const [tecnicoId, setTecnicoId] = useState(defaultTecnico ? String(defaultTecnico) : '');
  const [frecuenciaId, setFrecuenciaId] = useState(() => {
    const match = frecuencias.find((f) => f.dias === ventilacion.frecuencia_dias);
    return match ? String(match.id) : '';
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setFecha(ventilacion.proxima_limpieza ?? todayISO());
      setTecnicoId(defaultTecnico ? String(defaultTecnico) : '');
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, ventilacion.id]);

  if (!visible) return null;

  const tecnicoOptions = tecnicos.map((t) => ({ value: String(t.id), label: t.concat_name }));
  const frecuenciaOptions = frecuencias.filter((f) => f.status === 'Activo').map((f) => ({ value: String(f.id), label: `${f.dias} días` }));
  const canSave = !!tecnicoId && !!fecha && fecha >= todayISO();

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const frecuencia = frecuencias.find((f) => String(f.id) === frecuenciaId);
      await api.ventilaciones.asignar({
        id: ventilacion.id,
        tecnico_id: Number(tecnicoId),
        proxima_limpieza: fecha,
        ...(ventilacion.es_incidente && frecuencia ? { frecuencia_dias: frecuencia.dias } : {}),
      });
      onSaved();
      onClose();
    } catch {
      setError('No se pudo asignar la ventilación. Intentá de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Asignar ventilación</h2>
            <p className="text-xs text-muted-foreground">{ventilacion.edificio} · {ventilacion.habitacion}</p>
          </div>
          <button onClick={saving ? undefined : onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Próxima limpieza<span className="text-destructive ml-0.5">*</span></label>
              <input type="date" value={fecha} min={todayISO()} onChange={(e) => setFecha(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Técnico<span className="text-destructive ml-0.5">*</span></label>
              <Select value={tecnicoId} onChange={setTecnicoId} options={tecnicoOptions} placeholder="Elegí un técnico" />
            </div>
          </div>
          {ventilacion.es_incidente && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Frecuencia</label>
              <Select value={frecuenciaId} onChange={setFrecuenciaId} options={frecuenciaOptions} placeholder="Elegí una frecuencia" />
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={!canSave || saving} className="min-w-[140px] w-full sm:w-auto">
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />} Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─────────────────────────────────────────────────────────────────────────
// Ver detalle (Realizada) — read-only. En la PA original el control que la abría
// tenía su OnSelect completamente comentado (dead). Se implementa LIVE acá: es de
// solo lectura y no tiene ningún costo/riesgo mostrarla (mejora deliberada, ver
// resumen de la tarea).
// ─────────────────────────────────────────────────────────────────────────
interface DetalleVentilacionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ventilacion: Ventilacion | null;
}

export const DetalleVentilacionModal: React.FC<DetalleVentilacionModalProps> = ({ isOpen, onClose, ventilacion }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [fotoNombre, setFotoNombre] = useState<string | null>(null);
  const [loadingFoto, setLoadingFoto] = useState(false);

  useEffect(() => {
    if (!isOpen || !ventilacion) return;
    let cancelled = false;
    setLoadingFoto(true);
    setFotoNombre(null);
    // documentos.list() no tiene filtro por ventilacion_id (services/api.ts solo
    // soporta orden_trabajo_id/compra_id) — se trae todo y se matchea por prefijo
    // de storage_path, que es como el mock adapter guarda la foto de finalizar().
    api.documentos.list({}).then((docs) => {
      if (cancelled) return;
      const match = docs.find((d) => d.storage_path.startsWith(`ventilaciones/${ventilacion.id}/`));
      setFotoNombre(match?.nombre ?? null);
    }).finally(() => { if (!cancelled) setLoadingFoto(false); });
    return () => { cancelled = true; };
  }, [isOpen, ventilacion]);

  if (!visible || !ventilacion) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(onClose)}>
      <div className={`${modalClass} bg-background w-full max-w-lg rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Detalle de la ventilación</h2>
            <p className="text-xs text-muted-foreground">{ventilacion.edificio} · {ventilacion.habitacion} — finalizada {formatDate(ventilacion.fecha_finalizacion) || '-'}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Observación del técnico</label>
            <p className="text-sm rounded-md border border-input bg-muted/20 p-3 min-h-[3rem]">{ventilacion.obs_resuelto || 'Sin observaciones.'}</p>
          </div>
          {loadingFoto ? (
            <div className="flex items-center justify-center py-4"><Loader size="sm" /></div>
          ) : fotoNombre ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground rounded-lg border border-input bg-muted/20 p-2.5">
              <FileImage className="h-4 w-4 shrink-0" /> <span className="truncate">{fotoNombre}</span>
            </div>
          ) : null}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">Cerrar</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
