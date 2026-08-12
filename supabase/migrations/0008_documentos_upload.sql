-- 0008 — documentos.crear support (the OT-create photos + compra-receipt PDF the PA persisted; they
-- were staged client-side only). A private `documentos` Storage bucket + a DEFINER RPC to record the
-- metadata row (documentos is SELECT-only under RLS like every other table, so the write goes through
-- the vetted RPC surface). Mirrors mock documentos.crear (services/mock/adapter.ts), unit-checked in
-- scripts/checks/run.ts. NOTE: this whole file is UNVERIFIED here (no DB); apply + smoke-test against
-- Supabase (an OT photo + a compra receipt upload, then confirm the file lands in the bucket and the row).

-- Private bucket for OT / compra / bitácora attachments.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documentos', 'documentos', false)
ON CONFLICT (id) DO NOTHING;

-- Authenticated users may read + upload objects in the documentos bucket. (Writes to the metadata
-- TABLE still go only through documento_crear below; direct table writes stay blocked by RLS.)
DROP POLICY IF EXISTS "documentos bucket authenticated read" ON storage.objects;
CREATE POLICY "documentos bucket authenticated read"
  ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'documentos');
DROP POLICY IF EXISTS "documentos bucket authenticated upload" ON storage.objects;
CREATE POLICY "documentos bucket authenticated upload"
  ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'documentos');

-- Record a documento metadata row. The file bytes are uploaded to Storage client-side first; this only
-- writes the row (nombre/storage_path/carpeta + the owning OT or compra). documentos.carpeta is plain text.
CREATE OR REPLACE FUNCTION documento_crear(
  p_nombre text,
  p_storage_path text,
  p_carpeta text,
  p_orden_trabajo_id bigint DEFAULT NULL,
  p_compra_id bigint DEFAULT NULL,
  p_content_type text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO documentos (nombre, storage_path, carpeta, orden_trabajo_id, compra_id, content_type)
  VALUES (p_nombre, p_storage_path, p_carpeta, p_orden_trabajo_id, p_compra_id, p_content_type)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
