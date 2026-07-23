import React from 'react';
import { cn } from './UIComponents';
const STATUS_COLORS: Record<string, string> = {
  'pendiente': 'bg-amber-100 text-amber-700',
  'en proceso': 'bg-indigo-100 text-indigo-700',
  'off season': 'bg-sky-100 text-sky-700',
  'pospuesto': 'bg-sky-100 text-sky-700',
  'listo para enviar': 'bg-emerald-100 text-emerald-700',
  'resuelto': 'bg-emerald-100 text-emerald-700',
  'despachado': 'bg-violet-100 text-violet-700',
  'anulado': 'bg-slate-100 text-slate-600',
  'cerrada': 'bg-slate-100 text-slate-600',
  'cerrado': 'bg-slate-100 text-slate-600',
};
export const statusColor = (status: string): string =>
  STATUS_COLORS[String(status || '').trim().toLowerCase()] || 'bg-slate-100 text-slate-600';
export const StatusBadge: React.FC<{ status: string; label?: string; className?: string }> = ({ status, label, className }) => (
  <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', statusColor(status), className)}>
    {label ?? status}
  </span>
);
export default StatusBadge;
