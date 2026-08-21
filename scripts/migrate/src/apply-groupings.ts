// Aplica las agrupaciones de torres (zona OT/ventilación + grupo_stock) a edificios.
// Standalone/idempotente; también lo corre el migrate al final. Uso (desde scripts/migrate/):
//   node --experimental-strip-types src/apply-groupings.ts
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { applyGroupings } from './groupings.ts';

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
    const { zona, grupoStock } = await applyGroupings(client);
    console.log(`Agrupaciones aplicadas: zona → ${zona} edificios, grupo_stock → ${grupoStock} edificios.`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
