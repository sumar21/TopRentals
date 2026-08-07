// Dashboard (Admin-only) — monthly operations analytics requested by the client:
// stock intake, consumption per article, incidents (OTs) and resolution time by tower,
// and AC cleanings by building. Aggregation lives in utils/dashboardStats (pure + unit-checked);
// this file is presentation only. Everything reads from the existing services (no new backend),
// per CLAUDE.md "la UI habla SOLO con services/". Charts use recharts per DESIGN.md §10;
// the brand navy drives the primary series, a light navy→gold ramp colours the pie slices.
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Clock, Fan, PackageMinus, PackagePlus } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, StatCard } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { api } from '../../services/index.ts';
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../../services/types.ts';
import { todayISO } from '../../utils/dates';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { buildDashboardStats } from '../../utils/dashboardStats';

// ── Chart chrome (DESIGN.md §10 data-viz tokens) ──
const BRAND = '#23313E'; // brand navy — primary series
const CHART_COLORS = ['#23313E', '#3b5266', '#5b7c94', '#7ea3b8', '#a7c3d4', '#c9a24b', '#8a6d3b', '#c98b5b'];
const GRID = { stroke: '#eef0f2' };
const X_TICK = { fontSize: 11, fill: '#52525b' };
const Y_TICK = { fontSize: 11, fill: '#94a3b8' };
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid #e4e4e7', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' };
// recharts formatter typing is loose across versions; our callbacks stay simple and cast to any at the prop.

const money = (n: number) => `$ ${maskFromNumber(n)}`;
const num = (n: number) => n.toLocaleString('es-AR');
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

const DashboardView: React.FC = () => {
  const [movimientos, setMovimientos] = useState<MovimientoStock[]>([]);
  const [salidas, setSalidas] = useState<SalidaStock[]>([]);
  const [ots, setOts] = useState<OrdenTrabajo[]>([]);
  const [ventilaciones, setVentilaciones] = useState<Ventilacion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [mes, setMes] = useState<string>(todayISO().slice(0, 7));

  useEffect(() => {
    setLoading(true);
    setLoadError(false);
    Promise.all([api.stock.movimientos(), api.stock.salidas(), api.ots.list(), api.ventilaciones.list()])
      .then(([mov, sal, o, v]) => {
        setMovimientos(mov);
        setSalidas(sal);
        setOts(o);
        setVentilaciones(v);
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, []);

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
            <StatCard title="Tiempo de resolución" value={data.resolProm.toFixed(1)} icon={Clock} subtext="días promedio" />
            <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext="ventilaciones" />
          </div>

          {!hasAny ? (
            <EmptyState icon={BarChart3} title="Sin datos este mes" message="No hay movimientos, OTs ni ventilaciones registrados en el mes seleccionado." />
          ) : (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Ingreso de stock por edificio" subtitle="Unidades ingresadas" empty={data.ingreso.length === 0} emptyMsg="Sin ingresos de stock este mes.">
                <ResponsiveContainer width="100%" height={Math.max(200, data.ingreso.length * 38)}>
                  <BarChart data={data.ingreso} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={X_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="key" tick={Y_TICK} axisLine={false} tickLine={false} width={150} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={((v: number, _n: string, p: any) => [`${num(v)} u · ${money(p?.payload?.b ?? 0)}`, 'Ingreso']) as any} />
                    <Bar dataKey="a" name="Unidades" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Consumo por artículo" subtitle="Top 8 por unidades" empty={data.consumo.length === 0} emptyMsg="Sin consumo registrado este mes.">
                <ResponsiveContainer width="100%" height={Math.max(200, consumoTop.length * 34)}>
                  <BarChart data={consumoTop} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={X_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="key" tick={Y_TICK} axisLine={false} tickLine={false} width={150} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={((v: number) => [num(v), 'Unidades']) as any} />
                    <Bar dataKey="a" name="Unidades" fill={BRAND} radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Incidencias por torre" subtitle="OTs iniciadas este mes" empty={data.incidencias.length === 0} emptyMsg="Sin OTs iniciadas este mes.">
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={data.incidencias} dataKey="a" nameKey="key" cx="50%" cy="50%" innerRadius={52} outerRadius={92} paddingAngle={2}>
                      {data.incidencias.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={((v: number, n: string) => [num(v), n]) as any} />
                    <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Tiempo de resolución por torre" subtitle="Días promedio de cierre" empty={data.resolucion.length === 0} emptyMsg="Sin OTs cerradas este mes.">
                <ResponsiveContainer width="100%" height={Math.max(200, data.resolucion.length * 38)}>
                  <BarChart data={data.resolucion} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={X_TICK} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="key" tick={Y_TICK} axisLine={false} tickLine={false} width={150} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={((v: number) => [`${v.toFixed(1)} días`, 'Promedio']) as any} />
                    <Bar dataKey="b" name="Días" fill="#5b7c94" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>

              <ChartCard title="Ventilaciones limpiadas por edificio" subtitle="Limpiezas del mes" empty={data.ventilacionesLimpiadas.length === 0} emptyMsg="No se limpiaron aires este mes.">
                <ResponsiveContainer width="100%" height={Math.max(200, data.ventilacionesLimpiadas.length * 38)}>
                  <BarChart data={data.ventilacionesLimpiadas} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                    <CartesianGrid {...GRID} horizontal={false} />
                    <XAxis type="number" tick={X_TICK} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="key" tick={Y_TICK} axisLine={false} tickLine={false} width={150} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={((v: number) => [num(v), 'Limpiezas']) as any} />
                    <Bar dataKey="a" name="Limpiezas" fill="#7ea3b8" radius={[0, 4, 4, 0]} maxBarSize={22} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardView;
