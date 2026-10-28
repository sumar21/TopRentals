import React from 'react';
import { cn } from './UIComponents';
import { NEUTRAL_CHIP } from './StatusBadge';

// Pill categórico para valores que vienen de un desplegable (tipo de OT, tipo de trabajo,
// tipo de tarea, ocupación de la unidad). Misma forma y tamaño que StatusBadge, pero el color
// se asigna por VALOR para reconocerlos de un vistazo. Los valores conocidos tienen un hue curado
// y distinto; cualquier otro cae a un hash estable dentro de la paleta (el texto del pill lleva la
// identidad, así que una reutilización rara de color es inocua). No es un estado de workflow → se
// mantiene fuera de StatusBadge/STATUS_COLORS.
const CATEGORIA_COLORS: Record<string, string> = {
  // tipo de OT
  'orden de trabajo': 'bg-blue-100 text-blue-700',
  'solicitud ot': 'bg-violet-100 text-violet-700',
  // tipo de trabajo / tipo de tarea (comparten nombres de valor)
  correctivo: 'bg-rose-100 text-rose-700',
  preventivo: 'bg-emerald-100 text-emerald-700',
  mejora: 'bg-teal-100 text-teal-700',
  chequeo: 'bg-sky-100 text-sky-700',
  electrico: 'bg-amber-100 text-amber-800',
  pintura: 'bg-fuchsia-100 text-fuchsia-700',
  ventilacion: 'bg-cyan-100 text-cyan-700',
  otros: NEUTRAL_CHIP,
  // ocupación de la unidad (columna "Requiere parada")
  vacante: 'bg-emerald-100 text-emerald-700',
  'vacante con ingreso': 'bg-lime-100 text-lime-700',
  bloqueada: 'bg-orange-100 text-orange-700',
  ocupada: 'bg-red-100 text-red-700',
};

const PALETTE = [
  'bg-blue-100 text-blue-700', 'bg-violet-100 text-violet-700', 'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800', 'bg-cyan-100 text-cyan-700', 'bg-rose-100 text-rose-700',
  'bg-teal-100 text-teal-700', 'bg-fuchsia-100 text-fuchsia-700', 'bg-sky-100 text-sky-700', 'bg-lime-100 text-lime-700',
];

function hashIndex(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h) % PALETTE.length;
}

export const categoriaColor = (value: string): string => {
  const key = value.trim().toLowerCase();
  return CATEGORIA_COLORS[key] ?? PALETTE[hashIndex(key)];
};

/**
 * Colored categorical pill. Same size as StatusBadge; '—' when empty.
 * `label` overrides the displayed text (e.g. a short "OT"/"Sol OT") while the color still keys off
 * the full `value`, so the palette stays consistent no matter how it's abbreviated.
 */
export const CategoriaBadge: React.FC<{ value: string | null | undefined; label?: string; className?: string }> = ({ value, label, className }) => {
  const v = (value ?? '').trim();
  if (!v) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap', categoriaColor(v), className)}>
      {label ?? v}
    </span>
  );
};
