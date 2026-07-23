// Orchestrator: env validation -> Graph client -> migrate() -> summary report.
// Plain async main, no framework. Run via `npm run migrate` / `npm run dry-run`.

import { config } from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGraphClient } from './graph.ts';
import { migrate, type TableProgress } from './load.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
// Primary source of truth: repo-root .env (see env.example). A local
// scripts/migrate/.env (or whatever's in cwd) can add/override on top.
config({ path: path.resolve(here, '../../../.env') });
config();

const OUT_DIR = path.resolve(here, '../out');

function parseArgs(argv: string[]) {
  const dryRun = argv.includes('--dry-run');
  const skipFiles = argv.includes('--skip-files') || dryRun; // files are always skipped on dry runs
  return { dryRun, skipFiles };
}

function requireEnv(names: string[]): Record<string, string> {
  const missing = names.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}.\n` +
        `Copy env.example to .env at the repo root and fill them in (see scripts/migrate/README.md).`,
    );
  }
  return Object.fromEntries(names.map((name) => [name, process.env[name]!.trim()]));
}

function printProgressRow(p: TableProgress): void {
  const unresolvedNote = p.unresolved > 0 ? ` (${p.unresolved} unresolved joins so far)` : '';
  console.log(`  ${p.table.padEnd(20)} read=${p.rowsRead.toString().padStart(6)}  inserted=${p.rowsInserted.toString().padStart(6)}${unresolvedNote}`);
}

function printSummary(progress: TableProgress[], unresolvedCount: number, options: { dryRun: boolean; skipFiles: boolean }): void {
  console.log('\n=== Migration summary ===');
  console.log(`Mode: ${options.dryRun ? 'DRY RUN (no writes to Supabase)' : 'LIVE (wrote to Supabase)'}${options.skipFiles ? ', files skipped' : ''}`);
  console.table(progress.map((p) => ({ table: p.table, rows_read: p.rowsRead, rows_inserted: p.rowsInserted })));
  console.log(`Total unresolved joins: ${unresolvedCount}`);
  if (unresolvedCount > 0) {
    console.log(`See ${path.join(OUT_DIR, 'unresolved-joins.csv')} for details (list, sp_id, column, raw_value).`);
  }
}

async function main(): Promise<void> {
  const { dryRun, skipFiles } = parseArgs(process.argv.slice(2));

  const msEnv = requireEnv(['MS_TENANT_ID', 'MS_CLIENT_ID', 'MS_CLIENT_SECRET', 'SP_SITE_URL']);
  const supabaseEnv = dryRun ? {} : requireEnv(['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_DB_URL']);

  const graph = createGraphClient({
    tenantId: msEnv.MS_TENANT_ID,
    clientId: msEnv.MS_CLIENT_ID,
    clientSecret: msEnv.MS_CLIENT_SECRET,
  });

  console.log(`Starting ${dryRun ? 'DRY RUN' : 'LIVE migration'} against ${msEnv.SP_SITE_URL}${skipFiles ? ' (files skipped)' : ''}...\n`);

  const progress: TableProgress[] = [];
  const { ctx } = await migrate(
    graph,
    {
      siteUrl: msEnv.SP_SITE_URL,
      supabaseUrl: supabaseEnv.SUPABASE_URL ?? '',
      supabaseServiceRoleKey: supabaseEnv.SUPABASE_SERVICE_ROLE_KEY ?? '',
      supabaseDbUrl: supabaseEnv.SUPABASE_DB_URL ?? '',
    },
    { dryRun, skipFiles },
    (p) => {
      progress.push(p);
      printProgressRow(p);
    },
  );

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, 'unresolved-joins.csv'), ctx.toUnresolvedCsv(), 'utf8');

  printSummary(progress, ctx.unresolved.length, { dryRun, skipFiles });
}

main().catch((err) => {
  console.error('\nMigration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
