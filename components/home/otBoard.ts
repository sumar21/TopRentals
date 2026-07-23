// Pure helpers for the Home triage board — no React/DOM so they stay unit-testable
// with plain node (see otBoard.check.ts). Kept out of HomeView.tsx so the bucketing/
// search rules (the actual business logic of this screen) are easy to eyeball and test
// in isolation from rendering.
import type { OrdenTrabajo } from '../../services/types.ts';

export type BoardColumn = 'pendiente' | 'alta' | 'media' | 'baja';

const PRIORITY_COLUMN: Record<string, BoardColumn> = {
  alta: 'alta',
  media: 'media',
  baja: 'baja',
};

/**
 * Which board column an OT belongs to, or null if it's not part of the triage board
 * (i.e. any status other than Pendiente/Asignada, or an Asignada with an unrecognized
 * tipo_prioridad). Mirrors the original PA galleries: Pendiente bucket ignores priority;
 * Asignada buckets split by `tipo_prioridad` (NOT `prioridad` — that's the card's pill).
 */
export function bucketOf(ot: OrdenTrabajo): BoardColumn | null {
  if (ot.status === 'Pendiente') return 'pendiente';
  if (ot.status === 'Asignada') return PRIORITY_COLUMN[String(ot.tipo_prioridad ?? '').trim().toLowerCase()] ?? null;
  return null;
}

/** Free-text match against torre, status and técnico name — mirrors the PA search's `in` filter. */
export function matchesSearch(ot: OrdenTrabajo, term: string, tecnicoNombre: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return (
    (ot.torre ?? '').toLowerCase().includes(q) ||
    ot.status.toLowerCase().includes(q) ||
    tecnicoNombre.toLowerCase().includes(q)
  );
}
