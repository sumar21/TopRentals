// Dashboard (Admin-only) — monthly operations analytics requested by the client:
// stock intake, consumption per article, incidents (OTs) and resolution time by tower,
// and AC cleanings by building. Aggregation lives in utils/dashboardStats (pure + unit-checked);
// this file is presentation only. Everything reads from the existing services (no new backend),
// per CLAUDE.md "la UI habla SOLO con services/". Charts use recharts per DESIGN.md §10.
//
// Data-viz method (skill `dataviz`) applied to the recharts layer:
//  · Form — every metric here is single-series MAGNITUDE, so every chart is a sorted
//    horizontal bar. The former "Incidencias por torre" donut was an anti-pattern
//    (pie for comparing >6 values; a value-ramp over nominal towers) → now a bar.
//  · Color — one series → ONE hue. Brand navy is the only brand color (CLAUDE.md); it
//    FAILs the *categorical* lightness/chroma bands (that's for multi-hue palettes) but
//    PASSes contrast ≥3:1 on the white card surface, which is the check that applies to a
//    lone single-series fill (validate_palette.js, --mode light).
//  · Marks — thin bars, 4px rounded data-ends on the baseline, hairline recessive grid,
//    a 2px-ish category gap, and a selective direct value label at each bar end so every
//    value is readable without the tooltip (accessibility: values are never tooltip-gated).
//  · Interaction — a single month filter above ALL charts (never per-chart); per-mark hover.
//  · Single series ⇒ no legend box (the card title names the series).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Clock, Fan, PackageMinus, PackagePlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatCard } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { api } from '../../services/index.ts';
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../../services/types.ts';
import type { Grouped } from '../../utils/dashboardStats';
import { todayISO } from '../../utils/dates';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { buildDashboardStats } from '../../utils/dashboardStats';

// ── Chart chrome — brand navy series + recessive slate axes/grid (DESIGN.md §10) ──
const BRAND = '#23313E';       // single-series fill (brand navy; contrast-validated on white)
const GRID = '#eef0f2';        // hairline gridline, one shade off the surface
const CAT_INK = '#475569';     // category names + direct value labels (readable slate)
const AXIS_MUTED = '#94a3b8';  // numeric axis ticks (recessive)
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid #e4e4e7', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' };
const CURSOR = { fill: 'rgba(35,49,62,0.06)' };
// recharts formatter typing is loose across versions; our callbacks stay simple and cast to any at the prop.

const money = (n: number) => `$ ${maskFromNumber(n)}`;
const num = (n: number) => n.toLocaleString('es-AR');
const oneDecimal = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
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

const DashboardView: React.FC = () => {
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [salidas, setSalidas] = useState<SalidaStock[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mes, setMes] = useState<string>(todayISO().slice(0, 7));

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

  const consumoTop = useMemo(() => data.consumo.slice(0, 8), [data.consumo]);

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
            <StatCard title="Ingreso de stock" value={num(data.ingresoTotal)} icon={PackagePlus} subtext="unidades" />
            <StatCard title="Consumo" value={num(data.consumoTotal)} icon={PackageMinus} subtext="unidades" />
            <StatCard title="Incidencias" value={num(data.incidenciasTotal)} icon={ClipboardList} subtext="OTs del mes" />
            <StatCard title="Tiempo de resolución" value={oneDecimal(data.resolProm)} icon={Clock} subtext="días promedio" />
            <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext="ventilaciones" />
          </div>

          {!hasAny ? (
            <EmptyState icon={BarChart3} title="Sin datos este mes" message="No hay movimientos, OTs ni ventilaciones registrados en el mes seleccionado." />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Ingreso de stock por edificio" subtitle="Unidades ingresadas" empty={data.ingreso.length === 0} emptyMsg="Sin ingresos de stock este mes.">
                <MagnitudeBar
                  data={data.ingreso}
                  valueKey="a"
                  label={num}
                  tooltipName="Ingreso"
                  tooltipExtra={(g) => `${num(g.a)} u · ${money(g.b)}`}
                />
              </ChartCard>

              <ChartCard title="Consumo por artículo" subtitle="Top 8 por unidades" empty={data.consumo.length === 0} emptyMsg="Sin consumo registrado este mes.">
                <MagnitudeBar data={consumoTop} valueKey="a" label={num} tooltipName="Unidades" />
              </ChartCard>

              <ChartCard title="Incidencias por torre" subtitle="OTs iniciadas este mes" empty={data.incidencias.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                <MagnitudeBar data={data.incidencias} valueKey="a" label={num} tooltipName="OTs" />
              </ChartCard>

              <ChartCard title="Tiempo de resolución por torre" subtitle="Días promedio de cierre" empty={data.resolucion.length === 0} emptyMsg="Sin OTs cerradas este mes.">
                <MagnitudeBar
                  data={data.resolucion}
                  valueKey="b"
                  label={oneDecimal}
                  tooltipName="Promedio"
                  tooltipExtra={(g) => `${oneDecimal(g.b)} días · ${num(g.a)} OTs`}
                  allowDecimals
                />
              </ChartCard>

              <ChartCard title="Ventilaciones limpiadas por edificio" subtitle="Limpiezas del mes" empty={data.ventilacionesLimpiadas.length === 0} emptyMsg="No se limpiaron aires este mes.">
                <MagnitudeBar
                  data={data.ventilacionesLimpiadas}
                  valueKey="a"
                  label={num}
                  tooltipName="Limpiezas"
                  tooltipExtra={(g) => `${num(g.a)} limpiezas${g.extra ? ` · última ${g.extra}` : ''}`}
                />
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardView;
