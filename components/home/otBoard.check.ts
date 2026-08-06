// Plain-node smoke check for otBoard.ts (no framework — same spirit as scripts/checks/run.ts,
// but kept dependency-free: no 'node:assert' / 'process' so this file still passes `tsc -b`,
// which type-checks the whole components/ tree without @types/node in scope).
// Run with: node --experimental-strip-types components/home/otBoard.check.ts
import type { OrdenTrabajo, Prioridad } from '../../services/types.ts';
import { bucketOf, matchesSearch } from './otBoard.ts';

function assertEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

function baseOt(overrides: Partial<OrdenTrabajo>): OrdenTrabajo {
  return {
    id: 1,
    id_univoco: 'x',
    status: 'Pendiente',
    tipo: 'ORDEN DE TRABAJO',
    prioridad: 'Media',
    tipo_trabajo: null,
    tipo_tarea: null,
    tipo_prioridad: null,
    unidad_id: null,
    torre: 'Palermo Soho',
    departamento: '4B',
    concat_activo: null,
    tecnico_id: null,
    asignador_id: null,
    user_carga_id: 1,
    fecha_inicio: '2026-07-10',
    fecha_cierre: null,
    fecha_asignada: null,
    dias_estimado: null,
    personas_requeridas: null,
    detalle: null,
    observaciones: null,
    obs_resuelto: null,
    obs_asignacion: null,
    obs_cierre: null,
    orden_revision_id: null,
    problema: null,
    desde: 'Desktop',
    version_app: null,
    hora: null,
    created_at: '2026-07-10T09:00:00Z',
    ...overrides,
  };
}

let passed = 0;
let failed = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (err) {
    failed++;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

check('bucketOf: Pendiente ignores priority fields', () => {
  assertEqual(bucketOf(baseOt({ status: 'Pendiente', tipo_prioridad: null })), 'pendiente', 'null tipo_prioridad');
  assertEqual(bucketOf(baseOt({ status: 'Pendiente', tipo_prioridad: 'Alta' })), 'pendiente', 'set tipo_prioridad');
});

check('bucketOf: Asignada splits by prioridad, not tipo_prioridad (occupancy)', () => {
  assertEqual(bucketOf(baseOt({ status: 'Asignada', prioridad: 'Alta', tipo_prioridad: 'Ocupada' })), 'alta', 'prioridad drives the bucket; occupancy is ignored');
  assertEqual(bucketOf(baseOt({ status: 'Asignada', prioridad: 'Media' })), 'media', 'media');
  assertEqual(bucketOf(baseOt({ status: 'Asignada', prioridad: 'Baja' })), 'baja', 'baja');
  // Live SP data has Asignada rows with no priority (RequiereParada_OT null) -> off board,
  // exactly like PA (its board only ever shows Alta/Media/Baja). The type claims non-null,
  // but the migrated data disagrees, so cover the real case explicitly.
  assertEqual(bucketOf(baseOt({ status: 'Asignada', prioridad: null as unknown as Prioridad })), null, 'null priority -> off board');
});

check('bucketOf: closed/cancelled statuses never appear on the board', () => {
  for (const status of ['Cerrada', 'Cerrada F', 'Cerrada V', 'Anulada'] as const) {
    assertEqual(bucketOf(baseOt({ status, prioridad: 'Alta' })), null, status);
  }
});

check('matchesSearch: empty term matches everything', () => {
  assertEqual(matchesSearch(baseOt({}), '', ''), true, 'empty string');
  assertEqual(matchesSearch(baseOt({}), '   ', ''), true, 'whitespace-only');
});

check('matchesSearch: matches torre, status or técnico name, case-insensitive', () => {
  const ot = baseOt({ torre: 'Palermo Soho', status: 'Asignada' });
  assertEqual(matchesSearch(ot, 'palermo', 'Gómez, Lucas'), true, 'torre substring');
  assertEqual(matchesSearch(ot, 'ASIGNADA', 'Gómez, Lucas'), true, 'status uppercase');
  assertEqual(matchesSearch(ot, 'gomez', 'Gómez, Lucas'), false, 'no accent-folding — documented limitation');
  assertEqual(matchesSearch(ot, 'lucas', 'Gómez, Lucas'), true, 'técnico substring');
  assertEqual(matchesSearch(ot, 'nunez', 'Gómez, Lucas'), false, 'no match');
});

console.log(`\n${passed} check(s) passed${failed ? `, ${failed} FAILED` : ''}.`);
if (failed > 0) throw new Error(`${failed} check(s) failed`);
