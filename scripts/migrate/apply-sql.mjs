// One-off helper: run a .sql file against SUPABASE_DB_URL using the `pg` dep already
// installed here. Usage (from repo root):
//   node --env-file=.env scripts/migrate/apply-sql.mjs supabase/schema.sql
import { readFileSync } from 'node:fs';
import pg from 'pg';

const file = process.argv[2];
if (!file) { console.error('usage: node apply-sql.mjs <path.sql>'); process.exit(1); }
const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) { console.error('SUPABASE_DB_URL missing in env'); process.exit(1); }

const sql = readFileSync(file, 'utf8');
const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log(`OK - applied ${file}`);
} catch (err) {
  console.error(`FAIL - ${file}`);
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
