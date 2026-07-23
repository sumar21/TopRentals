// "Salida de Stock" modal — dispatch/consume/transfer stock from a row. DESIGN.md §4.1.
// The old "Cantidad Insuficiente" full-screen PA modal becomes inline validation + Toast(error)
// on the calling view (react_mapping) instead of a second modal here.
import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, PackageMinus, X } from 'lucide-react';
import { Button, cn, useModalAnimation } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Input } from '../ui/UIComponents';
import { backdropClose } from '../ui/backdropClose';
import { todayISO } from '../../utils/dates';
import { api } from '../../services/index.ts';
import type { StockRowWithEdificios } from '../../services/api.ts';
import type { Articulo, Edificio, TipoSalidaStock, Usuario } from '../../services/types.ts';

const TIPOS: { value: TipoSalidaStock; label: string }[] = [
  { value: 'ASIGNACION', label: 'Asignación' },
  { value: 'CONSUMIBLE', label: 'Consumible' },
  { value: 'DEVOLUCION', label: 'Devolución' },
  { value: 'TRASLADO', label: 'Traslado' },
];

interface SalidaStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  row: StockRowWithEdificios | null;
  articulo: Articulo | undefined;
  edificios: Edificio[];
  tecnicos: Usuario[];
  usuarioId: number;
}

export const SalidaStockModal: React.FC<SalidaStockModalProps> = ({ isOpen, onClose, onSaved, onError, row, articulo, edificios, tecnicos, usuarioId }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [tipo, setTipo] = useState<TipoSalidaStock | ''>('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [edificioId, setEdificioId] = useState('');
  const [centroCosto, setCentroCosto] = useState('');
  const [edificioDestinoId, setEdificioDestinoId] = useState('');
  const [fecha, setFecha] = useState(todayISO());
  const [saving, setSaving] = useState(false);

  const reset = () => { setTipo(''); setTecnicoId(''); setCantidad(''); setEdificioId(''); setCentroCosto(''); setEdificioDestinoId(''); setFecha(todayISO()); };
  const close = () => { if (!saving) { reset(); onClose(); } };

  const edificiosDelRow = useMemo(
    () => edificios.filter((e) => row?.edificio_ids.includes(e.id)),
    [edificios, row],
  );
  const edificioOptions = edificiosDelRow.map((e) => ({ label: e.nombre, value: String(e.id) }));
  // Pre-select the source building when the row only pools stock in one (the common case).
  React.useEffect(() => {
    if (isOpen && edificiosDelRow.length === 1 && !edificioId) setEdificioId(String(edificiosDelRow[0].id));
  }, [isOpen, edificiosDelRow, edificioId]);

  const centroCostoOptions = edificios.filter((e) => e.status === 'Activo').map((e) => ({ label: e.nombre, value: e.nombre }));
  const destinoOptions = edificios
    .filter((e) => e.status === 'Activo' && String(e.id) !== edificioId)
    .map((e) => ({ label: e.nombre, value: String(e.id) }));
  const tecnicoOptions = tecnicos.map((t) => ({ label: t.concat_name, value: String(t.id) }));

  const disponible = row?.cantidad ?? 0;
  const cantidadNum = Number(cantidad);
  const cantidadValida = cantidadNum > 0 && cantidadNum <= disponible;
  const valid = Boolean(tipo) && Boolean(tecnicoId) && cantidadValida && Boolean(edificioId) && Boolean(centroCosto)
    && (tipo !== 'TRASLADO' || Boolean(edificioDestinoId));

  const handleSave = async () => {
    if (!valid || !row || !tipo) return;
    setSaving(true);
    try {
      await api.stock.salida({
        stock_id: row.id,
        edificio_id: Number(edificioId),
        tipo,
        cantidad: cantidadNum,
        tecnico_id: Number(tecnicoId),
        uso: 'Consumo Diario',
        centro_de_costo: centroCosto,
        usuario_id: usuarioId,
        fecha_salida: fecha,
        ...(tipo === 'TRASLADO' ? { edificio_destino_id: Number(edificioDestinoId) } : {}),
      });
      onSaved();
      reset();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo registrar la salida.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !row) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(close)}>
      <div className={cn(modalClass, 'bg-background w-full max-w-2xl rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]')}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Salida de Stock</h2>
            <p className="text-xs text-muted-foreground">
              Disponible <span className="font-medium text-foreground">{disponible}</span>
            </p>
          </div>
          <button onClick={close} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Fila 1 (PA): Tipo salida · Fecha · Técnico Responsable */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo salida</label>
              <Select value={tipo} onChange={(v) => setTipo(v as TipoSalidaStock)} options={TIPOS} placeholder="Elegí un tipo" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fecha</label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Técnico Responsable</label>
              <Select value={tecnicoId} onChange={setTecnicoId} options={tecnicoOptions} placeholder="Elegí un técnico" />
            </div>
          </div>

          {/* Fila 2 (PA): Artículo a retirar (read-only) · Cantidad */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Artículo a retirar</label>
              <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">
                {articulo ? `${articulo.codigo ? articulo.codigo + ' - ' : ''}${articulo.nombre}` : '—'}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad</label>
              <Input type="number" min={1} max={disponible} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="0" />
              {cantidad !== '' && !cantidadValida && (
                <p className="text-[11px] text-red-600 mt-1">Cantidad insuficiente — disponible: {disponible}.</p>
              )}
            </div>
          </div>

          {/* Fila 3 (PA): Uso (fijo) · Torre (centro de costo) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Uso</label>
              <div className="flex h-10 items-center px-3 rounded-md border border-input bg-muted/50 text-sm text-muted-foreground">Consumo Diario</div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Torre</label>
              <Select value={centroCosto} onChange={setCentroCosto} options={centroCostoOptions} placeholder="Elegí una torre" />
            </div>
          </div>

          {/* Extra: picker de origen solo si el row agrupa varios edificios; destino solo en TRASLADO */}
          {(edificiosDelRow.length > 1 || tipo === 'TRASLADO') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {edificiosDelRow.length > 1 && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio (origen del stock)</label>
                  <Select value={edificioId} onChange={setEdificioId} options={edificioOptions} placeholder="Elegí un edificio" />
                </div>
              )}
              {tipo === 'TRASLADO' && (
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Edificio destino</label>
                  <Select value={edificioDestinoId} onChange={setEdificioDestinoId} options={destinoOptions} placeholder="Elegí el edificio destino" />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-col sm:flex-row flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={saving} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSave} disabled={!valid || saving} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageMinus className="h-4 w-4" />}
            Confirmar salida
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default SalidaStockModal;
