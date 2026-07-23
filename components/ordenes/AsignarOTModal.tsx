// Asignar OT (Group_AsignarOT) — técnico + repuestos assignment. Built complete per
// the original PA logic (stock deduction, qty-vs-disponible check), but its entry-point
// icon in OrdenesTrabajoView only renders while FEATURES.asignarOTDesktop is true —
// which is false, exactly mirroring the disabled PA feature (config/features.ts).
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { Button, Combobox, Input, useModalAnimation } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { backdropClose } from '../ui/backdropClose';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index';
import type { Articulo, Edificio, OrdenTrabajo, Usuario } from '../../services/types';
import type { StockRowWithEdificios } from '../../services/api';
import { todayISO } from '../../utils/dates';

interface StagedRepuesto { articulo_id: number; nombre: string; cantidad: number; }

export interface AsignarOTModalProps {
  isOpen: boolean;
  onClose: () => void;
  ot: OrdenTrabajo | null;
  edificios: Edificio[];
  onSaved: (ot: OrdenTrabajo) => void;
}

const AsignarOTModal: React.FC<AsignarOTModalProps> = ({ isOpen, onClose, ot, edificios, onSaved }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tecnicos, setTecnicos] = useState<Usuario[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [stock, setStock] = useState<StockRowWithEdificios[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [tecnicoId, setTecnicoId] = useState('');
  const [articuloId, setArticuloId] = useState('');
  const [cantidad, setCantidad] = useState('1');
  const [staged, setStaged] = useState<StagedRepuesto[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const edificioId = useMemo(() => edificios.find((e) => e.nombre === ot?.torre)?.id ?? null, [edificios, ot]);

  useEffect(() => {
    if (!isOpen) return;
    setTecnicoId('');
    setArticuloId('');
    setCantidad('1');
    setStaged([]);
    setError('');
    setLoadingData(true);
    Promise.all([api.usuarios.list(), api.articulos.list(), api.stock.list()])
      .then(([u, a, s]) => { setTecnicos(u.filter((x) => x.perfil === 'Tecnico' && x.status === 'ALTA')); setArticulos(a.filter((x) => x.status === 'Activo')); setStock(s); })
      .finally(() => setLoadingData(false));
  }, [isOpen]);

  const tecnicoOptions = useMemo(() => tecnicos.map((t) => ({ label: t.concat_name, value: String(t.id) })), [tecnicos]);
  const articuloOptions = useMemo(() => articulos.map((a) => ({ label: a.nombre, value: String(a.id) })), [articulos]);
  const disponible = useMemo(() => {
    if (!articuloId || edificioId == null) return 0;
    const row = stock.find((s) => s.articulo_id === Number(articuloId) && s.edificio_ids.includes(edificioId));
    return row?.cantidad ?? 0;
  }, [stock, articuloId, edificioId]);

  const handleAgregarRepuesto = () => {
    const artId = Number(articuloId);
    const qty = Number(cantidad);
    if (!artId || qty <= 0) return;
    if (qty > disponible) { setError(`Cantidad insuficiente: disponible ${disponible}.`); return; }
    const nombre = articulos.find((a) => a.id === artId)?.nombre ?? '';
    setStaged((prev) => [...prev, { articulo_id: artId, nombre, cantidad: qty }]);
    setArticuloId('');
    setCantidad('1');
    setError('');
  };
  const removeStaged = (idx: number) => setStaged((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!ot || !user || !tecnicoId || edificioId == null) return;
    setSaving(true);
    setError('');
    try {
      for (const r of staged) {
        await api.ots.repuestos.asignarRepuesto({ orden_trabajo_id: ot.id, articulo_id: r.articulo_id, edificio_id: edificioId, cantidad: r.cantidad, usuario_id: user.id });
      }
      const saved = await api.ots.actualizar(ot.id, {
        status: 'Asignada',
        tecnico_id: Number(tecnicoId),
        asignador_id: user.id,
        fecha_asignada: todayISO(),
      });
      showToast('Orden de trabajo asignada.', 'success');
      onSaved(saved);
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo asignar la orden de trabajo.';
      setError(msg);
      showToast(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(() => { if (!saving) onClose(); })}>
      <div className={`${modalClass} bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]`}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Asignar Orden de Trabajo</h2>
            {ot && <p className="text-xs text-muted-foreground">OT <span className="font-medium text-foreground">#{ot.id}</span></p>}
          </div>
          <button onClick={saving ? undefined : onClose} className="p-2 hover:bg-secondary rounded-full transition-colors" aria-label="Cerrar">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div role="alert" className="p-3 bg-red-50 text-red-700 rounded-lg flex items-center gap-2 text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" /> {error}
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Técnico *</label>
            <Select value={tecnicoId} onChange={setTecnicoId} options={tecnicoOptions} placeholder="Seleccionar técnico…" disabled={loadingData} />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground block">Repuestos</label>
            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[10rem]">
                <Combobox options={articuloOptions} value={articuloId} onChange={setArticuloId} placeholder="Artículo…" searchPlaceholder="Buscar artículo…" disabled={loadingData} />
              </div>
              <div className="w-24">
                <Input type="number" min={1} inputMode="numeric" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>
              <Button variant="outline" onClick={handleAgregarRepuesto} disabled={!articuloId} className="gap-1.5 shrink-0"><Plus className="h-4 w-4" /> Agregar</Button>
            </div>
            {articuloId && <p className="text-[11px] text-muted-foreground">Disponible en {ot?.torre ?? 'el edificio'}: {disponible}</p>}

            {staged.length > 0 && (
              <ul className="space-y-1.5 mt-2">
                {staged.map((r, i) => (
                  <li key={`${r.articulo_id}-${i}`} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2 text-sm">
                    <span className="truncate">{r.nombre} <span className="text-muted-foreground">x{r.cantidad}</span></span>
                    <button type="button" onClick={() => removeStaged(i)} aria-label={`Quitar ${r.nombre}`} className="text-muted-foreground hover:text-destructive shrink-0"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!tecnicoId || saving} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Asignar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default AsignarOTModal;
