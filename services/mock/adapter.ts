// Mock DataApi adapter: in-memory copies of services/mock/data.ts, mutated in place.
// One instance = one isolated "session" (structuredClone at construction time).
// ~150ms artificial latency on every call so loading states are visible in the UI.

import type { CompraConDetalle, CompraLineaInput, DataApi, StockRowWithEdificios } from '../api.ts';
import type {
  Articulo,
  Bitacora,
  Compra,
  DetalleCompra,
  MovimientoStock,
  OrdenTrabajo,
  RepuestoOT,
  SalidaStock,
  StockRow,
  Usuario,
  Ventilacion,
} from '../types.ts';
import * as seed from './data.ts';

const LATENCY_MS = 150;
const sleep = (ms = LATENCY_MS) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function nextId(rows: { id: number }[]): number {
  return rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;
}

const nowIso = () => new Date().toISOString();
const todayIso = () => new Date().toISOString().slice(0, 10);

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function sumLineas(lineas: CompraLineaInput[]) {
  return {
    cantidad_total: lineas.reduce((sum, l) => sum + l.cantidad, 0),
    monto_total: lineas.reduce((sum, l) => sum + l.cantidad * l.costo_unitario, 0),
  };
}

export function createMockAdapter(): DataApi {
  // Deep-cloned mutable state, isolated per adapter instance — never touches the seed module.
  const db = {
    usuarios: structuredClone(seed.usuarios),
    edificios: structuredClone(seed.edificios),
    articulos: structuredClone(seed.articulos),
    unidades: structuredClone(seed.unidades),
    frecuencias: structuredClone(seed.frecuencias),
    perfilesPermisos: structuredClone(seed.perfilesPermisos),
    emailsNotificacion: structuredClone(seed.emailsNotificacion),
    ordenesTrabajo: structuredClone(seed.ordenesTrabajo),
    bitacoras: structuredClone(seed.bitacoras),
    fotosBitacora: structuredClone(seed.fotosBitacora),
    repuestosOT: structuredClone(seed.repuestosOT),
    stock: structuredClone(seed.stock),
    stockEdificios: structuredClone(seed.stockEdificios),
    movimientosStock: structuredClone(seed.movimientosStock),
    salidasStock: structuredClone(seed.salidasStock),
    compras: structuredClone(seed.compras),
    detalleCompras: structuredClone(seed.detalleCompras),
    aprobaciones: structuredClone(seed.aprobaciones),
    ventilaciones: structuredClone(seed.ventilaciones),
    documentos: structuredClone(seed.documentos),
    credenciales: structuredClone(seed.credenciales),
  };

  const nombreArticulo = (id: number | null) => db.articulos.find((a) => a.id === id)?.nombre ?? null;
  const nombreEdificio = (id: number | null) => db.edificios.find((e) => e.id === id)?.nombre ?? null;

  function withEdificios(row: StockRow): StockRowWithEdificios {
    return { ...row, edificio_ids: db.stockEdificios.filter((se) => se.stock_id === row.id).map((se) => se.edificio_id) };
  }

  function stockRowFor(articulo_id: number, edificio_id: number): StockRow | undefined {
    return db.stock.find(
      (s) => s.articulo_id === articulo_id && db.stockEdificios.some((se) => se.stock_id === s.id && se.edificio_id === edificio_id),
    );
  }

  /** Every stock mutation writes one of these — append-only audit trail (CLAUDE.md domain rule). */
  function registrarMovimiento(input: Omit<MovimientoStock, 'id'>): MovimientoStock {
    const row: MovimientoStock = { id: nextId(db.movimientosStock), ...input };
    db.movimientosStock.push(row);
    return row;
  }

  function detalleActivo(compra_id: number) {
    return db.detalleCompras.filter((d) => d.compra_id === compra_id && d.status === 'Activo');
  }

  function compraConDetalle(compra: Compra): CompraConDetalle {
    return { ...compra, detalle: db.detalleCompras.filter((d) => d.compra_id === compra.id).map((d) => ({ ...d })) };
  }

  function insertarLineas(compra_id: number, articuloDefault: Articulo | undefined, lineas: CompraLineaInput[]) {
    for (const linea of lineas) {
      const art = db.articulos.find((a) => a.id === linea.articulo_id) ?? articuloDefault;
      const row: DetalleCompra = {
        id: nextId(db.detalleCompras),
        compra_id,
        id_univoco: `(DTC)-${String(nextId(db.detalleCompras)).padStart(3, '0')}`,
        articulo_id: linea.articulo_id,
        articulo: art?.nombre ?? null,
        edificio_id: linea.edificio_id,
        edificio: nombreEdificio(linea.edificio_id),
        cantidad: linea.cantidad,
        recibido: null,
        costo_unitario: linea.costo_unitario,
        cant_min: art?.corte ?? null,
        costo_total: linea.cantidad * linea.costo_unitario,
        status: 'Activo',
        usuario_id: null,
        fecha: nowIso(),
        version_app: null,
      };
      db.detalleCompras.push(row);
    }
  }

  function reemplazarLineas(compra_id: number, lineas: CompraLineaInput[]) {
    detalleActivo(compra_id).forEach((d) => (d.status = 'Inactivo'));
    insertarLineas(compra_id, undefined, lineas);
  }

  const api: DataApi = {
    auth: {
      async login(usuario, password) {
        await sleep();
        const usr = db.usuarios.find((u) => u.usuario_app === usuario && u.status === 'ALTA');
        if (!usr || db.credenciales[usuario] !== password) throw new Error('Usuario o contraseña incorrectos.');
        return structuredClone(usr);
      },
    },

    usuarios: {
      async list() {
        await sleep();
        return structuredClone(db.usuarios);
      },
      async get(id) {
        await sleep();
        return structuredClone(db.usuarios.find((u) => u.id === id) ?? null);
      },
      async crear(input) {
        await sleep();
        const row: Usuario = { id: nextId(db.usuarios), created_at: nowIso(), updated_at: nowIso(), ...input };
        db.usuarios.push(row);
        db.credenciales[row.usuario_app] = '1234';
        return structuredClone(row);
      },
      async actualizar(id, patch) {
        await sleep();
        const row = db.usuarios.find((u) => u.id === id);
        if (!row) throw new Error(`Usuario ${id} no encontrado.`);
        Object.assign(row, patch, { updated_at: nowIso() });
        return structuredClone(row);
      },
      async eliminar(id) {
        await sleep();
        const row = db.usuarios.find((u) => u.id === id);
        if (row) row.status = 'BAJA';
      },
    },

    edificios: {
      async list() {
        await sleep();
        return structuredClone(db.edificios);
      },
    },

    articulos: {
      async list() {
        await sleep();
        return structuredClone(db.articulos);
      },
      async crear(input) {
        await sleep();
        const row: Articulo = { id: nextId(db.articulos), created_at: nowIso(), updated_at: nowIso(), ...input };
        db.articulos.push(row);
        return structuredClone(row);
      },
      async actualizar(id, patch) {
        await sleep();
        const row = db.articulos.find((a) => a.id === id);
        if (!row) throw new Error(`Articulo ${id} no encontrado.`);
        Object.assign(row, patch, { updated_at: nowIso() });
        return structuredClone(row);
      },
    },

    unidades: {
      async list() {
        await sleep();
        return structuredClone(db.unidades);
      },
    },

    frecuencias: {
      async list() {
        await sleep();
        return structuredClone(db.frecuencias);
      },
    },

    emailsNotificacion: {
      async list() {
        await sleep();
        return structuredClone(db.emailsNotificacion);
      },
    },

    perfilesPermisos: {
      async list() {
        await sleep();
        return structuredClone(db.perfilesPermisos);
      },
    },

    stock: {
      async list() {
        await sleep();
        return db.stock.map(withEdificios);
      },

      async agregar({ articulo_id, edificio_id, cantidad, precio_unitario, usuario_id }) {
        await sleep();
        let row = stockRowFor(articulo_id, edificio_id);
        const cant_anterior = row?.cantidad ?? 0;
        if (row) {
          row.cantidad += cantidad;
          row.precio_unitario = precio_unitario;
        } else {
          row = {
            id: nextId(db.stock),
            id_univoco: `(STK)-${String(nextId(db.stock)).padStart(3, '0')}`,
            articulo_id,
            cantidad,
            precio_unitario,
            condicion_corte: db.articulos.find((a) => a.id === articulo_id)?.corte ?? 0,
            status: 'Activo',
            usuario_id,
            fecha: nowIso(),
            ultima_mod: null,
            desde: 'Desktop',
            version_app: null,
          };
          db.stock.push(row);
          db.stockEdificios.push({ stock_id: row.id, edificio_id });
        }
        // Screen_Stock behavior: Agregar/Editar Stock keeps the article master price in sync.
        const articulo = db.articulos.find((a) => a.id === articulo_id);
        if (articulo) articulo.precio_unitario = precio_unitario;
        registrarMovimiento({
          articulo_id,
          articulo_raw: String(articulo_id),
          concat_articulo: nombreArticulo(articulo_id),
          articulo: nombreArticulo(articulo_id),
          cant_anterior,
          cant_posterior: row.cantidad,
          costo_anterior: null,
          costo_posterior: precio_unitario,
          stock_min_anterior: null,
          stock_min_posterior: row.condicion_corte,
          edificio_id,
          edificio_raw: null,
          edificio: nombreEdificio(edificio_id),
          edificio_traslado: null,
          desde: 'Desktop - Stock',
          tipo_movimiento: cant_anterior === 0 ? 'Nuevo' : 'Editado',
          cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        });
        return withEdificios(row);
      },

      async salida({ stock_id, edificio_id, tipo, cantidad, tecnico_id, uso, centro_de_costo, usuario_id, edificio_destino_id }) {
        await sleep();
        const row = db.stock.find((s) => s.id === stock_id);
        if (!row) throw new Error(`Stock ${stock_id} no encontrado.`);
        if (row.cantidad < cantidad) throw new Error('Cantidad insuficiente.');
        const cant_anterior = row.cantidad;
        row.cantidad -= cantidad;
        registrarMovimiento({
          articulo_id: row.articulo_id,
          articulo_raw: String(row.articulo_id),
          concat_articulo: nombreArticulo(row.articulo_id),
          articulo: nombreArticulo(row.articulo_id),
          cant_anterior,
          cant_posterior: row.cantidad,
          costo_anterior: row.precio_unitario,
          costo_posterior: row.precio_unitario,
          stock_min_anterior: row.condicion_corte,
          stock_min_posterior: row.condicion_corte,
          edificio_id,
          edificio_raw: null,
          edificio: nombreEdificio(edificio_id),
          edificio_traslado: tipo === 'TRASLADO' ? nombreEdificio(edificio_destino_id ?? null) : null,
          desde: 'Desktop - Salida Stock',
          tipo_movimiento: tipo,
          cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        });
        if (tipo === 'TRASLADO') {
          if (!edificio_destino_id) throw new Error('TRASLADO requiere edificio_destino_id.');
          let destino = stockRowFor(row.articulo_id, edificio_destino_id);
          if (destino) {
            destino.cantidad += cantidad;
          } else {
            destino = { ...structuredClone(row), id: nextId(db.stock), cantidad };
            db.stock.push(destino);
            db.stockEdificios.push({ stock_id: destino.id, edificio_id: edificio_destino_id });
          }
        }
        const salidaRow: SalidaStock = {
          id: nextId(db.salidasStock),
          articulo_id: row.articulo_id,
          concat_articulo: nombreArticulo(row.articulo_id),
          tecnico_id,
          tipo,
          fecha_salida: todayIso(),
          fecha_reingreso: null,
          uso,
          centro_de_costo,
          cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        };
        db.salidasStock.push(salidaRow);
        return structuredClone(salidaRow);
      },

      async editar({ stock_id, cantidad, precio_unitario, condicion_corte, usuario_id }) {
        await sleep();
        const row = db.stock.find((s) => s.id === stock_id);
        if (!row) throw new Error(`Stock ${stock_id} no encontrado.`);
        const cant_anterior = row.cantidad;
        const costo_anterior = row.precio_unitario;
        const stock_min_anterior = row.condicion_corte;
        row.cantidad = cantidad;
        row.precio_unitario = precio_unitario;
        row.condicion_corte = condicion_corte;
        const edificio_id = db.stockEdificios.find((se) => se.stock_id === row.id)?.edificio_id ?? null;
        registrarMovimiento({
          articulo_id: row.articulo_id,
          articulo_raw: String(row.articulo_id),
          concat_articulo: nombreArticulo(row.articulo_id),
          articulo: nombreArticulo(row.articulo_id),
          cant_anterior,
          cant_posterior: cantidad,
          costo_anterior,
          costo_posterior: precio_unitario,
          stock_min_anterior,
          stock_min_posterior: condicion_corte,
          edificio_id,
          edificio_raw: null,
          edificio: nombreEdificio(edificio_id),
          edificio_traslado: null,
          desde: 'Desktop - Stock',
          tipo_movimiento: 'Editado',
          cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        });
        return withEdificios(row);
      },

      async editarSalida({ salida_id, cantidad, usuario_id }) {
        await sleep();
        const salida = db.salidasStock.find((s) => s.id === salida_id);
        if (!salida) throw new Error(`Salida ${salida_id} no encontrada.`);
        if (salida.fecha_reingreso) throw new Error('La salida ya fue devuelta.');
        const edificio = db.edificios.find((e) => e.nombre === salida.centro_de_costo) ?? null;
        const stockRow =
          (edificio &&
            db.stock.find(
              (s) => s.articulo_id === salida.articulo_id && db.stockEdificios.some((se) => se.stock_id === s.id && se.edificio_id === edificio.id),
            )) ||
          db.stock.find((s) => s.articulo_id === salida.articulo_id);
        if (!stockRow) throw new Error('No se encontró stock para el artículo.');
        const delta = salida.cantidad - cantidad; // positive delta returns stock to the shelf
        if (delta < 0 && stockRow.cantidad < -delta) throw new Error('Cantidad insuficiente.');
        const cant_anterior = stockRow.cantidad;
        stockRow.cantidad += delta;
        salida.cantidad = cantidad;
        registrarMovimiento({
          articulo_id: salida.articulo_id,
          articulo_raw: String(salida.articulo_id),
          concat_articulo: nombreArticulo(salida.articulo_id),
          articulo: nombreArticulo(salida.articulo_id),
          cant_anterior,
          cant_posterior: stockRow.cantidad,
          costo_anterior: stockRow.precio_unitario,
          costo_posterior: stockRow.precio_unitario,
          stock_min_anterior: stockRow.condicion_corte,
          stock_min_posterior: stockRow.condicion_corte,
          edificio_id: edificio?.id ?? null,
          edificio_raw: null,
          edificio: edificio?.nombre ?? null,
          edificio_traslado: null,
          desde: 'Desktop - Salida Stock',
          tipo_movimiento: `${salida.tipo} - EDIT CANT`,
          cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        });
        return structuredClone(salida);
      },

      async confirmarDevolucion({ salida_id, usuario_id }) {
        await sleep();
        const salida = db.salidasStock.find((s) => s.id === salida_id);
        if (!salida) throw new Error(`Salida ${salida_id} no encontrada.`);
        if (salida.tipo !== 'DEVOLUCION' || salida.fecha_reingreso) throw new Error('La salida no está pendiente de devolución.');
        const edificio = db.edificios.find((e) => e.nombre === salida.centro_de_costo) ?? null;
        const stockRow =
          (edificio &&
            db.stock.find(
              (s) => s.articulo_id === salida.articulo_id && db.stockEdificios.some((se) => se.stock_id === s.id && se.edificio_id === edificio.id),
            )) ||
          db.stock.find((s) => s.articulo_id === salida.articulo_id);
        if (!stockRow) throw new Error('No se encontró stock para el artículo.');
        const cant_anterior = stockRow.cantidad;
        stockRow.cantidad += salida.cantidad;
        salida.fecha_reingreso = todayIso();
        salida.tipo = 'DEVUELTO';
        // Audit row on return — deliberately added: the PA flow had this Patch commented out.
        registrarMovimiento({
          articulo_id: salida.articulo_id,
          articulo_raw: String(salida.articulo_id),
          concat_articulo: nombreArticulo(salida.articulo_id),
          articulo: nombreArticulo(salida.articulo_id),
          cant_anterior,
          cant_posterior: stockRow.cantidad,
          costo_anterior: stockRow.precio_unitario,
          costo_posterior: stockRow.precio_unitario,
          stock_min_anterior: stockRow.condicion_corte,
          stock_min_posterior: stockRow.condicion_corte,
          edificio_id: edificio?.id ?? null,
          edificio_raw: null,
          edificio: edificio?.nombre ?? null,
          edificio_traslado: null,
          desde: 'Desktop - Salida Stock',
          tipo_movimiento: 'DEVOLUCION - REINGRESO',
          cantidad: salida.cantidad,
          usuario_id,
          fecha: nowIso(),
          version_app: null,
        });
        return structuredClone(salida);
      },

      async movimientos() {
        await sleep();
        return structuredClone(db.movimientosStock);
      },
      async salidas() {
        await sleep();
        return structuredClone(db.salidasStock);
      },
    },

    compras: {
      async list() {
        await sleep();
        return structuredClone(db.compras);
      },
      async get(id) {
        await sleep();
        const row = db.compras.find((c) => c.id === id);
        return row ? compraConDetalle(row) : null;
      },
      async crear(input, lineas) {
        await sleep();
        const { cantidad_total, monto_total } = sumLineas(lineas);
        const id = nextId(db.compras);
        const row: Compra = {
          ...input,
          id,
          created_at: nowIso(),
          id_compra: `(BUY)-${String(id).padStart(3, '0')}${todayIso().replace(/-/g, '')}`,
          cantidad_total,
          monto_total,
        };
        db.compras.push(row);
        insertarLineas(row.id, undefined, lineas);
        return compraConDetalle(row);
      },
      async actualizar(id, patch, lineas) {
        await sleep();
        const row = db.compras.find((c) => c.id === id);
        if (!row) throw new Error(`Compra ${id} no encontrada.`);
        Object.assign(row, patch);
        if (lineas) {
          reemplazarLineas(id, lineas);
          const totales = sumLineas(lineas);
          row.cantidad_total = totales.cantidad_total;
          row.monto_total = totales.monto_total;
        }
        return compraConDetalle(row);
      },
      async enviarAprobacion(id) {
        await sleep();
        const row = db.compras.find((c) => c.id === id);
        if (!row) throw new Error(`Compra ${id} no encontrada.`);
        row.status = 'Aprobacion';
        const aprobacion = {
          id: nextId(db.aprobaciones),
          compra_id: row.id,
          status: 'Pendiente' as const,
          fecha: todayIso(),
          urgencia: row.urgencia,
          tecnico: row.usuario_compra,
          obs_compra: row.observacion,
          fecha_aprobada: null,
          obs_rechazo: null,
          user_gen_id: row.usuario_id,
          user_aprob_id: null,
          cantidad: row.cantidad_total,
          monto: row.monto_total,
          sector: null,
          version_app: null,
          hora: new Date().toISOString().slice(11, 16),
        };
        db.aprobaciones.push(aprobacion);
        return structuredClone(aprobacion);
      },
      async recibir(id, lineas, obs_recibir) {
        await sleep();
        const row = db.compras.find((c) => c.id === id);
        if (!row) throw new Error(`Compra ${id} no encontrada.`);
        row.status = 'Recibida';
        row.obs_recibir = obs_recibir;
        for (const { detalle_id, recibido } of lineas) {
          const linea = db.detalleCompras.find((d) => d.id === detalle_id);
          if (!linea) continue;
          linea.recibido = recibido;
          if (linea.articulo_id && linea.edificio_id && recibido > 0) {
            let stockRow = stockRowFor(linea.articulo_id, linea.edificio_id);
            const cant_anterior = stockRow?.cantidad ?? 0;
            if (stockRow) {
              stockRow.cantidad += recibido;
            } else {
              stockRow = {
                id: nextId(db.stock),
                id_univoco: `(STK)-${String(nextId(db.stock)).padStart(3, '0')}`,
                articulo_id: linea.articulo_id,
                cantidad: recibido,
                precio_unitario: linea.costo_unitario,
                condicion_corte: linea.cant_min,
                status: 'Activo',
                usuario_id: row.usuario_id,
                fecha: nowIso(),
                ultima_mod: null,
                desde: 'Desktop',
                version_app: null,
              };
              db.stock.push(stockRow);
              db.stockEdificios.push({ stock_id: stockRow.id, edificio_id: linea.edificio_id });
            }
            registrarMovimiento({
              articulo_id: linea.articulo_id,
              articulo_raw: String(linea.articulo_id),
              concat_articulo: linea.articulo,
              articulo: linea.articulo,
              cant_anterior,
              cant_posterior: stockRow.cantidad,
              costo_anterior: null,
              costo_posterior: linea.costo_unitario,
              stock_min_anterior: null,
              stock_min_posterior: stockRow.condicion_corte,
              edificio_id: linea.edificio_id,
              edificio_raw: null,
              edificio: linea.edificio,
              edificio_traslado: null,
              desde: 'Desktop - Recibir Compra',
              tipo_movimiento: cant_anterior === 0 ? 'Nuevo' : 'Existente',
              cantidad: recibido,
              usuario_id: row.usuario_id,
              fecha: nowIso(),
              version_app: null,
            });
          }
        }
        const aprobacion = db.aprobaciones.find((a) => a.compra_id === id);
        if (aprobacion) aprobacion.status = 'Recibida';
        return compraConDetalle(row);
      },
      async anular(id) {
        await sleep();
        const row = db.compras.find((c) => c.id === id);
        if (!row) throw new Error(`Compra ${id} no encontrada.`);
        row.status = 'Anulada';
        detalleActivo(id).forEach((d) => (d.status = 'Anulado'));
        return structuredClone(row);
      },
    },

    aprobaciones: {
      async list() {
        await sleep();
        return structuredClone(db.aprobaciones);
      },
      async aprobar(id, user_aprob_id) {
        await sleep();
        const row = db.aprobaciones.find((a) => a.id === id);
        if (!row) throw new Error(`Aprobacion ${id} no encontrada.`);
        row.status = 'Aprobada';
        row.fecha_aprobada = todayIso();
        row.user_aprob_id = user_aprob_id;
        const compraRow = db.compras.find((c) => c.id === row.compra_id);
        if (compraRow) compraRow.status = 'Aprobada';
        return structuredClone(row);
      },
      async rechazar(id, motivo, user_aprob_id) {
        await sleep();
        const row = db.aprobaciones.find((a) => a.id === id);
        if (!row) throw new Error(`Aprobacion ${id} no encontrada.`);
        row.status = 'Rechazada';
        row.obs_rechazo = motivo;
        row.user_aprob_id = user_aprob_id;
        const compraRow = db.compras.find((c) => c.id === row.compra_id);
        if (compraRow) {
          compraRow.status = 'Rechazada';
          detalleActivo(compraRow.id).forEach((d) => (d.status = 'Inactivo'));
        }
        return structuredClone(row);
      },
      async editar(id, lineas, header) {
        await sleep();
        const row = db.aprobaciones.find((a) => a.id === id);
        if (!row) throw new Error(`Aprobacion ${id} no encontrada.`);
        reemplazarLineas(row.compra_id, lineas);
        const totales = sumLineas(lineas);
        row.cantidad = totales.cantidad_total;
        row.monto = totales.monto_total;
        const compraRow = db.compras.find((c) => c.id === row.compra_id);
        if (compraRow) {
          compraRow.cantidad_total = totales.cantidad_total;
          compraRow.monto_total = totales.monto_total;
          if (header) Object.assign(compraRow, header);
        }
        if (header?.urgencia) row.urgencia = header.urgencia;
        return structuredClone(row);
      },
    },

    ots: {
      async list() {
        await sleep();
        return structuredClone(db.ordenesTrabajo);
      },
      async get(id) {
        await sleep();
        return structuredClone(db.ordenesTrabajo.find((o) => o.id === id) ?? null);
      },
      async crear(input) {
        await sleep();
        const id = nextId(db.ordenesTrabajo);
        const row: OrdenTrabajo = {
          ...input,
          id,
          id_univoco: `(OT)-TR-${String(id).padStart(3, '0')}${todayIso().replace(/-/g, '')}${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`,
          created_at: nowIso(),
        };
        db.ordenesTrabajo.push(row);
        return structuredClone(row);
      },
      async actualizar(id, patch) {
        await sleep();
        const row = db.ordenesTrabajo.find((o) => o.id === id);
        if (!row) throw new Error(`Orden de trabajo ${id} no encontrada.`);
        Object.assign(row, patch);
        return structuredClone(row);
      },
      async anular(id) {
        await sleep();
        const row = db.ordenesTrabajo.find((o) => o.id === id);
        if (!row) throw new Error(`Orden de trabajo ${id} no encontrada.`);
        row.status = 'Anulada';
        return structuredClone(row);
      },
      async cerrar(id, tipo) {
        await sleep();
        const row = db.ordenesTrabajo.find((o) => o.id === id);
        if (!row) throw new Error(`Orden de trabajo ${id} no encontrada.`);
        row.status = tipo;
        row.fecha_cierre = todayIso();
        return structuredClone(row);
      },
      async finalizar(id) {
        await sleep();
        const row = db.ordenesTrabajo.find((o) => o.id === id);
        if (!row) throw new Error(`Orden de trabajo ${id} no encontrada.`);
        row.status = 'Cerrada';
        row.fecha_cierre = todayIso();
        return structuredClone(row);
      },
      async replicar(id) {
        await sleep();
        const original = db.ordenesTrabajo.find((o) => o.id === id);
        if (!original) throw new Error(`Orden de trabajo ${id} no encontrada.`);
        const newId = nextId(db.ordenesTrabajo);
        const row: OrdenTrabajo = {
          ...original,
          id: newId,
          id_univoco: `(OT)-TR-${String(newId).padStart(3, '0')}${todayIso().replace(/-/g, '')}${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`,
          status: 'Pendiente',
          orden_revision_id: original.id,
          fecha_cierre: null,
          fecha_asignada: null,
          tecnico_id: null,
          created_at: nowIso(),
        };
        db.ordenesTrabajo.push(row);
        return structuredClone(row);
      },

      bitacoras: {
        async list(orden_trabajo_id) {
          await sleep();
          return structuredClone(db.bitacoras.filter((b) => b.orden_trabajo_id === orden_trabajo_id));
        },
        async crear({ orden_trabajo_id, descripcion, usuario_id, foto_path }) {
          await sleep();
          const id = nextId(db.bitacoras);
          const row: Bitacora = {
            id,
            orden_trabajo_id,
            id_univoco_bitacora: `BC-${String(id).padStart(4, '0')}${todayIso().replace(/-/g, '')}${new Date().toISOString().slice(11, 19).replace(/:/g, '')}`,
            descripcion,
            fecha: nowIso(),
            usuario_id,
            version_app: null,
          };
          db.bitacoras.push(row);
          if (foto_path) {
            db.fotosBitacora.push({ id: nextId(db.fotosBitacora), orden_trabajo_id, bitacora_id: id, foto_path, created_at: nowIso() });
          }
          return structuredClone(row);
        },
      },

      repuestos: {
        async list(orden_trabajo_id) {
          await sleep();
          return structuredClone(db.repuestosOT.filter((r) => r.orden_trabajo_id === orden_trabajo_id && r.status === 'Activo'));
        },
        async asignarRepuesto({ orden_trabajo_id, articulo_id, edificio_id, cantidad, usuario_id }) {
          await sleep();
          const stockRow = stockRowFor(articulo_id, edificio_id);
          if (!stockRow || stockRow.cantidad < cantidad) throw new Error('Cantidad insuficiente.');
          const cant_anterior = stockRow.cantidad;
          stockRow.cantidad -= cantidad;
          const row: RepuestoOT = {
            id: nextId(db.repuestosOT),
            orden_trabajo_id,
            articulo_id,
            repuesto: nombreArticulo(articulo_id),
            cantidad,
            edificio: nombreEdificio(edificio_id),
            usuario_id,
            fecha: nowIso(),
            status: 'Activo',
            version_app: null,
          };
          db.repuestosOT.push(row);
          registrarMovimiento({
            articulo_id,
            articulo_raw: String(articulo_id),
            concat_articulo: nombreArticulo(articulo_id),
            articulo: nombreArticulo(articulo_id),
            cant_anterior,
            cant_posterior: stockRow.cantidad,
            costo_anterior: stockRow.precio_unitario,
            costo_posterior: stockRow.precio_unitario,
            stock_min_anterior: stockRow.condicion_corte,
            stock_min_posterior: stockRow.condicion_corte,
            edificio_id,
            edificio_raw: null,
            edificio: nombreEdificio(edificio_id),
            edificio_traslado: null,
            desde: 'Mobile - OT',
            tipo_movimiento: 'Asignacion Repuesto',
            cantidad,
            usuario_id,
            fecha: nowIso(),
            version_app: null,
          });
          return structuredClone(row);
        },
        async quitar(id) {
          await sleep();
          const row = db.repuestosOT.find((r) => r.id === id);
          if (row) row.status = 'Inactivo';
        },
      },
    },

    ventilaciones: {
      async list() {
        await sleep();
        return structuredClone(db.ventilaciones);
      },
      async crear(input) {
        await sleep();
        const row: Ventilacion = { id: nextId(db.ventilaciones), ...input };
        db.ventilaciones.push(row);
        // PA parity: creating a schedule flags the unit as under ventilation control.
        const unidad = db.unidades.find((u) => u.id === row.unidad_id);
        if (unidad) unidad.requiere_ventilacion = true;
        return structuredClone(row);
      },
      async asignar({ id, tecnico_id, proxima_limpieza, frecuencia_dias }) {
        await sleep();
        const row = db.ventilaciones.find((v) => v.id === id);
        if (!row) throw new Error(`Ventilacion ${id} no encontrada.`);
        row.estado = 'Asignada';
        row.asignado_id = tecnico_id;
        row.proxima_limpieza = proxima_limpieza;
        row.fecha_asignado = nowIso();
        row.orden = 3;
        if (frecuencia_dias != null) {
          row.frecuencia_dias = frecuencia_dias;
          const unidad = db.unidades.find((u) => u.id === row.unidad_id);
          if (unidad) unidad.frecuencia_ventilacion_dias = frecuencia_dias;
        }
        return structuredClone(row);
      },
      async programar(id, fecha_programada) {
        await sleep();
        const row = db.ventilaciones.find((v) => v.id === id);
        if (!row) throw new Error(`Ventilacion ${id} no encontrada.`);
        row.fecha_programada = fecha_programada;
        row.estado = 'Programada';
        row.orden = 2;
        return structuredClone(row);
      },
      async finalizar({ id, obs_resuelto, usuario_id, foto_path }) {
        await sleep();
        const row = db.ventilaciones.find((v) => v.id === id);
        if (!row) throw new Error(`Ventilacion ${id} no encontrada.`);
        row.estado = 'Realizada';
        row.obs_resuelto = obs_resuelto;
        row.fecha_finalizacion = nowIso();
        row.version_resuelto = null;
        row.orden = 1;
        // KEY BUSINESS RULE (CLAUDE.md): closing a cycle atomically creates the next one.
        const frecuencia = row.frecuencia_dias ?? 90;
        const siguiente: Ventilacion = {
          id: nextId(db.ventilaciones),
          estado: 'Pendiente',
          unidad_id: row.unidad_id,
          direccion_edificio: row.direccion_edificio,
          edificio: row.edificio,
          habitacion: row.habitacion,
          frecuencia_dias: frecuencia,
          fecha_ultima: todayIso(),
          proxima_limpieza: addDaysIso(todayIso(), frecuencia),
          fecha_programada: null,
          obs_adelanto: null,
          obs_resuelto: null,
          asignado_id: null,
          fecha_asignado: null,
          version_asignado: null,
          fecha_finalizacion: null,
          version_resuelto: null,
          es_incidente: false,
          orden: 4,
        };
        db.ventilaciones.push(siguiente);
        void usuario_id; // mock has no per-user audit column on ventilaciones; kept for API symmetry with other domains
        if (foto_path) {
          db.documentos.push({
            id: nextId(db.documentos),
            nombre: foto_path.split('/').pop() ?? foto_path,
            storage_path: `ventilaciones/${id}/${foto_path}`,
            carpeta: 'Ordenes',
            orden_trabajo_id: null,
            compra_id: null,
            content_type: 'image/jpeg',
            created_at: nowIso(),
          });
        }
        return { cerrada: structuredClone(row), siguiente: structuredClone(siguiente) };
      },
      async adelantar({ id, obs_adelanto }) {
        await sleep();
        const row = db.ventilaciones.find((v) => v.id === id);
        if (!row) throw new Error(`Ventilacion ${id} no encontrada.`);
        row.proxima_limpieza = todayIso();
        row.obs_adelanto = obs_adelanto;
        row.es_incidente = true;
        return structuredClone(row);
      },
      async eliminar(id) {
        await sleep();
        // Soft-delete like PA (Estado 'Eliminada') + release the unit for a new schedule.
        const row = db.ventilaciones.find((v) => v.id === id);
        if (!row) return;
        row.estado = 'Eliminada';
        const unidad = db.unidades.find((u) => u.id === row.unidad_id);
        if (unidad) unidad.requiere_ventilacion = false;
      },
    },

    documentos: {
      async list(filter) {
        await sleep();
        return structuredClone(
          db.documentos.filter(
            (d) =>
              (filter.orden_trabajo_id === undefined || d.orden_trabajo_id === filter.orden_trabajo_id) &&
              (filter.compra_id === undefined || d.compra_id === filter.compra_id),
          ),
        );
      },
    },
  };

  return api;
}
