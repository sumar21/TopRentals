-- 0002_rls_hardening.sql — high-value RLS lockdown for the ALREADY-DEPLOYED DB.
--
-- Fresh installs get this straight from schema.sql; this migration brings an
-- existing DB (which today has the old permissive `<t>_todo_authenticated_all`
-- FOR ALL policy on every table) up to the same state:
--   * catalogs + perfiles_permisos + usuarios + stock/audit tables -> SELECT-only
--     for `authenticated` (writes only via DEFINER RPC or the service-role sync).
--   * operational tables (OTs, ventilaciones, compras…) stay read/write.
-- See schema.sql's RLS section and rpc.sql's header for the rationale.
--
-- PREREQ: re-apply supabase/rpc.sql FIRST. It makes every mutation RPC SECURITY
-- DEFINER and adds usuario_* / articulo_insert_mirror / unidad_set_*; without
-- that, the in-app writes to the tables locked below would start failing.
--
-- Apply: node --env-file=.env scripts/migrate/apply-sql.mjs supabase/migrations/0002_rls_hardening.sql
-- Idempotent — safe to re-run.

-- finalizar_ventilacion lives in schema.sql (not re-applied on an existing DB), so flip it here.
ALTER FUNCTION finalizar_ventilacion(bigint, text, text) SECURITY DEFINER;
ALTER FUNCTION finalizar_ventilacion(bigint, text, text) SET search_path = public;

-- Swap FOR ALL -> SELECT-only on the read-only (catalog + usuarios + stock/audit) tables.
DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'edificios', 'articulos', 'frecuencias', 'unidades', 'usuarios',
    'perfiles_permisos', 'iconos_app', 'emails_notificacion',
    'stock', 'stock_edificios', 'movimientos_stock', 'salidas_stock'
  ])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_todo_authenticated_all', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_authenticated_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true);',
      t || '_authenticated_read', t
    );
  END LOOP;
END;
$$;

-- CRITICAL companion to SECURITY DEFINER: revoke the default PUBLIC/anon EXECUTE so a
-- holder of the public anon key can't call the RLS-bypassing RPCs. rpc.sql does the same
-- on re-apply; repeated here so this migration also closes the hole if run on its own
-- (covers finalizar_ventilacion too, which the ALTERs above just flipped to DEFINER).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
  END IF;
END;
$$;
