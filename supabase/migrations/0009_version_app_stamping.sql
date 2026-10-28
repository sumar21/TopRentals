-- 0009 — App-version stamping (client-driven: config/appVersion.ts is the single source of
-- truth; the client passes APP_VERSION into every write, these RPCs persist it). Mirrors the
-- same change already applied to services/mock/adapter.ts (the behavioral spec): every created
-- record gets version_app: APP_VERSION, and finalizar_ventilacion stamps version_resuelto on the
-- closed row. Columns already exist (see schema.sql) — this migration only touches RPC bodies.
--
-- Nine functions gain a new trailing text param (each DEFAULT NULL, so existing untyped callers
-- keep working) — Postgres can't CREATE OR REPLACE a function whose parameter list changed
-- (it would either error or create a confusing overload), so each one is DROPped first by its
-- OLD signature, then recreated. finalizar_ventilacion additionally lives in schema.sql (its
-- canonical home) and is kept in sync there. Bodies below are identical to their canonical
-- homes in supabase/rpc.sql / supabase/schema.sql.
--
-- Two functions keep their signature (body-only change): compras_crear (passes version_app
-- through to insertar_detalle_lineas) and ot_registrar_salidas_repuestos (copies version_app
-- from the repuestos_ot row it's spilling into salidas_stock, not the live app version — the
-- repuesto could have been assigned under a different deploy than the one closing the OT).
--
-- Apply: node --env-file=.env scripts/migrate/apply-sql.mjs supabase/migrations/0009_version_app_stamping.sql

-- ============================================================================
-- DROP old signatures (all gain a trailing p_version_app / p_version text DEFAULT NULL)
-- ============================================================================
DROP FUNCTION IF EXISTS insertar_detalle_lineas(bigint, jsonb);
DROP FUNCTION IF EXISTS stock_agregar(bigint, bigint, numeric, numeric, bigint);
DROP FUNCTION IF EXISTS stock_salida(bigint, bigint, text, numeric, bigint, text, text, bigint, bigint, date);
DROP FUNCTION IF EXISTS stock_editar(bigint, numeric, numeric, numeric, bigint);
DROP FUNCTION IF EXISTS stock_editar_salida(bigint, numeric, bigint);
DROP FUNCTION IF EXISTS stock_confirmar_devolucion(bigint, bigint);
DROP FUNCTION IF EXISTS compras_recibir(bigint, jsonb, text);
DROP FUNCTION IF EXISTS ot_asignar_repuesto(bigint, bigint, bigint, numeric, bigint);
DROP FUNCTION IF EXISTS ot_bitacora_crear(bigint, text, bigint, text);
DROP FUNCTION IF EXISTS finalizar_ventilacion(bigint, text, text);

-- ============================================================================
-- helper: insertar_detalle_lineas — +p_version_app. Only compras_crear passes it (stamps the
-- same version on the detail lines as the parent compra); compras_actualizar/aprobaciones_editar
-- keep calling with 2 args, defaulting to NULL (their line-replacement flow is out of scope here).
-- ============================================================================
CREATE OR REPLACE FUNCTION insertar_detalle_lineas(p_compra_id bigint, p_lineas jsonb, p_version_app text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linea jsonb;
  v_articulo_id bigint;
  v_edificio_id bigint;
  v_cantidad numeric;
  v_costo_unitario numeric;
  v_articulo_nombre text;
  v_edificio_nombre text;
  v_cant_min numeric;
  v_detalle_id bigint;
BEGIN
  IF p_lineas IS NULL THEN
    RETURN;
  END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_articulo_id := (v_linea->>'articulo_id')::bigint;
    v_edificio_id := (v_linea->>'edificio_id')::bigint;
    v_cantidad := (v_linea->>'cantidad')::numeric;
    v_costo_unitario := (v_linea->>'costo_unitario')::numeric;

    SELECT nombre, NULLIF(corte, '')::numeric INTO v_articulo_nombre, v_cant_min
      FROM articulos WHERE id = v_articulo_id;
    SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = v_edificio_id;

    INSERT INTO detalle_compras (
      compra_id, articulo_id, articulo, edificio_id, edificio,
      cantidad, costo_unitario, cant_min, costo_total, activo, fecha, version_app
    ) VALUES (
      p_compra_id, v_articulo_id, v_articulo_nombre, v_edificio_id, v_edificio_nombre,
      v_cantidad, v_costo_unitario, v_cant_min, v_cantidad * v_costo_unitario, true, now(), p_version_app
    ) RETURNING id INTO v_detalle_id;

    UPDATE detalle_compras SET id_univoco = '(DTC)-' || lpad(v_detalle_id::text, 3, '0')
      WHERE id = v_detalle_id;
  END LOOP;
END;
$$;

-- Mirrors mock stock.agregar() +p_version_app: stamped on a NEW stock row (else-branch only,
-- like the mock) and unconditionally on the movimientos_stock audit row.
CREATE OR REPLACE FUNCTION stock_agregar(
  p_articulo_id bigint, p_edificio_id bigint, p_cantidad numeric,
  p_precio_unitario numeric, p_usuario_id bigint, p_version_app text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id bigint;
  v_cant_anterior numeric;
  v_condicion_corte numeric;
  v_articulo_nombre text;
  v_edificio_nombre text;
BEGIN
  SELECT s.id, s.cantidad INTO v_stock_id, v_cant_anterior
  FROM stock s
  JOIN stock_edificios se ON se.stock_id = s.id
  WHERE s.articulo_id = p_articulo_id AND se.edificio_id IN (SELECT stock_pool_edificios(p_edificio_id))
  LIMIT 1;

  IF v_stock_id IS NOT NULL THEN
    UPDATE stock SET cantidad = cantidad + p_cantidad, precio_unitario = p_precio_unitario
    WHERE id = v_stock_id
    RETURNING condicion_corte INTO v_condicion_corte;
  ELSE
    v_cant_anterior := 0;
    SELECT NULLIF(corte, '')::numeric INTO v_condicion_corte FROM articulos WHERE id = p_articulo_id;
    v_condicion_corte := coalesce(v_condicion_corte, 0);

    INSERT INTO stock (articulo_id, cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, desde, version_app)
    VALUES (p_articulo_id, p_cantidad, p_precio_unitario, v_condicion_corte, true, p_usuario_id, now(), 'Desktop', p_version_app)
    RETURNING id INTO v_stock_id;

    UPDATE stock SET id_univoco = '(STK)-' || lpad(v_stock_id::text, 3, '0') WHERE id = v_stock_id;
    INSERT INTO stock_edificios (stock_id, edificio_id) VALUES (v_stock_id, p_edificio_id);
  END IF;

  -- Screen_Stock parity: Agregar/Editar Stock keeps the article master price in sync.
  UPDATE articulos SET precio_unitario = p_precio_unitario WHERE id = p_articulo_id
    RETURNING nombre INTO v_articulo_nombre;
  SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = p_edificio_id;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha, version_app
  ) VALUES (
    p_articulo_id, p_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior + p_cantidad, NULL, p_precio_unitario,
    NULL, v_condicion_corte,
    p_edificio_id, v_edificio_nombre, 'Desktop - Stock',
    CASE WHEN v_cant_anterior = 0 THEN 'Nuevo' ELSE 'Editado' END,
    p_cantidad, p_usuario_id, now(), p_version_app
  );

  RETURN v_stock_id;
END;
$$;

-- Mirrors mock stock.salida() +p_version_app: stamped on the movimientos_stock audit row and the
-- salidas_stock row. The TRASLADO destination stock row (when newly created) already copies
-- version_app from the SOURCE stock row (pre-existing behavior, unrelated to this param).
CREATE OR REPLACE FUNCTION stock_salida(
  p_stock_id bigint, p_edificio_id bigint, p_tipo text, p_cantidad numeric,
  p_tecnico_id bigint, p_uso text, p_centro_de_costo text, p_usuario_id bigint,
  p_edificio_destino_id bigint DEFAULT NULL, p_fecha_salida date DEFAULT NULL,
  p_version_app text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_articulo_id bigint;
  v_cant_anterior numeric;
  v_precio numeric;
  v_corte numeric;
  v_articulo_nombre text;
  v_edificio_nombre text;
  v_edificio_traslado_nombre text;
  v_destino_id bigint;
  v_salida_id bigint;
BEGIN
  SELECT articulo_id, cantidad, precio_unitario, condicion_corte
    INTO v_articulo_id, v_cant_anterior, v_precio, v_corte
  FROM stock WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock % no encontrado.', p_stock_id;
  END IF;
  IF v_cant_anterior < p_cantidad THEN
    RAISE EXCEPTION 'Cantidad insuficiente.';
  END IF;

  UPDATE stock SET cantidad = cantidad - p_cantidad WHERE id = p_stock_id;

  SELECT nombre INTO v_articulo_nombre FROM articulos WHERE id = v_articulo_id;
  SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = p_edificio_id;

  IF p_tipo = 'TRASLADO' THEN
    IF p_edificio_destino_id IS NULL THEN
      RAISE EXCEPTION 'TRASLADO requiere edificio_destino_id.';
    END IF;
    SELECT nombre INTO v_edificio_traslado_nombre FROM edificios WHERE id = p_edificio_destino_id;
  END IF;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, edificio_traslado, desde, tipo_movimiento, cantidad, usuario_id, fecha, version_app
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior - p_cantidad, v_precio, v_precio,
    v_corte, v_corte,
    p_edificio_id, v_edificio_nombre, v_edificio_traslado_nombre, 'Desktop - Salida Stock',
    p_tipo, p_cantidad, p_usuario_id, now(), p_version_app
  );

  IF p_tipo = 'TRASLADO' THEN
    SELECT s.id INTO v_destino_id
    FROM stock s
    JOIN stock_edificios se ON se.stock_id = s.id
    WHERE s.articulo_id = v_articulo_id AND se.edificio_id IN (SELECT stock_pool_edificios(p_edificio_destino_id))
    LIMIT 1;

    IF v_destino_id IS NOT NULL THEN
      UPDATE stock SET cantidad = cantidad + p_cantidad WHERE id = v_destino_id;
    ELSE
      -- mock: `{...structuredClone(row), id: nextId, cantidad}` — copy every
      -- other column verbatim from the (already-decremented) source row.
      INSERT INTO stock (id_univoco, articulo_id, cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, ultima_mod, desde, version_app)
      SELECT id_univoco, articulo_id, p_cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, ultima_mod, desde, version_app
      FROM stock WHERE id = p_stock_id
      RETURNING id INTO v_destino_id;

      INSERT INTO stock_edificios (stock_id, edificio_id) VALUES (v_destino_id, p_edificio_destino_id);
    END IF;
  END IF;

  INSERT INTO salidas_stock (
    articulo_id, stock_id, edificio_destino_id, concat_articulo, tecnico_id, tipo,
    fecha_salida, uso, centro_de_costo, cantidad, usuario_id, fecha, version_app
  ) VALUES (
    v_articulo_id, p_stock_id, CASE WHEN p_tipo = 'TRASLADO' THEN p_edificio_destino_id ELSE NULL END,
    v_articulo_nombre, p_tecnico_id, p_tipo::tipo_salida_stock,
    coalesce(p_fecha_salida, current_date), p_uso, p_centro_de_costo, p_cantidad, p_usuario_id, now(), p_version_app
  ) RETURNING id INTO v_salida_id;

  RETURN v_salida_id;
END;
$$;

-- Mirrors mock stock.editar() +p_version_app: stamped only on the movimientos_stock audit row
-- (the stock row itself is never re-stamped on edit — mock parity).
CREATE OR REPLACE FUNCTION stock_editar(
  p_stock_id bigint, p_cantidad numeric, p_precio_unitario numeric,
  p_condicion_corte numeric, p_usuario_id bigint, p_version_app text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_articulo_id bigint;
  v_cant_anterior numeric;
  v_costo_anterior numeric;
  v_stock_min_anterior numeric;
  v_edificio_id bigint;
  v_articulo_nombre text;
  v_edificio_nombre text;
BEGIN
  SELECT articulo_id, cantidad, precio_unitario, condicion_corte
    INTO v_articulo_id, v_cant_anterior, v_costo_anterior, v_stock_min_anterior
  FROM stock WHERE id = p_stock_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock % no encontrado.', p_stock_id;
  END IF;

  UPDATE stock SET cantidad = p_cantidad, precio_unitario = p_precio_unitario, condicion_corte = p_condicion_corte
  WHERE id = p_stock_id;

  -- Screen_Stock parity: Editar Stock also keeps the article master price in sync (PA Patch to 99.ABM_Articulos).
  UPDATE articulos SET precio_unitario = p_precio_unitario WHERE id = v_articulo_id;

  SELECT edificio_id INTO v_edificio_id FROM stock_edificios WHERE stock_id = p_stock_id LIMIT 1;
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
    v_cant_anterior, p_cantidad, v_costo_anterior, p_precio_unitario,
    v_stock_min_anterior, p_condicion_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Stock', 'Editado', p_cantidad, p_usuario_id, now(), p_version_app
  );

  RETURN p_stock_id;
END;
$$;

-- Mirrors mock stock.editarSalida() +p_version_app: stamped only on the movimientos_stock audit row.
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
  IF v_stock_id IS NULL THEN
    RAISE EXCEPTION 'La salida no tiene stock de origen registrado (registro legacy) — no se puede reajustar.';
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

-- Mirrors mock stock.confirmarDevolucion() +p_version_app: stamped only on the movimientos_stock audit row.
CREATE OR REPLACE FUNCTION stock_confirmar_devolucion(p_salida_id bigint, p_usuario_id bigint, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_articulo_id bigint;
  v_stock_id bigint;
  v_tipo text;
  v_cantidad numeric;
  v_fecha_reingreso date;
  v_cant_anterior numeric;
  v_costo numeric;
  v_corte numeric;
  v_edificio_id bigint;
  v_articulo_nombre text;
  v_edificio_nombre text;
BEGIN
  SELECT articulo_id, stock_id, tipo::text, cantidad, fecha_reingreso
    INTO v_articulo_id, v_stock_id, v_tipo, v_cantidad, v_fecha_reingreso
  FROM salidas_stock WHERE id = p_salida_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Salida % no encontrada.', p_salida_id;
  END IF;
  IF v_tipo <> 'DEVOLUCION' OR v_fecha_reingreso IS NOT NULL THEN
    RAISE EXCEPTION 'La salida no está pendiente de devolución.';
  END IF;
  IF v_stock_id IS NULL THEN
    RAISE EXCEPTION 'La salida no tiene stock de origen registrado (registro legacy) — no se puede devolver.';
  END IF;

  SELECT cantidad, precio_unitario, condicion_corte INTO v_cant_anterior, v_costo, v_corte
  FROM stock WHERE id = v_stock_id;

  UPDATE stock SET cantidad = cantidad + v_cantidad WHERE id = v_stock_id;
  UPDATE salidas_stock SET fecha_reingreso = current_date, tipo = 'DEVUELTO' WHERE id = p_salida_id;

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
    v_cant_anterior, v_cant_anterior + v_cantidad, v_costo, v_costo,
    v_corte, v_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Salida Stock', 'DEVOLUCION - REINGRESO', v_cantidad, p_usuario_id, now(), p_version_app
  );

  RETURN p_salida_id;
END;
$$;

-- Mirrors mock compras.crear(): body-only change (signature unchanged) — now forwards
-- p_compra->>'version_app' to insertar_detalle_lineas so the detalle_compras rows it creates
-- get stamped too. The compras row itself already read p_compra->>'version_app' before this migration.
CREATE OR REPLACE FUNCTION compras_crear(p_compra jsonb, p_lineas jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
  v_cantidad_total numeric;
  v_monto_total numeric;
BEGIN
  SELECT coalesce(sum((l->>'cantidad')::numeric), 0),
         coalesce(sum((l->>'cantidad')::numeric * (l->>'costo_unitario')::numeric), 0)
    INTO v_cantidad_total, v_monto_total
  FROM jsonb_array_elements(p_lineas) l;

  INSERT INTO compras (
    usuario_id, usuario_compra, urgencia, observacion, obs_recibir, fecha,
    cantidad_total, monto_total, status, cargo, sector_pedido, version_app
  ) VALUES (
    (p_compra->>'usuario_id')::bigint,
    p_compra->>'usuario_compra',
    p_compra->>'urgencia',
    p_compra->>'observacion',
    p_compra->>'obs_recibir',
    coalesce((p_compra->>'fecha')::date, current_date),
    v_cantidad_total,
    v_monto_total,
    (p_compra->>'status')::estado_compra,
    p_compra->>'cargo',
    p_compra->>'sector_pedido',
    p_compra->>'version_app'
  ) RETURNING id INTO v_id;

  UPDATE compras SET id_compra = '(BUY)-' || lpad(v_id::text, 3, '0') || to_char(current_date, 'YYYYMMDD')
    WHERE id = v_id;

  PERFORM insertar_detalle_lineas(v_id, p_lineas, p_compra->>'version_app');

  RETURN v_id;
END;
$$;

-- Mirrors mock compras.recibir() +p_version_app: stamped on a NEW stock row (else-branch only)
-- and unconditionally on the movimientos_stock audit row, same pattern as stock_agregar.
CREATE OR REPLACE FUNCTION compras_recibir(p_id bigint, p_lineas jsonb, p_obs_recibir text, p_version_app text DEFAULT NULL)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_usuario_id bigint;
  v_linea jsonb;
  v_detalle_id bigint;
  v_recibido numeric;
  v_articulo_id bigint;
  v_edificio_id bigint;
  v_articulo text;
  v_edificio text;
  v_costo_unitario numeric;
  v_cant_min numeric;
  v_stock_id bigint;
  v_cant_anterior numeric;
BEGIN
  UPDATE compras SET status = 'Recibida', obs_recibir = p_obs_recibir
  WHERE id = p_id
  RETURNING usuario_id INTO v_usuario_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada.', p_id;
  END IF;

  FOR v_linea IN SELECT * FROM jsonb_array_elements(p_lineas)
  LOOP
    v_detalle_id := (v_linea->>'detalle_id')::bigint;
    v_recibido := (v_linea->>'recibido')::numeric;

    -- PA recomputes CostoTotal_DC = CostoUnitario_DC * recibido on (partial) receipt.
    UPDATE detalle_compras SET recibido = v_recibido, costo_total = COALESCE(costo_unitario, 0) * v_recibido
    WHERE id = v_detalle_id
    RETURNING articulo_id, edificio_id, articulo, edificio, costo_unitario, cant_min
      INTO v_articulo_id, v_edificio_id, v_articulo, v_edificio, v_costo_unitario, v_cant_min;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    IF v_articulo_id IS NOT NULL AND v_edificio_id IS NOT NULL AND v_recibido > 0 THEN
      SELECT s.id, s.cantidad INTO v_stock_id, v_cant_anterior
      FROM stock s
      JOIN stock_edificios se ON se.stock_id = s.id
      WHERE s.articulo_id = v_articulo_id AND se.edificio_id IN (SELECT stock_pool_edificios(v_edificio_id))
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock SET cantidad = cantidad + v_recibido WHERE id = v_stock_id;
      ELSE
        v_cant_anterior := 0;
        INSERT INTO stock (articulo_id, cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, desde, version_app)
        VALUES (v_articulo_id, v_recibido, v_costo_unitario, v_cant_min, true, v_usuario_id, now(), 'Desktop', p_version_app)
        RETURNING id INTO v_stock_id;
        INSERT INTO stock_edificios (stock_id, edificio_id) VALUES (v_stock_id, v_edificio_id);
        UPDATE stock SET id_univoco = '(STK)-' || lpad(v_stock_id::text, 3, '0') WHERE id = v_stock_id; -- parity: stamp id_univoco like stock_agregar / the mock
      END IF;

      INSERT INTO movimientos_stock (
        articulo_id, articulo_raw, concat_articulo, articulo,
        cant_anterior, cant_posterior, costo_anterior, costo_posterior,
        stock_min_anterior, stock_min_posterior,
        edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha, version_app
      ) VALUES (
        v_articulo_id, v_articulo_id::text, v_articulo, v_articulo,
        v_cant_anterior, v_cant_anterior + v_recibido, NULL, v_costo_unitario,
        NULL, v_cant_min,
        v_edificio_id, v_edificio, 'Desktop - Recibir Compra',
        CASE WHEN v_cant_anterior = 0 THEN 'Nuevo' ELSE 'Existente' END,
        v_recibido, v_usuario_id, now(), p_version_app
      );
    END IF;
  END LOOP;

  UPDATE aprobaciones SET status = 'Recibida' WHERE compra_id = p_id;

  RETURN p_id;
END;
$$;

-- Mirrors mock ots.repuestos.asignarRepuesto() +p_version_app: stamped on the repuestos_ot row
-- AND the movimientos_stock audit row.
CREATE OR REPLACE FUNCTION ot_asignar_repuesto(
  p_orden_trabajo_id bigint, p_articulo_id bigint, p_edificio_id bigint, p_cantidad numeric, p_usuario_id bigint,
  p_version_app text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stock_id bigint;
  v_cant_anterior numeric;
  v_precio numeric;
  v_corte numeric;
  v_articulo_nombre text;
  v_edificio_nombre text;
  v_id bigint;
BEGIN
  SELECT s.id, s.cantidad, s.precio_unitario, s.condicion_corte
    INTO v_stock_id, v_cant_anterior, v_precio, v_corte
  FROM stock s
  JOIN stock_edificios se ON se.stock_id = s.id
  WHERE s.articulo_id = p_articulo_id AND se.edificio_id IN (SELECT stock_pool_edificios(p_edificio_id))
  LIMIT 1;

  IF v_stock_id IS NULL OR v_cant_anterior < p_cantidad THEN
    RAISE EXCEPTION 'Cantidad insuficiente.';
  END IF;

  UPDATE stock SET cantidad = cantidad - p_cantidad WHERE id = v_stock_id;

  SELECT nombre INTO v_articulo_nombre FROM articulos WHERE id = p_articulo_id;
  SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = p_edificio_id;

  INSERT INTO repuestos_ot (orden_trabajo_id, articulo_id, repuesto, cantidad, edificio, usuario_id, fecha, activo, version_app)
  VALUES (p_orden_trabajo_id, p_articulo_id, v_articulo_nombre, p_cantidad, v_edificio_nombre, p_usuario_id, now(), true, p_version_app)
  RETURNING id INTO v_id;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha, version_app
  ) VALUES (
    p_articulo_id, p_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior - p_cantidad, v_precio, v_precio,
    v_corte, v_corte,
    p_edificio_id, v_edificio_nombre, 'Mobile - OT', 'Asignacion Repuesto', p_cantidad, p_usuario_id, now(), p_version_app
  );

  RETURN v_id;
END;
$$;

-- Mirrors mock ots.bitacoras.crear() +p_version_app: stamped on the bitacoras row.
CREATE OR REPLACE FUNCTION ot_bitacora_crear(
  p_orden_trabajo_id bigint, p_descripcion text, p_usuario_id bigint, p_foto_path text DEFAULT NULL,
  p_version_app text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO bitacoras (orden_trabajo_id, descripcion, fecha, usuario_id, version_app)
  VALUES (p_orden_trabajo_id, p_descripcion, now(), p_usuario_id, p_version_app)
  RETURNING id INTO v_id;

  UPDATE bitacoras
  SET id_univoco_bitacora = 'BC-' || lpad(v_id::text, 4, '0') || to_char(now(), 'YYYYMMDD') || to_char(now(), 'HH24MISS')
  WHERE id = v_id;

  IF p_foto_path IS NOT NULL THEN
    INSERT INTO fotos_bitacora (orden_trabajo_id, bitacora_id, foto_path)
    VALUES (p_orden_trabajo_id, v_id, p_foto_path);
  END IF;

  RETURN v_id;
END;
$$;

-- Mirrors mock registrarSalidasDeRepuestos(): body-only change (signature unchanged) — now
-- copies version_app from the repuestos_ot row being spilled (r.version_app), stamped at
-- ot_asignar_repuesto time, rather than the live app version at ot_cerrar/ot_finalizar time.
CREATE OR REPLACE FUNCTION ot_registrar_salidas_repuestos(p_ot_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO salidas_stock (
    articulo_id, stock_id, concat_articulo, tecnico_id, tipo,
    fecha_salida, fecha_reingreso, uso, centro_de_costo, cantidad, usuario_id, fecha, version_app
  )
  SELECT r.articulo_id, NULL, r.repuesto, ot.tecnico_id, 'CONSUMIBLE'::tipo_salida_stock,
         current_date, NULL, ot.id_univoco, NULL, r.cantidad, r.usuario_id, now(), r.version_app
  FROM repuestos_ot r
  JOIN ordenes_trabajo ot ON ot.id = r.orden_trabajo_id
  WHERE r.orden_trabajo_id = p_ot_id AND r.activo = true;
END;
$$;

-- Mirrors mock ventilaciones.finalizar() +p_version: stamped as version_resuelto on the CLOSED
-- row only. The auto-created next cycle stays version_asignado = NULL, version_resuelto = NULL
-- (mock parity — it isn't assigned/resolved yet; its INSERT column list below never mentions them).
CREATE OR REPLACE FUNCTION finalizar_ventilacion(
  p_id bigint,
  p_obs text,
  p_foto_path text,
  p_version text DEFAULT NULL
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
    version_resuelto = p_version,
    orden = 1  -- PA re-stamps Orden_VE:1 on the closed row (drives the desktop list sort)
  WHERE id = p_id
  RETURNING
    unidad_id, direccion_edificio, edificio, habitacion, frecuencia_dias
    INTO v_unidad_id, v_direccion_edificio, v_edificio, v_habitacion, v_frecuencia_dias;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'finalizar_ventilacion: ventilacion % not found', p_id;
  END IF;

  -- Next cycle is always UNASSIGNED (PA leaves IDAsignado_VE blank; the back office re-assigns it),
  -- starts at Orden_VE:4, es_incidente = false, and proxima_limpieza = today + frecuencia_dias
  -- (fallback 90 days when the unit has no frequency, matching the mock — NOT 0/today).
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

COMMENT ON FUNCTION finalizar_ventilacion(bigint, text, text, text) IS
  'Closes a ventilacion cycle (estado=Realizada, obs + foto + version_resuelto) and atomically '
  'inserts the next cycle (estado=Pendiente, proxima_limpieza = current_date + '
  'frecuencia_dias). Returns the new row''s id. Replaces the desktop/mobile '
  '"finalizar ventilacion" flow.';

-- ============================================================================
-- Re-grant EXECUTE — CRITICAL companion to SECURITY DEFINER (see rpc.sql header). Dropping a
-- function drops its grants; a bare CREATE OR REPLACE on the ones NOT dropped above keeps their
-- existing grants, but every DROP+CREATE pair above is a brand-new function object that starts
-- back at the Postgres default (EXECUTE granted to PUBLIC), which would reopen these
-- RLS-bypassing DEFINER functions to the anon key. Re-close the hole, same as rpc.sql's tail.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
  END IF;
END;
$$;
