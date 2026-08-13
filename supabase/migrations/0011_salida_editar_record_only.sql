-- 0011 — Salidas migradas de SharePoint (stock_id NULL) ahora son editables como CORRECCIÓN DE
-- REGISTRO: se actualiza sólo el dato de la fila, sin reajustar stock ni escribir movimiento.
--
-- Contexto: la lista SP 09.SalidaStock no tiene referencia a la fila de stock, así que TODA salida
-- migrada quedó con stock_id NULL (ver schema.sql). Antes stock_editar_salida abortaba en ese caso
-- ("registro legacy — no se puede reajustar"), dejando esas filas sin acción. Backfillear el stock_id
-- sería adivinar por centro_de_costo (texto libre) y, para traslados, falta también edificio_destino_id
-- → medio-reconciliar descuadraría el inventario. Por eso: sin stock_id ⇒ corrección de registro pura.
--
-- Parity: services/mock/adapter.ts stock.editarSalida (rama `salida.stock_id == null`).
-- Misma firma que 0010 → CREATE OR REPLACE conserva los GRANT existentes (sin DROP ni re-grant).

CREATE OR REPLACE FUNCTION stock_editar_salida(p_salida_id bigint, p_cantidad numeric, p_usuario_id bigint, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_articulo_id bigint;
  v_stock_id bigint;
  v_tipo text;
  v_cantidad_actual numeric;
  v_fecha_reingreso date;
  v_cant_anterior numeric;
  v_costo numeric;
  v_corte numeric;
  v_edificio_id bigint;
  v_articulo_nombre text;
  v_edificio_nombre text;
  v_delta numeric;
  v_edificio_destino_id bigint;
  v_destino_stock_id bigint;
BEGIN
  SELECT articulo_id, stock_id, tipo::text, cantidad, fecha_reingreso, edificio_destino_id
    INTO v_articulo_id, v_stock_id, v_tipo, v_cantidad_actual, v_fecha_reingreso, v_edificio_destino_id
  FROM salidas_stock WHERE id = p_salida_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salida % no encontrada.', p_salida_id;
  END IF;
  IF v_fecha_reingreso IS NOT NULL THEN
    RAISE EXCEPTION 'La salida ya fue devuelta.';
  END IF;
  -- Registro histórico sin stock de origen (stock_id null, p. ej. salidas migradas de SharePoint):
  -- se corrige SOLO el dato de la fila, sin reajustar stock ni auditar (parity con el mock).
  IF v_stock_id IS NULL THEN
    UPDATE salidas_stock SET cantidad = p_cantidad WHERE id = p_salida_id;
    RETURN p_salida_id;
  END IF;

  SELECT cantidad, precio_unitario, condicion_corte INTO v_cant_anterior, v_costo, v_corte
  FROM stock WHERE id = v_stock_id;

  v_delta := v_cantidad_actual - p_cantidad;
  IF v_delta < 0 AND v_cant_anterior < -v_delta THEN
    RAISE EXCEPTION 'Cantidad insuficiente.';
  END IF;

  -- TRASLADO parity: the destination building was credited at salida time — rebalance it by the inverse
  -- delta (pool-aware lookup). Resolve + validate BEFORE mutating so both sides move together or neither.
  IF v_tipo = 'TRASLADO' AND v_edificio_destino_id IS NOT NULL THEN
    SELECT s.id INTO v_destino_stock_id
    FROM stock s
    JOIN stock_edificios se ON se.stock_id = s.id
    WHERE s.articulo_id = v_articulo_id AND se.edificio_id IN (SELECT stock_pool_edificios(v_edificio_destino_id))
    LIMIT 1;
    IF v_destino_stock_id IS NOT NULL AND v_delta > 0
       AND (SELECT cantidad FROM stock WHERE id = v_destino_stock_id) < v_delta THEN
      RAISE EXCEPTION 'El edificio destino ya no tiene el stock trasladado — no se puede reducir la cantidad.';
    END IF;
  END IF;

  UPDATE stock SET cantidad = cantidad + v_delta WHERE id = v_stock_id;
  IF v_destino_stock_id IS NOT NULL THEN
    UPDATE stock SET cantidad = cantidad - v_delta WHERE id = v_destino_stock_id;
  END IF;
  UPDATE salidas_stock SET cantidad = p_cantidad WHERE id = p_salida_id;

  SELECT edificio_id INTO v_edificio_id FROM stock_edificios WHERE stock_id = v_stock_id LIMIT 1;
  SELECT nombre INTO v_articulo_nombre FROM articulos WHERE id = v_articulo_id;
  IF v_edificio_id IS NOT NULL THEN
    SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = v_edificio_id;
  END IF;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha, version_app
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior + v_delta, v_costo, v_costo,
    v_corte, v_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Salida Stock', v_tipo || ' - EDIT CANT', p_cantidad, p_usuario_id, now(), p_version_app
  );

  RETURN p_salida_id;
END;
$$;
