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
//  · Color — donut/stacked-bar segments use a jewel-tone *categorical* palette tuned to the navy
//    brand (ocean-blue / terracotta / emerald / amber / wine; "Otros" neutral slate), NOT tints of
//    navy: a single-hue ramp over nominal categories is the banned multi-tint anti-pattern. Muted
//    "on-brand" hues failed the chroma floor (colour-blind viewers can't separate near-gray hues),
//    so the palette is deep-but-rich, not desaturated. Validated with scripts/checks/validate_palette.js on white:
//    PASSes every hard gate (CVD adjacent ΔE 9.7, normal-vision 20.5); the amber's sub-3:1 contrast
//    WARN is relieved by the per-slice % labels + legend (identity never rests on hue alone).
//    paddingAngle=2 = the mandated surface gap. Bars and the trend/sparkline stay lone-series navy.
//  · Marks — bars: thin, 4px rounded ends, direct end-labels. Line: 2px stroke, recessive grid,
//    dashed navy crosshair. Donut: center total, top-slice insight, labeled legend. Per-tile
//    month-over-month deltas are NEUTRAL (arrow only, no green/red) — on an ops board "more
//    incidencias" isn't "good", so a good/bad color would lie.
//  · Interaction — a single month filter scopes every card (never per-chart); the trend card
//    adds one metric selector; per-mark / crosshair hover everywhere.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Building2, ClipboardList, Clock, Fan, LayoutDashboard, PackageMinus, PackagePlus, TrendingUp, Trophy, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatCard, Tabs, TabsList, TabsTrigger } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { LoadErrorState } from '../LoadErrorState';
import { EmptyState } from '../EmptyState';
import { api } from '../../services/index.ts';
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Usuario, Ventilacion } from '../../services/types.ts';
import type { Grouped, MonthlyPoint } from '../../utils/dashboardStats';
import { todayISO } from '../../utils/dates';
import { buildDashboardStats, buildMonthlyTrend, deltaChip, foldTopN, monthKey, trendExtremes } from '../../utils/dashboardStats';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuth } from '../../contexts/AuthContext';
import { canSeeGeneralDashboard } from '../../utils/permissions.ts';

// ── Chart chrome — theme-aware (DESIGN.md §10). recharts pinta fill/stroke como ATRIBUTOS SVG, donde
// `var(--x)` NO resuelve → los colores se eligen por tema con este hook. En claro: navy de marca + slate
// recesivo; en oscuro: navy ACLARADO (el #23313E se pierde sobre fondo oscuro), grises invertidos y
// superficie de card oscura para los gaps del pie / anillo de dots / fondo del tooltip. ──
function useChartColors() {
  const dark = useTheme().theme === 'dark';
  return {
    BRAND: dark ? '#6f9bc4' : '#23313E',    // single-series fill (aclarado en oscuro para verse)
    GRID: dark ? '#27272a' : '#eef0f2',     // hairline gridline
    CAT_INK: dark ? '#a1a1aa' : '#475569',  // category names + direct value labels
    AXIS_MUTED: dark ? '#71717a' : '#94a3b8',
    SURFACE: dark ? '#18181b' : '#ffffff',  // gaps del pie / anillo de dots / fondo del tooltip (= card)
    TOOLTIP_STYLE: {
      fontSize: 12,
      borderRadius: 8,
      boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
      border: `1px solid ${dark ? '#3f3f46' : '#e4e4e7'}`,
      background: dark ? '#18181b' : '#ffffff',
      color: dark ? '#e4e4e7' : '#18181b',
    },
    CURSOR: { fill: dark ? 'rgba(255,255,255,0.06)' : 'rgba(35,49,62,0.06)' },
  };
}
// Donut/stacked-bar segments: a jewel-tone categorical palette tuned to the navy brand — deeper and
// more editorial than the dataviz bright default, with slot 1 (the largest slice) an ocean blue in the
// navy family for cohesion. ocean-blue / terracotta / emerald / amber / wine. Validated on white
// (scripts/checks/validate_palette.js): clears every hard gate — CVD adjacent ΔE 9.7 (≥8), normal-vision 20.5 (≥15);
// the amber's sub-3:1 contrast WARN is relieved by the per-slice % labels + legend. "Otros" is a
// de-emphasized slate neutral, not a hue.
// Hues are assigned by RANK within each chart (slice i → DONUT_HUES[i]), NOT by a stable per-entity map.
// That's intentional: these are top-N-fold charts over an UNBOUNDED category universe (many buildings/
// articles), and with 5 hues a stable per-entity mapping cannot guarantee distinct colours within a
// visible ring (pigeonhole → two same-coloured adjacent slices, worse than the cross-chart inconsistency
// it would fix). The per-chart legend carries identity, so rank-based is the correct call here.
const DONUT_HUES = ['#215f9c', '#cc5a2f', '#12906c', '#c78f1a', '#9a487a'];
const OTROS_GREY = '#64748b';
// recharts formatter typing is loose across versions; our callbacks stay simple and cast to any at the prop.

const num = (n: number) => n.toLocaleString('es-AR');
const oneDecimal = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  const s = new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1); // es-AR month is lowercase-first; match mesShort + VentilacionesView
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
// Hoisted: the metric-selector options never change, so build them once (not per render).
const TREND_SELECT_OPTIONS = TREND_METRICS.map((mm) => ({ value: mm.value, label: mm.label }));

// Botonera de secciones del dashboard — una pestaña por dominio. Los gráficos existentes se
// redistribuyen acá y cada pestaña suma métricas propias del dominio (dataviz-consistente).
const DASH_TABS = [
  { value: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { value: 'ots', label: 'OTs', icon: ClipboardList },
  { value: 'consumos', label: 'Consumos', icon: PackageMinus },
  { value: 'ingresos', label: 'Ingresos', icon: PackagePlus },
  { value: 'ventilaciones', label: 'Ventilaciones', icon: Fan },
] as const;
type DashTab = (typeof DASH_TABS)[number]['value'];

// Stable React key for a slice: the folded "Otros" bucket gets a reserved key so it can never collide
// with a real category literally named "Otros (n)" (migrated free-text data). Real keys are unique per aggregation.
const sliceKey = (s: { key: string; rest?: boolean }) => (s.rest ? '__otros__' : s.key);

// Clave de edificio/torre — idéntica a `named(m.edificio, 'Sin edificio')` de dashboardStats, para que el
// filtro por torre matchee exactamente los grupos de las agregaciones.
const edificioKey = (e?: string | null) => e?.trim() || 'Sin edificio';

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
}> = ({ data, valueKey, label, tooltipName, tooltipExtra, allowDecimals = false }) => {
  const { GRID, AXIS_MUTED, CAT_INK, CURSOR, TOOLTIP_STYLE, BRAND } = useChartColors();
  return (
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
};

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
}> = ({ data, fmt, name, allowDecimals = false }) => {
  const { GRID, AXIS_MUTED, BRAND, TOOLTIP_STYLE, SURFACE } = useChartColors();
  return (
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
      <Line type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={{ r: 4, fill: BRAND, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
  );
};

/**
 * Part-to-whole donut — share of a total across categories. Folded to top-5 + "Otros" (≤6 slices),
 * segments in the validated categorical palette with a 2px surface gap (paddingAngle). Center holds
 * the total; a top-slice insight and a labeled legend (dot + name + value + %) carry identity so it
 * never rests on hue alone — which also relieves the sub-3:1 contrast of the lighter hues.
 */
const DonutBase: React.FC<{
  rows: Grouped[];
  valueKey: 'a' | 'b';
  label: (v: number) => string;
  unit?: string;
  // Desglose opcional por slice (key → sub-ítems): cuando está, el tooltip muestra el detalle
  // (p. ej. "qué productos se consumieron" en el edificio bajo el mouse) en vez del valor pelado.
  detail?: Record<string, Grouped[]>;
}> = ({ rows, valueKey, label, unit, detail }) => {
  const { SURFACE, TOOLTIP_STYLE } = useChartColors();
  const { slices, total } = useMemo(() => foldTopN(rows, valueKey, 5), [rows, valueKey]);
  if (slices.length === 0) return null;
  const colored = slices.map((s, i) => ({ ...s, fill: s.rest ? OTROS_GREY : DONUT_HUES[i] }));
  const top = colored[0];

  // Tooltip enriquecido, para TODO donut: total del slice + desglose (top 6). Para el bucket "Otros"
  // el desglose son los ítems que se plegaron (foldTopN.members); para un slice normal, el desglose
  // propio del gráfico si lo trae (p. ej. consumo por edificio → artículos). Sin desglose → sólo el total.
  const DetailTooltip = ({ active, payload }: { active?: boolean; payload?: { payload: { key: string; value: number; rest?: boolean; members?: { key: string; value: number }[] } }[] }) => {
    if (!active || !payload?.length) return null;
    const p = payload[0].payload;
    const items = p.rest ? (p.members ?? []) : (detail?.[p.key] ?? []).map((g) => ({ key: g.key, value: g.a }));
    return (
      <div style={{ ...TOOLTIP_STYLE, padding: '8px 10px', maxWidth: 240 }}>
        <div className={items.length > 0 ? 'mb-1 flex items-center justify-between gap-3' : 'flex items-center justify-between gap-3'}>
          <span className="font-semibold">{p.key}</span>
          <span className="tabular-nums text-muted-foreground">{label(p.value)}{unit ? ` ${unit}` : ''}</span>
        </div>
        {items.length > 0 && (
          <ul className="space-y-0.5">
            {items.slice(0, 6).map((it) => (
              <li key={it.key} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="min-w-0 truncate text-muted-foreground">{it.key}</span>
                <span className="tabular-nums">{label(it.value)}</span>
              </li>
            ))}
            {items.length > 6 && <li className="text-[11px] text-muted-foreground">+{items.length - 6} más…</li>}
          </ul>
        )}
      </div>
    );
  };
  return (
    <div>
      <p className="mb-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-foreground">{top.key}</span> concentra el {top.pct.toFixed(0)}%.
      </p>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
        <div className="relative h-[200px] w-[200px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={colored} dataKey="value" nameKey="key" cx="50%" cy="50%" innerRadius={62} outerRadius={92} paddingAngle={2} stroke={SURFACE} strokeWidth={2} isAnimationActive={false}>
                {colored.map((s) => <Cell key={sliceKey(s)} fill={s.fill} />)}
              </Pie>
              <Tooltip
                // El total central del donut es un div absolute posterior en el DOM → se pinta encima del
                // tooltip. Elevamos el wrapper para que quede por arriba (no transparente).
                wrapperStyle={{ zIndex: 50 }}
                content={<DetailTooltip />}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold">{label(total)}</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{unit ?? 'total'}</span>
          </div>
        </div>
        <ul className="w-full space-y-1.5 text-xs sm:max-w-[240px]">
          {colored.map((s) => (
            <li key={sliceKey(s)} className="flex items-center gap-2">
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
const Donut = React.memo(DonutBase); // props are stable refs (memoized data + module-const formatters) → skips re-render on metric change

/** Tiny axis-less navy trend for the hero header — shape at a glance, no exact reads (the big number carries those). */
const Sparkline: React.FC<{ data: number[] }> = ({ data }) => {
  const { BRAND } = useChartColors();
  return (
  <ResponsiveContainer width="100%" height={48}>
    <LineChart data={data.map((value, i) => ({ i, value }))} margin={{ top: 4, right: 2, left: 2, bottom: 4 }}>
      <Line type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" dot={false} isAnimationActive={false} />
    </LineChart>
  </ResponsiveContainer>
  );
};

/**
 * 100%-stacked share bar — the colorful part-to-whole strip for the hero (top-5 + "Otros").
 * flex-grow makes segment widths proportional to value while the 2px gap gives the mandated
 * surface separation; an inline legend (dot + name + %) keeps identity off hue-alone.
 */
const StackedShareBar: React.FC<{ rows: Grouped[]; valueKey: 'a' | 'b' }> = ({ rows, valueKey }) => {
  const { slices } = useMemo(() => foldTopN(rows, valueKey, 5), [rows, valueKey]);
  if (slices.length === 0) return <p className="text-xs text-muted-foreground">Sin datos este mes.</p>;
  const colored = slices.map((s, i) => ({ ...s, fill: s.rest ? OTROS_GREY : DONUT_HUES[i] }));
  return (
    <div className="space-y-2.5">
      <div className="flex h-3 w-full gap-[2px]">
        {colored.map((s) => (
          <div key={sliceKey(s)} className="rounded-[2px]" style={{ flexGrow: s.value, backgroundColor: s.fill }} title={`${s.key} · ${s.pct.toFixed(0)}%`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        {colored.map((s) => (
          <span key={sliceKey(s)} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: s.fill }} />
            <span className="min-w-0 max-w-[140px] truncate text-muted-foreground">{s.key}</span>
            <span className="font-semibold tabular-nums">{s.pct.toFixed(0)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
};

/**
 * Hero card — the dashboard's headline metric, larger than every other card (size hierarchy).
 * Big number + neutral delta + sparkline on top; a colored 100%-stacked share strip in the middle;
 * a footer with the previous month and the 12-month average.
 */
const HeroCardBase: React.FC<{
  caption: string;
  total: number;
  unit: string;
  prev: number | null;
  spark: number[];
  avg: number;
  rows: Grouped[];
}> = ({ caption, total, unit, prev, spark, avg, rows }) => (
  <Card className="flex h-full flex-col border shadow-sm">
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{caption}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight">{num(total)}</span>
            <span className="text-sm text-muted-foreground">{unit}</span>
          </div>
          {prev != null && <p className="mt-1 text-xs text-muted-foreground">{deltaChip(total, prev)}</p>}
        </div>
        <div className="w-28 shrink-0 sm:w-44"><Sparkline data={spark} /></div>
      </div>
      <div>
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Por torre</p>
        <StackedShareBar rows={rows} valueKey="a" />
      </div>
      <div className="mt-auto flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
        <span>Mes anterior: <span className="font-semibold tabular-nums text-foreground">{prev != null ? num(prev) : '—'}</span></span>
        <span>Promedio 12m: <span className="font-semibold tabular-nums text-foreground">{num(avg)}</span></span>
      </div>
    </div>
  </Card>
);
const HeroCard = React.memo(HeroCardBase); // stable props → doesn't re-render when only the trend metric changes

const DashboardView: React.FC = () => {
  const { user } = useAuth();
  // Admin ve TODO el portfolio solo con el flag dashboard_global; el resto queda acotado a las
  // torres de edificios_dash (lista de nombres) — la ruta/sidebar siguen siendo Admin-only
  // (utils/permissions.ts), esto solo decide el CONTENIDO de la vista.
  const global = !!user && canSeeGeneralDashboard(user);

  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [salidas, setSalidas] = useState<SalidaStock[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mes, setMes] = useState<string>(todayISO().slice(0, 7));
  const [metric, setMetric] = useState<MetricKey>('incidencias');
  const [tab, setTab] = useState<DashTab>('resumen');
  // Filtro por torre, independiente por sección (Ingresos / Consumos). '' = todas las torres.
  // Solo aplica con dashboard global: un usuario scopeado ya está acotado a su edificio.
  const [ingTorre, setIngTorre] = useState('');
  const [conTorre, setConTorre] = useState('');

  // Monotonic request id: the initial mount fetch and any realtime-triggered refetch can overlap, so
  // stamp each call and only the newest one is allowed to commit — a slow earlier response can't clobber
  // a fresher one (also makes StrictMode's dev double-mount harmless).
  const reqSeq = useRef(0);
  const load = useCallback(async (silent = false) => {
    const myId = ++reqSeq.current;
    if (!silent) { setLoading(true); setLoadError(false); }
    try {
      const [mov, sal, o, v, us] = await Promise.all([api.stock.movimientos(), api.stock.salidas(), api.ots.list(), api.ventilaciones.list(), api.usuarios.list()]);
      if (myId !== reqSeq.current) return; // superseded by a newer load() — drop the stale response
      setMovimientos(mov);
      setSalidas(sal);
      setOts(o);
      setVentilaciones(v);
      setUsuarios(us);
    } catch {
      if (myId === reqSeq.current && !silent) setLoadError(true);
    } finally {
      if (myId === reqSeq.current && !silent) setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  // Realtime: silent refetch when any source table changes — no loader flash.
  useEffect(() => api.realtime.subscribe(['movimientos', 'salidas', 'ots', 'ventilaciones'], () => { void load(true); }), [load]);

  // Usuario scopeado (no global): sus torres asignadas viven en `edificios_dash`, una lista de
  // NOMBRES separada por ';' (mismo patrón que emails_notificacion.emails) — no hay lookup por id
  // ni fetch adicional, están en el propio `user`. Vacío = sin torres asignadas (empty state).
  const misEdificiosNombres = useMemo(
    () => (user?.edificios_dash ?? '').split(';').map((s) => s.trim()).filter(Boolean),
    [user],
  );
  // Set normalizado (edificioKey) para matchear los grupos de las agregaciones. Con dashboard
  // global no se usa (sin filtro); con un usuario scopeado sin torres asignadas, un Set vacío
  // filtra todo afuera naturalmente (ningún `.has()` da true) sin una rama extra.
  const misEdificiosSet = useMemo(() => new Set(misEdificiosNombres.map(edificioKey)), [misEdificiosNombres]);
  const movimientosScoped = useMemo(() => (global ? movimientos : movimientos.filter((m) => misEdificiosSet.has(edificioKey(m.edificio)))), [movimientos, misEdificiosSet, global]);
  const otsScoped = useMemo(() => (global ? ots : ots.filter((o) => misEdificiosSet.has(edificioKey(o.torre)))), [ots, misEdificiosSet, global]);
  const ventilacionesScoped = useMemo(() => (global ? ventilaciones : ventilaciones.filter((v) => misEdificiosSet.has(edificioKey(v.edificio)))), [ventilaciones, misEdificiosSet, global]);
  // `salidas` no tiene edificio propio (services/types.ts) → no se puede acotar por torre; queda
  // fuera de buildDashboardStats/buildMonthlyTrend (no las leen), así que esto no filtra datos reales.

  const mesOptions = useMemo(() => {
    const set = new Set<string>([todayISO().slice(0, 7)]);
    const add = (iso: string | null | undefined) => { if (iso) set.add(monthKey(iso)); };
    movimientosScoped.forEach((m) => add(m.fecha));
    salidas.forEach((s) => add(s.fecha_salida));
    otsScoped.forEach((o) => { add(o.fecha_inicio); add(o.fecha_cierre); });
    ventilacionesScoped.forEach((v) => add(v.fecha_finalizacion));
    return [...set].sort().reverse().map((ym) => ({ value: ym, label: mesLabel(ym) }));
  }, [movimientosScoped, salidas, otsScoped, ventilacionesScoped]);

  // Keep the selected month valid: if a realtime update drops the row that was its only source, the month
  // leaves mesOptions — snap back to the newest available (options are sorted newest-first) instead of a dangling value.
  useEffect(() => {
    if (mesOptions.length && !mesOptions.some((o) => o.value === mes)) setMes(mesOptions[0].value);
  }, [mesOptions, mes]);

  const data = useMemo(
    () => buildDashboardStats(mes, { movimientos: movimientosScoped, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }),
    [movimientosScoped, salidas, otsScoped, ventilacionesScoped, mes],
  );

  // Rolling 12-month trend (oldest → newest) ending at the selected month. Feeds the line
  // chart and the per-tile deltas; reuses buildDashboardStats so it can't drift from `data`.
  const trend = useMemo(
    () => buildMonthlyTrend(mes, { movimientos: movimientosScoped, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }, 12),
    [movimientosScoped, salidas, otsScoped, ventilacionesScoped, mes],
  );
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null; // previous month, for the deltas

  // Torres disponibles (según los movimientos de stock) para el filtro de las secciones Ingresos/Consumos.
  // Solo tiene sentido con dashboard global — un usuario scopeado ya está acotado a una sola torre
  // (el selector se oculta en el JSX).
  const torreOptions = useMemo(() => {
    const set = new Set<string>();
    movimientosScoped.forEach((m) => set.add(edificioKey(m.edificio)));
    return [{ value: '', label: 'Todas las torres' }, ...[...set].sort().map((t) => ({ value: t, label: t }))];
  }, [movimientosScoped]);

  // Stats + trend scopeados por torre. Sin torre seleccionada devuelven `data`/`trend` (sin recomputar):
  // el filtro sólo acota los movimientos (ingreso/consumo dependen de ellos); OTs/ventilaciones no cambian.
  const ingMovs = useMemo(() => (ingTorre ? movimientosScoped.filter((m) => edificioKey(m.edificio) === ingTorre) : movimientosScoped), [movimientosScoped, ingTorre]);
  const conMovs = useMemo(() => (conTorre ? movimientosScoped.filter((m) => edificioKey(m.edificio) === conTorre) : movimientosScoped), [movimientosScoped, conTorre]);
  const ingData = useMemo(() => (ingTorre ? buildDashboardStats(mes, { movimientos: ingMovs, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }) : data), [ingTorre, mes, ingMovs, salidas, otsScoped, ventilacionesScoped, data]);
  const conData = useMemo(() => (conTorre ? buildDashboardStats(mes, { movimientos: conMovs, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }) : data), [conTorre, mes, conMovs, salidas, otsScoped, ventilacionesScoped, data]);
  const ingTrend = useMemo(() => (ingTorre ? buildMonthlyTrend(mes, { movimientos: ingMovs, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }, 12) : trend), [ingTorre, mes, ingMovs, salidas, otsScoped, ventilacionesScoped, trend]);
  const conTrend = useMemo(() => (conTorre ? buildMonthlyTrend(mes, { movimientos: conMovs, salidas, ots: otsScoped, ventilaciones: ventilacionesScoped }, 12) : trend), [conTorre, mes, conMovs, salidas, otsScoped, ventilacionesScoped, trend]);
  const ingPrev = ingTrend.length >= 2 ? ingTrend[ingTrend.length - 2] : null;
  const conPrev = conTrend.length >= 2 ? conTrend[conTrend.length - 2] : null;

  const metricCfg = TREND_METRICS.find((mm) => mm.value === metric)!;
  const serie = useMemo(() => trend.map((p) => ({ mes: p.mes, label: mesShort(p.mes), value: p[metric] })), [trend, metric]);
  const hasTrend = useMemo(
    () => trend.some((p) => p.ingreso || p.consumo || p.incidencias || p.resolProm || p.ventilaciones),
    [trend],
  );
  // Auto insight: peak/valley month of the selected metric across the window (like "Pico en Jul; valle en Feb").
  // A flat or all-zero series has no meaningful peak/valley, so it's worded differently (no "Pico en X; valle en X").
  const insight = useMemo(() => {
    const ex = trendExtremes(serie.map((p) => p.value));
    if (ex.allZero) return 'Sin datos en la ventana de 12 meses.';
    if (ex.flat) return 'Sin variación en la ventana de 12 meses.';
    return `Pico en ${serie[ex.maxIndex].label}; valle en ${serie[ex.minIndex].label}.`;
  }, [serie]);

  // Trend fijo por pestaña (reusa el mismo cálculo del selector del Resumen, pero atado a una métrica).
  // `tr` permite pasar un trend scopeado por torre (Ingresos/Consumos); por defecto usa el global.
  const serieOf = (tr: MonthlyPoint[], mk: MetricKey) => tr.map((p) => ({ mes: p.mes, label: mesShort(p.mes), value: p[mk] }));
  const trendInsight = (labels: string[], values: number[]) => {
    const ex = trendExtremes(values);
    if (ex.allZero) return 'Sin datos en la ventana de 12 meses.';
    if (ex.flat) return 'Sin variación en la ventana de 12 meses.';
    return `Pico en ${labels[ex.maxIndex]}; valle en ${labels[ex.minIndex]}.`;
  };
  const trendCard = (mk: MetricKey, tr: MonthlyPoint[] = trend) => {
    const cfg = TREND_METRICS.find((m) => m.value === mk)!;
    const s = serieOf(tr, mk);
    return (
      <ChartCard title={`Evolución mensual · ${cfg.label}`} subtitle={trendInsight(s.map((p) => p.label), s.map((p) => p.value))} empty={false} emptyMsg="">
        <p className="mb-3 text-[11px] text-muted-foreground">Últimos 12 meses · total por mes</p>
        <TrendLine data={s} fmt={cfg.fmt} name={cfg.label} allowDecimals={mk === 'resolProm'} />
      </ChartCard>
    );
  };

  // Hero = Incidencias (the ops workload pulse): 12-month sparkline, 12-month average, leading tower.
  const incSpark = useMemo(() => trend.map((p) => p.incidencias), [trend]);
  const incAvg = incSpark.length ? Math.round(incSpark.reduce((s, v) => s + v, 0) / incSpark.length) : 0;
  const torreLider = useMemo(() => foldTopN(data.incidencias, 'a', 5).slices[0], [data.incidencias]);

  // OTs resueltas por técnico — cierres del mes seleccionado (por fecha_cierre), agrupados por el
  // técnico que la cerró (tecnico_id se estampa al cierre). tecnico_id es un número → mapeo a nombre.
  const usuariosById = useMemo(() => new Map(usuarios.map((u) => [u.id, u.concat_name || `${u.apellido}, ${u.nombre}`])), [usuarios]);
  const otsPorTecnico = useMemo<Grouped[]>(() => {
    const counts = new Map<string, number>();
    for (const o of otsScoped) {
      if (o.tecnico_id == null || !o.status.startsWith('Cerrada')) continue;
      if (!o.fecha_cierre || monthKey(o.fecha_cierre) !== mes) continue;
      const name = usuariosById.get(o.tecnico_id) ?? `Técnico #${o.tecnico_id}`;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return [...counts.entries()].map(([key, a]) => ({ key, a, b: 0 })).sort((x, y) => y.a - x.a);
  }, [otsScoped, usuariosById, mes]);
  const tecnicoLider = otsPorTecnico[0];

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          {!global && misEdificiosNombres.length > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
              <Building2 className="h-3.5 w-3.5 shrink-0" /> Resumen operativo del mes · <span className="font-medium text-foreground">{misEdificiosNombres.join(', ')}</span>
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">Resumen operativo del mes</p>
          )}
        </div>
        {/* Single filter row: scopes every chart below to the same month (never per-chart). */}
        <div className="w-full sm:w-56">
          <Select value={mes} onChange={setMes} options={mesOptions} placeholder="Mes" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20"><Loader size="lg" text="Cargando dashboard…" /></div>
      ) : loadError ? (
        <LoadErrorState onRetry={() => void load()} />
      ) : !global && misEdificiosNombres.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Este usuario no tiene edificios asignados para el dashboard."
          message="Asignalos en Configuración → Usuarios."
        />
      ) : (
        <>
          {/* Botonera de secciones + filtro por torre en la MISMA fila (el filtro sólo aplica a Consumos/Ingresos,
              cambiando según la pestaña activa) → no gastamos un renglón extra. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Tabs value={tab} onValueChange={(v: string) => setTab(v as DashTab)}>
              <div className="overflow-x-auto pb-1">
                <TabsList className="w-max">
                  {DASH_TABS.map(({ value, label, icon: Icon }) => (
                    <TabsTrigger key={value} value={value} className="gap-1.5">
                      <Icon className="h-3.5 w-3.5" /> {label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
            {/* El selector de torre solo tiene sentido con dashboard global: un usuario scopeado ya
                está acotado a su propio edificio (no hay otra torre entre la cual elegir). */}
            {global && (tab === 'consumos' || tab === 'ingresos') && (
              <div className="w-full shrink-0 sm:w-56">
                <Select
                  value={tab === 'consumos' ? conTorre : ingTorre}
                  onChange={tab === 'consumos' ? setConTorre : setIngTorre}
                  options={torreOptions}
                  placeholder="Torre"
                />
              </div>
            )}
          </div>

          {/* RESUMEN — pulso ejecutivo: incidencias (hero) + KPIs + evolución mensual (selector de métrica). */}
          {tab === 'resumen' && (
            <>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <HeroCard
                    caption={`Incidencias · ${mesLabel(mes)}`}
                    total={data.incidenciasTotal}
                    unit="OTs este mes"
                    prev={prev?.incidencias ?? null}
                    spark={incSpark}
                    avg={incAvg}
                    rows={data.incidencias}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
                  <StatCard title="Torre líder" value={torreLider?.key ?? '—'} icon={Trophy} subtext={torreLider ? `${torreLider.pct.toFixed(0)}% de las OTs` : 'sin OTs este mes'} />
                  <StatCard title="Promedio mensual" value={num(incAvg)} icon={TrendingUp} subtext="OTs/mes · últimos 12m" />
                </div>
              </div>
              {/* Ingreso y Consumo salieron de acá: viven completos en sus propias pestañas (Ingresos / Consumos).
                  Unidad SIEMPRE junto al número: un "1,3" pelado no dice si son horas/días/meses. */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Tiempo de resolución" value={`${oneDecimal(data.resolProm)} días`} icon={Clock} subtext={prev ? deltaChip(data.resolProm, prev.resolProm) : 'días promedio'} />
                <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext={prev ? deltaChip(data.ventTotal, prev.ventilaciones) : 'ventilaciones'} />
              </div>
              {hasTrend && (
                <ChartCard title={`Evolución mensual · ${metricCfg.label}`} subtitle={insight} empty={false} emptyMsg="">
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-[11px] text-muted-foreground">Últimos 12 meses · total por mes</p>
                    <div className="w-full sm:w-56">
                      <Select value={metric} onChange={(v) => setMetric(v as MetricKey)} options={TREND_SELECT_OPTIONS} placeholder="Métrica" />
                    </div>
                  </div>
                  <TrendLine data={serie} fmt={metricCfg.fmt} name={metricCfg.label} allowDecimals={metric === 'resolProm'} />
                </ChartCard>
              )}
            </>
          )}

          {/* OTs — incidencias por torre/estado/tipo + tiempo de resolución + evolución. */}
          {tab === 'ots' && (
            <>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard title="Incidencias" value={num(data.incidenciasTotal)} icon={ClipboardList} subtext={prev ? deltaChip(data.incidenciasTotal, prev.incidencias) : 'OTs este mes'} />
                <StatCard title="Tiempo de resolución" value={`${oneDecimal(data.resolProm)} días`} icon={Clock} subtext="promedio de cierre" />
                <StatCard title="Torre líder" value={torreLider?.key ?? '—'} icon={Trophy} subtext={torreLider ? `${torreLider.pct.toFixed(0)}% de las OTs` : 'sin OTs este mes'} />
                <StatCard title="Técnico líder" value={tecnicoLider?.key ?? '—'} icon={Wrench} subtext={tecnicoLider ? `${num(tecnicoLider.a)} OTs resueltas` : 'sin cierres este mes'} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard title="Incidencias por torre" subtitle="Participación por torre" empty={data.incidencias.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                  <Donut rows={data.incidencias} valueKey="a" label={num} unit="OTs" />
                </ChartCard>
                <ChartCard title="OTs por estado" subtitle="Cómo se reparten las OTs del mes" empty={data.otsPorEstado.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                  <MagnitudeBar data={data.otsPorEstado} valueKey="a" label={num} tooltipName="OTs" />
                </ChartCard>
                <ChartCard title="OTs por tipo de trabajo" subtitle="Mix de trabajo del mes" empty={data.otsPorTipoTrabajo.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                  <Donut rows={data.otsPorTipoTrabajo} valueKey="a" label={num} unit="OTs" />
                </ChartCard>
                <ChartCard title="Tiempo de resolución por torre" subtitle="Días promedio de cierre (promedios no van en torta)" empty={data.resolucion.length === 0} emptyMsg="Sin OTs cerradas este mes.">
                  <MagnitudeBar data={data.resolucion} valueKey="b" label={oneDecimal} tooltipName="Promedio" tooltipExtra={(g) => `${oneDecimal(g.b)} días · ${num(g.a)} OTs`} allowDecimals />
                </ChartCard>
              </div>
              <ChartCard title="OTs resueltas por técnico" subtitle="Cierres del mes, por el técnico que cerró la OT" empty={otsPorTecnico.length === 0} emptyMsg="Sin OTs cerradas este mes.">
                <MagnitudeBar data={otsPorTecnico} valueKey="a" label={num} tooltipName="OTs resueltas" />
              </ChartCard>
              {trendCard('incidencias')}
            </>
          )}

          {/* CONSUMOS — por artículo y por edificio + evolución. Filtro por torre scopea toda la sección. */}
          {tab === 'consumos' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Consumo" value={`${num(conData.consumoTotal)} u`} icon={PackageMinus} subtext={conPrev ? deltaChip(conData.consumoTotal, conPrev.consumo) : 'unidades este mes'} />
                <StatCard title="Artículo más consumido" value={conData.consumo[0]?.key ?? '—'} icon={Trophy} subtext={conData.consumo[0] ? `${num(conData.consumo[0].a)} u` : 'sin consumo este mes'} />
              </div>
              {/* Con una torre elegida, "por edificio" sería un único slice al 100% → se oculta y "por artículo" ocupa el ancho. */}
              <div className={`grid grid-cols-1 gap-4 ${!conTorre ? 'xl:grid-cols-2' : ''}`}>
                <ChartCard title="Consumo por artículo" subtitle={conTorre ? `Participación por artículo · ${conTorre}` : 'Participación por artículo (incluye repuestos de OT)'} empty={conData.consumo.length === 0} emptyMsg="Sin consumo registrado este mes.">
                  <Donut rows={conData.consumo} valueKey="a" label={num} unit="u" />
                </ChartCard>
                {!conTorre && (
                  <ChartCard title="Consumo por edificio" subtitle="A qué edificio se fue el stock · pasá el mouse para ver el desglose por producto" empty={conData.consumoPorEdificio.length === 0} emptyMsg="Sin consumo registrado este mes.">
                    <Donut rows={conData.consumoPorEdificio} valueKey="a" label={num} unit="u" detail={conData.consumoPorEdificioDesglose} />
                  </ChartCard>
                )}
              </div>
              {trendCard('consumo', conTrend)}
            </>
          )}

          {/* INGRESOS — por artículo y por edificio + evolución. Filtro por torre scopea toda la sección. */}
          {tab === 'ingresos' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Ingreso de stock" value={`${num(ingData.ingresoTotal)} u`} icon={PackagePlus} subtext={ingPrev ? deltaChip(ingData.ingresoTotal, ingPrev.ingreso) : 'unidades este mes'} />
                <StatCard title="Artículo más ingresado" value={ingData.ingresoArticulo[0]?.key ?? '—'} icon={Trophy} subtext={ingData.ingresoArticulo[0] ? `${num(ingData.ingresoArticulo[0].a)} u` : 'sin ingresos este mes'} />
              </div>
              {/* Con una torre elegida, "por edificio" sería un único slice al 100% → se oculta y "por artículo" ocupa el ancho. */}
              <div className={`grid grid-cols-1 gap-4 ${!ingTorre ? 'xl:grid-cols-2' : ''}`}>
                <ChartCard title="Ingreso de stock por artículo" subtitle={ingTorre ? `Participación por artículo · ${ingTorre}` : 'Participación por artículo (item)'} empty={ingData.ingresoArticulo.length === 0} emptyMsg="Sin ingresos de stock este mes.">
                  <Donut rows={ingData.ingresoArticulo} valueKey="a" label={num} unit="u" />
                </ChartCard>
                {!ingTorre && (
                  <ChartCard title="Ingreso de stock por edificio" subtitle="Participación por edificio" empty={ingData.ingreso.length === 0} emptyMsg="Sin ingresos de stock este mes.">
                    <Donut rows={ingData.ingreso} valueKey="a" label={num} unit="u" />
                  </ChartCard>
                )}
              </div>
              {trendCard('ingreso', ingTrend)}
            </>
          )}

          {/* VENTILACIONES — limpiadas por edificio + estado + evolución. */}
          {tab === 'ventilaciones' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext={prev ? deltaChip(data.ventTotal, prev.ventilaciones) : 'ventilaciones este mes'} />
                <StatCard title="Edificio líder" value={data.ventilacionesLimpiadas[0]?.key ?? '—'} icon={Trophy} subtext={data.ventilacionesLimpiadas[0] ? `${num(data.ventilacionesLimpiadas[0].a)} limpiezas` : 'sin limpiezas este mes'} />
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard title="Ventilaciones limpiadas por edificio" subtitle="Participación por edificio" empty={data.ventilacionesLimpiadas.length === 0} emptyMsg="No se limpiaron aires este mes.">
                  <Donut rows={data.ventilacionesLimpiadas} valueKey="a" label={num} unit="limpiezas" />
                </ChartCard>
                <ChartCard title="Ventilaciones por estado" subtitle="Estado de las ventilaciones del mes" empty={data.ventilacionesPorEstado.length === 0} emptyMsg="Sin ventilaciones este mes.">
                  <MagnitudeBar data={data.ventilacionesPorEstado} valueKey="a" label={num} tooltipName="Ventilaciones" />
                </ChartCard>
              </div>
              {trendCard('ventilaciones')}
            </>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardView;
