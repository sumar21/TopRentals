// Pure, DOM-free monthly aggregations + the small delta/insight helpers for the Admin dashboard
// (components/dashboard/DashboardView). Extracted from the view so both the number-crunching and the
// label logic can be unit-checked (scripts/checks/run.ts) without React. `mes` is a 'YYYY-MM' key;
// rows are attributed to a month via `monthKey` before aggregating.
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../services/types.ts';

export interface Grouped {
  key: string;
  a: number; // primary numeric metric
  b: number; // secondary numeric metric — 0 when unused; carries the day-average for `resolucion`
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
  ingresoArticulo: Grouped[]; // desglose de ingreso por artículo (item), en paralelo al consumo por artículo
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
// Consumo = stock that physically left the shelf, read from the append-only movimientos_stock ledger
// (CLAUDE.md: "Toda mutación de stock escribe una fila en movimientos_stock"). This is the symmetric
// mirror of `ingreso` (positive deltas) and — crucially — includes 'Asignacion Repuesto', the movement
// written when a repuesto is assigned to an OT. Reading salidas_stock instead missed repuestos of OPEN
// OTs (their CONSUMIBLE salida is only written at close), so consumo under-reported. No double count:
// the close-time CONSUMIBLE salida writes NO movimiento, so a repuesto is counted once, at assign time.
// TRASLADO (internal relocation) and DEVOLUCION/DEVUELTO (returns) are not consumption → excluded.
const CONSUMO_MOV_TIPOS = new Set(['CONSUMIBLE', 'ASIGNACION', 'Asignacion Repuesto']);
const daysBetween = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000);

// Month attribution → 'YYYY-MM'. Plain SQL `date` values arrive as a bare 'YYYY-MM-DD' (already the local
// calendar day) and are sliced directly. `timestamptz` values (movimientos.fecha, ventilaciones.fecha_finalizacion,
// written with now()) arrive as a UTC ISO string with a time part; those are converted to the Argentina
// calendar month first, so a cleaning finalized at 22:00 AR (= 01:00 UTC the next day) counts in the right
// local month instead of leaking into the next one. Unparseable input falls back to the raw slice.
const AR_MONTH = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' });
export function monthKey(iso: string): string {
  if (!iso.includes('T')) return iso.slice(0, 7); // bare `date` → already the local calendar month
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 7);
  const parts = AR_MONTH.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  return y && m ? `${y}-${m}` : iso.slice(0, 7);
}

// Category label with a real fallback: `??` would keep an empty/whitespace string (migrated SharePoint
// text is dirty), silently producing a blank, invisible, self-merging category. `|| fallback` after a trim fixes it.
const named = (value: string | null | undefined, fallback: string) => value?.trim() || fallback;

// `salidas` stays in DashboardSources (DashboardView still uses it for the month picker), but the
// stats no longer read it — consumo now derives from movimientos_stock (see CONSUMO_MOV_TIPOS).
export function buildDashboardStats(mes: string, { movimientos, ots, ventilaciones }: DashboardSources): DashboardStats {
  const inMonth = (iso: string | null | undefined) => !!iso && monthKey(iso) === mes;
  const bump = (map: Map<string, Grouped>, key: string, a: number, b: number) => {
    const g = map.get(key) ?? { key, a: 0, b: 0 };
    g.a += a;
    g.b += b;
    map.set(key, g);
  };
  const articuloKey = (concat: string | null | undefined, id: number | null | undefined) =>
    named(concat, id != null ? `#${id}` : 'Sin artículo');

  // 1. Ingreso de stock: positive-delta movements (altas + reposiciones), grouped both by edificio
  //    (which building restocked) and by artículo (which item came in — the "desglose x item").
  const ingresoMap = new Map<string, Grouped>();
  const ingresoArtMap = new Map<string, Grouped>();
  for (const m of movimientos) {
    if (!inMonth(m.fecha)) continue;
    const delta = (m.cant_posterior ?? 0) - (m.cant_anterior ?? 0);
    if (delta <= 0) continue;
    bump(ingresoMap, named(m.edificio, 'Sin edificio'), delta, 0);
    bump(ingresoArtMap, articuloKey(m.concat_articulo, m.articulo_id), delta, 0);
  }
  const ingreso = [...ingresoMap.values()].sort((x, y) => y.a - x.a);
  const ingresoArticulo = [...ingresoArtMap.values()].sort((x, y) => y.a - x.a);
  const ingresoTotal = ingreso.reduce((s, r) => s + r.a, 0);

  // 2. Consumo por artículo: consumption-type movements from movimientos_stock (incl. OT repuestos).
  const consumoMap = new Map<string, Grouped>();
  for (const m of movimientos) {
    if (!inMonth(m.fecha) || !CONSUMO_MOV_TIPOS.has(m.tipo_movimiento)) continue;
    bump(consumoMap, articuloKey(m.concat_articulo, m.articulo_id), m.cantidad ?? 0, 0);
  }
  const consumo = [...consumoMap.values()].sort((x, y) => y.a - x.a);
  const consumoTotal = consumo.reduce((s, r) => s + r.a, 0);

  // 3. Incidencias por torre: OTs started this month.
  const incidenciasMap = new Map<string, Grouped>();
  for (const o of ots) {
    if (!inMonth(o.fecha_inicio)) continue;
    bump(incidenciasMap, named(o.torre, 'Sin torre'), 1, 0);
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
    const key = named(o.torre, 'Sin torre');
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

  // 5. Ventilaciones limpiadas por edificio: estado Realizada + fecha_finalizacion this month (count only).
  const ventMap = new Map<string, Grouped>();
  for (const v of ventilaciones) {
    if (v.estado !== 'Realizada' || !inMonth(v.fecha_finalizacion)) continue;
    bump(ventMap, named(v.edificio, 'Sin edificio'), 1, 0);
  }
  const ventilacionesLimpiadas = [...ventMap.values()].sort((x, y) => y.a - x.a);
  const ventTotal = ventilacionesLimpiadas.reduce((s, r) => s + r.a, 0);

  return {
    ingreso,
    ingresoTotal,
    ingresoArticulo,
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
  pct: number; // integer share of the total; the slices' pcts sum to exactly 100 (largest-remainder)
  rest?: boolean; // true for the folded "Otros" bucket
}

/**
 * Top-`n` rows by `valueKey` (desc) plus the remainder folded into one "Otros (k)" bucket. Percentages
 * are integers rounded so the slice set sums to exactly 100 (largest-remainder) — legend %s never read
 * 99/101. Keeps a part-to-whole donut at ≤ n+1 legible slices (docs/design-overrides.md §2: pie/donut
 * only for part-to-whole, ≤6 segments). Rows whose value is ≤0 are dropped — a share of nothing is not a slice.
 */
export function foldTopN(rows: Grouped[], valueKey: 'a' | 'b', n = 5): { slices: Share[]; total: number } {
  const sorted = rows.filter((r) => r[valueKey] > 0).sort((x, y) => y[valueKey] - x[valueKey]);
  const total = sorted.reduce((s, r) => s + r[valueKey], 0);
  const slices: Share[] = sorted.slice(0, n).map((r) => ({ key: r.key, value: r[valueKey], pct: 0 }));
  const rest = sorted.slice(n);
  const restSum = rest.reduce((s, r) => s + r[valueKey], 0);
  if (restSum > 0) slices.push({ key: `Otros (${rest.length})`, value: restSum, pct: 0, rest: true });
  if (total > 0) {
    // Largest-remainder rounding: floor every share, then hand the leftover points to the biggest fractions.
    const raw = slices.map((s) => (s.value / total) * 100);
    const pct = raw.map((v) => Math.floor(v));
    let left = 100 - pct.reduce((a, b) => a + b, 0);
    const byFrac = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
    for (let k = 0; k < byFrac.length && left > 0; k++) { pct[byFrac[k].i] += 1; left -= 1; }
    slices.forEach((s, i) => { s.pct = pct[i]; });
  }
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
 * The 5 dashboard totals over the last `count` months up to and including `mes` (oldest → newest).
 * Single pass per source, bucketed by `monthKey` — O(N) total, vs O(count·N) for rebuilding each month
 * (movimientos_stock is append-only and grows forever, so the per-month rebuild degraded linearly). The
 * predicates are byte-identical to buildDashboardStats, and a cross-check test pins the two together so
 * the trend can never diverge from the single-month view. Feeds the trend line and the per-tile deltas.
 */
export function buildMonthlyTrend(mes: string, { movimientos, ots, ventilaciones }: DashboardSources, count = 12): MonthlyPoint[] {
  interface Acc { ingreso: number; consumo: number; incidencias: number; resolDays: number; resolCount: number; ventilaciones: number }
  const buckets = new Map<string, Acc>();
  const at = (ym: string): Acc => {
    let a = buckets.get(ym);
    if (!a) { a = { ingreso: 0, consumo: 0, incidencias: 0, resolDays: 0, resolCount: 0, ventilaciones: 0 }; buckets.set(ym, a); }
    return a;
  };
  // Single pass over the ledger: positive deltas → ingreso, consumption-type movements → consumo
  // (byte-identical predicates to buildDashboardStats so the trend can never diverge from it).
  for (const m of movimientos) {
    if (!m.fecha) continue;
    const delta = (m.cant_posterior ?? 0) - (m.cant_anterior ?? 0);
    if (delta > 0) at(monthKey(m.fecha)).ingreso += delta;
    if (CONSUMO_MOV_TIPOS.has(m.tipo_movimiento)) at(monthKey(m.fecha)).consumo += m.cantidad ?? 0;
  }
  for (const o of ots) {
    if (o.fecha_inicio) at(monthKey(o.fecha_inicio)).incidencias += 1;
    if (OT_CERRADA.has(o.status) && o.fecha_inicio && o.fecha_cierre) {
      const b = at(monthKey(o.fecha_cierre));
      b.resolDays += Math.max(0, daysBetween(o.fecha_inicio, o.fecha_cierre));
      b.resolCount += 1;
    }
  }
  for (const v of ventilaciones) {
    if (v.estado === 'Realizada' && v.fecha_finalizacion) at(monthKey(v.fecha_finalizacion)).ventilaciones += 1;
  }

  const [y, mo] = mes.split('-').map(Number);
  const points: MonthlyPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, mo - 1 - i, 1); // Date normalizes negative month indices across year boundaries
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const b = buckets.get(ym);
    points.push({
      mes: ym,
      ingreso: b?.ingreso ?? 0,
      consumo: b?.consumo ?? 0,
      incidencias: b?.incidencias ?? 0,
      resolProm: b && b.resolCount ? b.resolDays / b.resolCount : 0,
      ventilaciones: b?.ventilaciones ?? 0,
    });
  }
  return points;
}

/**
 * Month-over-month delta label — NEUTRAL by design (arrow only, no green/red): on an ops board a
 * rise/fall isn't inherently good or bad. Prints "± 0%" whenever the change rounds to zero (exact
 * equality OR a sub-0.5% move), so it never contradicts itself with a "▲ 0%".
 */
export function deltaChip(cur: number, prev: number): string {
  if (prev === 0) return cur === prev ? '± 0% vs mes ant.' : '▲ vs mes ant.'; // % is undefined from a zero base
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (pct === 0) return '± 0% vs mes ant.';
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs mes ant.`;
}

/**
 * Peak/valley indices of a series plus flags for the two shapes the caption must word differently:
 * `allZero` (no data) and `flat` (constant, incl. all-zero) — where reporting "peak in X, valley in X"
 * would be misleading. On a genuine trend, maxIndex ≠ minIndex.
 */
export function trendExtremes(values: number[]): { maxIndex: number; minIndex: number; allZero: boolean; flat: boolean } {
  if (values.length === 0) return { maxIndex: -1, minIndex: -1, allZero: true, flat: true };
  let maxIndex = 0;
  let minIndex = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[maxIndex]) maxIndex = i;
    if (values[i] < values[minIndex]) minIndex = i;
  }
  return {
    maxIndex,
    minIndex,
    allZero: values.every((v) => v === 0),
    flat: values[maxIndex] === values[minIndex], // no variation across the window
  };
}
