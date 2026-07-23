// Plain-node smoke checks — no test framework (`npm run check`, i.e.
// `node --experimental-strip-types scripts/checks/run.ts`). Every util imported here
// must stay React/DOM-free so it runs directly under Node.
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../services/mock/adapter.ts';
import type { PerfilPermiso } from '../../services/types.ts';
import { addDays, formatDate, parseDMY, todayISO } from '../../utils/dates.ts';
import { canAccessModule } from '../../utils/permissions.ts';

let passed = 0;

async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`ok   - ${name}`);
  } catch (err) {
    process.exitCode = 1;
    console.error(`FAIL - ${name}`);
    console.error(err);
  }
}

function samplePermisos(): PerfilPermiso[] {
  const row = (modulo: string, overrides: Partial<PerfilPermiso>): PerfilPermiso => ({
    id: 1,
    modulo,
    admin: 'SI',
    operador: 'NO',
    tecnico: 'NO',
    recepcion: 'NO',
    compras: 'NO',
    gerencia: 'NO',
    jefe_operativo: 'NO',
    orden: 1,
    imagen_path: null,
    imagen_no_selected_path: null,
    aplicacion: 'Desktop',
    status: 'Activo',
    ...overrides,
  });
  return [row('ABM', {}), row('Compras', { compras: 'SI' })];
}

async function main() {
  await check('parseDMY/formatDate roundtrip', () => {
    const dmy = '23/07/2026';
    const iso = parseDMY(dmy);
    assert.equal(iso, '2026-07-23');
    assert.equal(formatDate(iso), dmy);
    assert.throws(() => parseDMY('31/02/2026')); // Feb 31 doesn't exist
  });

  await check('addDays / todayISO sanity', () => {
    assert.equal(addDays('2026-07-23', 90), '2026-10-21');
    assert.match(todayISO(), /^\d{4}-\d{2}-\d{2}$/);
  });

  await check('canAccessModule matrix', () => {
    const permisos = samplePermisos();
    assert.equal(canAccessModule('Admin', 'ABM', permisos), true);
    assert.equal(canAccessModule('Operador', 'ABM', permisos), false);
    assert.equal(canAccessModule('Compras', 'Compras', permisos), true);
    assert.equal(canAccessModule('Recepcion', 'Compras', permisos), false);
    assert.equal(canAccessModule('Admin', 'ModuloInexistente', permisos), true); // Admin sees everything
  });

  await check('mock adapter: auth.login ok/fail', async () => {
    const api = createMockAdapter();
    const user = await api.auth.login('admin', '1234');
    assert.equal(user.usuario_app, 'admin');
    await assert.rejects(() => api.auth.login('admin', 'wrong-password'));
    await assert.rejects(() => api.auth.login('no-existe', '1234'));
  });

  await check('mock adapter: finalizar ventilación crea el próximo ciclo', async () => {
    const api = createMockAdapter();
    const asignada = (await api.ventilaciones.list()).find((v) => v.estado === 'Asignada');
    assert.ok(asignada, 'seed debe tener al menos una ventilación Asignada');
    const { cerrada, siguiente } = await api.ventilaciones.finalizar({ id: asignada!.id, obs_resuelto: 'Listo', usuario_id: 2 });
    assert.equal(cerrada.estado, 'Realizada');
    assert.equal(siguiente.estado, 'Pendiente');
    assert.equal(siguiente.unidad_id, cerrada.unidad_id);
    assert.equal(siguiente.proxima_limpieza, addDays(todayISO(), siguiente.frecuencia_dias ?? 0));
  });

  await check('mock adapter: salida de stock decrementa y audita', async () => {
    const api = createMockAdapter();
    const target = (await api.stock.list()).find((row) => row.cantidad > 0 && row.edificio_ids.length > 0);
    assert.ok(target, 'seed debe tener stock disponible');
    const before = target!.cantidad;
    const movimientosBefore = (await api.stock.movimientos()).length;
    await api.stock.salida({
      stock_id: target!.id,
      edificio_id: target!.edificio_ids[0],
      tipo: 'CONSUMIBLE',
      cantidad: 1,
      tecnico_id: null,
      uso: 'Consumo Diario',
      centro_de_costo: 'Test',
      usuario_id: 1,
    });
    const after = (await api.stock.list()).find((row) => row.id === target!.id);
    assert.equal(after?.cantidad, before - 1);
    assert.equal((await api.stock.movimientos()).length, movimientosBefore + 1);
  });

  // utils/formatMoneyInput.ts belongs to the UI/components track — check it opportunistically.
  // maskFromNumber (number -> display string) pairs with parseMoney (display string -> number);
  // maskMoney is a live-keystroke input mask, not a number formatter, so it is not a roundtrip pair.
  try {
    const moneyModule = (await import('../../utils/formatMoneyInput.ts')) as {
      parseMoney: (value: string) => number;
      maskFromNumber: (value: number) => string;
    };
    await check('parseMoney/maskFromNumber roundtrip', () => {
      const value = 1234.5;
      assert.equal(moneyModule.parseMoney(moneyModule.maskFromNumber(value)), value);
    });
  } catch {
    console.log('skip - parseMoney/maskFromNumber roundtrip (utils/formatMoneyInput.ts not present yet)');
  }

  console.log(`\n${passed} check(s) passed.`);
}

main();
