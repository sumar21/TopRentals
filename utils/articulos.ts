import type { Articulo } from '../services/types';

// PA `Concat_AR = Nro_ART & " - " & nombre`: every article picker/label reads `{codigo} - {nombre}`
// (hyphen, es-AR), falling back to the bare name when an article has no code. Single source of truth
// so the compras/stock/OT article combos never drift into separate formats again.
export const articuloLabel = (a: Pick<Articulo, 'codigo' | 'nombre'>): string =>
  a.codigo ? `${a.codigo} - ${a.nombre}` : a.nombre;
