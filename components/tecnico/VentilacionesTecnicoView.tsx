// mobile/Screen_Ventilaciones — technician's ventilation/duct-cleaning jobs.
// docs/analysis/mobile_Screen_Ventilaciones.md react_mapping.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Calendar, Camera, Check, FastForward, Loader2, Trash2, Fan } from 'lucide-react';
import { Button, Input } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Edificio, Ventilacion } from '../../services/types.ts';
import { formatDate, todayISO } from '../../utils/dates';
import { BottomSheet, edificioOptions, fileToCompressedDataUrl, torresEnZona, zonaKey } from './shared';

type ActiveSheet = 'programar' | 'finalizar' | 'adelantar' | 'cambiarTorre' | null;

const VentilacionesTecnicoView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [zonaFilter, setZonaFilter] = useState<string | null>(null);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [selectedVent, setSelectedVent] = useState<Ventilacion | null>(null);

  const [programarFecha, setProgramarFecha] = useState('');
  const [savingProgramar, setSavingProgramar] = useState(false);

  const [finalizarObs, setFinalizarObs] = useState('');
  const [finalizarFoto, setFinalizarFoto] = useState('');
  const [savingFinalizar, setSavingFinalizar] = useState(false);

  const [pendientes, setPendientes] = useState<Ventilacion[]>([]);
  const [adelantarZona, setAdelantarZona] = useState('');
  const [adelantarVentId, setAdelantarVentId] = useState('');
  const [adelantarObs, setAdelantarObs] = useState('');
  const [savingAdelantar, setSavingAdelantar] = useState(false);

  const [torrePickerValue, setTorrePickerValue] = useState('');

  const loadVentilaciones = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(false);
    try {
      const rows = await api.ventilaciones.list();
      setVentilaciones(rows.filter((v) => v.asignado_id === user.id && (v.estado === 'Asignada' || v.estado === 'Programada')));
    } catch {
      showToast('No se pudieron cargar las ventilaciones.', 'error');
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    api.edificios.list().then(setEdificios).catch(() => {});
    loadVentilaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const zonaOptions = useMemo(() => edificioOptions(edificios.filter((e) => e.status === 'Activo'), zonaKey), [edificios]);
  const visible = useMemo(() => {
    if (!zonaFilter) return ventilaciones;
    const towers = torresEnZona(edificios, zonaFilter);
    return ventilaciones.filter((v) => towers.includes(v.edificio ?? ''));
  }, [ventilaciones, zonaFilter, edificios]);
  const adelantarVentOptions = useMemo(() => {
    if (!adelantarZona) return [];
    const towers = torresEnZona(edificios, adelantarZona);
    return pendientes.filter((v) => towers.includes(v.edificio ?? '')).map((v) => ({ value: String(v.id), label: `${v.edificio} - ${v.habitacion ?? ''}` }));
  }, [pendientes, adelantarZona, edificios]);

  const openProgramar = (v: Ventilacion) => { setSelectedVent(v); setProgramarFecha(v.fecha_programada ?? v.proxima_limpieza ?? todayISO()); setActiveSheet('programar'); };
  const openFinalizar = (v: Ventilacion) => { setSelectedVent(v); setFinalizarObs(''); setFinalizarFoto(''); setActiveSheet('finalizar'); };
  const openAdelantar = async () => {
    setAdelantarZona(''); setAdelantarVentId(''); setAdelantarObs('');
    setActiveSheet('adelantar');
    try {
      const rows = await api.ventilaciones.list();
      setPendientes(rows.filter((v) => v.estado === 'Pendiente'));
    } catch {
      showToast('No se pudieron cargar las ventilaciones pendientes.', 'error');
    }
  };

  const handleProgramar = async () => {
    if (!selectedVent || !programarFecha) return;
    setSavingProgramar(true);
    try {
      await api.ventilaciones.programar(selectedVent.id, programarFecha);
      showToast('Ventilación programada.', 'success');
      setActiveSheet(null);
      await loadVentilaciones();
    } catch {
      showToast('No se pudo programar la ventilación.', 'error');
    } finally {
      setSavingProgramar(false);
    }
  };

  const handleFinalizar = async () => {
    if (!selectedVent || !user) return;
    setSavingFinalizar(true);
    try {
      const { siguiente } = await api.ventilaciones.finalizar({
        id: selectedVent.id,
        obs_resuelto: finalizarObs.trim(),
        usuario_id: user.id,
        foto_path: finalizarFoto || undefined,
      });
      showToast(`Ventilación realizada. Próximo ciclo: ${formatDate(siguiente.proxima_limpieza)}`, 'success');
      setActiveSheet(null);
      await loadVentilaciones();
    } catch {
      showToast('No se pudo finalizar la ventilación.', 'error');
    } finally {
      setSavingFinalizar(false);
    }
  };

  const handleAdelantar = async () => {
    if (!adelantarVentId) return;
    setSavingAdelantar(true);
    try {
      await api.ventilaciones.adelantar({ id: Number(adelantarVentId), obs_adelanto: adelantarObs.trim() });
      showToast('Ventilación adelantada.', 'success');
      setActiveSheet(null);
    } catch {
      showToast('No se pudo adelantar la ventilación.', 'error');
    } finally {
      setSavingAdelantar(false);
    }
  };

  const handleCambiarTorre = () => {
    const ed = edificios.find((e) => String(e.id) === torrePickerValue);
    if (!ed) return;
    setZonaFilter(zonaKey(ed));
    setTorrePickerValue('');
    setActiveSheet(null);
  };

  const handleStageFinalizarFoto = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await fileToCompressedDataUrl(file);
    if (dataUrl) setFinalizarFoto(dataUrl);
  };

  const today = todayISO();

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Ventilaciones</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={openAdelantar} aria-label="Adelantar ventilación" className="p-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <FastForward className="h-5 w-5" />
          </button>
          <button onClick={() => setActiveSheet('cambiarTorre')} aria-label="Cambiar torre" className="p-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeftRight className="h-5 w-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={loadVentilaciones} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Fan} title="Sin ventilaciones asignadas" message="No tenés tareas de ventilación pendientes en este edificio." />
      ) : (
        <div className="space-y-2">
          {visible.map((v) => {
            const nextDate = v.estado === 'Programada' ? v.fecha_programada : v.proxima_limpieza;
            const canFinalizar = v.estado === 'Programada' && !!v.fecha_programada && v.fecha_programada <= today;
            return (
              <div key={v.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge status={v.estado} />
                  <div className="flex items-center gap-1.5">
                    <button aria-label="Programar" onClick={() => openProgramar(v)} className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                      <Calendar className="h-4 w-4" />
                    </button>
                    {canFinalizar && (
                      <button aria-label="Finalizar" onClick={() => openFinalizar(v)} className="h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 flex items-center justify-center">
                        <Check className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
                <p className="text-base font-bold uppercase text-foreground truncate">{v.edificio}</p>
                <p className="text-sm text-muted-foreground">{v.habitacion}</p>
                <p className="text-sm font-semibold text-brand">
                  {v.estado === 'Programada' ? 'Programada' : 'Próxima'}: {formatDate(nextDate) || 'Sin fecha'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Programar */}
      <BottomSheet
        isOpen={activeSheet === 'programar'}
        onClose={() => setActiveSheet(null)}
        locked={savingProgramar}
        title="Programar ventilación"
        subtitle={selectedVent?.edificio ?? undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingProgramar}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={!programarFecha || savingProgramar} onClick={handleProgramar}>
              {savingProgramar && <Loader2 className="h-4 w-4 animate-spin" />}Aceptar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha</label>
          <Input type="date" value={programarFecha} onChange={(e) => setProgramarFecha(e.target.value)} className="h-10" />
        </div>
      </BottomSheet>

      {/* Finalizar */}
      <BottomSheet
        isOpen={activeSheet === 'finalizar'}
        onClose={() => setActiveSheet(null)}
        locked={savingFinalizar}
        title="Finalizar ventilación"
        subtitle={selectedVent?.edificio ?? undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingFinalizar}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={savingFinalizar} onClick={handleFinalizar}>
              {savingFinalizar && <Loader2 className="h-4 w-4 animate-spin" />}Aceptar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Observaciones</label>
          <textarea
            value={finalizarObs}
            onChange={(e) => setFinalizarObs(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Notas sobre la limpieza…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Foto</label>
          {finalizarFoto ? (
            <div className="relative inline-block">
              <img src={finalizarFoto} className="h-20 w-20 rounded-md object-cover border" alt="Foto de la ventilación" />
              <button aria-label="Quitar foto" onClick={() => setFinalizarFoto('')} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <label className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void handleStageFinalizarFoto(e.target.files?.[0]); e.target.value = ''; }} />
              <Camera className="w-5 h-5 text-muted-foreground/50" />
              <span className="text-xs text-muted-foreground">Tocá para sacar una foto</span>
            </label>
          )}
        </div>
      </BottomSheet>

      {/* Adelantar (incidente) */}
      <BottomSheet
        isOpen={activeSheet === 'adelantar'}
        onClose={() => setActiveSheet(null)}
        locked={savingAdelantar}
        title="Adelantar ventilación"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingAdelantar}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={!adelantarVentId || savingAdelantar} onClick={handleAdelantar}>
              {savingAdelantar && <Loader2 className="h-4 w-4 animate-spin" />}Aceptar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio</label>
          <Select value={adelantarZona} onChange={(v) => { setAdelantarZona(v); setAdelantarVentId(''); }} options={zonaOptions} placeholder="Seleccioná un edificio" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Ventilación pendiente</label>
          <Select value={adelantarVentId} onChange={setAdelantarVentId} options={adelantarVentOptions} placeholder="Seleccioná una ventilación" disabled={!adelantarZona} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Observaciones</label>
          <textarea
            value={adelantarObs}
            onChange={(e) => setAdelantarObs(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Motivo del adelanto…"
          />
        </div>
      </BottomSheet>

      {/* Cambiar torre */}
      <BottomSheet
        isOpen={activeSheet === 'cambiarTorre'}
        onClose={() => setActiveSheet(null)}
        title="Cambiar torre"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)}>Cancelar</Button>
            <Button className="flex-1" disabled={!torrePickerValue} onClick={handleCambiarTorre}>Aceptar</Button>
          </>
        }
      >
        <Select value={torrePickerValue} onChange={setTorrePickerValue} options={zonaOptions} placeholder="Seleccioná un edificio" />
      </BottomSheet>
    </div>
  );
};

export default VentilacionesTecnicoView;
