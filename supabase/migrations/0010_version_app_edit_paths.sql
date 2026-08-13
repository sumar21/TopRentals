-- 0010 — Close the two MINOR version-stamping gaps left by 0009, bringing Supabase up to the
-- mock (services/mock/adapter.ts, the behavioral spec — no mock changes needed):
--
--   #1  Repuesto-spill salidas (created when an OT is closed/finalized) now stamp the CLOSE-time
--       app version, not the repuesto's assign-time version. ot_registrar_salidas_repuestos gains
--       p_version_app; ot_cerrar/ot_finalizar (both call it) pass it down. Matches mock
--       registrarSalidasDeRepuestos, which stamps APP_VERSION at close.
--   #2  detalle_compras rows created on the EDIT paths (compras_actualizar / aprobaciones_editar)
--       now stamp version_app too (via insertar_detalle_lineas, which already accepts p_version_app
--       since 0009). A dedicated 4th param p_version_app is used (NOT the p_patch/p_header jsonb) so
--       the compra HEADER's version_app is never re-stamped on edit — mock parity. Matches mock
--       insertarLineas, which stamps APP_VERSION unconditionally (incl. the reemplazarLineas path).
--
-- All five functions gain a trailing text param → each is DROPped by its CURRENT signature and
-- recreated. Columns already exist (schema.sql); this only touches RPC bodies. The tail re-grant
-- DO block is REQUIRED: DROP+CREATE resets a function's grants to PUBLIC EXECUTE, which would
-- reopen these SECURITY DEFINER RLS-bypassing RPCs to the anon key — re-close them (same as 0009).
--
-- Apply: node --env-file=.env scripts/migrate/apply-sql.mjs supabase/migrations/0010_version_app_edit_paths.sql

-- ============================================================================
-- DROP current signatures
-- ============================================================================
DROP FUNCTION IF EXISTS ot_registrar_salidas_repuestos(bigint);
DROP FUNCTION IF EXISTS ot_cerrar(bigint, text);              -- ancient sig (pre-0007); no-op today, defensive
DROP FUNCTION IF EXISTS ot_cerrar(bigint, text, date, text);
DROP FUNCTION IF EXISTS ot_finalizar(bigint);                 -- ancient sig (pre-0007); no-op today, defensive
DROP FUNCTION IF EXISTS ot_finalizar(bigint, bigint);
DROP FUNCTION IF EXISTS compras_actualizar(bigint, jsonb, jsonb);
DROP FUNCTION IF EXISTS aprobaciones_editar(bigint, jsonb, jsonb);

-- ============================================================================
-- #1 — helper first (ot_cerrar/ot_finalizar call it), now stamps the close-time version
-- ============================================================================
CREATE OR REPLACE FUNCTION ot_registrar_salidas_repuestos(p_ot_id bigint, p_version_app text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- version_app: the CLOSE-time app version (passed down from ot_cerrar/ot_finalizar), matching the
  -- mock (registrarSalidasDeRepuestos stamps APP_VERSION) — this salida row is written now, at close.
  INSERT INTO salidas_stock (
    articulo_id, stock_id, concat_articulo, tecnico_id, tipo,
    fecha_salida, fecha_reingreso, uso, centro_de_costo, cantidad, usuario_id, fecha, version_app
  )
  SELECT r.articulo_id, NULL, r.repuesto, ot.tecnico_id, 'CONSUMIBLE'::tipo_salida_stock,
         current_date, NULL, ot.id_univoco, NULL, r.cantidad, r.usuario_id, now(), p_version_app
  FROM repuestos_ot r
  JOIN ordenes_trabajo ot ON ot.id = r.orden_trabajo_id
  WHERE r.orden_trabajo_id = p_ot_id AND r.activo = true;
END;
$$;

CREATE OR REPLACE FUNCTION ot_cerrar(p_id bigint, p_tipo text, p_fecha_cierre date DEFAULT NULL, p_obs_cierre text DEFAULT NULL, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previo text;
BEGIN
  SELECT status::text INTO v_previo FROM ordenes_trabajo WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de trabajo % no encontrada.', p_id;
  END IF;

  UPDATE ordenes_trabajo
    SET status = p_tipo::estado_ot,
        fecha_cierre = COALESCE(p_fecha_cierre, current_date),
        obs_cierre = p_obs_cierre
  WHERE id = p_id;

  IF v_previo NOT IN ('Cerrada', 'Cerrada V', 'Cerrada F', 'Anulada') THEN
    PERFORM ot_registrar_salidas_repuestos(p_id, p_version_app);
  END IF;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION ot_finalizar(p_id bigint, p_tecnico_id bigint DEFAULT NULL, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previo text;
BEGIN
  SELECT status::text INTO v_previo FROM ordenes_trabajo WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Orden de trabajo % no encontrada.', p_id;
  END IF;

  -- p_tecnico_id: PA's mobile close stamps Tecnico_IN = the closing technician; desktop passes NULL (keep existing).
  UPDATE ordenes_trabajo SET status = 'Cerrada', fecha_cierre = current_date, tecnico_id = COALESCE(p_tecnico_id, tecnico_id) WHERE id = p_id;

  IF v_previo NOT IN ('Cerrada', 'Cerrada V', 'Cerrada F', 'Anulada') THEN
    PERFORM ot_registrar_salidas_repuestos(p_id, p_version_app);
  END IF;

  RETURN p_id;
END;
$$;

-- ============================================================================
-- #2 — edit paths forward the version to insertar_detalle_lineas (which stamps detalle_compras).
-- The 4th param keeps this out of p_patch/p_header, so the compra header version_app is untouched.
-- insertar_detalle_lineas(bigint, jsonb, text) already exists (0009) — not redefined here.
-- ============================================================================
CREATE OR REPLACE FUNCTION compras_actualizar(p_id bigint, p_patch jsonb, p_lineas jsonb DEFAULT NULL, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cantidad_total numeric;
  v_monto_total numeric;
BEGIN
  UPDATE compras SET
    usuario_id = CASE WHEN p_patch ? 'usuario_id' THEN (p_patch->>'usuario_id')::bigint ELSE usuario_id END,
    usuario_compra = CASE WHEN p_patch ? 'usuario_compra' THEN p_patch->>'usuario_compra' ELSE usuario_compra END,
    urgencia = CASE WHEN p_patch ? 'urgencia' THEN p_patch->>'urgencia' ELSE urgencia END,
    observacion = CASE WHEN p_patch ? 'observacion' THEN p_patch->>'observacion' ELSE observacion END,
    obs_recibir = CASE WHEN p_patch ? 'obs_recibir' THEN p_patch->>'obs_recibir' ELSE obs_recibir END,
    fecha = CASE WHEN p_patch ? 'fecha' THEN (p_patch->>'fecha')::date ELSE fecha END,
    status = CASE WHEN p_patch ? 'status' THEN (p_patch->>'status')::estado_compra ELSE status END,
    cargo = CASE WHEN p_patch ? 'cargo' THEN p_patch->>'cargo' ELSE cargo END,
    sector_pedido = CASE WHEN p_patch ? 'sector_pedido' THEN p_patch->>'sector_pedido' ELSE sector_pedido END,
    version_app = CASE WHEN p_patch ? 'version_app' THEN p_patch->>'version_app' ELSE version_app END
  WHERE id = p_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada.', p_id;
  END IF;

  IF p_lineas IS NOT NULL THEN
    UPDATE detalle_compras SET activo = false WHERE compra_id = p_id AND activo = true;
    PERFORM insertar_detalle_lineas(p_id, p_lineas, p_version_app);

    SELECT coalesce(sum((l->>'cantidad')::numeric), 0),
           coalesce(sum((l->>'cantidad')::numeric * (l->>'costo_unitario')::numeric), 0)
      INTO v_cantidad_total, v_monto_total
    FROM jsonb_array_elements(p_lineas) l;

    UPDATE compras SET cantidad_total = v_cantidad_total, monto_total = v_monto_total WHERE id = p_id;
  END IF;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION aprobaciones_editar(p_id bigint, p_lineas jsonb, p_header jsonb DEFAULT NULL, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id bigint;
  v_cantidad_total numeric;
  v_monto_total numeric;
BEGIN
  SELECT compra_id INTO v_compra_id FROM aprobaciones WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobacion % no encontrada.', p_id;
  END IF;

  UPDATE detalle_compras SET activo = false WHERE compra_id = v_compra_id AND activo = true;
  PERFORM insertar_detalle_lineas(v_compra_id, p_lineas, p_version_app);

  SELECT coalesce(sum((l->>'cantidad')::numeric), 0),
         coalesce(sum((l->>'cantidad')::numeric * (l->>'costo_unitario')::numeric), 0)
    INTO v_cantidad_total, v_monto_total
  FROM jsonb_array_elements(p_lineas) l;

  UPDATE aprobaciones SET cantidad = v_cantidad_total, monto = v_monto_total WHERE id = p_id;
  UPDATE compras SET cantidad_total = v_cantidad_total, monto_total = v_monto_total WHERE id = v_compra_id;

  IF p_header IS NOT NULL THEN
    UPDATE compras SET
      usuario_compra = CASE WHEN p_header ? 'usuario_compra' THEN p_header->>'usuario_compra' ELSE usuario_compra END,
      urgencia = CASE WHEN p_header ? 'urgencia' THEN p_header->>'urgencia' ELSE urgencia END,
      observacion = CASE WHEN p_header ? 'observacion' THEN p_header->>'observacion' ELSE observacion END
    WHERE id = v_compra_id;

    IF coalesce(p_header->>'urgencia', '') <> '' THEN
      UPDATE aprobaciones SET urgencia = p_header->>'urgencia' WHERE id = p_id;
    END IF;
  END IF;

  RETURN p_id;
END;
$$;

-- ============================================================================
-- Re-grant EXECUTE — CRITICAL companion to the DROP+CREATE above (see 0009 / rpc.sql tail).
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
  END IF;
END;
$$;
