// Pure, DOM-free monthly aggregations for the Admin dashboard (components/dashboard/DashboardView).
// Extracted from the view so the number-crunching can be unit-checked (scripts/checks/run.ts)
// without React. `mes` is a 'YYYY-MM' key; rows are filtered by that month before aggregating.
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../services/types.ts';
import { formatDate } from './dates.ts';

export interface Grouped {
  key: string;
  a: number; // primary numeric metric
  b: number; // secondary numeric metric (0 when unused)
  extra?: string; // optional right-most string column (e.g. a date)
}

export interface DashboardSources {
  movimientos: MovimientoStock[];
  salidas: SalidaStock[];
  ots: OrdenTrabajo[];
  ventilaciones: Ventilacion[];
}

export interface DashboardStats {
  ingreso: Grouped[];
  ingresoTotal: number;
  consumo: Grouped[];
  consumoTotal: number;
  incidencias: Grouped[];
  incidenciasTotal: number;
  resolucion: Grouped[];
  resolProm: number;
  ventilacionesLimpiadas: Grouped[];
  ventTotal: number;
}

const OT_CERRADA = new Set(['Cerrada', 'Cerrada V', 'Cerrada F']);
const CONSUMO_TIPOS = new Set(['CONSUMIBLE', 'ASIGNACION']); // salidas that left the shelf (not returns/transfers)
const daysBetween = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

export function buildDashboardStats(mes: string, { movimientos, salidas, ots, ventilaciones }: DashboardSources): DashboardStats {
  const inMonth = (iso: string | null | undefined) => !!iso && iso.slice(0, 7) === mes;
  const bump = (map: Map<string, Grouped>, key: string, a: number, b: number) => {
    const g = map.get(key) ?? { key, a: 0, b: 0 };
    g.a += a;
    g.b += b;
    map.set(key, g);
  };

  // 1. Ingreso de stock por edificio: positive-delta movements (altas + reposiciones); value = delta * unit cost.
  const ingresoMap = new Map<string, Grouped>();
  for (const m of movimientos) {
    if (!inMonth(m.fecha)) continue;
    const delta = (m.cant_posterior ?? 0) - (m.cant_anterior ?? 0);
    if (delta <= 0) continue;
    bump(ingresoMap, m.edificio ?? 'Sin edificio', delta, delta * (m.costo_posterior ?? 0));
  }
  const ingreso = [...ingresoMap.values()].sort((x, y) => y.a - x.a);
  const ingresoTotal = ingreso.reduce((s, r) => s + r.a, 0);

  // 2. Consumo por artículo: salidas that left the shelf (CONSUMIBLE/ASIGNACION).
  const consumoMap = new Map<string, Grouped>();
  for (const s of salidas) {
    if (!inMonth(s.fecha_salida) || !CONSUMO_TIPOS.has(s.tipo)) continue;
    const key = s.concat_articulo ?? (s.articulo_id != null ? `#${s.articulo_id}` : 'Sin artículo');
    bump(consumoMap, key, s.cantidad, 1);
  }
  const consumo = [...consumoMap.values()].sort((x, y) => y.a - x.a);
  const consumoTotal = consumo.reduce((s, r) => s + r.a, 0);

  // 3. Incidencias por torre: OTs started this month.
  const incidenciasMap = new Map<string, Grouped>();
  for (const o of ots) {
    if (!inMonth(o.fecha_inicio)) continue;
    bump(incidenciasMap, o.torre ?? 'Sin torre', 1, 0);
  }
  const incidencias = [...incidenciasMap.values()].sort((x, y) => y.a - x.a);
  const incidenciasTotal = incidencias.reduce((s, r) => s + r.a, 0);

  // 4. Tiempo de resolución por torre: OTs closed this month, avg (cierre - inicio) in days.
  const resolMap = new Map<string, { key: string; count: number; totalDays: number }>();
  let resolCount = 0;
  let resolTotalDays = 0;
  for (const o of ots) {
    if (!OT_CERRADA.has(o.status) || !inMonth(o.fecha_cierre) || !o.fecha_inicio || !o.fecha_cierre) continue;
    const d = Math.max(0, daysBetween(o.fecha_inicio, o.fecha_cierre));
    const key = o.torre ?? 'Sin torre';
    const g = resolMap.get(key) ?? { key, count: 0, totalDays: 0 };
    g.count += 1;
    g.totalDays += d;
    resolMap.set(key, g);
    resolCount += 1;
    resolTotalDays += d;
  }
  const resolucion: Grouped[] = [...resolMap.values()]
    .map((g) => ({ key: g.key, a: g.count, b: g.count ? g.totalDays / g.count : 0 }))
    .sort((x, y) => y.b - x.b);
  const resolProm = resolCount ? resolTotalDays / resolCount : 0;

  // 5. Ventilaciones limpiadas por edificio: estado Realizada + fecha_finalizacion this month.
  // b holds the latest cleaning timestamp (ms) so `extra` can render the most recent date.
  const ventMap = new Map<string, Grouped>();
  for (const v of ventilaciones) {
    if (v.estado !== 'Realizada' || !inMonth(v.fecha_finalizacion)) continue;
    const key = v.edificio ?? 'Sin edificio';
    const g = ventMap.get(key) ?? { key, a: 0, b: 0, extra: '—' };
    g.a += 1;
    const ts = new Date(v.fecha_finalizacion!).getTime();
    if (ts >= g.b) {
      g.b = ts;
      g.extra = formatDate(v.fecha_finalizacion);
    }
    ventMap.set(key, g);
  }
  const ventilacionesLimpiadas = [...ventMap.values()].sort((x, y) => y.a - x.a);
  const ventTotal = ventilacionesLimpiadas.reduce((s, r) => s + r.a, 0);

  return {
    ingreso,
    ingresoTotal,
    consumo,
    consumoTotal,
    incidencias,
    incidenciasTotal,
    resolucion,
    resolProm,
    ventilacionesLimpiadas,
    ventTotal,
  };
}

export interface Share {
  key: string;
  value: number;
  pct: number; // share of the total (0–100)
  rest?: boolean; // true for the folded "Otros" bucket
}

/**
 * Top-`n` rows by `valueKey` (desc) plus the remainder folded into one "Otros (k)" bucket,
 * each carrying its share % of the total. Keeps a part-to-whole donut at ≤ n+1 legible slices
 * (docs/design-overrides.md §2: pie/donut only for part-to-whole, ≤6 segments). Rows whose
 * value is ≤0 are dropped — a share of nothing is not a slice.
 */
export function foldTopN(rows: Grouped[], valueKey: 'a' | 'b', n = 5): { slices: Share[]; total: number } {
  const sorted = rows.filter((r) => r[valueKey] > 0).sort((x, y) => y[valueKey] - x[valueKey]);
  const total = sorted.reduce((s, r) => s + r[valueKey], 0);
  const share = (v: number): number => (total ? (v / total) * 100 : 0);
  const slices: Share[] = sorted.slice(0, n).map((r) => ({ key: r.key, value: r[valueKey], pct: share(r[valueKey]) }));
  const rest = sorted.slice(n);
  const restSum = rest.reduce((s, r) => s + r[valueKey], 0);
  if (restSum > 0) slices.push({ key: `Otros (${rest.length})`, value: restSum, pct: share(restSum), rest: true });
  return { slices, total };
}

export interface MonthlyPoint {
  mes: string; // 'YYYY-MM'
  ingreso: number;
  consumo: number;
  incidencias: number;
  resolProm: number;
  ventilaciones: number;
}

/**
 * The 5 dashboard totals over the last `count` months up to and including `mes`,
 * one point per month (oldest → newest). Reuses buildDashboardStats per month so
 * the time series can never diverge from the single-month view — same aggregation,
 * just a wider window. Cheap: `sources` are the arrays the view already holds in
 * memory, so this adds no backend read. Feeds both the trend line and the
 * per-tile month-over-month deltas.
 */
export function buildMonthlyTrend(mes: string, sources: DashboardSources, count = 12): MonthlyPoint[] {
  const [y, m] = mes.split('-').map(Number);
  const points: MonthlyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1); // Date normalizes negative month indices across year boundaries
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const s = buildDashboardStats(ym, sources);
    points.push({
      mes: ym,
      ingreso: s.ingresoTotal,
      consumo: s.consumoTotal,
      incidencias: s.incidenciasTotal,
      resolProm: s.resolProm,
      ventilaciones: s.ventTotal,
    });
  }
  return points;
}
