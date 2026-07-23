// mobile/Ordenes de Trabajo — technician's OT list for a building/zone.
// docs/analysis/mobile_Ordenes_de_Trabajo.md react_mapping.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, MoreVertical, CheckCircle2, ClipboardList, Plus, Camera, Trash2, Loader2, AlertCircle,
} from 'lucide-react';
import { Button, Input, Badge, cn } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import ConfirmModal from '../ConfirmModal';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Articulo, Edificio, OrdenTrabajo, RepuestoOT, Unidad } from '../../services/types.ts';
import type { StockRowWithEdificios } from '../../services/api.ts';
import { resolveRecipients, sendEmail } from '../../emails/send.ts';
import { otResueltaEmail } from '../../emails/templates.ts';
import { formatDate, todayISO } from '../../utils/dates';
import { BottomSheet, edificioOptions, fileToCompressedDataUrl, torresEnZona, zonaKey } from './shared';

type ActiveSheet = 'detalle' | 'repuestos' | 'nuevaSolicitud' | 'agregarRepuesto' | 'cambiarEdificio' | null;
interface NavState { zona?: string; edificioNombre?: string }
interface StagedPhoto { id: string; dataUrl: string }

// EstadoOT has no 'Programada' literal (unlike EstadoVentilacion) — the original PA spec
// mentions it, but the real data model only tracks Pendiente/Asignada as open OT states.
const OT_STATUSES: OrdenTrabajo['status'][] = ['Pendiente', 'Asignada'];

const DetailRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex items-center justify-between gap-3">
    <dt className="text-xs text-muted-foreground uppercase tracking-wide shrink-0">{label}</dt>
    <dd className="text-sm text-right">{value}</dd>
  </div>
);

const OrdenesTecnicoView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? {}) as NavState;

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [unidades, setUnidades] = useState<Unidad[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [stockAll, setStockAll] = useState<StockRowWithEdificios[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [loading, setLoading] = useState(true);
  const [zona, setZona] = useState<string | null>(navState.zona ?? null);
  const [pickerValue, setPickerValue] = useState('');

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [selectedOt, setSelectedOt] = useState<OrdenTrabajo | null>(null);
  const [repuestosSel, setRepuestosSel] = useState<RepuestoOT[]>([]);
  const [confirmFinalizar, setConfirmFinalizar] = useState<OrdenTrabajo | null>(null);

  // Nueva solicitud form
  const [fecha, setFecha] = useState(todayISO());
  const [torreSel, setTorreSel] = useState('');
  const [deptoSel, setDeptoSel] = useState('');
  const [detalleText, setDetalleText] = useState('');
  const [staged, setStaged] = useState<StagedPhoto[]>([]);
  const [savingSolicitud, setSavingSolicitud] = useState(false);

  // Agregar repuesto
  const [repuestoSearch, setRepuestoSearch] = useState('');
  const [qtyMap, setQtyMap] = useState<Record<number, string>>({});
  const [assigningId, setAssigningId] = useState<number | null>(null);

  useEffect(() => {
    api.edificios.list().then(setEdificios).catch(() => showToast('No se pudieron cargar los edificios.', 'error'));
    api.unidades.list().then(setUnidades).catch(() => {});
    api.articulos.list().then(setArticulos).catch(() => {});
    api.stock.list().then(setStockAll).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadOts = useCallback(async (z: string) => {
    setLoading(true);
    try {
      const towers = torresEnZona(edificios, z);
      const rows = await api.ots.list();
      setOts(rows.filter((o) => towers.includes(o.torre ?? '') && OT_STATUSES.includes(o.status)));
    } catch {
      showToast('No se pudieron cargar las órdenes de trabajo.', 'error');
    } finally {
      setLoading(false);
    }
  }, [edificios, showToast]);

  useEffect(() => {
    if (!zona || edificios.length === 0) { setLoading(false); return; }
    loadOts(zona);
  }, [zona, edificios, loadOts]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const closeSheets = () => { setActiveSheet(null); setSelectedOt(null); };

  const towerOptions = useMemo(() => edificioOptions(edificios.filter((e) => e.status === 'Activo'), zonaKey), [edificios]);
  const solicitudTorreOptions = useMemo(
    () => (zona ? torresEnZona(edificios, zona).sort().map((t) => ({ value: t, label: t })) : []),
    [edificios, zona],
  );
  const solicitudDeptoOptions = useMemo(
    () => [...new Set(unidades.filter((u) => u.torre === torreSel).map((u) => u.depto).filter(Boolean))].map((d) => ({ value: d as string, label: d as string })),
    [unidades, torreSel],
  );
  const articulosMap = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const stockDelEdificio = useMemo(() => {
    if (!selectedOt) return [];
    const ed = edificios.find((e) => e.nombre === selectedOt.torre);
    if (!ed) return [];
    return stockAll.filter((s) => s.edificio_ids.includes(ed.id) && s.cantidad > 0);
  }, [selectedOt, edificios, stockAll]);
  const filteredStock = useMemo(() => {
    const q = repuestoSearch.trim().toLowerCase();
    if (!q) return stockDelEdificio;
    return stockDelEdificio.filter((s) => (articulosMap.get(s.articulo_id)?.nombre ?? '').toLowerCase().includes(q));
  }, [stockDelEdificio, repuestoSearch, articulosMap]);

  const openDetalle = (ot: OrdenTrabajo) => { setSelectedOt(ot); setActiveSheet('detalle'); };
  const openRepuestos = async (ot: OrdenTrabajo) => {
    setSelectedOt(ot);
    setActiveSheet('repuestos');
    try {
      setRepuestosSel(await api.ots.repuestos.list(ot.id));
    } catch {
      showToast('No se pudieron cargar los repuestos.', 'error');
    }
  };
  const openAgregarRepuesto = (ot: OrdenTrabajo) => {
    setSelectedOt(ot);
    setRepuestoSearch('');
    setQtyMap({});
    setActiveSheet('agregarRepuesto');
  };
  const openNuevaSolicitud = () => {
    setFecha(todayISO());
    setTorreSel('');
    setDeptoSel('');
    setDetalleText('');
    setStaged([]);
    setActiveSheet('nuevaSolicitud');
  };

  const handleTowerPick = () => {
    const ed = edificios.find((e) => String(e.id) === pickerValue);
    if (!ed) return;
    setZona(zonaKey(ed));
    setPickerValue('');
    setActiveSheet(null);
  };

  const handleFinalizar = async (ot: OrdenTrabajo) => {
    try {
      await api.ots.finalizar(ot.id);
      const repuestos = await api.ots.repuestos.list(ot.id);
      const emailRows = await api.emailsNotificacion.list();
      const recipients = resolveRecipients('OT', emailRows.map((r) => ({ modulo: r.modulo, emails: r.emails ?? '' })));
      const diasUtilizados = ot.fecha_asignada
        ? Math.max(0, Math.round((Date.now() - new Date(ot.fecha_asignada).getTime()) / 86400000))
        : 0;
      const email = otResueltaEmail({
        nroOT: ot.id,
        activo: ot.concat_activo ?? `${ot.torre ?? ''} - ${ot.departamento ?? ''}`,
        tipoTrabajo: ot.tipo_trabajo,
        tipoTarea: ot.tipo_tarea,
        diasEstimados: ot.dias_estimado,
        diasUtilizados,
        repuestos: repuestos.map((r) => ({ repuesto: r.repuesto ?? '', cantidad: r.cantidad })),
        tecnico: user?.concat_name ?? user?.nombre ?? '',
      });
      if (recipients.length) void sendEmail(recipients, email);
      showToast('Orden de trabajo completada.', 'success');
      if (zona) loadOts(zona);
    } catch {
      showToast('No se pudo completar la orden de trabajo.', 'error');
    }
  };

  const handleStagePhoto = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await fileToCompressedDataUrl(file);
    if (dataUrl) setStaged((prev) => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, dataUrl }]);
  };

  const handleCrearSolicitud = async () => {
    if (!user || !torreSel || !deptoSel || !detalleText.trim()) return;
    setSavingSolicitud(true);
    try {
      const unidad = unidades.find((u) => u.torre === torreSel && u.depto === deptoSel);
      await api.ots.crear({
        id_univoco: '', // overwritten by the adapter; the API requires the field on input regardless
        status: 'Asignada',
        tipo: 'SOLICITUD OT',
        prioridad: 'Media',
        tipo_trabajo: null,
        tipo_tarea: null,
        tipo_prioridad: null,
        unidad_id: unidad?.id ?? null,
        torre: torreSel,
        departamento: deptoSel,
        concat_activo: `${torreSel} - ${deptoSel}`,
        tecnico_id: user.id,
        asignador_id: null,
        user_carga_id: user.id,
        fecha_inicio: fecha,
        fecha_cierre: null,
        fecha_asignada: fecha,
        dias_estimado: null,
        personas_requeridas: null,
        detalle: detalleText.trim(),
        observaciones: null,
        obs_resuelto: null,
        obs_asignacion: null,
        obs_cierre: null,
        orden_revision_id: null,
        problema: null,
        desde: 'Mobile',
        version_app: null,
        hora: new Date().toTimeString().slice(0, 5),
      });
      // ponytail: staged photos are compressed + previewed client-side, but the DataApi
      // has no documentos.crear yet — nothing to attach them to. Upgrade path: add
      // documentos.crear(orden_trabajo_id, storage_path) and upload `staged` here.
      showToast('Solicitud creada correctamente.', 'success');
      setActiveSheet(null);
      if (zona) loadOts(zona);
    } catch {
      showToast('No se pudo crear la solicitud.', 'error');
    } finally {
      setSavingSolicitud(false);
    }
  };

  const handleAsignarRepuesto = async (row: StockRowWithEdificios) => {
    if (!selectedOt || !user) return;
    const qty = Number(qtyMap[row.id]);
    const ed = edificios.find((e) => e.nombre === selectedOt.torre);
    if (!ed || !qty || qty <= 0 || qty > row.cantidad) return;
    setAssigningId(row.id);
    try {
      await api.ots.repuestos.asignarRepuesto({ orden_trabajo_id: selectedOt.id, articulo_id: row.articulo_id, edificio_id: ed.id, cantidad: qty, usuario_id: user.id });
      showToast('Repuesto asignado.', 'success');
      setQtyMap((m) => ({ ...m, [row.id]: '' }));
      const [freshStock, freshRepuestos] = await Promise.all([api.stock.list(), api.ots.repuestos.list(selectedOt.id)]);
      setStockAll(freshStock);
      setRepuestosSel(freshRepuestos);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'No se pudo asignar el repuesto.', 'error');
    } finally {
      setAssigningId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Órdenes de Trabajo</h1>
        </div>
        {zona && (
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuOpen((o) => !o)} aria-label="Más opciones" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
              <MoreVertical className="h-5 w-5" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 z-[90] w-52 rounded-md border bg-popover shadow-md overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setMenuOpen(false); setActiveSheet('cambiarEdificio'); }}>Cambiar edificio</button>
                <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setMenuOpen(false); openNuevaSolicitud(); }}>Agregar solicitud</button>
                <button className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors" onClick={() => { setMenuOpen(false); if (zona) loadOts(zona); }}>Actualizar</button>
              </div>
            )}
          </div>
        )}
      </div>

      {!zona ? (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Elegí un edificio para ver sus órdenes de trabajo</p>
          <Select value={pickerValue} onChange={setPickerValue} options={towerOptions} placeholder="Seleccioná un edificio" />
          <Button className="w-full" disabled={!pickerValue} onClick={handleTowerPick}>Ver órdenes</Button>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : ots.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Sin órdenes de trabajo" message="No hay órdenes pendientes, asignadas o programadas en este edificio." />
      ) : (
        <div className="space-y-2">
          {ots.map((ot) => (
            <div key={ot.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-semibold">{ot.torre} - {ot.departamento}</p>
                <StatusBadge status={ot.prioridad} />
              </div>
              <p className="text-xs text-muted-foreground">{ot.tipo_trabajo ?? 'Sin tipo'} | {formatDate(ot.fecha_asignada) || 'Sin fecha'}</p>
              <div className="flex items-center gap-2 pt-1">
                <Button size="sm" className="flex-1" onClick={() => openDetalle(ot)}>Ver Detalle</Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={() => openAgregarRepuesto(ot)}>Repuestos</Button>
                <button
                  aria-label="Completar orden"
                  onClick={() => setConfirmFinalizar(ot)}
                  className="h-9 w-9 shrink-0 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center active:scale-95 transition-transform"
                >
                  <CheckCircle2 className="h-5 w-5" />
                </button>
              </div>
              <button className="text-xs text-muted-foreground underline underline-offset-2" onClick={() => openRepuestos(ot)}>Ver repuestos ya asignados</button>
            </div>
          ))}
        </div>
      )}

      {/* Cambiar edificio */}
      <BottomSheet
        isOpen={activeSheet === 'cambiarEdificio'}
        onClose={() => setActiveSheet(null)}
        title="Cambiar edificio"
        footer={<Button className="flex-1" disabled={!pickerValue} onClick={handleTowerPick}>Aceptar</Button>}
      >
        <Select value={pickerValue} onChange={setPickerValue} options={towerOptions} placeholder="Seleccioná un edificio" />
      </BottomSheet>

      {/* Ver detalle */}
      <BottomSheet isOpen={activeSheet === 'detalle'} onClose={closeSheets} title="Detalle de la orden" subtitle={selectedOt?.concat_activo ?? undefined}>
        {selectedOt && (
          <dl className="space-y-3">
            <DetailRow label="Torre" value={selectedOt.torre ?? '—'} />
            <DetailRow label="Departamento" value={selectedOt.departamento ?? '—'} />
            <DetailRow label="Fecha asignada" value={formatDate(selectedOt.fecha_asignada) || '—'} />
            <div className="flex items-center justify-between gap-3">
              <dt className="text-xs text-muted-foreground uppercase tracking-wide">Prioridad</dt>
              <dd><StatusBadge status={selectedOt.prioridad} /></dd>
            </div>
            <DetailRow label="Tipo de trabajo" value={selectedOt.tipo_trabajo ?? '—'} />
            <DetailRow label="Días estimado" value={selectedOt.dias_estimado != null ? String(selectedOt.dias_estimado) : '—'} />
            <DetailRow label="Personas requeridas" value={selectedOt.personas_requeridas != null ? String(selectedOt.personas_requeridas) : '—'} />
            <div>
              <dt className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Detalle</dt>
              <dd className="text-sm whitespace-pre-wrap">{selectedOt.detalle || 'Sin detalle.'}</dd>
            </div>
          </dl>
        )}
      </BottomSheet>

      {/* Ver repuestos (read-only) */}
      <BottomSheet isOpen={activeSheet === 'repuestos'} onClose={closeSheets} title="Repuestos asignados" subtitle={selectedOt?.concat_activo ?? undefined}>
        {repuestosSel.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin repuestos asignados.</p>
        ) : (
          <div className="space-y-2">
            {repuestosSel.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border bg-muted/20 px-3 py-2">
                <span className="text-sm">{r.repuesto}</span>
                <Badge>{r.cantidad}</Badge>
              </div>
            ))}
          </div>
        )}
      </BottomSheet>

      {/* Agregar repuesto */}
      <BottomSheet isOpen={activeSheet === 'agregarRepuesto'} onClose={closeSheets} title="Agregar repuesto" subtitle={selectedOt?.concat_activo ?? undefined}>
        <Input placeholder="Buscar artículo…" value={repuestoSearch} onChange={(e) => setRepuestoSearch(e.target.value)} className="h-9 text-sm" />
        {filteredStock.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sin stock disponible en este edificio.</p>
        ) : (
          <div className="space-y-2">
            {filteredStock.map((row) => {
              const qty = qtyMap[row.id] ?? '';
              const parsed = Number(qty);
              const invalid = qty !== '' && (!Number.isFinite(parsed) || parsed <= 0 || parsed > row.cantidad);
              return (
                <div key={row.id} className="rounded-md border p-2 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{articulosMap.get(row.articulo_id)?.nombre ?? `Artículo ${row.articulo_id}`}</p>
                      <p className="text-xs text-muted-foreground">Disponible: {row.cantidad}</p>
                    </div>
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className={cn('h-9 w-16 text-center px-1', invalid && 'border-red-500 focus-visible:ring-red-500')}
                      value={qty}
                      onChange={(e) => setQtyMap((m) => ({ ...m, [row.id]: e.target.value }))}
                    />
                    <button
                      aria-label="Asignar repuesto"
                      disabled={!qty || invalid || assigningId === row.id}
                      onClick={() => handleAsignarRepuesto(row)}
                      className="h-9 w-9 shrink-0 rounded-md bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-colors"
                    >
                      {assigningId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </button>
                  </div>
                  {invalid && (
                    <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />Supera el stock disponible.</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </BottomSheet>

      {/* Agregar solicitud (nueva OT) */}
      <BottomSheet
        isOpen={activeSheet === 'nuevaSolicitud'}
        onClose={() => setActiveSheet(null)}
        title="Agregar solicitud"
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingSolicitud}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={!torreSel || !deptoSel || !detalleText.trim() || savingSolicitud} onClick={handleCrearSolicitud}>
              {savingSolicitud && <Loader2 className="h-4 w-4 animate-spin" />}Aceptar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha</label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="h-10" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Torre</label>
          <Select value={torreSel} onChange={(v) => { setTorreSel(v); setDeptoSel(''); }} options={solicitudTorreOptions} placeholder="Seleccioná una torre" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Departamento</label>
          <Select value={deptoSel} onChange={setDeptoSel} options={solicitudDeptoOptions} placeholder="Seleccioná un departamento" disabled={!torreSel} />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Detalle</label>
          <textarea
            value={detalleText}
            onChange={(e) => setDetalleText(e.target.value)}
            rows={3}
            maxLength={1000}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
            placeholder="Describí el problema…"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Fotos</label>
          <label className="flex flex-col items-center justify-center gap-1.5 h-20 rounded-lg border-2 border-dashed border-input bg-muted/10 cursor-pointer hover:border-primary/40 hover:bg-primary/5 transition-colors text-center">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { void handleStagePhoto(e.target.files?.[0]); e.target.value = ''; }} />
            <Camera className="w-5 h-5 text-muted-foreground/50" />
            <span className="text-xs text-muted-foreground">Tocá para sacar una foto</span>
          </label>
          {staged.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {staged.map((p) => (
                <div key={p.id} className="relative">
                  <img src={p.dataUrl} className="h-16 w-16 rounded-md object-cover border" alt="Foto adjunta" />
                  <button
                    aria-label="Quitar foto"
                    onClick={() => setStaged((prev) => prev.filter((x) => x.id !== p.id))}
                    className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </BottomSheet>

      <ConfirmModal
        isOpen={!!confirmFinalizar}
        onClose={() => setConfirmFinalizar(null)}
        onConfirm={() => handleFinalizar(confirmFinalizar!)}
        title="Completar orden de trabajo"
        description={`¿Marcar como resuelta la orden de ${confirmFinalizar?.concat_activo ?? `${confirmFinalizar?.torre ?? ''} - ${confirmFinalizar?.departamento ?? ''}`}?`}
        confirmText="Completar"
        cancelText="Cancelar"
        icon={<CheckCircle2 className="h-6 w-6" />}
      />
    </div>
  );
};

export default OrdenesTecnicoView;
