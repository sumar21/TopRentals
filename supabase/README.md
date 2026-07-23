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

## RLS — pending backend decision

Every table (and the storage buckets) is RLS-**enabled** with a single
permissive policy: `FOR ALL TO authenticated USING (true) WITH CHECK (true)`.
This only blocks anonymous/unauthenticated access — any authenticated user can
read/write everything. It is a placeholder, not real authorization.

**TODO**: replace these with real per-`perfil_usuario` policies once the
auth model is decided (see `data_model.md` → `## Auth`: `usuarios.perfil` +
`perfiles_permisos` need to drive RLS instead of the client-side permission
gating the Power Apps did).

## Deviations from `data_model.md`

See the parent task response / commit message for the full list (table
count, enum-vs-boolean choices, the `ventilaciones.foto_path` addition, and
the FK `ON DELETE` behaviors the doc left unspecified).
