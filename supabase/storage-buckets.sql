-- TopRentals — Supabase Storage buckets
-- See docs/analysis/data_model.md "## Storage" for the bucket/object-key layout.
-- Private buckets hold operational attachments (bucket-level RLS still
-- applies); 'branding' is public because app logos/icons are meant to be
-- fetched directly without a signed URL.
--
-- Only runs against a real Supabase project (storage.buckets belongs to the
-- Supabase platform, not plain Postgres) — guarded so schema.sql/seed.sql can
-- still be applied standalone against a plain Postgres instance for tests.

DO $$
BEGIN
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE NOTICE 'storage.buckets not found (not a Supabase project) — skipping bucket creation.';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public)
  VALUES
    ('ordenes',       'ordenes',       false), -- ordenes/{ot_id}/{filename}
    ('compras',       'compras',       false), -- compras/{compra_id}/{filename}
    ('bitacoras',     'bitacoras',     false), -- bitacoras/{bitacora_id}/{filename}
    ('ventilaciones', 'ventilaciones', false), -- ventilaciones/{ventilacion_id}/{filename}
    ('articulos',     'articulos',     false), -- articulos/{articulo_id}/{filename}
    ('branding',      'branding',      true)   -- iconos_app / perfiles_permisos images
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ============================================================================
-- STORAGE RLS — placeholder policies only
-- TODO: same pending-backend-decision note as schema.sql. Mirrors table RLS:
-- any authenticated user can read/write any object in these buckets for now.
-- Replace with per-perfil / per-bucket policies once the auth model lands.
-- ============================================================================
DO $$
BEGIN
  IF to_regclass('storage.objects') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE 'CREATE POLICY toprentals_buckets_todo_authenticated_all ON storage.objects
    FOR ALL TO authenticated
    USING (bucket_id IN (''ordenes'',''compras'',''bitacoras'',''ventilaciones'',''articulos'',''branding''))
    WITH CHECK (bucket_id IN (''ordenes'',''compras'',''bitacoras'',''ventilaciones'',''articulos'',''branding''));';
EXCEPTION WHEN duplicate_object THEN
  NULL; -- policy already exists, re-running this file is a no-op
END;
$$;
