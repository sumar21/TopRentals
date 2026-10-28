// Barra de avisos del Home: tarjetas de alerta con conteo + botón al módulo. Solo aparece una tarjeta
// cuando hay algo que avisar (count > 0); si no hay nada, la barra no se renderiza (semántica de "avisos").
// Fuentes: bajo stock (mismo criterio que StockView) y ventilaciones con incidente (flag es_incidente,
// el "warning" ámbar que ya muestra VentilacionesView).
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Fan } from 'lucide-react';
import { Button, cn } from '../ui/UIComponents';
import { api } from '../../services/index.ts';

const VENT_TERMINALES = new Set(['Realizada', 'Eliminada']);

const TONE = {
  red: { wrap: 'border-l-red-400 bg-red-50/60 dark:bg-red-900/40 dark:border-red-900/50', icon: 'text-red-600 dark:text-red-400' },
  amber: { wrap: 'border-l-amber-400 bg-amber-50/60 dark:bg-amber-900/40 dark:border-amber-900/50', icon: 'text-amber-600 dark:text-amber-400' },
} as const;

const AlertCard: React.FC<{
  tone: keyof typeof TONE;
  icon: React.ComponentType<{ className?: string }>;
  count: number;
  label: string;
  cta: string;
  onClick: () => void;
}> = ({ tone, icon: Icon, count, label, cta, onClick }) => (
  <div className={cn('flex flex-1 items-center gap-3 rounded-lg border border-l-4 p-3 shadow-sm', TONE[tone].wrap)}>
    <Icon className={cn('h-5 w-5 shrink-0', TONE[tone].icon)} />
    <div className="min-w-0 flex-1">
      <span className="text-lg font-bold leading-none tabular-nums">{count}</span>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
    <Button variant="outline" size="sm" className="shrink-0 gap-1" onClick={onClick}>
      {cta} <ArrowRight className="h-3.5 w-3.5" />
    </Button>
  </div>
);

const HomeAlerts: React.FC = () => {
  const navigate = useNavigate();
  const [bajoStock, setBajoStock] = useState(0);
  const [ventAlerta, setVentAlerta] = useState(0);

  useEffect(() => {
    const load = () => {
      void api.stock.list().then((rows) =>
        setBajoStock(rows.filter((r) => r.cantidad > 0 && r.condicion_corte != null && r.cantidad < r.condicion_corte).length),
      ).catch(() => {});
      void api.ventilaciones.list().then((rows) =>
        setVentAlerta(rows.filter((v) => v.es_incidente && !VENT_TERMINALES.has(v.estado)).length),
      ).catch(() => {});
    };
    load();
    return api.realtime.subscribe(['movimientos', 'salidas', 'ventilaciones'], load);
  }, []);

  if (bajoStock === 0 && ventAlerta === 0) return null;

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      {bajoStock > 0 && (
        <AlertCard
          tone="red"
          icon={AlertTriangle}
          count={bajoStock}
          label={`artículo${bajoStock === 1 ? '' : 's'} en bajo stock`}
          cta="Ver stock"
          onClick={() => navigate('/stock')}
        />
      )}
      {ventAlerta > 0 && (
        <AlertCard
          tone="amber"
          icon={Fan}
          count={ventAlerta}
          label={`ventilaci${ventAlerta === 1 ? 'ón' : 'ones'} con incidente`}
          cta="Ver ventilaciones"
          onClick={() => navigate('/ventilaciones')}
        />
      )}
    </div>
  );
};

export default HomeAlerts;
