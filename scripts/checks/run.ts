// Plain-node smoke checks — no test framework (`npm run check`, i.e.
// `node --experimental-strip-types scripts/checks/run.ts`). Every util imported here
// must stay React/DOM-free so it runs directly under Node.
import assert from 'node:assert/strict';
import { createMockAdapter } from '../../services/mock/adapter.ts';
import type { PerfilPermiso } from '../../services/types.ts';
import { addDays, formatDate, parseDMY, todayISO } from '../../utils/dates.ts';
import { canAccessModule } from '../../utils/permissions.ts';
import {
  articuloFromDb, compraFromDb, detalleCompraFromDb, perfilPermisoFromDb, stockFromDb, unidadFromDb, usuarioFromDb,
} from '../../services/supabase/rows.ts';
import { buildDashboardStats } from '../../utils/dashboardStats.ts';

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
    // Gerencia: hardcoded to Aprobaciones only (PA parity — no LPP column, 2nd-level compras approval).
    // True even without an Aprobaciones row in permisos, exactly like the PA (which never data-drove it).
    assert.equal(canAccessModule('Gerencia', 'Aprobaciones', permisos), true);
    assert.equal(canAccessModule('Gerencia', 'Compras', permisos), false);
    assert.equal(canAccessModule('Gerencia', 'ABM', permisos), false);
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

  await check('mock adapter: cerrar OT vuelca repuestos al histórico de salidas (idempotente)', async () => {
    const api = createMockAdapter();
    const ot = (await api.ots.list()).find((o) => o.status === 'Pendiente' || o.status === 'Asignada');
    assert.ok(ot, 'seed debe tener una OT abierta');
    const stock = (await api.stock.list()).find((r) => r.cantidad > 0 && r.edificio_ids.length > 0);
    assert.ok(stock, 'seed debe tener stock disponible');

    await api.ots.repuestos.asignarRepuesto({
      orden_trabajo_id: ot!.id,
      articulo_id: stock!.articulo_id,
      edificio_id: stock!.edificio_ids[0],
      cantidad: 1,
      usuario_id: 1,
    });

    const salidasBefore = (await api.stock.salidas()).length;
    await api.ots.finalizar(ot!.id);
    const salidas = await api.stock.salidas();
    const nueva = salidas.find((s) => s.uso === ot!.id_univoco && s.tipo === 'CONSUMIBLE');
    assert.equal(salidas.length, salidasBefore + 1);
    assert.ok(nueva, 'debe existir una salida CONSUMIBLE referida a la OT');
    assert.equal(nueva!.stock_id, null); // record-only: no re-decrementa stock ni es devolvible
    assert.equal(nueva!.articulo_id, stock!.articulo_id);
    assert.equal(nueva!.cantidad, 1);

    // idempotencia: re-finalizar una OT ya cerrada no duplica las salidas
    await api.ots.finalizar(ot!.id);
    assert.equal((await api.stock.salidas()).length, salidasBefore + 1);
  });

  await check('supabase rows: fromDb reconciles schema.sql flags & numeric-as-string', () => {
    // articulos: numeric-string precio, text corte, activo=false -> 'Inactivo'
    const art = articuloFromDb({ id: '5', codigo: 'AR-001', nombre: 'Cloro', precio_unitario: '2100.00', corte: '3', activo: false, detalle: null, created_at: 'x', updated_at: null });
    assert.equal(art.id, 5);
    assert.equal(art.precio_unitario, 2100);
    assert.equal(art.corte, 3);
    assert.equal(art.status, 'Inactivo');
    // unidades: schema column is `activa`; null requiere_ventilacion -> false
    const uni = unidadFromDb({ id: 1, activa: true, requiere_ventilacion: null, edificio_id: '2', frecuencia_ventilacion_dias: '90' });
    assert.equal(uni.status, 'Alta');
    assert.equal(uni.requiere_ventilacion, false);
    assert.equal(uni.frecuencia_ventilacion_dias, 90);
    assert.equal(uni.edificio_id, 2);
    // usuarios: activo -> ALTA/BAJA (not Activo/Inactivo); dni numeric-string
    const usr = usuarioFromDb({ id: 1, usuario_app: 'admin', perfil: 'Admin', activo: true, validado: true, es_testing: false, dni: '30111222' });
    assert.equal(usr.status, 'ALTA');
    assert.equal(usr.dni, 30111222);
    // perfiles_permisos: missing `gerencia` column -> fail-closed 'NO'
    const perm = perfilPermisoFromDb({ id: 1, modulo: 'ABM', admin: 'SI', aplicacion: 'Desktop', activo: true });
    assert.equal(perm.status, 'Activo');
    assert.equal(perm.admin, 'SI');
    assert.equal(perm.gerencia, 'NO');
  });

  await check('supabase rows: operational entity mappers (stock/compras/detalle_compras)', () => {
    // stock: NOT NULL numeric `cantidad`, nullable precio/condicion_corte, activo -> status
    const stk = stockFromDb({ id: '10', articulo_id: '5', cantidad: '3', precio_unitario: '99.90', condicion_corte: null, activo: true, usuario_id: null, fecha: 'x' });
    assert.equal(stk.cantidad, 3);
    assert.equal(stk.precio_unitario, 99.9);
    assert.equal(stk.condicion_corte, null);
    assert.equal(stk.status, 'Activo');
    // compras: status enum passes through untouched; totals are numeric-strings
    const compra = compraFromDb({ id: '1', id_compra: '(BUY)-001', fecha: '2026-07-01', cantidad_total: '4', monto_total: '1200.50', status: 'Pendiente', created_at: 'x' });
    assert.equal(compra.cantidad_total, 4);
    assert.equal(compra.monto_total, 1200.5);
    assert.equal(compra.status, 'Pendiente');
    // detalle_compras: boolean activo -> Activo/Inactivo (schema has no Anulado/No Recibido column yet)
    const detalle = detalleCompraFromDb({ id: '1', compra_id: '1', cantidad: '2', activo: false, fecha: 'x' });
    assert.equal(detalle.status, 'Inactivo');
    assert.equal(detalle.cantidad, 2);
  });

  await check('dashboard stats: monthly aggregations (intake/consumo/incidencias/resolución/ventilaciones)', () => {
    const stats = buildDashboardStats('2026-07', {
      movimientos: [
        { edificio: 'Torre A', cant_anterior: 0, cant_posterior: 5, costo_posterior: 10, fecha: '2026-07-03T10:00:00Z' },
        { edificio: 'Torre A', cant_anterior: 5, cant_posterior: 2, costo_posterior: 10, fecha: '2026-07-04T10:00:00Z' }, // salida (delta<0) -> excluida
        { edificio: 'Torre A', cant_anterior: 0, cant_posterior: 9, costo_posterior: 10, fecha: '2026-06-03T10:00:00Z' }, // otro mes -> excluida
      ],
      salidas: [
        { articulo_id: 1, concat_articulo: 'Cloro', tipo: 'CONSUMIBLE', fecha_salida: '2026-07-05', cantidad: 3 },
        { articulo_id: 1, concat_articulo: 'Cloro', tipo: 'CONSUMIBLE', fecha_salida: '2026-07-06', cantidad: 2 },
        { articulo_id: 2, concat_articulo: 'Lija', tipo: 'DEVOLUCION', fecha_salida: '2026-07-06', cantidad: 9 }, // no es consumo -> excluida
      ],
      ots: [
        { torre: 'Torre A', status: 'Pendiente', fecha_inicio: '2026-07-01', fecha_cierre: null },
        { torre: 'Torre A', status: 'Cerrada', fecha_inicio: '2026-07-01', fecha_cierre: '2026-07-05' }, // 4 días
        { torre: 'Torre B', status: 'Cerrada V', fecha_inicio: '2026-07-02', fecha_cierre: '2026-07-08' }, // 6 días
      ],
      ventilaciones: [
        { edificio: 'Torre A', estado: 'Realizada', fecha_finalizacion: '2026-07-10T00:00:00Z' },
        { edificio: 'Torre A', estado: 'Realizada', fecha_finalizacion: '2026-07-12T00:00:00Z' },
        { edificio: 'Torre B', estado: 'Pendiente', fecha_finalizacion: null }, // no Realizada -> excluida
      ],
    } as any);

    assert.equal(stats.ingresoTotal, 5); // solo la entrada +5 del mes
    assert.equal(stats.ingreso[0].key, 'Torre A');
    assert.equal(stats.ingreso[0].b, 50); // 5 unidades * $10
    assert.equal(stats.consumoTotal, 5); // Cloro 3+2; DEVOLUCION excluida
    assert.equal(stats.consumo[0].key, 'Cloro');
    assert.equal(stats.incidenciasTotal, 3); // 3 OTs iniciadas en el mes
    assert.equal(stats.resolProm, 5); // (4 + 6) / 2 cerradas
    assert.equal(stats.ventTotal, 2); // 2 ventilaciones Realizadas
    assert.equal(stats.ventilacionesLimpiadas[0].a, 2);
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
