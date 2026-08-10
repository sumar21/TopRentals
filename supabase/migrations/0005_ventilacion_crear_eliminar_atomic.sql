-- 0005 — Make ventilaciones crear/eliminar atomic (fold each op's row write + unit-flag update
-- into one transaction). The two functions below are identical to the ones in supabase/rpc.sql
-- (which carries them for fresh builds); keep both copies in sync.

-- Ventilaciones create: insert the schedule row AND flag the unit as under ventilation
-- control in ONE transaction. Was two client-side calls (insert + unidad_set_ventilacion);
-- a failure between them left the row without the unit flag, so the still-unflagged unit
-- stayed selectable and a retry created a DUPLICATE Pendiente cycle. jsonb_populate_record
-- coerces the payload against the table's own column types (enum estado, dates, numerics);
-- id/created_at fall to their defaults; es_incidente defaults to false (PA EsIncidente_VE 'NO').
CREATE OR REPLACE FUNCTION ventilacion_crear(p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row ventilaciones;
  v_id bigint;
BEGIN
  v_row := jsonb_populate_record(NULL::ventilaciones, p_payload);
  INSERT INTO ventilaciones (
    estado, unidad_id, direccion_edificio, edificio, habitacion, frecuencia_dias,
    fecha_ultima, proxima_limpieza, fecha_programada, obs_adelanto, obs_resuelto,
    asignado_id, fecha_asignado, version_asignado, fecha_finalizacion, version_resuelto,
    es_incidente, orden, foto_path
  ) VALUES (
    v_row.estado, v_row.unidad_id, v_row.direccion_edificio, v_row.edificio, v_row.habitacion, v_row.frecuencia_dias,
    v_row.fecha_ultima, v_row.proxima_limpieza, v_row.fecha_programada, v_row.obs_adelanto, v_row.obs_resuelto,
    v_row.asignado_id, v_row.fecha_asignado, v_row.version_asignado, v_row.fecha_finalizacion, v_row.version_resuelto,
    coalesce(v_row.es_incidente, false), v_row.orden, v_row.foto_path
  ) RETURNING id INTO v_id;

  IF v_row.unidad_id IS NOT NULL THEN
    UPDATE unidades SET requiere_ventilacion = true WHERE id = v_row.unidad_id;
  END IF;

  RETURN v_id;
END;
$$;

-- Ventilaciones soft-delete: mark 'Eliminada' AND release the unit's requiere_ventilacion
-- flag in ONE transaction. Was select+update+RPC as three client calls; a failure between
-- them left the row deleted but the unit flag stuck true, permanently locking that unit out
-- of the create picker with no retry path. Returns the unit id (or NULL) so the caller can
-- mirror the cleared flag to SharePoint after the tx commits; NULL also covers not-found
-- (mock parity: silent no-op).
CREATE OR REPLACE FUNCTION ventilacion_eliminar(p_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidad_id bigint;
BEGIN
  UPDATE ventilaciones SET estado = 'Eliminada' WHERE id = p_id
    RETURNING unidad_id INTO v_unidad_id;
  IF NOT FOUND THEN
    RETURN NULL; -- mock parity: silent no-op if the ventilacion doesn't exist
  END IF;
  IF v_unidad_id IS NOT NULL THEN
    UPDATE unidades SET requiere_ventilacion = false WHERE id = v_unidad_id;
  END IF;
  RETURN v_unidad_id;
END;
$$;

-- New DEFINER functions default to PUBLIC/anon EXECUTE; restrict to app users + service_role,
-- matching rpc.sql's blanket grant. Guarded so the file still applies on plain Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON FUNCTION ventilacion_crear(jsonb), ventilacion_eliminar(bigint) FROM PUBLIC, anon;
    GRANT EXECUTE ON FUNCTION ventilacion_crear(jsonb), ventilacion_eliminar(bigint) TO authenticated, service_role;
  END IF;
END;
$$;
