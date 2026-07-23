// In-memory resolution maps + join logic for dirty SharePoint text/number
// foreign keys. Everything here is additive: a failed resolution NEVER
// throws — it returns null (caller inserts NULL in the FK column) and gets
// logged via `report()` so it shows up in out/unresolved-joins.csv.

export interface UnresolvedJoin {
  list: string;
  sp_id: string | number;
  column: string;
  raw_value: string;
}

export class ResolutionContext {
  // ---- text-key maps, built once each source table has been loaded --------
  otByUnivoco = new Map<string, number>(); // ordenes_trabajo.id_univoco -> id
  bitacoraByUnivoco = new Map<string, number>(); // bitacoras.id_univoco_bitacora -> id
  compraByBusinessKey = new Map<string, number>(); // compras.id_compra -> id
  userByConcatName = new Map<string, number>(); // usuarios.concat_name -> id
  userByUsuarioApp = new Map<string, number>(); // usuarios.usuario_app -> id
  edificioByNombre = new Map<string, number>(); // edificios.nombre -> id
  articuloByCodigo = new Map<string, number>(); // articulos.codigo -> id

  // ---- id sets, used to validate "the SP value already IS the target id" --
  edificioIds = new Set<number>();
  articuloIds = new Set<number>();
  unidadIds = new Set<number>();
  usuarioIds = new Set<number>();
  compraIds = new Set<number>();
  otIds = new Set<number>();

  unresolved: UnresolvedJoin[] = [];

  report(list: string, sp_id: string | number, column: string, raw_value: unknown): void {
    this.unresolved.push({
      list,
      sp_id,
      column,
      raw_value: raw_value == null ? '' : String(raw_value),
    });
  }

  /** SP value IS a target-table SP id — validate it actually exists, else null. */
  resolveDirectId(idSet: Set<number>, raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return idSet.has(n) ? n : null;
  }

  resolveByMap(map: Map<string, number>, raw: unknown): number | null {
    if (raw == null) return null;
    const key = String(raw).trim();
    if (!key) return null;
    return map.get(key) ?? null;
  }

  /**
   * Dirty IDArticulo_MS: desktop writes the article CODE, mobile writes the
   * numeric id. Try Number(v) as an articulos id first, else fall back to a
   * codigo match.
   */
  resolveArticuloDirty(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    const n = Number(raw);
    if (Number.isFinite(n) && this.articuloIds.has(n)) return n;
    return this.articuloByCodigo.get(String(raw).trim()) ?? null;
  }

  /** ';'-joined edificios SP ids ('16;17') — take the first that actually resolves. */
  resolveEdificioFirst(raw: unknown): number | null {
    if (raw == null || raw === '') return null;
    for (const token of String(raw).split(';')) {
      const n = Number(token.trim());
      if (Number.isFinite(n) && this.edificioIds.has(n)) return n;
    }
    return null;
  }

  /** Same multi-value column, but returns every valid id (for the stock_edificios junction). */
  splitEdificioIds(raw: unknown): number[] {
    if (raw == null || raw === '') return [];
    return String(raw)
      .split(';')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && this.edificioIds.has(n));
  }

  /** aprobaciones.compra_id: try the SP id first, else a business-key column. */
  resolveCompra(rawId: unknown, rawBusinessKey?: unknown): number | null {
    if (rawId != null && rawId !== '') {
      const n = Number(rawId);
      if (Number.isFinite(n) && this.compraIds.has(n)) return n;
    }
    if (rawBusinessKey != null && rawBusinessKey !== '') {
      return this.compraByBusinessKey.get(String(rawBusinessKey).trim()) ?? null;
    }
    return null;
  }

  toUnresolvedCsv(): string {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = this.unresolved.map(
      (u) => `${escape(String(u.list))},${escape(String(u.sp_id))},${escape(u.column)},${escape(u.raw_value)}`,
    );
    return ['list,sp_id,column,raw_value', ...rows].join('\n') + '\n';
  }
}
