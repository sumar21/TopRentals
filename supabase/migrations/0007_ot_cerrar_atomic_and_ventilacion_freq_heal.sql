-- 0007 — OT close atomicity (#5) + ventilación next-cycle frequency heal (#6).
--
-- #5  ot_cerrar now takes the user-entered fecha_cierre + obs_cierre so closing an OT is ONE atomic write.
--     Before, the client called ot_cerrar (which stamped today's date) then a SEPARATE update to overwrite
--     the date/obs — if that second call failed, the OT was left closed with the wrong date and no
--     observation. The signature changed, so DROP the old (bigint, text) overload first.
-- #6  finalizar_ventilacion stores the next cycle's frecuencia_dias coalesced to 90 (not NULL) when the
--     unit has no frequency, matching the mock — a null-frequency lineage heals instead of staying null
--     in Postgres forever. (Correction: 0004's note that "the fallback lives only in the function" was
--     wrong — the mock coalesces into the STORED column, and now this does too.)
--
-- Both bodies are identical to their canonical homes (ot_cerrar in supabase/rpc.sql, finalizar_ventilacion
-- in supabase/schema.sql); keep the copies in sync. They mirror services/mock/adapter.ts (the spec).

-- #5 --------------------------------------------------------------------------
DROP FUNCTION IF EXISTS ot_cerrar(bigint, text);
CREATE OR REPLACE FUNCTION ot_cerrar(p_id bigint, p_tipo text, p_fecha_cierre date DEFAULT NULL, p_obs_cierre text DEFAULT NULL)
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
    PERFORM ot_registrar_salidas_repuestos(p_id);
  END IF;

  RETURN p_id;
END;
$$;

-- #6 --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finalizar_ventilacion(
  p_id bigint,
  p_obs text,
  p_foto_path text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_unidad_id bigint;
  v_direccion_edificio text;
  v_edificio text;
  v_habitacion text;
  v_frecuencia_dias numeric;
  v_new_id bigint;
BEGIN
  UPDATE ventilaciones
  SET
    estado = 'Realizada',
    obs_resuelto = p_obs,
    foto_path = coalesce(p_foto_path, foto_path),
    fecha_finalizacion = now(),
    orden = 1
  WHERE id = p_id
  RETURNING
    unidad_id, direccion_edificio, edificio, habitacion, frecuencia_dias
    INTO v_unidad_id, v_direccion_edificio, v_edificio, v_habitacion, v_frecuencia_dias;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalizar_ventilacion: ventilacion % not found', p_id;
  END IF;

  INSERT INTO ventilaciones (
    estado, unidad_id, direccion_edificio, edificio, habitacion,
    frecuencia_dias, fecha_ultima, proxima_limpieza, asignado_id, es_incidente, orden
  )
  VALUES (
    'Pendiente', v_unidad_id, v_direccion_edificio, v_edificio, v_habitacion,
    coalesce(v_frecuencia_dias, 90), current_date, current_date + coalesce(v_frecuencia_dias, 90)::int, NULL, false, 4
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;
