import React from 'react';
import { cn } from './UIComponents';

// Chip neutro (estados sin color: baja, anulado, cerrado, eliminada…). En claro es un gris suave;
// en oscuro `bg-muted` (L~16%) queda casi pegado a `bg-card` (L~10%) y el pill se pierde → variante
// `dark:` explícita para que siga siendo visible pero subordinado a los chips de color.
export const NEUTRAL_CHIP = 'bg-muted text-muted-foreground dark:bg-zinc-700 dark:text-zinc-200';

const STATUS_COLORS: Record<string, string> = {
  'pendiente': 'bg-amber-100 text-amber-700',
  'en proceso': 'bg-indigo-100 text-indigo-700',
  'off season': 'bg-sky-100 text-sky-700',
  'pospuesto': 'bg-sky-100 text-sky-700',
  'listo para enviar': 'bg-emerald-100 text-emerald-700',
  'resuelto': 'bg-emerald-100 text-emerald-700',
  'despachado': 'bg-violet-100 text-violet-700',
  'anulado': NEUTRAL_CHIP,
  'cerrado': NEUTRAL_CHIP,

  // ── TopRentals domain statuses (semantic palette, DESIGN.md §1.4 / rule 11) ──
  // OT workflow
  'asignada': 'bg-amber-100 text-amber-700',
  'cerrada': 'bg-emerald-100 text-emerald-700',
  'cerrada v': 'bg-blue-100 text-blue-700',
  'cerrada f': 'bg-violet-100 text-violet-700',
  'anulada': NEUTRAL_CHIP,
  // Compras / Aprobaciones
  'aprobacion': 'bg-blue-100 text-blue-700',
  'en aprobacion': 'bg-blue-100 text-blue-700',
  'aprobada': 'bg-emerald-100 text-emerald-700',
  'aprobada supervision': 'bg-emerald-100 text-emerald-700',
  'rechazada': 'bg-red-100 text-red-700',
  'recibida': 'bg-sky-100 text-sky-700',
  // Ventilaciones (estado operativo del workflow)
  'programada': 'bg-blue-100 text-blue-700',
  'realizada': 'bg-emerald-100 text-emerald-700',
  'eliminada': NEUTRAL_CHIP,
  // Ventilaciones — estado de LIMPIEZA (derivado por días; semántico: limpio=ok, a vencer=warning, sucio=serio)
  'limpio': 'bg-emerald-100 text-emerald-700',
  'a vencer': 'bg-amber-100 text-amber-700',
  'sucio': 'bg-red-100 text-red-700',
  // Salidas de stock (tipo)
  'asignacion': 'bg-emerald-100 text-emerald-700',
  'consumible': 'bg-amber-100 text-amber-700',
  'devolucion': 'bg-blue-100 text-blue-700',
  'devuelto': 'bg-violet-100 text-violet-700',
  'traslado': 'bg-orange-100 text-orange-700',
  // Prioridad (semantic — deliberately NOT the inverted PowerApps palette).
  // NOTE: user active-state ALTA/BAJA must use <Badge>, not StatusBadge (key collision).
  'alta': 'bg-red-100 text-red-700',
  'media': 'bg-amber-100 text-amber-700',
  'baja': NEUTRAL_CHIP,
};
export const statusColor = (status: string): string =>
  STATUS_COLORS[String(status || '').trim().toLowerCase()] || NEUTRAL_CHIP;
export const StatusBadge: React.FC<{ status: string; label?: string; className?: string }> = ({ status, label, className }) => (
  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', statusColor(status), className)}>
    {label ?? status}
  </span>
);
export default StatusBadge;
