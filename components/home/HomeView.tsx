// Home — back-office landing board. Read-only OT triage: Pendiente + Asignada (split by
// tipo_prioridad). See docs/analysis/desktop_Screen_Home.md. Logout/nav preloads live in
// Layout.tsx (out of scope here); the dead "Planificaciones" toggle is intentionally dropped.
import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, RefreshCw, Inbox, Loader2 } from 'lucide-react';
import { api } from '../../services/index.ts';
import type { OrdenTrabajo, Usuario } from '../../services/types.ts';
import { Badge, Card, Tabs, TabsList, TabsTrigger } from '../ui/UIComponents';
import { StatusBadge } from '../ui/StatusBadge';
import { Loader } from '../ui/Loader';
import { useToast } from '../ui/Toast';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { formatDate } from '../../utils/dates.ts';
import { bucketOf, matchesSearch, type BoardColumn } from './otBoard.ts';

const COLUMN_DEFS: { key: BoardColumn; title: string }[] = [
  { key: 'pendiente', title: 'Pendiente' },
  { key: 'alta', title: 'Asignada · Alta' },
  { key: 'media', title: 'Asignada · Media' },
  { key: 'baja', title: 'Asignada · Baja' },
];

const MOBILE_TABS = [
  { key: 'todas', title: 'Todas' },
  { key: 'pendiente', title: 'Pendiente' },
  { key: 'alta', title: 'Alta' },
  { key: 'media', title: 'Media' },
  { key: 'baja', title: 'Baja' },
] as const;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

const TipoTag: React.FC<{ tipo: OrdenTrabajo['tipo'] }> = ({ tipo }) =>
  tipo === 'SOLICITUD OT' ? (
    <Badge variant="secondary" className="text-[10px]">SOLICITUD OT</Badge>
  ) : (
    <span className="inline-flex items-center rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[10px] font-semibold">
      ORDEN DE TRABAJO
    </span>
  );

const OtCard: React.FC<{ ot: OrdenTrabajo; asignador: string; onClick: () => void }> = ({ ot, asignador, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full text-left rounded-lg border bg-card p-3 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
  >
    <div className="flex items-start justify-between gap-2">
      <p className="text-sm font-medium leading-snug line-clamp-2">{ot.detalle || 'Sin detalle'}</p>
      <StatusBadge status={ot.prioridad} className="shrink-0" />
    </div>
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <TipoTag tipo={ot.tipo} />
    </div>
    <div className="mt-2 space-y-0.5 text-xs text-muted-foreground">
      <p>{[ot.torre || '-', ot.departamento || '-'].join(' - ')}</p>
      <p>{[ot.tipo_tarea, ot.tipo_trabajo].filter(Boolean).join(' · ') || 'Sin tipo de tarea'}</p>
      <p>Inicio: {formatDate(ot.fecha_inicio) || '-'}</p>
      <p>Asignador: {asignador}</p>
    </div>
  </button>
);

const ColumnHeader: React.FC<{ title: string; count: number }> = ({ title, count }) => (
  <div className="flex items-center justify-between px-1">
    <h2 className="text-sm font-semibold text-foreground">{title}</h2>
    <Badge variant="secondary" className="text-[11px] tabular-nums">{count}</Badge>
  </div>
);

const ColumnEmpty: React.FC<{ label: string }> = ({ label }) => (
  <EmptyState icon={Inbox} title={`Sin OTs en ${label}`} className="p-6" />
);

const HomeView: React.FC = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileTab, setMobileTab] = useState<(typeof MOBILE_TABS)[number]['key']>('todas');
  const debouncedSearch = useDebounced(search, 300);

  const nombreById = useMemo(() => {
    const map = new Map<number, string>();
    usuarios.forEach((u) => map.set(u.id, u.concat_name));
    return map;
  }, [usuarios]);

  const load = async (isRefresh: boolean) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    setLoadError(false);
    try {
      const [otRows, userRows] = await Promise.all([api.ots.list(), api.usuarios.list()]);
      setOts(otRows);
      setUsuarios(userRows);
      if (isRefresh) showToast('Tablero actualizado.', 'success');
    } catch {
      showToast('No se pudo cargar el tablero de OTs.', 'error');
      setLoadError(true);
    } finally {
      isRefresh ? setRefreshing(false) : setLoading(false);
    }
  };

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const board = useMemo(() => {
    const buckets: Record<BoardColumn, OrdenTrabajo[]> = { pendiente: [], alta: [], media: [], baja: [] };
    for (const ot of ots) {
      const column = bucketOf(ot);
      if (!column) continue;
      const tecnicoNombre = ot.tecnico_id ? nombreById.get(ot.tecnico_id) ?? '' : '';
      if (!matchesSearch(ot, debouncedSearch, tecnicoNombre)) continue;
      buckets[column].push(ot);
    }
    for (const key of Object.keys(buckets) as BoardColumn[]) {
      buckets[key].sort((a, b) => (b.fecha_inicio ?? '').localeCompare(a.fecha_inicio ?? ''));
    }
    return buckets;
  }, [ots, nombreById, debouncedSearch]);

  const goToDetail = () => navigate('/ordenes-trabajo');

  const renderCard = (ot: OrdenTrabajo) => (
    <OtCard
      key={ot.id}
      ot={ot}
      asignador={ot.asignador_id ? nombreById.get(ot.asignador_id) ?? 'Sin asignar' : 'Sin asignar'}
      onClick={goToDetail}
    />
  );

  const mobileList = mobileTab === 'todas' ? [...board.pendiente, ...board.alta, ...board.media, ...board.baja] : board[mobileTab as BoardColumn] ?? [];

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-3 shrink-0">
        <div className="shrink-0 hidden md:block">
          <h1 className="text-2xl font-bold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted-foreground mt-1">Tablero de Órdenes de Trabajo en curso.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:justify-end">
          <div className="relative flex-1 sm:w-64 sm:flex-none min-w-[7rem]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por torre, estado o técnico…"
              className="flex h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          <button
            type="button"
            aria-label="Actualizar tablero"
            title="Actualizar"
            disabled={refreshing || loading}
            onClick={() => load(true)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:pointer-events-none shrink-0"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader size="lg" text="Cargando tablero…" subtext="Órdenes de trabajo" />
        </div>
      ) : loadError ? (
        <LoadErrorState onRetry={() => load(false)} />
      ) : (
        <div className={`transition-opacity duration-300 ${refreshing ? 'opacity-60' : ''}`}>
          {/* MOBILE: single list gated by a segmented Tabs filter */}
          <div className="md:hidden flex flex-col gap-3">
            <Tabs value={mobileTab} onValueChange={(v: string) => setMobileTab(v as (typeof MOBILE_TABS)[number]['key'])}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="w-max">
                  {MOBILE_TABS.map((tab) => (
                    <TabsTrigger key={tab.key} value={tab.key}>{tab.title}</TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
            {mobileList.length === 0 ? (
              <ColumnEmpty label={MOBILE_TABS.find((t) => t.key === mobileTab)?.title.toLowerCase() ?? ''} />
            ) : (
              <div className="space-y-2">{mobileList.map(renderCard)}</div>
            )}
          </div>

          {/* DESKTOP: 4 side-by-side triage columns */}
          <div className="hidden md:grid md:grid-cols-4 gap-4">
            {COLUMN_DEFS.map(({ key, title }) => {
              const items = board[key];
              return (
                <div key={key} className="flex flex-col gap-2 min-w-0">
                  <ColumnHeader title={title} count={items.length} />
                  <Card className="border shadow-sm p-2 flex flex-col gap-2 min-h-[10rem] max-h-[70vh] overflow-y-auto">
                    {items.length === 0 ? <ColumnEmpty label={title.toLowerCase()} /> : items.map(renderCard)}
                  </Card>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default HomeView;
