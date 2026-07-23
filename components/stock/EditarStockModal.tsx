// "Editar Stock" modal — overwrite cantidad/stock mínimo/costo unitario. DESIGN.md §4.1.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, Save, X } from 'lucide-react';
import { Button, Input, cn, useModalAnimation } from '../ui/UIComponents';
import { MoneyInput } from '../ui/MoneyInput';
import { backdropClose } from '../ui/backdropClose';
import { maskFromNumber, parseMoney } from '../../utils/formatMoneyInput';
import { api } from '../../services/index.ts';
import type { StockRowWithEdificios } from '../../services/api.ts';
import type { Articulo } from '../../services/types.ts';

interface EditarStockModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: (row: StockRowWithEdificios) => void;
  onError: (message: string) => void;
  row: StockRowWithEdificios | null;
  articulo: Articulo | undefined;
  usuarioId: number;
}

export const EditarStockModal: React.FC<EditarStockModalProps> = ({ isOpen, onClose, onSaved, onError, row, articulo, usuarioId }) => {
  const { visible, overlayClass, modalClass } = useModalAnimation(isOpen);
  const [cantidad, setCantidad] = useState('');
  const [minimo, setMinimo] = useState('');
  const [costo, setCosto] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && row) {
      setCantidad(String(row.cantidad));
      setMinimo(row.condicion_corte != null ? String(row.condicion_corte) : '');
      setCosto(maskFromNumber(row.precio_unitario));
    }
  }, [isOpen, row]);

  const close = () => { if (!saving) onClose(); };

  const cantidadNum = Number(cantidad);
  const minimoNum = Number(minimo);
  const costoNum = parseMoney(costo);
  const valid = cantidad !== '' && cantidadNum >= 0 && minimo !== '' && minimoNum >= 0 && costo !== '' && costoNum >= 0;

  const handleSave = async () => {
    if (!valid || !row) return;
    setSaving(true);
    try {
      const updated = await api.stock.editar({
        stock_id: row.id,
        cantidad: cantidadNum,
        precio_unitario: costoNum,
        condicion_corte: minimoNum,
        usuario_id: usuarioId,
      });
      onSaved(updated);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'No se pudo editar el stock.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible || !row) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 ${overlayClass}`} {...backdropClose(close)}>
      <div className={cn(modalClass, 'bg-background w-full max-w-md rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col max-h-[90vh]')}>
        <div className="px-6 py-4 border-b flex justify-between items-center bg-secondary/20">
          <div>
            <h2 className="text-xl font-bold tracking-tight">Editar Stock</h2>
            <p className="text-xs text-muted-foreground">Artículo <span className="font-medium text-foreground">{articulo?.nombre ?? '—'}</span></p>
          </div>
          <button onClick={close} aria-label="Cerrar" className="p-2 hover:bg-secondary rounded-full transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad actual</label>
            <Input type="number" min={0} step={1} value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Stock mínimo</label>
            <Input type="number" min={0} step={1} value={minimo} onChange={(e) => setMinimo(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Costo unitario</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-muted-foreground text-sm z-10 pointer-events-none">$</span>
              <MoneyInput className="pl-7" value={costo} onChange={setCosto} />
            </div>
          </div>
        </div>

        <div className="p-4 border-t bg-muted/20 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSave} disabled={!valid || saving} className="min-w-[140px] w-full sm:w-auto gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default EditarStockModal;
