// Agrupaciones de torres — SharePoint no tiene columna de zona/grupo, PA las tenía HARDCODEADAS
// (ver docs/analysis/mobile_Home_Tecnico.md:29 y mobile_Screen_Ventilaciones.md:36). El rebuild las
// pasó a edificios.zona / edificios.grupo_stock (data-driven). Este módulo es esa "config/lookup
// table" que el análisis pedía: se aplica post-migración por nombre de edificio. Idempotente.
import type pg from 'pg';

/** Grupos de ZONA — controlan qué OTs/ventilaciones ve el técnico (torres que trabaja juntas). */
export const ZONA_GROUPS: { label: string; torres: string[] }[] = [
  { label: 'Palermo Chico/Soho', torres: ['Palermo Chico', 'Palermo Soho'] },
  { label: 'Hollywood/Dorrego', torres: ['Palermo Hollywood', 'Dorrego'] },
  { label: 'Montañeses/Nuñez/Hub/Jaramillo', torres: ['Montañeses', 'Nuñez', 'Hub', 'Jaramillo'] },
  { label: 'Qorner/Epic', torres: ['Qorner', 'Epic'] },
];

/** Grupos de STOCK — pools de repuestos compartidos (distintos de las zonas de OT). */
export const GRUPO_STOCK_GROUPS: { label: string; torres: string[] }[] = [
  { label: 'Hub/Nuñez', torres: ['Hub', 'Nuñez'] },
  { label: 'Hollywood/Dorrego', torres: ['Palermo Hollywood', 'Dorrego'] },
  { label: 'Admin/Admin 2', torres: ['Admin', 'Admin 2'] },
];

/** Aplica zona + grupo_stock a edificios por nombre. Devuelve cuántas filas tocó cada columna. */
export async function applyGroupings(client: pg.Client): Promise<{ zona: number; grupoStock: number }> {
  let zona = 0;
  for (const g of ZONA_GROUPS) {
    const r = await client.query('update edificios set zona = $1, updated_at = now() where nombre = any($2)', [g.label, g.torres]);
    zona += r.rowCount ?? 0;
  }
  let grupoStock = 0;
  for (const g of GRUPO_STOCK_GROUPS) {
    const r = await client.query('update edificios set grupo_stock = $1, updated_at = now() where nombre = any($2)', [g.label, g.torres]);
    grupoStock += r.rowCount ?? 0;
  }
  return { zona, grupoStock };
}
