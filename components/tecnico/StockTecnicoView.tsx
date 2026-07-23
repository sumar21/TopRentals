// mobile/Screen_Stock — technician stock view for a building/pool.
// docs/analysis/mobile_Screen_Stock.md react_mapping. The "Perche, Adriana" hardcoded
// read-only gate from the original screen is NOT ported — every technician can add/edit
// stock (no such permission exists in perfiles_permisos; add a real capability there if
// the business still wants this restricted).
import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, Plus, Search, Pencil, Package, Loader2 } from 'lucide-react';
import { Button, Input, Combobox } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../ui/Toast';
import { api } from '../../services/index.ts';
import type { Articulo, Edificio } from '../../services/types.ts';
import type { StockRowWithEdificios } from '../../services/api.ts';
import { BottomSheet, edificioIdsEnGrupoStock, edificioOptions, grupoStockKey } from './shared';

type ActiveSheet = 'swap' | 'add' | 'edit' | null;
interface NavState { grupo?: string; edificioNombre?: string; edificioId?: number }

const StockTecnicoView: React.FC = () => {
  const { user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const navState = (location.state ?? {}) as NavState;

  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [stockAll, setStockAll] = useState<StockRowWithEdificios[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [grupo, setGrupo] = useState<string | null>(navState.grupo ?? null);
  const [edificioNombre, setEdificioNombre] = useState<string | null>(navState.edificioNombre ?? null);
  const [edificioId, setEdificioId] = useState<number | null>(navState.edificioId ?? null);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [pickerValue, setPickerValue] = useState('');
  const [addArticuloId, setAddArticuloId] = useState('');
  const [addCantidad, setAddCantidad] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [editRow, setEditRow] = useState<StockRowWithEdificios | null>(null);
  const [editCantidad, setEditCantidad] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    Promise.all([api.edificios.list(), api.articulos.list(), api.stock.list()])
      .then(([eds, arts, stock]) => { setEdificios(eds); setArticulos(arts); setStockAll(stock); })
      .catch(() => showToast('No se pudo cargar el stock.', 'error'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingOptions = useMemo(() => edificioOptions(edificios.filter((e) => e.status === 'Activo'), grupoStockKey), [edificios]);
  const edificioIds = useMemo(
    () => (edificioId != null ? edificioIdsEnGrupoStock(edificios, edificioId) : []),
    [edificios, edificioId],
  );
  const articulosMap = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const rowsDelGrupo = useMemo(
    () => stockAll.filter((s) => s.cantidad > 0 && s.edificio_ids.some((id) => edificioIds.includes(id))),
    [stockAll, edificioIds],
  );
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...rowsDelGrupo].sort((a, b) => a.id - b.id);
    if (!q) return sorted;
    return sorted.filter((r) => (articulosMap.get(r.articulo_id)?.nombre ?? '').toLowerCase().includes(q));
  }, [rowsDelGrupo, search, articulosMap]);
  const addOptions = useMemo(() => {
    const already = new Set(rowsDelGrupo.map((r) => r.articulo_id));
    return articulos.filter((a) => a.status === 'Activo' && !already.has(a.id)).map((a) => ({ value: String(a.id), label: a.nombre }));
  }, [articulos, rowsDelGrupo]);

  const handlePickBuilding = () => {
    const ed = edificios.find((e) => String(e.id) === pickerValue);
    if (!ed) return;
    setGrupo(grupoStockKey(ed));
    setEdificioNombre(ed.nombre);
    setEdificioId(ed.id);
    setPickerValue('');
    setActiveSheet(null);
  };

  const openEdit = (row: StockRowWithEdificios) => { setEditRow(row); setEditCantidad(String(row.cantidad)); setActiveSheet('edit'); };

  const refreshStock = async () => setStockAll(await api.stock.list());

  const handleAgregarStock = async () => {
    const cantidad = Number(addCantidad);
    if (!user || !edificioId || !addArticuloId || !cantidad || cantidad <= 0) return;
    setSavingAdd(true);
    try {
      const articulo = articulosMap.get(Number(addArticuloId));
      await api.stock.agregar({ articulo_id: Number(addArticuloId), edificio_id: edificioId, cantidad, precio_unitario: articulo?.precio_unitario ?? 0, usuario_id: user.id });
      showToast('Stock agregado correctamente.', 'success');
      setActiveSheet(null);
      setAddArticuloId('');
      setAddCantidad('');
      await refreshStock();
    } catch {
      showToast('No se pudo agregar el stock.', 'error');
    } finally {
      setSavingAdd(false);
    }
  };

  const handleEditarStock = async () => {
    const cantidad = Number(editCantidad);
    if (!user || !editRow || !Number.isFinite(cantidad) || cantidad < 0) return;
    setSavingEdit(true);
    try {
      await api.stock.editar({ stock_id: editRow.id, cantidad, precio_unitario: editRow.precio_unitario ?? 0, condicion_corte: editRow.condicion_corte ?? 0, usuario_id: user.id });
      showToast('Stock actualizado correctamente.', 'success');
      setActiveSheet(null);
      setEditRow(null);
      await refreshStock();
    } catch {
      showToast('No se pudo actualizar el stock.', 'error');
    } finally {
      setSavingEdit(false);
    }
  };

  if (!grupo) {
    return (
      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight">Stock</h1>
        </div>
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <p className="text-sm font-medium">Elegí un edificio para ver su stock</p>
          <Select value={pickerValue} onChange={setPickerValue} options={buildingOptions} placeholder="Seleccioná un edificio" />
          <Button className="w-full" disabled={!pickerValue} onClick={handlePickBuilding}>Ver stock</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={() => navigate('/tecnico')} aria-label="Volver" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold tracking-tight truncate">Edificio: {edificioNombre}</h1>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={() => setActiveSheet('swap')} aria-label="Cambiar edificio" className="p-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors">
            <ArrowLeftRight className="h-5 w-5" />
          </button>
          <button onClick={() => setActiveSheet('add')} aria-label="Agregar stock" className="p-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
            <Plus className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader size="md" /></div>
      ) : filteredRows.length === 0 ? (
        <EmptyState icon={Package} title="Sin stock" message="No hay artículos con stock disponible en este edificio." />
      ) : (
        <div className="space-y-2">
          {filteredRows.map((row) => (
            <div key={row.id} className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
              <span className="inline-flex items-center justify-center min-w-[2.25rem] h-7 px-2 rounded-full bg-blue-100 text-blue-700 text-sm font-semibold shrink-0">{row.cantidad}</span>
              <span className="flex-1 text-sm font-medium truncate">{articulosMap.get(row.articulo_id)?.nombre ?? `Artículo ${row.articulo_id}`}</span>
              <button onClick={() => openEdit(row)} aria-label="Editar cantidad" className="p-2 -m-2 rounded-full text-muted-foreground hover:bg-secondary transition-colors shrink-0">
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Swap building */}
      <BottomSheet
        isOpen={activeSheet === 'swap'}
        onClose={() => setActiveSheet(null)}
        title="Cambiar edificio"
        footer={<Button className="flex-1" disabled={!pickerValue} onClick={handlePickBuilding}>Aceptar</Button>}
      >
        <Select value={pickerValue} onChange={setPickerValue} options={buildingOptions} placeholder="Seleccioná un edificio" />
      </BottomSheet>

      {/* Add stock */}
      <BottomSheet
        isOpen={activeSheet === 'add'}
        onClose={() => setActiveSheet(null)}
        title="Ingresar stock"
        subtitle={edificioNombre ?? undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingAdd}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={!addArticuloId || !addCantidad || Number(addCantidad) <= 0 || savingAdd} onClick={handleAgregarStock}>
              {savingAdd && <Loader2 className="h-4 w-4 animate-spin" />}Agregar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Artículo</label>
          <Combobox options={addOptions} value={addArticuloId} onChange={setAddArticuloId} placeholder="Seleccioná un artículo" emptyText="Sin artículos disponibles" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad</label>
          <Input type="number" inputMode="numeric" min={1} value={addCantidad} onChange={(e) => setAddCantidad(e.target.value)} />
        </div>
      </BottomSheet>

      {/* Edit stock */}
      <BottomSheet
        isOpen={activeSheet === 'edit'}
        onClose={() => setActiveSheet(null)}
        title="Editar cantidad"
        subtitle={editRow ? articulosMap.get(editRow.articulo_id)?.nombre : undefined}
        footer={
          <>
            <Button variant="outline" className="flex-1" onClick={() => setActiveSheet(null)} disabled={savingEdit}>Cancelar</Button>
            <Button className="flex-1 gap-2" disabled={editCantidad === '' || Number(editCantidad) < 0 || savingEdit} onClick={handleEditarStock}>
              {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}Guardar
            </Button>
          </>
        }
      >
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Cantidad</label>
          <Input type="number" inputMode="numeric" min={0} value={editCantidad} onChange={(e) => setEditCantidad(e.target.value)} />
        </div>
      </BottomSheet>
    </div>
  );
};

export default StockTecnicoView;
