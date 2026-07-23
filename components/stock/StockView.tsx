// Screen_Stock port — back-office inventory list. See docs/analysis/desktop_Screen_Stock.md.
// Page skeleton per DESIGN.md §4.4 (header + toolbar + loader + mobile cards / desktop table).
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRightLeft, Package, Pencil, Plus, RefreshCw, Search } from 'lucide-react';
import { Button, Card, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, cn } from '../ui/UIComponents';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { api } from '../../services/index.ts';
import type { StockRowWithEdificios } from '../../services/api.ts';
import type { Articulo, Edificio, Usuario } from '../../services/types.ts';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { AgregarStockModal } from './AgregarStockModal';
import { SalidaStockModal } from './SalidaStockModal';
import { EditarStockModal } from './EditarStockModal';

/** DESIGN.md §7.9-style pill, styled like StatusBadge but not routed through STATUS_COLORS —
 * "Bajo stock" isn't a workflow status, it's a computed row condition (cantidad < condicion_corte). */
const BajoStockBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700 whitespace-nowrap">
    <AlertTriangle className="h-3 w-3" /> Bajo stock
  </span>
);

const money = (n: number | null) => `$ ${maskFromNumber(n ?? 0)}`;

const StockView: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [rows, setRows] = useState<StockRowWithEdificios[]>([]);
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [edificios, setEdificios] = useState<Edificio[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');

  const [showAgregar, setShowAgregar] = useState(false);
  const [salidaRow, setSalidaRow] = useState<StockRowWithEdificios | null>(null);
  const [editRow, setEditRow] = useState<StockRowWithEdificios | null>(null);

  const readOnly = user?.perfil === 'Compras';

  const load = async () => {
    setLoadError(false);
    try {
      const [stockRows, art, edi, usr] = await Promise.all([
        api.stock.list(),
        api.articulos.list(),
        api.edificios.list(),
        api.usuarios.list(),
      ]);
      setRows(stockRows);
      setArticulos(art);
      setEdificios(edi);
      setUsuarios(usr);
    } catch {
      setLoadError(true);
    }
  };

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const refresh = async () => {
    setLoading(true);
    try {
      await load();
    } finally {
      setLoading(false);
    }
  };

  const articulosById = useMemo(() => new Map(articulos.map((a) => [a.id, a])), [articulos]);
  const edificiosById = useMemo(() => new Map(edificios.map((e) => [e.id, e])), [edificios]);
  const tecnicos = useMemo(() => usuarios.filter((u) => u.perfil === 'Tecnico' && u.status === 'ALTA'), [usuarios]);

  const edificioNames = (ids: number[]) => ids.map((id) => edificiosById.get(id)?.nombre).filter(Boolean).join(', ') || '—';
  const isLowStock = (r: StockRowWithEdificios) => r.condicion_corte != null && r.cantidad < r.condicion_corte;

  // Screen_Stock: Items = Filter(CollectStock, Cantidad_ST>0) — zero-quantity rows are dropped.
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.cantidad > 0)
      .filter((r) => {
        if (!q) return true;
        const articulo = articulosById.get(r.articulo_id);
        const haystack = `${articulo?.codigo ?? ''} ${articulo?.nombre ?? ''} ${edificioNames(r.edificio_ids)}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (articulosById.get(a.articulo_id)?.nombre ?? '').localeCompare(articulosById.get(b.articulo_id)?.nombre ?? ''));
  }, [rows, search, articulosById, edificiosById]);

  const totalItems = visibleRows.length;
  const totalCosto = visibleRows.reduce((acc, r) => acc + (r.precio_unitario ?? 0) * r.cantidad, 0);

  const handleMutationError = (message: string) => showToast(message, 'error');

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Stock</h1>
          <p className="text-sm text-muted-foreground mt-1">Inventario de insumos de mantenimiento por edificio</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar artículo o edificio…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={refresh} disabled={loading} aria-label="Actualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
          <Button
            variant="secondary"
            className="h-9 px-3 text-sm gap-1.5 shrink-0"
            onClick={() => navigate('/salidas-stock')}
            disabled={readOnly}
            title={readOnly ? 'No tenés permiso para esta acción.' : undefined}
            aria-label="Salidas"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Salidas</span>
          </Button>
          <Button
            className="h-9 px-3 text-sm gap-1.5 shrink-0"
            onClick={() => setShowAgregar(true)}
            disabled={readOnly}
            title={readOnly ? 'No tenés permiso para esta acción.' : undefined}
            aria-label="Ingresar Stock"
          >
            <Plus className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Ingresar Stock</span>
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando stock…" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={refresh} />
      ) : visibleRows.length === 0 ? (
        <EmptyState icon={Package} title="Sin resultados" message="No hay stock que coincida con la búsqueda." />
      ) : (
        <>
          {/* MOBILE */}
          <div className="md:hidden space-y-2">
            {visibleRows.map((r) => {
              const articulo = articulosById.get(r.articulo_id);
              const low = isLowStock(r);
              return (
                <div key={r.id} className={cn('rounded-lg border bg-card p-3 shadow-sm space-y-2', low && 'bg-red-50 border-red-200')}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{articulo?.nombre ?? '—'}</div>
                      <div className="text-[11px] text-muted-foreground">{articulo?.codigo ?? '—'} · {edificioNames(r.edificio_ids)}</div>
                    </div>
                    {low && <BajoStockBadge />}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div><div className="text-muted-foreground">Cantidad</div><div className="font-semibold tabular-nums">{r.cantidad}</div></div>
                    <div><div className="text-muted-foreground">Mínimo</div><div className="font-semibold tabular-nums">{r.condicion_corte ?? '—'}</div></div>
                    <div><div className="text-muted-foreground">Costo total</div><div className="font-semibold tabular-nums">{money((r.precio_unitario ?? 0) * r.cantidad)}</div></div>
                  </div>
                  {!readOnly && (
                    <div className="flex justify-end gap-1 pt-2 border-t">
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditRow(r)} aria-label="Editar stock">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setSalidaRow(r)} aria-label="Registrar salida">
                        <ArrowRightLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* DESKTOP */}
          <Card className="hidden md:block border shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead>Edificios</TableHead>
                  <TableHead className="text-right">Precio unitario</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Stock mínimo</TableHead>
                  <TableHead className="text-right">Costo total</TableHead>
                  {!readOnly && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRows.map((r) => {
                  const articulo = articulosById.get(r.articulo_id);
                  const low = isLowStock(r);
                  return (
                    <TableRow key={r.id} className={cn(low && 'bg-red-50 hover:bg-red-50/80')}>
                      <TableCell className="text-muted-foreground">{articulo?.codigo ?? '—'}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{articulo?.nombre ?? '—'}</span>
                          {low && <BajoStockBadge />}
                        </div>
                      </TableCell>
                      <TableCell>{edificioNames(r.edificio_ids)}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(r.precio_unitario)}</TableCell>
                      <TableCell className="text-right tabular-nums font-medium">{r.cantidad}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">{r.condicion_corte ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{money((r.precio_unitario ?? 0) * r.cantidad)}</TableCell>
                      {!readOnly && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setEditRow(r)} aria-label="Editar stock">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" onClick={() => setSalidaRow(r)} aria-label="Registrar salida">
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {/* Totales — DESIGN.md §7.3 "barra de N columnas" */}
          <div className="grid grid-cols-2 gap-px border rounded-lg overflow-hidden bg-border">
            <div className="bg-muted/30 px-4 py-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Ítems</div>
              <div className="text-sm font-bold tabular-nums">{totalItems}</div>
            </div>
            <div className="bg-muted/30 px-4 py-2.5">
              <div className="text-[10px] uppercase text-muted-foreground">Costo total</div>
              <div className="text-sm font-bold tabular-nums text-brand">{money(totalCosto)}</div>
            </div>
          </div>
        </>
      )}

      <AgregarStockModal
        isOpen={showAgregar}
        onClose={() => setShowAgregar(false)}
        onSaved={(row) => { setShowAgregar(false); showToast('Stock ingresado correctamente.', 'success'); refresh(); void row; }}
        onError={handleMutationError}
        articulos={articulos}
        edificios={edificios}
        rows={rows}
        usuarioId={user?.id ?? 0}
      />
      <SalidaStockModal
        isOpen={salidaRow !== null}
        onClose={() => setSalidaRow(null)}
        onSaved={() => { setSalidaRow(null); showToast('Salida registrada correctamente.', 'success'); refresh(); }}
        onError={handleMutationError}
        row={salidaRow}
        articulo={salidaRow ? articulosById.get(salidaRow.articulo_id) : undefined}
        edificios={edificios}
        tecnicos={tecnicos}
        usuarioId={user?.id ?? 0}
      />
      <EditarStockModal
        isOpen={editRow !== null}
        onClose={() => setEditRow(null)}
        onSaved={() => { setEditRow(null); showToast('Stock actualizado correctamente.', 'success'); refresh(); }}
        onError={handleMutationError}
        row={editRow}
        articulo={editRow ? articulosById.get(editRow.articulo_id) : undefined}
        edificioNombre={editRow ? edificioNames(editRow.edificio_ids) : '—'}
        usuarioId={user?.id ?? 0}
      />
    </div>
  );
};

export default StockView;
