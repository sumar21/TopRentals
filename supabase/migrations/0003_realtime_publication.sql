-- 0003 — Enable Supabase Realtime (postgres_changes) on the operational tables the UI
-- subscribes to (services/supabase/adapter.ts REALTIME_TABLES), so lists auto-refresh
-- without the manual "Actualizar" button. RLS still applies: authenticated users only
-- receive change events they are allowed to read.
--
-- Idempotent: a table is added only if it isn't already in the `supabase_realtime`
-- publication (Postgres has no ADD TABLE IF NOT EXISTS for publications).
do $$
declare
  t text;
  tables text[] := array[
    'ordenes_trabajo', 'stock', 'movimientos_stock', 'salidas_stock',
    'compras', 'detalle_compras', 'aprobaciones', 'ventilaciones',
    'articulos', 'usuarios'
  ];
begin
  foreach t in array tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
