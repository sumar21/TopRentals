// Offline, credential-free smoke checks (`npm run check`, i.e.
// `node --experimental-strip-types src/checks.ts`). Covers coerce.ts's pure
// functions, resolve.ts's fallback/dirty-data logic, and mappings.ts's mapRow
// dispatch — the parts of this migration that can be verified without a real
// SharePoint site or Supabase project.

import assert from 'node:assert/strict';
import {
  activoToBool,
  altaBajaToBool,
  combineDateTime,
  emptyToNull,
  parseDMY,
  parseHora,
  parseNumber,
  siNoToBool,
} from './coerce.ts';
import { mapRow, type Mapping } from './mappings.ts';
import { ResolutionContext } from './resolve.ts';

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

async function main() {
  // ---- coerce.ts -----------------------------------------------------------
  await check('emptyToNull: blank/whitespace/"null" -> null, trims otherwise', () => {
    assert.equal(emptyToNull(''), null);
    assert.equal(emptyToNull('   '), null);
    assert.equal(emptyToNull('null'), null);
    assert.equal(emptyToNull(null), null);
    assert.equal(emptyToNull(undefined), null);
    assert.equal(emptyToNull('  hola  '), 'hola');
  });

  await check('parseDMY: strict dd/mm/yyyy, rejects impossible dates, never throws', () => {
    assert.equal(parseDMY('23/07/2026'), '2026-07-23');
    assert.equal(parseDMY('31/02/2026'), null); // Feb 31 doesn't exist
    assert.equal(parseDMY('2026-07-23'), null); // wrong shape
    assert.equal(parseDMY(''), null);
    assert.equal(parseDMY(undefined), null);
    assert.doesNotThrow(() => parseDMY('not a date'));
  });

  await check('parseHora: HH:mm -> HH:mm:00, rejects out-of-range, never throws', () => {
    assert.equal(parseHora('9:30'), '09:30:00');
    assert.equal(parseHora('23:59'), '23:59:00');
    assert.equal(parseHora('24:00'), null);
    assert.equal(parseHora('12:60'), null);
    assert.equal(parseHora(''), null);
  });

  await check('combineDateTime: date + hora -> timestamp; missing hora falls back to midnight', () => {
    assert.equal(combineDateTime('23/07/2026', '14:05'), '2026-07-23T14:05:00');
    assert.equal(combineDateTime('23/07/2026', ''), '2026-07-23T00:00:00');
    assert.equal(combineDateTime('', '14:05'), null);
  });

  await check('parseNumber: comma decimal, dot decimal, thousands+decimal mix, garbage -> null', () => {
    assert.equal(parseNumber('1234'), 1234);
    assert.equal(parseNumber('1234,50'), 1234.5);
    assert.equal(parseNumber('1234.50'), 1234.5);
    assert.equal(parseNumber('1.234,50'), 1234.5); // '.' thousands, ',' decimal
    assert.equal(parseNumber('1,234.50'), 1234.5); // ',' thousands, '.' decimal
    assert.equal(parseNumber(''), null);
    assert.equal(parseNumber('abc'), null);
    assert.equal(parseNumber(42), 42);
  });

  await check('siNoToBool / activoToBool / altaBajaToBool: tolerant, case-insensitive, null on unknown', () => {
    assert.equal(siNoToBool('SI'), true);
    assert.equal(siNoToBool('no'), false);
    assert.equal(siNoToBool('quizas'), null);
    assert.equal(activoToBool('Activo'), true);
    assert.equal(activoToBool('INACTIVO'), false);
    assert.equal(altaBajaToBool('ALTA'), true);
    assert.equal(altaBajaToBool('Baja'), false);
  });

  // ---- mappings.ts: mapRow dispatch -----------------------------------------
  await check('mapRow: applies each coercion type and combines datetime mappings', () => {
    const mapping: Mapping[] = [
      { pg: 'nombre', sp: 'Nombre_X', type: 'text' },
      { pg: 'cantidad', sp: 'Cantidad_X', type: 'number' },
      { pg: 'activo', sp: 'Status_X', type: 'bool_activo_inactivo' },
      { kind: 'datetime', pg: 'fecha', spDate: 'Fecha_X', spHora: 'Hora_X' },
    ];
    const row = mapRow(mapping, {
      Nombre_X: '  Juan  ',
      Cantidad_X: '10,5',
      Status_X: 'Activo',
      Fecha_X: '01/01/2026',
      Hora_X: '08:00',
    });
    assert.equal(row.nombre, 'Juan');
    assert.equal(row.cantidad, 10.5);
    assert.equal(row.activo, true);
    assert.equal(row.fecha, '2026-01-01T08:00:00');
  });

  // ---- resolve.ts: dirty-data fallbacks --------------------------------------
  await check('ResolutionContext.resolveArticuloDirty: numeric id first, else codigo, else null', () => {
    const ctx = new ResolutionContext();
    ctx.articuloIds.add(42);
    ctx.articuloByCodigo.set('ART-001', 7);
    assert.equal(ctx.resolveArticuloDirty(42), 42); // numeric id wins
    assert.equal(ctx.resolveArticuloDirty('ART-001'), 7); // falls back to codigo
    assert.equal(ctx.resolveArticuloDirty('nope'), null);
    assert.equal(ctx.resolveArticuloDirty(''), null);
  });

  await check('ResolutionContext.resolveEdificioFirst / splitEdificioIds: ";"-joined multivalue', () => {
    const ctx = new ResolutionContext();
    ctx.edificioIds.add(16);
    ctx.edificioIds.add(17);
    assert.equal(ctx.resolveEdificioFirst('16;17'), 16);
    assert.deepEqual(ctx.splitEdificioIds('16;17'), [16, 17]);
    assert.deepEqual(ctx.splitEdificioIds('16;999'), [16]); // 999 doesn't exist -> dropped
    assert.deepEqual(ctx.splitEdificioIds(''), []);
  });

  await check('ResolutionContext.resolveCompra: SP id first, business-key fallback second', () => {
    const ctx = new ResolutionContext();
    ctx.compraIds.add(5);
    ctx.compraByBusinessKey.set('(BUY)-001', 9);
    assert.equal(ctx.resolveCompra(5), 5);
    assert.equal(ctx.resolveCompra(999, '(BUY)-001'), 9); // id fails -> business key
    assert.equal(ctx.resolveCompra(null, '(BUY)-001'), 9);
    assert.equal(ctx.resolveCompra(999, 'unknown'), null);
  });

  await check('ResolutionContext.report/toUnresolvedCsv: escapes quotes/commas, never throws on dirty data', () => {
    const ctx = new ResolutionContext();
    ctx.report('08.MovimientoStock', 123, 'articulo_id', 'ART-999, "raw"');
    const csv = ctx.toUnresolvedCsv();
    assert.match(csv, /^list,sp_id,column,raw_value\n/);
    assert.match(csv, /"08\.MovimientoStock","123","articulo_id","ART-999, ""raw"""/);
  });

  await check('resolveByMap / resolveDirectId: null on empty/missing, never throw', () => {
    const ctx = new ResolutionContext();
    ctx.userByConcatName.set('Juan Perez', 3);
    assert.equal(ctx.resolveByMap(ctx.userByConcatName, 'Juan Perez'), 3);
    assert.equal(ctx.resolveByMap(ctx.userByConcatName, 'nadie'), null);
    assert.equal(ctx.resolveByMap(ctx.userByConcatName, null), null);
    ctx.unidadIds.add(10);
    assert.equal(ctx.resolveDirectId(ctx.unidadIds, '10'), 10);
    assert.equal(ctx.resolveDirectId(ctx.unidadIds, 'not-a-number'), null);
    assert.equal(ctx.resolveDirectId(ctx.unidadIds, ''), null);
  });

  console.log(`\n${passed} check(s) passed.`);
}

main();
