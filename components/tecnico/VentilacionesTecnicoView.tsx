// mobile/Screen_Ventilaciones — technician's ventilation/duct-cleaning jobs.
// docs/analysis/mobile_Screen_Ventilaciones.md react_mapping.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, Calendar, Camera, Check, FastForward, Loader2, Plus, Search, Trash2, Fan } from 'lucide-react';
import { Button, Input } from '../ui/UIComponents';
import { DatePicker } from '../ui/DatePicker';
import { Select } from '../ui/Select';
import { EstadoVentilacionCell } from '../ventilaciones/EstadoVentilacionCell';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext';
import { useBuilding } from '../../contexts/BuildingContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Unidad, Ventilacion } from '../../services/types.ts';
import { formatDate, todayISO } from '../../utils/dates';
import { BottomSheet, edificioOptions, fileToCompressedDataUrl, torresEnZona, zonaKey } from './shared';
import BuildingChip from './BuildingChip';

type ActiveSheet = 'programar' | 'finalizar' | 'adelantar' | 'agregar' | null;

const VentilacionesTecnicoView: React.FC = () => {
  const { user } = useAuth();
  const { edificios, selected, openPicker } = useBuilding();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');

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

  const [unidadesEdificio, setUnidadesEdificio] = useState<Unidad[]>([]);
  const [agregarUnidadId, setAgregarUnidadId] = useState('');
  const [agregarFecha, setAgregarFecha] = useState(todayISO());
  const [savingAgregar, setSavingAgregar] = useState(false);

  // Bug #9 fix: this used to be "mine across every building" (never read the selected edificio),
  // so it silently pulled in every zona. Now always driven by the global selected building —
  // re-queries the WHOLE zona: every technician's Asignada/Programada + unassigned Pendiente,
  // not just this tech's own jobs (PA bt_AceptarSelectTorre_VE drops the IDAsignado filter).
  const loadZona = useCallback(async (zona: string, silent = false) => {
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const rows = await api.ventilaciones.list();
      const towers = torresEnZona(edificios, zona);
      setVentilaciones(rows.filter((v) => towers.includes(v.edificio ?? '') && (v.estado === 'Pendiente' || v.estado === 'Asignada' || v.estado === 'Programada')));
    } catch {
      if (!silent) { showToast('No se pudieron cargar las ventilaciones de la zona.', 'error'); setLoadError(true); }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [edificios, showToast]);

  useEffect(() => {
    if (!selected) return;
    void loadZona(zonaKey(selected));
  }, [selected, loadZona]);

  // Realtime: silent refetch of the current zona on ventilacion changes.
  useEffect(() => api.realtime.subscribe(['ventilaciones'], () => {
    if (selected) void loadZona(zonaKey(selected), true);
  }), [selected, loadZona]);

  const zonaOptions = useMemo(() => edificioOptions(edificios, zonaKey), [edificios]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return ventilaciones;
    return ventilaciones.filter((v) => `${v.edificio ?? ''} ${v.habitacion ?? ''}`.toLowerCase().includes(q));
  }, [ventilaciones, search]);
  const adelantarVentOptions = useMemo(() => {
    if (!adelantarZona) return [];
    const towers = torresEnZona(edificios, adelantarZona);
    return pendientes.filter((v) => towers.includes(v.edificio ?? '')).map((v) => ({ value: String(v.id), label: `${v.edificio} - ${v.habitacion ?? ''}` }));
  }, [pendientes, adelantarZona, edificios]);
  const agregarUnidadOptions = useMemo(
    () => unidadesEdificio.map((u) => ({ value: String(u.id), label: [u.depto, u.tipo_depto].filter(Boolean).join(' · ') || `Unidad #${u.id}` })),
    [unidadesEdificio],
  );

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
      if (selected) await loadZona(zonaKey(selected));
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
      if (selected) await loadZona(zonaKey(selected));
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

  // FEATURE #10 — técnicos no tenían forma de agregar una ventilación (la PA sí la tiene).
  const openAgregar = async () => {
    if (!selected) return;
    setAgregarUnidadId(''); setAgregarFecha(todayISO());
    setActiveSheet('agregar');
    try {
      const rows = await api.unidades.list();
      // ponytail: mismo filtro que CrearVentilacionModal (ABM desktop) — evita programar un segundo
      // ciclo Pendiente para una unidad que ya está bajo control de ventilación.
      setUnidadesEdificio(rows.filter((u) => u.edificio_id === selected.id && u.status === 'Alta' && !u.requiere_ventilacion));
    } catch {
      showToast('No se pudieron cargar las unidades del edificio.', 'error');
    }
  };

  const handleAgregar = async () => {
    if (!selected || !agregarUnidadId || !agregarFecha) return;
    const unidad = unidadesEdificio.find((u) => String(u.id) === agregarUnidadId);
    if (!unidad) return;
    setSavingAgregar(true);
    try {
      await api.ventilaciones.crear({
        estado: 'Pendiente',
        unidad_id: unidad.id,
        direccion_edificio: null,
        edificio: selected.nombre,
        habitacion: unidad.depto,
        // ponytail: form mínimo, sin selector de frecuencia — si queda en null, finalizar() y el
        // ABM desktop ya asumen 90 días por defecto (o la frecuencia ya configurada en la unidad).
        frecuencia_dias: null,
        fecha_ultima: null, // PA deja FechaUltima_VE vacío en una ventilación nueva ("Primera Vez")
        proxima_limpieza: agregarFecha,
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
      showToast('Ventilación agregada.', 'success');
      setActiveSheet(null);
      await loadZona(zonaKey(selected));
    } catch {
      showToast('No se pudo agregar la ventilación.', 'error');
    } finally {
      setSavingAgregar(false);
    }
  };

  const handleStageFinalizarFoto = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await fileToCompressedDataUrl(file);
    if (dataUrl) setFinalizarFoto(dataUrl);
  };

  const today = todayISO();

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" title="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors md:hidden">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Ventilaciones</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <BuildingChip />
          <button onClick={openAgregar} aria-label="Agregar ventilación" title="Agregar ventilación" disabled={!selected} className="p-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors disabled:opacity-40 disabled:pointer-events-none">
            <Plus className="h-5 w-5" />
          </button>
          <button onClick={openAdelantar} aria-label="Adelantar ventilación" title="Adelantar ventilación" className="p-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <FastForward className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input placeholder="Buscar departamento…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-10" />
      </div>

      {!selected ? (
        <div className="space-y-3">
          <EmptyState icon={Building2} title="Elegí un edificio" message="Seleccioná un edificio para ver sus ventilaciones." />
          <Button className="w-full" onClick={openPicker}>Elegí un edificio</Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={() => loadZona(zonaKey(selected))} />
      ) : visible.length === 0 ? (
        search.trim() ? (
          <EmptyState icon={Search} title="Sin resultados" message={`No hay departamentos que coincidan con "${search.trim()}".`} />
        ) : (
          <EmptyState icon={Fan} title="Sin ventilaciones asignadas" message="No tenés tareas de ventilación pendientes en este edificio." />
        )
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((v) => {
            const nextDate = v.estado === 'Programada' ? v.fecha_programada : v.proxima_limpieza;
            const canFinalizar = v.estado === 'Programada' && !!v.fecha_programada && v.fecha_programada <= today;
            return (
              <div key={v.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <EstadoVentilacionCell v={v} />
                  <div className="flex items-center gap-1.5">
                    <button aria-label="Programar" title="Programar" onClick={() => openProgramar(v)} className="h-8 w-8 rounded-md bg-primary text-primary-foreground flex items-center justify-center">
                      <Calendar className="h-4 w-4" />
                    </button>
                    {canFinalizar && (
                      <button aria-label="Finalizar" title="Finalizar" onClick={() => openFinalizar(v)} className="h-8 w-8 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
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
          <DatePicker value={programarFecha} onChange={setProgramarFecha} className="h-10" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio</label>
            <Select value={adelantarZona} onChange={(v) => { setAdelantarZona(v); setAdelantarVentId(''); }} options={zonaOptions} placeholder="Seleccioná un edificio" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Ventilación pendiente</label>
            <Select value={adelantarVentId} onChange={setAdelantarVentId} options={adelantarVentOptions} placeholder="Seleccioná una ventilación" disabled={!adelantarZona} />
          </div>
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

      {/* Agregar ventilación */}
      <BottomSheet
        isOpen={activeSheet === 'agregar'}
        onClose={() => setActiveSheet(null)}
        locked={savingAgregar}
        title="Agregar ventilación"
        subtitle={selected?.nombre}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingAgregar}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={!agregarUnidadId || !agregarFecha || savingAgregar} onClick={handleAgregar}>
              {savingAgregar && <Loader2 className="h-4 w-4 animate-spin" />}Aceptar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Unidad</label>
          <Select value={agregarUnidadId} onChange={setAgregarUnidadId} options={agregarUnidadOptions} placeholder="Seleccioná una unidad" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha</label>
          <DatePicker value={agregarFecha} onChange={setAgregarFecha} className="h-10" />
        </div>
      </BottomSheet>
    </div>
  );
};

export default VentilacionesTecnicoView;
