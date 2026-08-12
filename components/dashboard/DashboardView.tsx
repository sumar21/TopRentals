// Dashboard (Admin-only) — monthly operations analytics requested by the client:
// stock intake, consumption per article, incidents (OTs) and resolution time by tower,
// and AC cleanings by building. Aggregation lives in utils/dashboardStats (pure + unit-checked);
// this file is presentation only. Everything reads from the existing services (no new backend),
// per CLAUDE.md "la UI habla SOLO con services/". Charts use recharts per DESIGN.md §10.
//
// Data-viz method (skill `dataviz`) applied to the recharts layer — the JOB picks the form:
//  · PART-TO-WHOLE (share of a total by building/tower/article) → donut. Grouped to top-5 +
//    "Otros" so the ring stays ≤6 legible slices — inside docs/design-overrides.md §2, which
//    permits pie/donut ONLY for part-to-whole at ≤6 segments. Averages are NOT part-to-whole
//    (they don't sum to a total), so "Tiempo de resolución" stays a BAR — a pie of averages
//    would be mathematically meaningless.
//  · MAGNITUDE that isn't a share (avg days per tower) → sorted horizontal bar, single hue.
//  · CHANGE-OVER-TIME → line: "Evolución mensual" plots a chosen total across a rolling
//    12-month window (the month filter throws the time axis away; the trend reads it back off
//    the same in-memory data).
//  · Color — donut segments use the dataviz *validated categorical* palette (blue/orange/aqua/
//    yellow/magenta; "Otros" neutral grey), NOT brand navy: TopRentals has no multi-hue brand
//    ramp, so the skill's reference instance is the honest source. Validated with
//    validate_palette.js on the white surface: 5 hues PASS every hard gate (CVD adjacent ΔE 9.1,
//    normal-vision 19.6); the sub-3:1 contrast WARN is relieved by the per-slice % labels + the
//    legend (identity never rests on hue alone). paddingAngle=2 = the mandated surface gap.
//    Bars and the trend line stay lone-series brand navy (contrast-validated on white).
//  · Marks — bars: thin, 4px rounded ends, direct end-labels. Line: 2px stroke, recessive grid,
//    dashed navy crosshair. Donut: center total, top-slice insight, labeled legend. Per-tile
//    month-over-month deltas are NEUTRAL (arrow only, no green/red) — on an ops board "more
//    incidencias" isn't "good", so a good/bad color would lie.
//  · Interaction — a single month filter scopes every card (never per-chart); the trend card
//    adds one metric selector; per-mark / crosshair hover everywhere.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Clock, Fan, PackageMinus, PackagePlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatCard } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { api } from '../../services/index.ts';
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../../services/types.ts';
import type { Grouped } from '../../utils/dashboardStats';
import { todayISO } from '../../utils/dates';
import { buildDashboardStats, buildMonthlyTrend, foldTopN } from '../../utils/dashboardStats';

// ── Chart chrome — brand navy series + recessive slate axes/grid (DESIGN.md §10) ──
const BRAND = '#23313E';       // single-series fill (brand navy; contrast-validated on white)
const GRID = '#eef0f2';        // hairline gridline, one shade off the surface
const CAT_INK = '#475569';     // category names + direct value labels (readable slate)
const AXIS_MUTED = '#94a3b8';  // numeric axis ticks (recessive)
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid #e4e4e7', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' };
const CURSOR = { fill: 'rgba(35,49,62,0.06)' };
// Donut segments: dataviz validated categorical palette (blue/orange/aqua/yellow/magenta) — the
// skill's reference instance, since TopRentals has no multi-hue brand ramp. Validated on white:
// 5 hues clear every hard gate (validate_palette.js). "Otros" is a de-emphasized neutral, not a hue.
const DONUT_HUES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4'];
const OTROS_GREY = '#64748b';
// recharts formatter typing is loose across versions; our callbacks stay simple and cast to any at the prop.

const num = (n: number) => n.toLocaleString('es-AR');
const oneDecimal = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};
// Compact axis label for the 12-month trend: "Ago", "Sep"… (window is 12 distinct months → no year needed).
const mesShort = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'short' }).replace('.', '');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Trend-chart metrics: the 5 monthly totals, each with its own value formatter and unit.
type MetricKey = 'incidencias' | 'consumo' | 'ingreso' | 'resolProm' | 'ventilaciones';
const TREND_METRICS: { value: MetricKey; label: string; fmt: (n: number) => string; unit: string }[] = [
  { value: 'incidencias', label: 'Incidencias (OTs)', fmt: num, unit: 'OTs' },
  { value: 'consumo', label: 'Consumo de stock', fmt: num, unit: 'u' },
  { value: 'ingreso', label: 'Ingreso de stock', fmt: num, unit: 'u' },
  { value: 'resolProm', label: 'Tiempo de resolución', fmt: oneDecimal, unit: 'días' },
  { value: 'ventilaciones', label: 'Aires limpiados', fmt: num, unit: '' },
];

// Month-over-month delta under each StatCard. NEUTRAL by design (arrow only, no trend color):
// on an ops board a rise/fall isn't inherently good or bad, so green/red would mislead.
const deltaChip = (cur: number, prev: number): string => {
  if (cur === prev) return '± 0% vs mes ant.';
  if (prev === 0) return '▲ vs mes ant.'; // % is undefined from a zero base
  const pct = Math.round(Math.abs((cur - prev) / prev) * 100);
  return `${cur > prev ? '▲' : '▼'} ${pct}% vs mes ant.`;
};

const ChartCard: React.FC<{ title: string; subtitle?: string; empty: boolean; emptyMsg: string; children: React.ReactNode }> = ({ title, subtitle, empty, emptyMsg, children }) => (
  <Card className="border shadow-sm overflow-hidden">
    <div className="border-b px-4 py-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-[11px] text-muted-foreground">{subtitle}</p>}
    </div>
    {empty ? <p className="px-4 py-12 text-center text-sm text-muted-foreground">{emptyMsg}</p> : <div className="p-4">{children}</div>}
  </Card>
);

/**
 * Sorted horizontal magnitude bar — the one chart recipe every metric on this dashboard uses.
 * Single series ⇒ single brand hue, no legend; the direct end-label keeps every value readable
 * without the tooltip. `valueKey` picks which Grouped metric drives bar length + the label.
 */
const MagnitudeBar: React.FC<{
  data: Grouped[];
  valueKey: 'a' | 'b';
  label: (v: number) => string;          // direct bar-end label + primary tooltip value
  tooltipName: string;                   // tooltip series name
  tooltipExtra?: (g: Grouped) => string; // optional richer tooltip (e.g. cost, last date)
  allowDecimals?: boolean;
}> = ({ data, valueKey, label, tooltipName, tooltipExtra, allowDecimals = false }) => (
  <ResponsiveContainer width="100%" height={Math.max(180, data.length * 40)}>
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }} barCategoryGap="24%">
      <CartesianGrid stroke={GRID} horizontal={false} />
      <XAxis type="number" tick={{ fontSize: 11, fill: AXIS_MUTED }} axisLine={false} tickLine={false} allowDecimals={allowDecimals} />
      <YAxis type="category" dataKey="key" tick={{ fontSize: 11, fill: CAT_INK }} axisLine={false} tickLine={false} width={150} />
      <Tooltip
        cursor={CURSOR}
        contentStyle={TOOLTIP_STYLE}
        formatter={((_v: number, _n: string, p: any) => [tooltipExtra ? tooltipExtra(p.payload as Grouped) : label(p.payload[valueKey]), tooltipName]) as any}
      />
      <Bar dataKey={valueKey} fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
        <LabelList dataKey={valueKey} position="right" formatter={((v: number) => label(v)) as any} style={{ fontSize: 11, fill: CAT_INK, fontWeight: 500 }} />
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

/**
 * Change-over-time line — one navy series over the rolling 12-month window. No legend
 * (single series; the card title names it), recessive horizontal grid, dashed navy crosshair
 * on hover so any month's exact value is readable without a per-point label.
 */
const TrendLine: React.FC<{
  data: { mes: string; label: string; value: number }[];
  fmt: (v: number) => string;
  name: string;
  allowDecimals?: boolean;
}> = ({ data, fmt, name, allowDecimals = false }) => (
  <ResponsiveContainer width="100%" height={260}>
    <LineChart data={data} margin={{ top: 12, right: 20, left: 4, bottom: 4 }}>
      <CartesianGrid stroke={GRID} vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: AXIS_MUTED }} axisLine={false} tickLine={false} />
      <YAxis tick={{ fontSize: 11, fill: AXIS_MUTED }} axisLine={false} tickLine={false} width={40} allowDecimals={allowDecimals} />
      <Tooltip
        cursor={{ stroke: BRAND, strokeWidth: 1, strokeDasharray: '4 4' }}
        contentStyle={TOOLTIP_STYLE}
        labelFormatter={((_l: string, p: any) => (p?.[0]?.payload ? mesLabel(p[0].payload.mes) : _l)) as any}
        formatter={((v: number) => [fmt(v), name]) as any}
      />
      <Line type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} dot={{ r: 2.5, fill: BRAND, strokeWidth: 0 }} activeDot={{ r: 4 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
);

/**
 * Part-to-whole donut — share of a total across categories. Folded to top-5 + "Otros" (≤6 slices),
 * segments in the validated categorical palette with a 2px surface gap (paddingAngle). Center holds
 * the total; a top-slice insight and a labeled legend (dot + name + value + %) carry identity so it
 * never rests on hue alone — which also relieves the sub-3:1 contrast of the lighter hues.
 */
const Donut: React.FC<{
  rows: Grouped[];
  valueKey: 'a' | 'b';
  label: (v: number) => string;
  unit?: string;
}> = ({ rows, valueKey, label, unit }) => {
  const { slices, total } = useMemo(() => foldTopN(rows, valueKey, 5), [rows, valueKey]);
  if (slices.length === 0) return null;
  const colored = slices.map((s, i) => ({ ...s, fill: s.rest ? OTROS_GREY : DONUT_HUES[i] }));
  const top = colored[0];
  return (
    <div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{top.key}</span> concentra el {top.pct.toFixed(0)}%.
      </p>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={colored} dataKey="value" nameKey="key" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="#fff" strokeWidth={2} isAnimationActive={false}>
                {colored.map((s) => <Cell key={s.key} fill={s.fill} />)}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={((v: number, n: string) => [`${label(v)}${unit ? ` ${unit}` : ''} · ${((v / total) * 100).toFixed(0)}%`, n]) as any}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold tabular-nums">{label(total)}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{unit || 'total'}</span>
          </div>
        </div>
        <ul className="w-full space-y-1.5 text-xs sm:max-w-[240px]">
          {colored.map((s) => (
            <li key={s.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.fill }} />
              <span className="min-w-0 flex-1 truncate">{s.key}</span>
              <span className="tabular-nums text-muted-foreground">{label(s.value)}</span>
              <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{s.pct.toFixed(0)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const DashboardView: React.FC = () => {
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [salidas, setSalidas] = useState<SalidaStock[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mes, setMes] = useState<string>(todayISO().slice(0, 7));
  const [metric, setMetric] = useState<MetricKey>('incidencias');

  const load = useCallback(async (silent = false) => {
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const [mov, sal, o, v] = await Promise.all([api.stock.movimientos(), api.stock.salidas(), api.ots.list(), api.ventilaciones.list()]);
      setMovimientos(mov);
      setSalidas(sal);
      setOts(o);
      setVentilaciones(v);
    } catch {
      if (!silent) setLoadError(true);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Realtime: silent refetch when any source table changes — no loader flash.
  useEffect(() => api.realtime.subscribe(['movimientos', 'salidas', 'ots', 'ventilaciones'], () => { void load(true); }), [load]);

  const mesOptions = useMemo(() => {
    const set = new Set<string>([todayISO().slice(0, 7)]);
    movimientos.forEach((m) => m.fecha && set.add(m.fecha.slice(0, 7)));
    salidas.forEach((s) => s.fecha_salida && set.add(s.fecha_salida.slice(0, 7)));
    ots.forEach((o) => o.fecha_inicio && set.add(o.fecha_inicio.slice(0, 7)));
    ots.forEach((o) => o.fecha_cierre && set.add(o.fecha_cierre.slice(0, 7)));
    ventilaciones.forEach((v) => v.fecha_finalizacion && set.add(v.fecha_finalizacion.slice(0, 7)));
    return [...set].sort().reverse().map((ym) => ({ value: ym, label: mesLabel(ym) }));
  }, [movimientos, salidas, ots, ventilaciones]);

  const data = useMemo(
    () => buildDashboardStats(mes, { movimientos, salidas, ots, ventilaciones }),
    [movimientos, salidas, ots, ventilaciones, mes],
  );

  // Rolling 12-month trend (oldest → newest) ending at the selected month. Feeds the line
  // chart and the per-tile deltas; reuses buildDashboardStats so it can't drift from `data`.
  const trend = useMemo(
    () => buildMonthlyTrend(mes, { movimientos, salidas, ots, ventilaciones }, 12),
    [movimientos, salidas, ots, ventilaciones, mes],
  );
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null; // previous month, for the deltas
  const metricCfg = TREND_METRICS.find((mm) => mm.value === metric)!;
  const serie = useMemo(() => trend.map((p) => ({ mes: p.mes, label: mesShort(p.mes), value: p[metric] })), [trend, metric]);
  const hasTrend = useMemo(
    () => trend.some((p) => p.ingreso || p.consumo || p.incidencias || p.resolProm || p.ventilaciones),
    [trend],
  );
  // Auto insight: peak/valley month of the selected metric across the window (like "Pico en Jul; valle en Feb").
  const insight = useMemo(() => {
    if (serie.every((p) => p.value === 0)) return 'Sin datos en la ventana de 12 meses.';
    let maxI = 0;
    let minI = 0;
    serie.forEach((p, i) => {
      if (p.value > serie[maxI].value) maxI = i;
      if (p.value < serie[minI].value) minI = i;
    });
    return `Pico en ${serie[maxI].label}; valle en ${serie[minI].label}.`;
  }, [serie]);

  const hasAny =
    data.ingreso.length + data.consumo.length + data.incidencias.length + data.resolucion.length + data.ventilacionesLimpiadas.length > 0;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">Resumen operativo del mes</p>
        </div>
        {/* Single filter row: scopes every chart below to the same month (never per-chart). */}
        <div className="w-full sm:w-56">
          <Select value={mes} onChange={setMes} options={mesOptions} placeholder="Mes" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando dashboard…" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={() => window.location.reload()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard title="Ingreso de stock" value={num(data.ingresoTotal)} icon={PackagePlus} subtext={prev ? deltaChip(data.ingresoTotal, prev.ingreso) : 'unidades'} />
            <StatCard title="Consumo" value={num(data.consumoTotal)} icon={PackageMinus} subtext={prev ? deltaChip(data.consumoTotal, prev.consumo) : 'unidades'} />
            <StatCard title="Incidencias" value={num(data.incidenciasTotal)} icon={ClipboardList} subtext={prev ? deltaChip(data.incidenciasTotal, prev.incidencias) : 'OTs del mes'} />
            <StatCard title="Tiempo de resolución" value={oneDecimal(data.resolProm)} icon={Clock} subtext={prev ? deltaChip(data.resolProm, prev.resolProm) : 'días promedio'} />
            <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext={prev ? deltaChip(data.ventTotal, prev.ventilaciones) : 'ventilaciones'} />
          </div>

          {hasTrend && (
            <ChartCard title={`Evolución mensual · ${metricCfg.label}`} subtitle={insight} empty={false} emptyMsg="">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[11px] text-muted-foreground">Últimos 12 meses · total por mes</p>
                <div className="w-full sm:w-56">
                  <Select
                    value={metric}
                    onChange={(v) => setMetric(v as MetricKey)}
                    options={TREND_METRICS.map((mm) => ({ value: mm.value, label: mm.label }))}
                    placeholder="Métrica"
                  />
                </div>
              </div>
              <TrendLine data={serie} fmt={metricCfg.fmt} name={metricCfg.label} allowDecimals={metric === 'resolProm'} />
            </ChartCard>
          )}

          {!hasAny ? (
            <EmptyState icon={BarChart3} title="Sin datos este mes" message="No hay movimientos, OTs ni ventilaciones registrados en el mes seleccionado." />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Ingreso de stock por edificio" subtitle="Participación por edificio" empty={data.ingreso.length === 0} emptyMsg="Sin ingresos de stock este mes.">
                <Donut rows={data.ingreso} valueKey="a" label={num} unit="u" />
              </ChartCard>

              <ChartCard title="Consumo por artículo" subtitle="Participación por artículo" empty={data.consumo.length === 0} emptyMsg="Sin consumo registrado este mes.">
                <Donut rows={data.consumo} valueKey="a" label={num} unit="u" />
              </ChartCard>

              <ChartCard title="Incidencias por torre" subtitle="Participación por torre" empty={data.incidencias.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                <Donut rows={data.incidencias} valueKey="a" label={num} unit="OTs" />
              </ChartCard>

              <ChartCard title="Tiempo de resolución por torre" subtitle="Días promedio de cierre (promedios no van en torta)" empty={data.resolucion.length === 0} emptyMsg="Sin OTs cerradas este mes.">
                <MagnitudeBar
                  data={data.resolucion}
                  valueKey="b"
                  label={oneDecimal}
                  tooltipName="Promedio"
                  tooltipExtra={(g) => `${oneDecimal(g.b)} días · ${num(g.a)} OTs`}
                  allowDecimals
                />
              </ChartCard>

              <ChartCard title="Ventilaciones limpiadas por edificio" subtitle="Participación por edificio" empty={data.ventilacionesLimpiadas.length === 0} emptyMsg="No se limpiaron aires este mes.">
                <Donut rows={data.ventilacionesLimpiadas} valueKey="a" label={num} unit="limpiezas" />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardView;
