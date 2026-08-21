// Post-migración: reconciliar requiere_ventilacion con la realidad (ciclos abiertos).
// El migrate lo siembra desde el campo ABM Ventilacion_ABMUnid, que no coincide con el
// significado operacional (true = tiene ciclo activo). Idempotente.
// Uso (desde scripts/migrate/): node --experimental-strip-types src/reconcile-ventilaciones.ts
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(here, '../../../.env') });
config();

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Falta ${name} en el .env de la raíz.`);
  return v;
}

async function main(): Promise<void> {
  const client = new pg.Client({ connectionString: requireEnv('SUPABASE_DB_URL') });
  await client.connect();
  try {
    const liberadas = await client.query(`
      update unidades u set requiere_ventilacion = false, updated_at = now()
      where u.requiere_ventilacion
        and not exists (select 1 from ventilaciones v where v.unidad_id = u.id and v.estado::text <> 'Eliminada')
      returning u.id`);
    const marcadas = await client.query(`
      update unidades u set requiere_ventilacion = true, updated_at = now()
      where not u.requiere_ventilacion
        and exists (select 1 from ventilaciones v where v.unidad_id = u.id and v.estado::text <> 'Eliminada')
      returning u.id`);
    console.log(`Ventilaciones reconciliadas: ${liberadas.rowCount} liberadas, ${marcadas.rowCount} marcadas.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
