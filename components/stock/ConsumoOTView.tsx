// Consumo por OT — histórico de stock consumido en órdenes de trabajo, leído de repuestos_ot
// (la lista SharePoint 10.RepuestosOT, migrada). Responde "en qué OT se usó cada artículo" sin
// abrir OT por OT. Solo lectura. La OT se muestra por su NÚMERO (#id), nunca por id_univoco.
// Page skeleton per DESIGN.md §4.4; filtros con FilterPopover como VentilacionesView/SalidasStock.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, PackageSearch, Search } from 'lucide-react';
import { Button, Card, Input, MultiCombobox, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { FilterPopover } from '../ui/FilterPopover';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { api } from '../../services/index.ts';
import type { RepuestoOT, Usuario } from '../../services/types.ts';
import { formatDate } from '../../utils/dates';

/** Last 12 months (current first), as 'YYYY-MM' keys — used for the mes filter. */
function last12Months(): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
    out.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
  }
  return out;
}
const mesKeyOf = (iso: string | null) => (iso ? iso.slice(0, 7) : '');

/** OT number chip — the migrated FK `orden_trabajo_id` IS the OT number the whole app shows as #id. */
const OTChip: React.FC<{ id: number }> = ({ id }) => (
  <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-semibold tabular-nums">#{id}</span>
);

const ConsumoOTView: React.FC = () => {
  const navigate = useNavigate();
  const [repuestos, setRepuestos] = useState<RepuestoOT[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [meses, setMeses] = useState<string[]>([]);
  const [articulos, setArticulos] = useState<string[]>([]);

  const load = () => {
    setLoading(true);
    setLoadError(false);
    return Promise.all([api.ots.repuestos.listAll(), api.usuarios.list()])
      .then(([r, u]) => { setRepuestos(r); setUsuarios(u); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const tecnicosById = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const tecnicoName = (r: RepuestoOT) => (r.usuario_id != null ? tecnicosById.get(r.usuario_id)?.concat_name ?? null : null);

  const mesOptions = useMemo(() => last12Months(), []);
  const articuloOptions = useMemo(() => {
    const names = [...new Set(repuestos.map((r) => r.repuesto?.trim()).filter((n): n is string => !!n))].sort((a, b) => a.localeCompare(b));
    return names.map((n) => ({ label: n, value: n }));
  }, [repuestos]);

  const activeCount = meses.length + articulos.length;
  const clearFilters = () => { setMeses([]); setArticulos([]); };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return repuestos
      .filter((r) => meses.length === 0 || meses.includes(mesKeyOf(r.fecha)))
      .filter((r) => articulos.length === 0 || (r.repuesto != null && articulos.includes(r.repuesto.trim())))
      .filter((r) => {
        if (!q) return true;
        const haystack = `#${r.orden_trabajo_id} ${r.repuesto ?? ''} ${r.edificio ?? ''} ${tecnicoName(r) ?? ''}`.toLowerCase();
        return haystack.includes(q);
      })
      .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repuestos, meses, articulos, search, tecnicosById]);

  return (
    <div className="flex flex-col gap-4 w-full md:h-full md:min-h-0">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" className="h-9 w-9 shrink-0" onClick={() => navigate('/stock')} aria-label="Volver a Stock">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="hidden md:block">
            <h1 className="text-2xl font-bold tracking-tight">Consumo por OT</h1>
            <p className="text-sm text-muted-foreground mt-1">Stock consumido en órdenes de trabajo — sin abrir OT por OT</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-56 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Buscar OT, artículo…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
          </div>
          <FilterPopover activeCount={activeCount} onClear={clearFilters}>
            <div className="w-full">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Mes</label>
              <MultiCombobox options={mesOptions} value={meses} onChange={setMeses} placeholder="Todos" searchPlaceholder="Buscar mes…" />
            </div>
            <div className="w-full">
              <label className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Artículo</label>
              <MultiCombobox options={articuloOptions} value={articulos} onChange={setArticulos} placeholder="Todos" searchPlaceholder="Buscar artículo…" />
            </div>
          </FilterPopover>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando consumo…" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={load} />
      ) : visible.length === 0 ? (
        <EmptyState icon={PackageSearch} title="Sin resultados" message="No hay consumo de stock en OTs que coincida con la búsqueda/filtros." />
      ) : (
        <>
          {/* MOBILE */}
          <div className="md:hidden space-y-2">
            {visible.map((r) => (
              <div key={r.id} className="rounded-lg border bg-card p-3 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{r.repuesto ?? '—'}</div>
                    <div className="text-[11px] text-muted-foreground">{formatDate(r.fecha)} · {r.edificio ?? '—'}</div>
                  </div>
                  <OTChip id={r.orden_trabajo_id} />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><div className="text-muted-foreground">Cantidad</div><div className="font-semibold tabular-nums">{r.cantidad}</div></div>
                  <div><div className="text-muted-foreground">Técnico</div><div className="font-medium">{tecnicoName(r) ?? '—'}</div></div>
                </div>
              </div>
            ))}
          </div>

          {/* DESKTOP */}
          <Card className="hidden md:flex md:flex-col md:flex-1 md:min-h-0 border shadow-sm overflow-hidden">
            <Table wrapperClassName="h-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>OT</TableHead>
                  <TableHead>Artículo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Técnico</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">{formatDate(r.fecha)}</TableCell>
                    <TableCell><OTChip id={r.orden_trabajo_id} /></TableCell>
                    <TableCell>{r.repuesto ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.cantidad}</TableCell>
                    <TableCell>{r.edificio ?? '—'}</TableCell>
                    <TableCell>{tecnicoName(r) ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
};

export default ConsumoOTView;
