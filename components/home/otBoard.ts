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
 * (any status other than Pendiente/Asignada, or an Asignada with no recognized priority).
 * Mirrors the original PA Home galleries: the Pendiente bucket ignores priority; the
 * Asignada buckets split by PRIORITY. PA's column filter is `TipoPrioridad_OT`, which is
 * only the display name of the SP column our migration imports as `prioridad` (internal
 * name RequiereParada_OT; values Alta/Media/Baja — verified against live SP data).
 * `tipo_prioridad` is occupancy (Vacante/Ocupada/Bloqueada, from Prioridad_IN), NOT
 * priority — bucketing by it left every Asignada column permanently empty.
 */
export function bucketOf(ot: OrdenTrabajo): BoardColumn | null {
  if (ot.status === 'Pendiente') return 'pendiente';
  if (ot.status === 'Asignada') return PRIORITY_COLUMN[String(ot.prioridad ?? '').trim().toLowerCase()] ?? null;
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
