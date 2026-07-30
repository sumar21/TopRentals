// Dashboard (Admin-only) — monthly operations analytics requested by the client:
// stock intake, consumption per article, incidents (OTs) and resolution time by tower,
// and AC cleanings by building. Aggregation lives in utils/dashboardStats (pure + unit-checked);
// this file is presentation only. Everything reads from the existing services (no new backend),
// per CLAUDE.md "la UI habla SOLO con services/". StatCard + page skeleton per docs/DESIGN.md
// §4.4 / §7 (KPIs). No recharts — the app doesn't ship it and this reads fine as KPIs + tables.
import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ClipboardList, Clock, Fan, PackageMinus, PackagePlus } from 'lucide-react';
import { Card, StatCard, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/UIComponents';
import { Select } from '../ui/Select';
import { Loader } from '../ui/Loader';
import { EmptyState } from '../EmptyState';
import { LoadErrorState } from '../LoadErrorState';
import { api } from '../../services/index.ts';
import type { MovimientoStock, OrdenTrabajo, SalidaStock, Ventilacion } from '../../services/types.ts';
import { todayISO } from '../../utils/dates';
import { maskFromNumber } from '../../utils/formatMoneyInput';
import { buildDashboardStats, type Grouped } from '../../utils/dashboardStats';

const money = (n: number) => `$ ${maskFromNumber(n)}`;
const num = (n: number) => n.toLocaleString('es-AR');
const mesLabel = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
};

const SectionTable: React.FC<{
  title: string;
  colKey: string;
  colA: string;
  colB?: string;
  colExtra?: string;
  rows: Grouped[];
  renderA: (n: number) => string;
  renderB?: (n: number) => string;
  emptyMsg: string;
}> = ({ title, colKey, colA, colB, colExtra, rows, renderA, renderB, emptyMsg }) => (
  <Card className="border shadow-sm overflow-hidden">
    <div className="px-4 py-3 border-b">
      <h2 className="text-sm font-semibold">{title}</h2>
    </div>
    {rows.length === 0 ? (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">{emptyMsg}</p>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{colKey}</TableHead>
            <TableHead className="text-right">{colA}</TableHead>
            {colB && <TableHead className="text-right whitespace-nowrap">{colB}</TableHead>}
            {colExtra && <TableHead className="text-right whitespace-nowrap">{colExtra}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="font-medium">{r.key}</TableCell>
              <TableCell className="text-right tabular-nums">{renderA(r.a)}</TableCell>
              {colB && <TableCell className="text-right tabular-nums whitespace-nowrap">{renderB ? renderB(r.b) : ''}</TableCell>}
              {colExtra && <TableCell className="text-right tabular-nums text-muted-foreground whitespace-nowrap">{r.extra ?? '—'}</TableCell>}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
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

  const hasAny =
    data.ingreso.length + data.consumo.length + data.incidencias.length + data.resolucion.length + data.ventilacionesLimpiadas.length > 0;

  return (
    <div className="flex flex-col gap-4 w-full">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Resumen operativo del mes</p>
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
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard title="Ingreso de stock" value={num(data.ingresoTotal)} icon={PackagePlus} subtext="unidades" />
            <StatCard title="Consumo" value={num(data.consumoTotal)} icon={PackageMinus} subtext="unidades" />
            <StatCard title="Incidencias" value={num(data.incidenciasTotal)} icon={ClipboardList} subtext="OTs del mes" />
            <StatCard title="Tiempo de resolución" value={data.resolProm.toFixed(1)} icon={Clock} subtext="días promedio" />
            <StatCard title="Aires limpiados" value={num(data.ventTotal)} icon={Fan} subtext="ventilaciones" />
          </div>

          {!hasAny ? (
            <EmptyState icon={BarChart3} title="Sin datos este mes" message="No hay movimientos, OTs ni ventilaciones registrados en el mes seleccionado." />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <SectionTable
                title="Ingreso de stock por edificio"
                colKey="Edificio" colA="Unidades" colB="Valor"
                rows={data.ingreso} renderA={num} renderB={money}
                emptyMsg="Sin ingresos de stock este mes."
              />
              <SectionTable
                title="Consumo por artículo"
                colKey="Artículo" colA="Unidades" colB="Salidas"
                rows={data.consumo} renderA={num} renderB={num}
                emptyMsg="Sin consumo registrado este mes."
              />
              <SectionTable
                title="Incidencias por torre"
                colKey="Torre" colA="Incidencias"
                rows={data.incidencias} renderA={num}
                emptyMsg="Sin OTs iniciadas este mes."
              />
              <SectionTable
                title="Tiempo de resolución por torre"
                colKey="Torre" colA="OTs cerradas" colB="Prom. (días)"
                rows={data.resolucion} renderA={num} renderB={(n) => n.toFixed(1)}
                emptyMsg="Sin OTs cerradas este mes."
              />
              <SectionTable
                title="Ventilaciones limpiadas por edificio"
                colKey="Edificio" colA="Limpiezas" colExtra="Última limpieza"
                rows={data.ventilacionesLimpiadas} renderA={num}
                emptyMsg="No se limpiaron aires este mes."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DashboardView;
