# Supabase schema

PostgreSQL schema for the future Supabase backend, generated from
[`docs/analysis/data_model.md`](../docs/analysis/data_model.md) (source of truth —
read that first if you're touching these files).

## Files

| File | Purpose |
|---|---|
| `schema.sql` | Enums, 21 tables (FK-dependency order), indexes, the `finalizar_ventilacion` RPC, RLS placeholders. |
| `seed.sql` | Small dev dataset (edificios, usuarios, articulos, unidades, permisos, a few OTs/stock/compras/ventilaciones). |
| `storage-buckets.sql` | Creates the 6 Storage buckets + a placeholder storage RLS policy. |

## Apply order

These are plain `.sql` files, not a `supabase/migrations/` folder, so
`supabase db reset` will **not** pick them up automatically. Apply with `psql`
in this exact order:

```bash
psql "$DATABASE_URL" -f supabase/schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql            # optional, dev only
psql "$DATABASE_URL" -f supabase/storage-buckets.sql # no-op on plain Postgres
```

If you'd rather use `supabase db reset` (Supabase CLI):
1. Copy `schema.sql` into `supabase/migrations/<timestamp>_init.sql`.
2. Keep `seed.sql` where it is — the CLI already auto-applies `supabase/seed.sql`
   after migrations.
3. Run `storage-buckets.sql` once by hand afterwards (bucket creation isn't a
   schema migration).

`schema.sql` and `storage-buckets.sql` guard the parts that only exist on a
real Supabase project (`auth.users`, `storage.buckets`) with
`to_regclass(...) IS NOT NULL` checks. The tables, enums, indexes and the
`finalizar_ventilacion` function all run clean on plain Postgres (e.g. for
tests); the RLS policies (`TO authenticated`) do not — that role only exists
on a real Supabase project.

## RLS — high-value hardening (not per-perfil authorization)

Per-`perfil_usuario` authorization stays client-side (`utils/permissions.ts`)
and inside the vetted DEFINER RPCs — RLS here is **not** that layer. It closes
the direct-write holes that actually have blast radius:

- **SELECT-only for `authenticated`** — catalogs (`edificios`, `articulos`,
  `frecuencias`, `unidades`, `perfiles_permisos`, `iconos_app`,
  `emails_notificacion`), `usuarios`, and the stock/audit tables (`stock`,
  `stock_edificios`, `movimientos_stock`, `salidas_stock`). Writes happen only
  through `SECURITY DEFINER` RPCs (`supabase/rpc.sql`) or the service-role
  catalog sync — both bypass RLS. This closes the **raw table-write** path:
  no `UPDATE usuarios SET perfil='Admin'`, no direct tampering with the shared
  catalogs / permission matrix, no rewriting the append-only audit trail. It does
  **not** add per-perfil authz — an authenticated user can still call the
  equivalent RPC (e.g. `usuario_actualizar` with any `perfil`); closing that is
  the deferred per-perfil layer below.
- **Function EXECUTE is restricted too** — since the RPCs are DEFINER (they
  bypass RLS), `rpc.sql` / the migration `REVOKE EXECUTE … FROM PUBLIC, anon` and
  grant it only to `authenticated` + `service_role`. Without this, a holder of the
  public anon key could call the RPCs and bypass RLS entirely.
- **Read/write for `authenticated`** — the operational records
  (`ordenes_trabajo`, `ventilaciones`, `compras`, `detalle_compras`,
  `aprobaciones`, `bitacoras`, `fotos_bitacora`, `repuestos_ot`, `documentos`).
  Left writable because locking them adds no real security: the same client
  could call the equivalent RPC anyway (the RPCs carry no per-perfil check).

Fresh installs get this from `schema.sql`. An already-deployed DB is migrated by
`migrations/0002_rls_hardening.sql` (after re-applying `rpc.sql` for the DEFINER
flip + the new `usuario_*` / `articulo_insert_mirror` / `unidad_set_*` RPCs).

**Still open**: true per-`perfil` policies at the DB (see `data_model.md` →
`## Auth`) if the threat model ever needs authz enforced below the app.

## Deviations from `data_model.md`

See the parent task response / commit message for the full list (table
count, enum-vs-boolean choices, the `ventilaciones.foto_path` addition, and
the FK `ON DELETE` behaviors the doc left unspecified).
