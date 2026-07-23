# TopRentals — SharePoint → Supabase migration

One-shot, wipe-and-load migration script. It reads the 19 SharePoint lists +
the `Documentos` library described in `docs/analysis/data_model.md` and loads
them into the 21-table Supabase schema in `supabase/schema.sql`, preserving
every SharePoint numeric id as the new Postgres `id`.

**This is destructive by design.** Every run `TRUNCATE`s all 21 tables
(`RESTART IDENTITY CASCADE`) before loading. It exists for the production
cutover, not for incremental syncs — running it twice against the same
Supabase project just re-does the load from scratch.

Self-contained: its own `package.json`, not part of the app's `tsconfig`. Node
22+ (`--experimental-strip-types`), no build step.

## 1. Register the Azure AD app (once)

1. Azure Portal → Azure Active Directory → App registrations → New registration.
2. API permissions → Add a permission → Microsoft Graph → **Application
   permissions** → `Sites.Read.All` → Add.
3. Click **Grant admin consent** for the tenant (application permissions need
   admin consent — a normal user consent screen won't appear on its own).
4. Certificates & secrets → New client secret → copy the *value* immediately
   (it won't be shown again).
5. Note the **Application (client) ID**, **Directory (tenant) ID**, and the
   client secret value — these become `MS_CLIENT_ID`, `MS_TENANT_ID`,
   `MS_CLIENT_SECRET`.

## 2. Fill in `.env`

Copy `env.example` (repo root) to `.env` and fill in:

- `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET` — from step 1.
- `SP_SITE_URL` — already set to `https://sumardigital.sharepoint.com/sites/TopRentals`.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — Supabase dashboard → Settings → API.
- `SUPABASE_DB_URL` — Settings → Database → Connection string (used directly
  via `pg` for `TRUNCATE` and sequence fixups; the service-role key alone
  can't run raw SQL).

This script loads the repo-root `.env` automatically; you don't need a second
copy inside `scripts/migrate/`.

## 3. Install and dry-run first

```bash
cd scripts/migrate
npm install
npm run dry-run
```

Dry run reads every SharePoint list, transforms and resolves every row **in
memory**, and prints per-table counts — but never writes to Supabase, and
never touches Storage (files are always skipped on a dry run regardless of
`--skip-files`). Do this first, every time, before a real run. It needs valid
`MS_*`/`SP_SITE_URL` credentials but not Supabase ones.

## 4. Run it for real

```bash
npm run migrate
```

Add `--skip-files` to skip Documentos/Storage uploads on a real run too (base64
photo columns and Documentos attachments) if you want a fast schema-and-rows-only
cutover first and to backfill files separately later.

## What `out/unresolved-joins.csv` means

SharePoint data is dirty by construction (typos, stale references, columns
that store a code instead of an id, etc.). Every time a foreign key can't be
resolved, this script does **not** abort — it inserts `NULL` in that column
(plus keeps the raw value in a `*_raw` text column where the schema has one)
and appends one row to `out/unresolved-joins.csv`:

| column | meaning |
|---|---|
| `list` | source SharePoint list (or `Documentos`) |
| `sp_id` | the SharePoint item id that had the dirty value |
| `column` | the target Postgres FK column that got `NULL` |
| `raw_value` | the original, unresolved value |

Review this file after every run. A handful of rows is expected (dirty
historical data); a large or growing number usually means a mapping in
`src/mappings.ts` needs fixing, not that the data is uniquely bad.

## Auth — passwords are NOT migrated

`auth.users` creation is **explicitly skipped**. `usuarios.auth_user_id` stays
`NULL` for every migrated row. SharePoint's `Password_Usr` column is read by
nobody in this script — see `data_model.md`'s "## Auth" section for why (plain
text, no hashing, downloaded to every client today).

`src/load.ts` has a `createAuthUsersTODO()` stub that throws on purpose,
marking exactly where this plugs in once the client decides the password
policy (forced reset vs. one-time seed of the existing passwords). Until then,
nobody can log in via the new backend — this migration only moves data, not
credentials.

## Assumptions made beyond `data_model.md`

`data_model.md` is the spec, but it doesn't spell out literally everything.
Where it was silent, this was assumed (all are cheap to fix — a wrong value
just comes back `null`/unresolved, nothing else breaks):

- **List display names are resolved live** via
  `GET /sites/{siteId}/lists?$filter=displayName eq '...'` (see
  `mappings.ts`'s `SP_LISTS`), instead of one env var per list as
  `data_model.md`'s migration section sketches — simpler, and the task brief
  asked for display-name resolution explicitly.
- **`version_app` internal names** are not given for `08.MovimientoStock`,
  `14.Compras`, and `15.DetalleCompras`. Inferred from the sibling lists that
  *do* state it: `VersionApp_MS` (matches `VersionApp_ST`/`VersionApp_ROT` from
  the same `08.*` list family) and `Version_C`/`Version_DC` (matches the
  majority `Version_XX` pattern from `_IN`/`_BC`/`_SS`/`_AP`).
- **Documentos folder → bucket/FK mapping**: `data_model.md`'s own open
  questions flag this as unconfirmed. This script treats `Ordenes` and
  `Bitacoras` subfolders identically (both resolve `orden_trabajo_id` from the
  folder name against `id_univoco`, preferring a `listItem.fields.IDOrdenes`
  value when Graph returns one), and `Compras` resolves `compra_id` from the
  folder name as a SharePoint numeric id. Bucket names mirror folder names 1:1
  (`ordenes`/`compras`/`bitacoras`). A file that can't be classified/resolved
  still gets uploaded (under an `_unresolved/...` or `_unclassified/...` path)
  rather than silently dropped.
- **Branding images** (`perfiles_permisos.imagen_path`/`imagen_no_selected_path`,
  `iconos_app.icono_path`) are treated like `fotos_bitacora.foto_path`: base64
  decoded and uploaded to the `branding` bucket. `data_model.md` describes this
  in its Storage section but the task's numbered file list only names
  "Documentos + base64 photo columns" generically; these are the only other
  base64 columns in the schema, so they're included. On `--skip-files` they're
  dropped (set to `null`) rather than kept as raw base64 — there's no `*_raw`
  fallback column for them in the schema (unlike `movimientos_stock`/etc.),
  and they aren't audit-critical.
- **`usuarios.pais`** falls back to the duplicate `Pais_U` column only when
  `Pais_Usr` is empty, per `data_model.md`'s "pick non-null" instruction.
- **`created_at`** is populated from SharePoint's system `Created` column on
  every list, even where `data_model.md` only spells this out explicitly for
  a couple of tables — `Created` is a standard column on every SharePoint list
  item, not something specific to those tables.
- **`documentos` rows get a fresh identity id** (SharePoint's own drive-item id
  isn't preserved) — `data_model.md` doesn't ask for id preservation on this
  table like it does for every list-backed one.

## Files

- `src/graph.ts` — Microsoft Graph client (auth, list/item paging, drive walk).
- `src/mappings.ts` — one SP-internal-name → PG-column table per list, plus
  the FK-resolution table (which SP column feeds which FK, via which resolver).
- `src/coerce.ts` — pure value coercion (dates, numbers, booleans). Never throws.
- `src/resolve.ts` — the in-memory join maps + dirty-data fallback logic +
  the unresolved-joins report.
- `src/load.ts` — Supabase wipe/insert/sequence-fixup/Storage-upload orchestration.
- `src/index.ts` — CLI entry point: env validation, `--dry-run`/`--skip-files`,
  progress log, final summary.
- `src/checks.ts` — offline checks (`npm run check`), no credentials needed.
