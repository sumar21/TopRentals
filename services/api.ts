// Typed service-layer contract. The UI talks ONLY to this interface — never to a
// specific backend. See services/index.ts for the active-adapter switch.
//
// Grounded in docs/analysis/*.md "data_reads"/"data_writes" sections (desktop Stock,
// OrdenesTrabajo, Compras; mobile Ordenes de Trabajo, Ventilaciones). Kept to the CRUD
// screens actually need plus the handful of transactional ops that touch >1 table.

import type {
  Aprobacion,
  Articulo,
  Bitacora,
  Compra,
  DetalleCompra,
  Documento,
  Edificio,
  EmailNotificacion,
  EstadoOT,
  Frecuencia,
  MovimientoStock,
  NewEntity,
  OrdenTrabajo,
  PerfilPermiso,
  RepuestoOT,
  SalidaStock,
  StockRow,
  TipoSalidaStock,
  Unidad,
  Usuario,
  Ventilacion,
} from './types.ts';

/** A stock row enriched with the buildings it is pooled across (stock_edificios). */
export type StockRowWithEdificios = StockRow & { edificio_ids: number[] };

export type CompraConDetalle = Compra & { detalle: DetalleCompra[] };
export interface CompraLineaInput {
  articulo_id: number;
  edificio_id: number;
  cantidad: number;
  costo_unitario: number;
}

/** Quick-access entry for the login demo panel — only meaningful on the mock backend. */
export interface DemoUser {
  usuario_app: string;
  nombre: string;
  perfil: string;
  app: 'Desktop' | 'Mantenimiento';
  password: string;
}

export interface DataApi {
  auth: {
    /** Plain-text mock check (usuario_app + password + status 'ALTA'). Throws on failure. */
    login(usuario: string, password: string): Promise<Usuario>;
    /** Seed users for the login quick-access panel. Absent on real backends → panel hides. */
    demoUsers?(): Promise<DemoUser[]>;
  };

  usuarios: {
    list(): Promise<Usuario[]>;
    get(id: number): Promise<Usuario | null>;
    crear(input: NewEntity<Usuario>): Promise<Usuario>;
    actualizar(id: number, patch: Partial<NewEntity<Usuario>>): Promise<Usuario>;
    /** Soft-delete: sets status='BAJA'. */
    eliminar(id: number): Promise<void>;
  };

  // ---- catalog getters (read-mostly master data) ----
  edificios: {
    list(): Promise<Edificio[]>;
  };
  articulos: {
    list(): Promise<Articulo[]>;
    crear(input: NewEntity<Articulo>): Promise<Articulo>;
    actualizar(id: number, patch: Partial<NewEntity<Articulo>>): Promise<Articulo>;
  };
  unidades: {
    list(): Promise<Unidad[]>;
  };
  frecuencias: {
    list(): Promise<Frecuencia[]>;
  };
  emailsNotificacion: {
    list(): Promise<EmailNotificacion[]>;
  };
  perfilesPermisos: {
    list(): Promise<PerfilPermiso[]>;
  };

  stock: {
    list(): Promise<StockRowWithEdificios[]>;
    /** Ingresar Stock: increments an existing (articulo, edificio) row or creates one. Writes movimientos_stock. */
    agregar(input: {
      articulo_id: number;
      edificio_id: number;
      cantidad: number;
      precio_unitario: number;
      usuario_id: number;
    }): Promise<StockRowWithEdificios>;
    /** Salida de Stock: decrements source row (TRASLADO also credits the destination edificio). Writes movimientos_stock + salidas_stock. */
    salida(input: {
      stock_id: number;
      edificio_id: number;
      tipo: TipoSalidaStock;
      cantidad: number;
      tecnico_id: number | null;
      uso: string | null;
      centro_de_costo: string | null;
      usuario_id: number;
      edificio_destino_id?: number; // required when tipo === 'TRASLADO'
      fecha_salida?: string; // ISO date; defaults to today when omitted
    }): Promise<SalidaStock>;
    /** Editar Stock: overwrites cantidad/precio_unitario/condicion_corte directly. Writes movimientos_stock. */
    editar(input: {
      stock_id: number;
      cantidad: number;
      precio_unitario: number;
      condicion_corte: number;
      usuario_id: number;
    }): Promise<StockRowWithEdificios>;
    /** Corrects the quantity on an existing salida: re-adjusts stock by the delta + audit row. */
    editarSalida(input: { salida_id: number; cantidad: number; usuario_id: number }): Promise<SalidaStock>;
    /** Confirms the return of a pending DEVOLUCION: credits stock back, stamps fecha_reingreso, tipo -> 'DEVUELTO'. Writes the audit row PA forgot. */
    confirmarDevolucion(input: { salida_id: number; usuario_id: number }): Promise<SalidaStock>;
    movimientos(): Promise<MovimientoStock[]>;
    salidas(): Promise<SalidaStock[]>;
  };

  compras: {
    list(): Promise<Compra[]>;
    get(id: number): Promise<CompraConDetalle | null>;
    crear(input: NewEntity<Compra>, lineas: CompraLineaInput[]): Promise<CompraConDetalle>;
    actualizar(id: number, patch: Partial<NewEntity<Compra>>, lineas?: CompraLineaInput[]): Promise<CompraConDetalle>;
    /** Status_C -> 'Aprobacion' + creates the matching aprobaciones row. */
    enviarAprobacion(id: number): Promise<Aprobacion>;
    /** Status_C -> 'Recibida'; writes received qty per line + stock intake + movimientos_stock. */
    recibir(id: number, lineas: { detalle_id: number; recibido: number }[], obs_recibir: string): Promise<CompraConDetalle>;
    anular(id: number): Promise<Compra>;
  };

  aprobaciones: {
    list(): Promise<Aprobacion[]>;
    aprobar(id: number, user_aprob_id: number): Promise<Aprobacion>;
    rechazar(id: number, motivo: string, user_aprob_id: number): Promise<Aprobacion>;
    /** Edits the underlying (still Pendiente) compra's lines (and optionally its header) and recomputes cantidad/monto on the aprobacion. */
    editar(
      id: number,
      lineas: CompraLineaInput[],
      header?: Partial<Pick<Compra, 'usuario_compra' | 'urgencia' | 'observacion'>>,
    ): Promise<Aprobacion>;
  };

  ots: {
    list(): Promise<OrdenTrabajo[]>;
    get(id: number): Promise<OrdenTrabajo | null>;
    crear(input: NewEntity<OrdenTrabajo>): Promise<OrdenTrabajo>;
    actualizar(id: number, patch: Partial<NewEntity<OrdenTrabajo>>): Promise<OrdenTrabajo>;
    anular(id: number): Promise<OrdenTrabajo>;
    cerrar(id: number, tipo: Extract<EstadoOT, 'Cerrada V' | 'Cerrada F'>): Promise<OrdenTrabajo>;
    finalizar(id: number): Promise<OrdenTrabajo>;
    /** Clones a closed OT into a new linked 'Pendiente' one (orden_revision_id = source id). */
    replicar(id: number): Promise<OrdenTrabajo>;

    bitacoras: {
      list(orden_trabajo_id: number): Promise<Bitacora[]>;
      crear(input: { orden_trabajo_id: number; descripcion: string; usuario_id: number; foto_path?: string }): Promise<Bitacora>;
    };

    repuestos: {
      list(orden_trabajo_id: number): Promise<RepuestoOT[]>;
      /** Assigns a spare part to the OT: decrements stock + writes movimientos_stock. */
      asignarRepuesto(input: {
        orden_trabajo_id: number;
        articulo_id: number;
        edificio_id: number;
        cantidad: number;
        usuario_id: number;
      }): Promise<RepuestoOT>;
      quitar(id: number): Promise<void>;
    };
  };

  ventilaciones: {
    list(): Promise<Ventilacion[]>;
    crear(input: NewEntity<Ventilacion>): Promise<Ventilacion>;
    programar(id: number, fecha_programada: string): Promise<Ventilacion>;
    /** Assigns técnico + próxima fecha (desktop endpoint behind FEATURES.asignarVentilacionDesktop). */
    asignar(input: { id: number; tecnico_id: number; proxima_limpieza: string; frecuencia_dias?: number }): Promise<Ventilacion>;
    /** Closes the cycle AND atomically creates the next 'Pendiente' one (proxima_limpieza = today + frecuencia). */
    finalizar(input: { id: number; obs_resuelto: string; usuario_id: number; foto_path?: string }): Promise<{ cerrada: Ventilacion; siguiente: Ventilacion }>;
    adelantar(input: { id: number; obs_adelanto: string }): Promise<Ventilacion>;
    eliminar(id: number): Promise<void>;
  };

  documentos: {
    list(filter: { orden_trabajo_id?: number; compra_id?: number }): Promise<Documento[]>;
  };
}
