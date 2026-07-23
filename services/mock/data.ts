// Seed data for the mock adapter. Realistic es-AR content grounded in the real
// TopRentals building portfolio and the zona/grupo_stock groupings called out in
// docs/analysis/data_model.md's open questions. structuredClone()'d fresh per
// adapter instance — never mutate these arrays directly.

import type {
  Aprobacion,
  Articulo,
  Bitacora,
  Compra,
  DetalleCompra,
  Documento,
  Edificio,
  EmailNotificacion,
  FotoBitacora,
  Frecuencia,
  MovimientoStock,
  OrdenTrabajo,
  PerfilPermiso,
  RepuestoOT,
  SalidaStock,
  StockEdificio,
  StockRow,
  Unidad,
  Usuario,
  Ventilacion,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Edificios — real portfolio + zona (geographic cluster) + grupo_stock (shared pool)
// ---------------------------------------------------------------------------
export const edificios: Edificio[] = [
  { id: 1, nombre: 'Palermo Chico', pais: 'Argentina', status: 'Activo', zona: 'Zona Palermo Chico/Soho', grupo_stock: null, created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 2, nombre: 'Palermo Soho', pais: 'Argentina', status: 'Activo', zona: 'Zona Palermo Chico/Soho', grupo_stock: null, created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 3, nombre: 'Palermo Hollywood', pais: 'Argentina', status: 'Activo', zona: 'Zona Hollywood/Dorrego', grupo_stock: 'Hollywood-Dorrego', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 4, nombre: 'Dorrego', pais: 'Argentina', status: 'Activo', zona: 'Zona Hollywood/Dorrego', grupo_stock: 'Hollywood-Dorrego', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 5, nombre: 'Montañeses', pais: 'Argentina', status: 'Activo', zona: 'Zona Montañeses/Nuñez/Hub/Jaramillo', grupo_stock: null, created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 6, nombre: 'Nuñez', pais: 'Argentina', status: 'Activo', zona: 'Zona Montañeses/Nuñez/Hub/Jaramillo', grupo_stock: 'Hub-Nuñez', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 7, nombre: 'Hub', pais: 'Argentina', status: 'Activo', zona: 'Zona Montañeses/Nuñez/Hub/Jaramillo', grupo_stock: 'Hub-Nuñez', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 8, nombre: 'Jaramillo', pais: 'Argentina', status: 'Activo', zona: 'Zona Montañeses/Nuñez/Hub/Jaramillo', grupo_stock: null, created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 9, nombre: 'Admin', pais: 'Argentina', status: 'Activo', zona: null, grupo_stock: 'Admin', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
  { id: 10, nombre: 'Admin 2', pais: 'Argentina', status: 'Activo', zona: null, grupo_stock: 'Admin', created_at: '2024-01-10T09:00:00Z', updated_at: '2024-01-10T09:00:00Z' },
];

// ---------------------------------------------------------------------------
// Usuarios — every perfil covered. Mock-only credentials kept OUT of the Usuario
// shape (password_usr was never migrated as a real column — see data_model.md Auth).
// ---------------------------------------------------------------------------
export const usuarios: Usuario[] = [
  u(1, 'admin', 'Administrador', 'Sistema', 'Admin', null, 'Desktop'),
  u(2, 'jperez', 'Juan', 'Pérez', 'Tecnico', 1, 'Mantenimiento'),
  u(3, 'mfernandez', 'María', 'Fernández', 'Gerencia', null, 'Desktop'),
  u(4, 'lgomez', 'Lucas', 'Gómez', 'Compras', null, 'Desktop'),
  u(5, 'crodriguez', 'Carla', 'Rodríguez', 'Supervisor Ventilaciones', null, 'Desktop'),
  u(6, 'aperez', 'Adriana', 'Pérez', 'Recepcion', 9, 'Desktop'),
  u(7, 'dlopez', 'Diego', 'López', 'Operador', 3, 'Desktop'),
  u(8, 'mtorres', 'Martín', 'Torres', 'Tecnico', 6, 'Mantenimiento'),
  u(9, 'vgarcia', 'Valeria', 'García', 'Operador', 7, 'Desktop'),
  u(10, 'rsilva', 'Ramiro', 'Silva', 'Tecnico', 8, 'Mantenimiento'),
];

function u(
  id: number,
  usuario_app: string,
  nombre: string,
  apellido: string,
  perfil: Usuario['perfil'],
  edificio_id: number | null,
  aplicacion: string,
): Usuario {
  return {
    id,
    auth_user_id: null,
    nombre,
    apellido,
    concat_name: `${apellido}, ${nombre}`,
    usuario_app,
    dni: 30000000 + id,
    fecha_nac: '1990-01-01',
    mail: `${usuario_app}@thetoprentals.com`,
    num_cel: `+54 9 11 5555-00${id}`,
    edificio_id,
    edificio_default: edificio_id ? (edificios.find((e) => e.id === edificio_id)?.nombre ?? null) : null,
    pais: 'Argentina',
    perfil,
    validado: true,
    wapp_default: null,
    mnt_global: null,
    aplicacion,
    es_testing: false,
    status: 'ALTA',
    legacy_id_usr: null,
    created_at: '2024-01-15T09:00:00Z',
    updated_at: '2024-01-15T09:00:00Z',
  };
}

/** Mock-only login credentials — all '1234'. Never a real auth mechanism. */
export const credenciales: Record<string, string> = Object.fromEntries(usuarios.map((usr) => [usr.usuario_app, '1234']));

// ---------------------------------------------------------------------------
// Articulos
// ---------------------------------------------------------------------------
export const articulos: Articulo[] = [
  a(1, 'AR-001', 'Lámpara LED 9W', 1500, 10),
  a(2, 'AR-002', 'Cable UTP Cat6 (rollo)', 8500, 3),
  a(3, 'AR-003', 'Cerradura Puerta Estándar', 6200, 5),
  a(4, 'AR-004', 'Grifería Monocomando Cocina', 12500, 2),
  a(5, 'AR-005', 'Pintura Látex Blanco 20L', 25000, 4),
  a(6, 'AR-006', 'Pintura Antihumedad 4L', 9800, 3),
  a(7, 'AR-007', 'Detergente Multiuso 5L', 2100, 8),
  a(8, 'AR-008', 'Papel Higiénico (paquete x12)', 3400, 15),
  a(9, 'AR-009', 'Filtro de Aire Split', 4700, 6),
  a(10, 'AR-010', 'Correa Ventilador Extractor', 3200, 5),
  a(11, 'AR-011', 'Llave de Paso 1/2"', 2800, 6),
  a(12, 'AR-012', 'Tornillos Autorroscantes x100', 1900, 10),
  a(13, 'AR-013', 'Silicona Selladora', 1600, 12),
  a(14, 'AR-014', 'Guantes de Trabajo (par)', 950, 20),
  a(15, 'AR-015', 'Destapador de Cañerías 1L', 2300, 8),
];

function a(id: number, codigo: string, nombre: string, precio_unitario: number, corte: number): Articulo {
  return {
    id,
    codigo,
    nombre,
    precio_unitario,
    corte,
    status: 'Activo',
    detalle: null,
    created_at: '2024-01-20T09:00:00Z',
    updated_at: '2024-01-20T09:00:00Z',
  };
}

// ---------------------------------------------------------------------------
// Frecuencias (ventilaciones picklist)
// Valores reales de la lista SharePoint '99.ABM_Frecuencias' (columna Frecuencia_FE,
// Status_FE = "Activo"). En PA el desplegable muestra el número de días crudo
// (Distinct(CollectFrecuencias, Frecuencia_FE), default 90) — no hay columna de nombre.
// ---------------------------------------------------------------------------
export const frecuencias: Frecuencia[] = [30, 60, 90, 120, 180, 182, 230, 240, 300, 365, 450, 500].map((dias, i) => ({
  id: i + 1,
  nombre: `${dias} días`,
  dias,
  status: 'Activo',
}));

// ---------------------------------------------------------------------------
// Unidades — 2 per edificio
// ---------------------------------------------------------------------------
const UNIDAD_TIPOS = ['Departamento', 'Oficina'] as const;
export const unidades: Unidad[] = edificios.flatMap((ed, edIdx) =>
  [0, 1].map((n) => {
    const id = edIdx * 2 + n + 1;
    const depto = n === 0 ? '1A' : '2B';
    return {
      id,
      id_client: `${ed.nombre.slice(0, 3).toUpperCase()}-${depto}`,
      depto,
      torre: ed.nombre,
      edificio_id: ed.id,
      tipo_depto: UNIDAD_TIPOS[n],
      tipo_sector: n === 0 ? 'Living' : 'Cocina',
      status: 'Alta' as const,
      frecuencia_ventilacion_dias: n === 0 ? 90 : 60,
      requiere_ventilacion: true,
      created_at: '2024-02-01T09:00:00Z',
      updated_at: '2024-02-01T09:00:00Z',
    };
  }),
);

// ---------------------------------------------------------------------------
// Perfiles/permisos — Desktop (7 módulos) + Mantenimiento (4 módulos)
// row shape: admin/operador/tecnico/recepcion/compras/gerencia/jefe_operativo
// ---------------------------------------------------------------------------
function pp(
  id: number,
  modulo: string,
  aplicacion: PerfilPermiso['aplicacion'],
  orden: number,
  flags: Omit<PerfilPermiso, 'id' | 'modulo' | 'aplicacion' | 'orden' | 'imagen_path' | 'imagen_no_selected_path' | 'status'>,
): PerfilPermiso {
  return { id, modulo, aplicacion, orden, imagen_path: null, imagen_no_selected_path: null, status: 'Activo', ...flags };
}

const SI = 'SI' as const;
const NO = 'NO' as const;

export const perfilesPermisos: PerfilPermiso[] = [
  // Desktop — tecnico is NEVER SI here (Tecnico is blocked from desktop login entirely)
  pp(1, 'Home', 'Desktop', 1, { admin: SI, operador: SI, tecnico: NO, recepcion: SI, compras: NO, gerencia: SI, jefe_operativo: SI }),
  pp(2, 'Stock', 'Desktop', 2, { admin: SI, operador: SI, tecnico: NO, recepcion: SI, compras: NO, gerencia: NO, jefe_operativo: SI }),
  pp(3, 'Compras', 'Desktop', 3, { admin: SI, operador: NO, tecnico: NO, recepcion: NO, compras: SI, gerencia: NO, jefe_operativo: NO }),
  pp(4, 'Aprobaciones', 'Desktop', 4, { admin: SI, operador: NO, tecnico: NO, recepcion: NO, compras: SI, gerencia: SI, jefe_operativo: NO }),
  pp(5, 'Ordenes de Trabajo', 'Desktop', 5, { admin: SI, operador: SI, tecnico: NO, recepcion: SI, compras: NO, gerencia: SI, jefe_operativo: SI }),
  pp(6, 'Ventilaciones', 'Desktop', 6, { admin: SI, operador: SI, tecnico: NO, recepcion: SI, compras: NO, gerencia: SI, jefe_operativo: SI }),
  pp(7, 'ABM', 'Desktop', 7, { admin: SI, operador: NO, tecnico: NO, recepcion: NO, compras: NO, gerencia: NO, jefe_operativo: NO }),
  // Mantenimiento (mobile) — tecnico is SI on all 4, per the app's whole purpose
  pp(8, 'Activos', 'Mantenimiento', 1, { admin: SI, operador: NO, tecnico: SI, recepcion: NO, compras: NO, gerencia: NO, jefe_operativo: NO }),
  pp(9, 'OT', 'Mantenimiento', 2, { admin: SI, operador: NO, tecnico: SI, recepcion: NO, compras: NO, gerencia: NO, jefe_operativo: NO }),
  pp(10, 'Ventilaciones', 'Mantenimiento', 3, { admin: SI, operador: NO, tecnico: SI, recepcion: NO, compras: NO, gerencia: NO, jefe_operativo: NO }),
  pp(11, 'Stock', 'Mantenimiento', 4, { admin: SI, operador: NO, tecnico: SI, recepcion: NO, compras: NO, gerencia: NO, jefe_operativo: NO }),
];

// ---------------------------------------------------------------------------
// Emails de notificación
// ---------------------------------------------------------------------------
export const emailsNotificacion: EmailNotificacion[] = [
  { id: 1, modulo: 'OT', emails: 'mantenimiento@thetoprentals.com', edificio: null, a_tecnolav: null, status: 'Activo' },
  { id: 2, modulo: 'Compra', emails: 'compras@thetoprentals.com', edificio: null, a_tecnolav: null, status: 'Activo' },
  { id: 3, modulo: 'Aprobaciones', emails: 'gerencia@thetoprentals.com', edificio: null, a_tecnolav: null, status: 'Activo' },
];

// ---------------------------------------------------------------------------
// Ordenes de trabajo — 15 across every estado/prioridad
// ---------------------------------------------------------------------------
function ot(id: number, overrides: Partial<OrdenTrabajo>): OrdenTrabajo {
  const base: OrdenTrabajo = {
    id,
    id_univoco: `(OT)-TR-${String(id).padStart(3, '0')}202607${10 + id}0900`,
    status: 'Pendiente',
    tipo: 'ORDEN DE TRABAJO',
    prioridad: 'Media',
    tipo_trabajo: 'Correctivo',
    tipo_tarea: 'Chequeo',
    tipo_prioridad: 'Media',
    unidad_id: null,
    torre: null,
    departamento: null,
    concat_activo: null,
    tecnico_id: null,
    asignador_id: null,
    user_carga_id: 1,
    fecha_inicio: '2026-07-10',
    fecha_cierre: null,
    fecha_asignada: null,
    dias_estimado: 2,
    personas_requeridas: 1,
    detalle: 'Revisión general solicitada por el edificio.',
    observaciones: null,
    obs_resuelto: null,
    obs_asignacion: null,
    obs_cierre: null,
    orden_revision_id: null,
    problema: null,
    desde: 'Desktop',
    version_app: 'v20260622_1.3.2',
    hora: '09:00',
    created_at: '2026-07-10T09:00:00Z',
  };
  return { ...base, ...overrides };
}

function activo(unidadId: number) {
  const un = unidades.find((x) => x.id === unidadId)!;
  return { unidad_id: un.id, torre: un.torre, departamento: un.depto, concat_activo: `${un.torre} - ${un.depto}` };
}

export const ordenesTrabajo: OrdenTrabajo[] = [
  ot(1, { status: 'Pendiente', prioridad: 'Alta', tipo_trabajo: 'Electrico', ...activo(1), detalle: 'Sin luz en el living.' }),
  ot(2, { status: 'Pendiente', prioridad: 'Media', tipo_trabajo: 'Pintura', ...activo(3), detalle: 'Retoque de pintura en pasillo.' }),
  ot(3, { status: 'Pendiente', prioridad: 'Baja', tipo_trabajo: 'Otros', ...activo(5), detalle: 'Solicitud de limpieza de rejillas.' }),
  ot(4, { status: 'Asignada', prioridad: 'Alta', tipo_prioridad: 'Alta', tipo_trabajo: 'Electrico', ...activo(2), tecnico_id: 2, asignador_id: 1, fecha_asignada: '2026-07-18', detalle: 'Cortocircuito en tablero.' }),
  ot(5, { status: 'Asignada', prioridad: 'Media', tipo_prioridad: 'Media', tipo_trabajo: 'Ventilacion', ...activo(7), tecnico_id: 8, asignador_id: 1, fecha_asignada: '2026-07-19' }),
  ot(6, { status: 'Asignada', prioridad: 'Baja', tipo_prioridad: 'Baja', tipo_trabajo: 'Chequeo', ...activo(9), tecnico_id: 10, asignador_id: 3, fecha_asignada: '2026-07-20' }),
  ot(7, { status: 'Cerrada', prioridad: 'Alta', tipo_trabajo: 'Correctivo', ...activo(11), tecnico_id: 2, fecha_cierre: '2026-07-15', fecha_asignada: '2026-07-12' }),
  ot(8, { status: 'Cerrada', prioridad: 'Media', tipo_trabajo: 'Mejora', ...activo(13), tecnico_id: 8, fecha_cierre: '2026-07-16', fecha_asignada: '2026-07-13', obs_resuelto: 'Se reemplazó cerradura de acceso.' }),
  ot(9, { status: 'Cerrada', prioridad: 'Baja', tipo_trabajo: 'Chequeo', ...activo(15), tecnico_id: 10, fecha_cierre: '2026-07-14' }),
  ot(10, { status: 'Cerrada F', prioridad: 'Alta', tipo_trabajo: 'Correctivo', ...activo(4), tecnico_id: 2, fecha_cierre: '2026-06-30' }),
  ot(11, { status: 'Cerrada F', prioridad: 'Media', tipo_trabajo: 'Pintura', ...activo(6), tecnico_id: 8, fecha_cierre: '2026-06-28' }),
  ot(12, { status: 'Cerrada V', prioridad: 'Alta', tipo_trabajo: 'Electrico', ...activo(8), tecnico_id: 10, fecha_cierre: '2026-07-05' }),
  ot(13, { status: 'Cerrada V', prioridad: 'Baja', tipo_trabajo: 'Otros', ...activo(10), tecnico_id: 2, fecha_cierre: '2026-07-08' }),
  ot(14, { status: 'Anulada', prioridad: 'Media', tipo_trabajo: 'Mejora', ...activo(12), detalle: 'Duplicado de OT #6.' }),
  ot(15, { status: 'Anulada', prioridad: 'Alta', tipo_trabajo: 'Correctivo', ...activo(14), detalle: 'Solicitud cancelada por el edificio.' }),
];

export const bitacoras: Bitacora[] = [
  { id: 1, orden_trabajo_id: 4, id_univoco_bitacora: 'BC-000120260718100000', descripcion: 'Técnico inició inspección del tablero eléctrico.', fecha: '2026-07-18T10:00:00Z', usuario_id: 2, version_app: 'v20260622_1.3.2' },
  { id: 2, orden_trabajo_id: 8, id_univoco_bitacora: 'BC-000220260715163000', descripcion: 'Trabajo finalizado: se reemplazó la cerradura de acceso.', fecha: '2026-07-15T16:30:00Z', usuario_id: 8, version_app: 'v20260622_1.3.2' },
];

export const fotosBitacora: FotoBitacora[] = [
  { id: 1, orden_trabajo_id: 4, bitacora_id: 1, foto_path: 'bitacoras/4/tablero-antes.jpg', created_at: '2026-07-18T10:01:00Z' },
  { id: 2, orden_trabajo_id: 8, bitacora_id: 2, foto_path: 'bitacoras/8/cerradura-nueva.jpg', created_at: '2026-07-15T16:31:00Z' },
];

export const repuestosOT: RepuestoOT[] = [
  { id: 1, orden_trabajo_id: 4, articulo_id: 1, repuesto: 'Lámpara LED 9W', cantidad: 3, edificio: 'Palermo Soho', usuario_id: 2, fecha: '2026-07-18T10:15:00Z', status: 'Activo', version_app: 'v20260622_1.3.2' },
  { id: 2, orden_trabajo_id: 12, articulo_id: 9, repuesto: 'Filtro de Aire Split', cantidad: 2, edificio: 'Jaramillo', usuario_id: 10, fecha: '2026-07-05T11:00:00Z', status: 'Activo', version_app: 'v20260622_1.3.2' },
];

// ---------------------------------------------------------------------------
// Stock — one row per (articulo, pool). Pools: the 3 shared groups + each
// unshared building on its own. Rotates articles across pools deterministically.
// ---------------------------------------------------------------------------
const STOCK_POOLS: { edificioIds: number[] }[] = [
  { edificioIds: [1] }, // Palermo Chico
  { edificioIds: [2] }, // Palermo Soho
  { edificioIds: [3, 4] }, // Hollywood-Dorrego
  { edificioIds: [5] }, // Montañeses
  { edificioIds: [6, 7] }, // Hub-Nuñez
  { edificioIds: [8] }, // Jaramillo
  { edificioIds: [9, 10] }, // Admin
];

export const stock: StockRow[] = [];
export const stockEdificios: StockEdificio[] = [];
let stockId = 1;
articulos.forEach((art, i) => {
  // each article gets stock in 2 pools, round-robin
  for (const poolIdx of [i % STOCK_POOLS.length, (i + 3) % STOCK_POOLS.length]) {
    const pool = STOCK_POOLS[poolIdx];
    const id = stockId++;
    const cantidad = 5 + ((i * 7 + poolIdx * 3) % 30); // varied, some near/under corte for low-stock rows
    stock.push({
      id,
      id_univoco: `(STK)-${String(id).padStart(3, '0')}`,
      articulo_id: art.id,
      cantidad,
      precio_unitario: art.precio_unitario,
      condicion_corte: art.corte,
      status: 'Activo',
      usuario_id: 1,
      fecha: '2026-06-01T09:00:00Z',
      ultima_mod: null,
      desde: 'Desktop',
      version_app: 'v20260622_1.3.2',
    });
    for (const edId of pool.edificioIds) stockEdificios.push({ stock_id: id, edificio_id: edId });
  }
});

// ---------------------------------------------------------------------------
// Movimientos de stock (audit) + salidas de stock (every tipo)
// ---------------------------------------------------------------------------
export const movimientosStock: MovimientoStock[] = stock.slice(0, 6).map((row, i) => ({
  id: i + 1,
  articulo_id: row.articulo_id,
  articulo_raw: String(row.articulo_id),
  concat_articulo: articulos.find((a2) => a2.id === row.articulo_id)?.nombre ?? null,
  articulo: articulos.find((a2) => a2.id === row.articulo_id)?.nombre ?? null,
  cant_anterior: 0,
  cant_posterior: row.cantidad,
  costo_anterior: null,
  costo_posterior: row.precio_unitario,
  stock_min_anterior: null,
  stock_min_posterior: row.condicion_corte,
  edificio_id: stockEdificios.find((se) => se.stock_id === row.id)?.edificio_id ?? null,
  edificio_raw: null,
  edificio: edificios.find((e) => e.id === (stockEdificios.find((se) => se.stock_id === row.id)?.edificio_id ?? -1))?.nombre ?? null,
  edificio_traslado: null,
  desde: 'Desktop - Stock',
  tipo_movimiento: 'Nuevo',
  cantidad: row.cantidad,
  usuario_id: 1,
  fecha: '2026-06-01T09:00:00Z',
  version_app: 'v20260622_1.3.2',
}));

/** First stock row for an articulo — deterministic reference for the salida seeds. */
const stockIdFor = (articuloId: number) => stock.find((s) => s.articulo_id === articuloId)?.id ?? null;

export const salidasStock: SalidaStock[] = [
  { id: 1, articulo_id: 1, stock_id: stockIdFor(1), concat_articulo: 'Lámpara LED 9W', tecnico_id: 2, tipo: 'ASIGNACION', fecha_salida: '2026-07-18', fecha_reingreso: null, uso: 'Consumo Diario', centro_de_costo: 'Palermo Soho', cantidad: 3, usuario_id: 2, fecha: '2026-07-18T10:15:00Z', version_app: 'v20260622_1.3.2' },
  { id: 2, articulo_id: 7, stock_id: stockIdFor(7), concat_articulo: 'Detergente Multiuso 5L', tecnico_id: 8, tipo: 'CONSUMIBLE', fecha_salida: '2026-07-10', fecha_reingreso: null, uso: 'Consumo Diario', centro_de_costo: 'Nuñez', cantidad: 2, usuario_id: 8, fecha: '2026-07-10T11:00:00Z', version_app: 'v20260622_1.3.2' },
  // Pending DEVOLUCION — exercises confirmarDevolucion in the demo.
  { id: 3, articulo_id: 2, stock_id: stockIdFor(2), concat_articulo: 'Cable UTP Cat6 (rollo)', tecnico_id: 10, tipo: 'DEVOLUCION', fecha_salida: '2026-07-05', fecha_reingreso: null, uso: 'Consumo Diario', centro_de_costo: 'Jaramillo', cantidad: 1, usuario_id: 10, fecha: '2026-07-05T09:30:00Z', version_app: 'v20260622_1.3.2' },
  { id: 4, articulo_id: 5, stock_id: stockIdFor(5), concat_articulo: 'Pintura Látex Blanco 20L', tecnico_id: 2, tipo: 'TRASLADO', fecha_salida: '2026-07-08', fecha_reingreso: null, uso: 'Consumo Diario', centro_de_costo: 'Palermo Chico', cantidad: 2, usuario_id: 1, fecha: '2026-07-08T09:00:00Z', version_app: 'v20260622_1.3.2' },
  { id: 5, articulo_id: 9, stock_id: stockIdFor(9), concat_articulo: 'Filtro de Aire Split', tecnico_id: 10, tipo: 'DEVUELTO', fecha_salida: '2026-07-05', fecha_reingreso: '2026-07-06', uso: 'Consumo Diario', centro_de_costo: 'Jaramillo', cantidad: 2, usuario_id: 10, fecha: '2026-07-05T11:00:00Z', version_app: 'v20260622_1.3.2' },
];

// ---------------------------------------------------------------------------
// Compras + detalle + aprobaciones — 8 compras across every estado
// ---------------------------------------------------------------------------
function compra(id: number, overrides: Partial<Compra>): Compra {
  const base: Compra = {
    id,
    id_compra: `(BUY)-LG-${String(id).padStart(3, '0')}20260710`,
    usuario_id: 4,
    usuario_compra: 'Gómez, Lucas',
    urgencia: 'Media',
    observacion: null,
    obs_recibir: null,
    fecha: '2026-07-10',
    cantidad_total: 0,
    monto_total: 0,
    status: 'Pendiente',
    cargo: null,
    sector_pedido: null,
    version_app: 'v20260622_1.3.2',
    created_at: '2026-07-10T09:00:00Z',
  };
  return { ...base, ...overrides };
}

export const compras: Compra[] = [
  compra(1, { urgencia: 'Media', status: 'Pendiente', cantidad_total: 4, monto_total: 100000 }),
  compra(2, { urgencia: 'Alta', status: 'Pendiente', cantidad_total: 6, monto_total: 27600 }),
  compra(3, { urgencia: 'Alta', status: 'Aprobacion', cantidad_total: 10, monto_total: 47000 }),
  compra(4, { urgencia: 'Media', status: 'Aprobada', cantidad_total: 5, monto_total: 31000 }),
  compra(5, { urgencia: 'Baja', status: 'Rechazada', cantidad_total: 8, monto_total: 16800 }),
  compra(6, { urgencia: 'Media', status: 'Recibida', cantidad_total: 3, monto_total: 18600, obs_recibir: 'Recibido completo, sin faltantes.' }),
  compra(7, { urgencia: 'Alta', status: 'Recibida', cantidad_total: 4, monto_total: 9200, obs_recibir: 'Recibido completo.' }),
  compra(8, { urgencia: 'Baja', status: 'Anulada', cantidad_total: 2, monto_total: 4600 }),
];

function detalle(id: number, compra_id: number, articulo_id: number, cantidad: number, costo_unitario: number, status: DetalleCompra['status'], recibido: number | null = null): DetalleCompra {
  const art = articulos.find((a2) => a2.id === articulo_id)!;
  return {
    id,
    compra_id,
    id_univoco: `(DTC)-${String(id).padStart(3, '0')}`,
    articulo_id,
    articulo: art.nombre,
    edificio_id: 1,
    edificio: 'Palermo Chico',
    cantidad,
    recibido,
    costo_unitario,
    cant_min: art.corte,
    costo_total: cantidad * costo_unitario,
    status,
    usuario_id: 4,
    fecha: '2026-07-10T09:00:00Z',
    version_app: 'v20260622_1.3.2',
  };
}

export const detalleCompras: DetalleCompra[] = [
  detalle(1, 1, 5, 4, 25000, 'Activo'),
  detalle(2, 2, 7, 4, 2100, 'Activo'),
  detalle(3, 2, 8, 2, 3400, 'Activo'),
  detalle(4, 3, 9, 6, 4700, 'Activo'),
  detalle(5, 3, 10, 4, 3200, 'Activo'),
  detalle(6, 4, 3, 5, 6200, 'Activo'),
  detalle(7, 5, 4, 8, 12500, 'Activo'),
  detalle(8, 6, 1, 3, 6200, 'Activo', 3),
  detalle(9, 7, 11, 4, 2800, 'Activo', 4),
  detalle(10, 8, 12, 2, 1900, 'Anulado'),
];

export const aprobaciones: Aprobacion[] = [
  { id: 1, compra_id: 3, status: 'Pendiente', fecha: '2026-07-11', urgencia: 'Alta', tecnico: 'Gómez, Lucas', obs_compra: null, fecha_aprobada: null, obs_rechazo: null, user_gen_id: 4, user_aprob_id: null, cantidad: 10, monto: 47000, sector: null, version_app: 'v20260622_1.3.2', hora: '09:30' },
  { id: 2, compra_id: 4, status: 'Aprobada', fecha: '2026-07-09', urgencia: 'Media', tecnico: 'Gómez, Lucas', obs_compra: null, fecha_aprobada: '2026-07-10', obs_rechazo: null, user_gen_id: 4, user_aprob_id: 3, cantidad: 5, monto: 31000, sector: null, version_app: 'v20260622_1.3.2', hora: '10:00' },
  { id: 3, compra_id: 5, status: 'Rechazada', fecha: '2026-07-08', urgencia: 'Baja', tecnico: 'Gómez, Lucas', obs_compra: null, fecha_aprobada: null, obs_rechazo: 'Presupuesto no disponible este mes.', user_gen_id: 4, user_aprob_id: 3, cantidad: 8, monto: 16800, sector: null, version_app: 'v20260622_1.3.2', hora: '11:15' },
  { id: 4, compra_id: 6, status: 'Recibida', fecha: '2026-07-01', urgencia: 'Media', tecnico: 'Gómez, Lucas', obs_compra: null, fecha_aprobada: '2026-07-02', obs_rechazo: null, user_gen_id: 4, user_aprob_id: 1, cantidad: 3, monto: 18600, sector: null, version_app: 'v20260622_1.3.2', hora: '09:00' },
  { id: 5, compra_id: 7, status: 'Recibida', fecha: '2026-06-28', urgencia: 'Alta', tecnico: 'Gómez, Lucas', obs_compra: null, fecha_aprobada: '2026-06-29', obs_rechazo: null, user_gen_id: 4, user_aprob_id: 1, cantidad: 4, monto: 9200, sector: null, version_app: 'v20260622_1.3.2', hora: '08:45' },
];

// ---------------------------------------------------------------------------
// Ventilaciones — 10 across every estado
// ---------------------------------------------------------------------------
function vent(id: number, overrides: Partial<Ventilacion>): Ventilacion {
  const un = unidades.find((x) => x.requiere_ventilacion && x.id === ((id - 1) % unidades.length) + 1)!;
  const base: Ventilacion = {
    id,
    estado: 'Pendiente',
    unidad_id: un.id,
    direccion_edificio: un.torre,
    edificio: un.torre,
    habitacion: un.depto,
    frecuencia_dias: un.frecuencia_ventilacion_dias,
    fecha_ultima: '2026-06-01',
    proxima_limpieza: '2026-07-30',
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
  return { ...base, ...overrides };
}

export const ventilaciones: Ventilacion[] = [
  vent(1, { estado: 'Pendiente', orden: 4 }),
  vent(2, { estado: 'Pendiente', orden: 4 }),
  vent(3, { estado: 'Programada', fecha_programada: '2026-07-28', orden: 2 }),
  vent(4, { estado: 'Programada', fecha_programada: '2026-07-29', orden: 2 }),
  vent(5, { estado: 'Asignada', asignado_id: 2, fecha_asignado: '2026-07-20T09:00:00Z', orden: 3 }),
  vent(6, { estado: 'Asignada', asignado_id: 8, fecha_asignado: '2026-07-21T09:00:00Z', orden: 3 }),
  vent(7, { estado: 'Asignada', asignado_id: 10, fecha_asignado: '2026-07-22T09:00:00Z', orden: 3 }),
  vent(8, { estado: 'Realizada', asignado_id: 2, fecha_finalizacion: '2026-07-15T14:00:00Z', obs_resuelto: 'Ducto limpio, sin novedades.', orden: 1 }),
  vent(9, { estado: 'Realizada', asignado_id: 8, fecha_finalizacion: '2026-07-16T15:00:00Z', obs_resuelto: 'Se retiró acumulación de polvo.', orden: 1 }),
  vent(10, { estado: 'Pendiente', es_incidente: true, obs_adelanto: 'Vecino reportó olor a humedad.', proxima_limpieza: '2026-07-23', orden: 4 }),
];

// ---------------------------------------------------------------------------
// Documentos (metadata only)
// ---------------------------------------------------------------------------
export const documentos: Documento[] = [
  { id: 1, nombre: 'tablero-antes.jpg', storage_path: 'ordenes/4/tablero-antes.jpg', carpeta: 'Ordenes', orden_trabajo_id: 4, compra_id: null, content_type: 'image/jpeg', created_at: '2026-07-18T10:01:00Z' },
  { id: 2, nombre: 'comprobante-compra6.pdf', storage_path: 'compras/6/comprobante.pdf', carpeta: 'Compras', orden_trabajo_id: null, compra_id: 6, content_type: 'application/pdf', created_at: '2026-07-02T09:30:00Z' },
];
