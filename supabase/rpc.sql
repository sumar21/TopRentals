-- TopRentals — Fase 1 tramo 2: transactional RPCs for multi-table mutations.
-- Companion to schema.sql's finalizar_ventilacion (same style: CREATE OR REPLACE
-- FUNCTION, LANGUAGE plpgsql, RAISE EXCEPTION on not-found, whole body = one
-- transaction). Every function here is the SQL port of the matching method in
-- services/mock/adapter.ts — that file is the behavioral spec; field values,
-- hardcoded strings and even its quirks (e.g. costo_anterior always NULL on
-- stock_agregar) are ported verbatim, not "fixed".
--
-- Apply: node --env-file=.env scripts/migrate/apply-sql.mjs supabase/rpc.sql
--
-- SECURITY: every function is SECURITY DEFINER with a pinned `search_path = public`.
-- The high-value RLS hardening (0002_rls_hardening.sql) makes catalogs, usuarios and
-- the stock/audit tables SELECT-only for `authenticated`, so these mutations MUST run
-- as the owner (bypassing RLS) to keep writing. DEFINER adds no authorization by itself
-- (a compromised client can still call any RPC) — the real gain is that arbitrary direct
-- table writes are blocked, so writes can only happen through this vetted, audited surface.
-- `search_path` is pinned to close the classic DEFINER search_path hijack.

-- ============================================================================
-- helper: insertar_detalle_lineas — shared by compras_crear / compras_actualizar
-- / aprobaciones_editar. Mirrors mock's insertarLineas(): resolves articulo/
-- edificio display names + cant_min (articulo.corte) per line, inserts one
-- detalle_compras row per line, then stamps its own id into id_univoco
-- (mirrors mock's `(DTC)-XXX` format).
-- ============================================================================
CREATE OR REPLACE FUNCTION insertar_detalle_lineas(p_compra_id bigint, p_lineas jsonb)
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
      cantidad, costo_unitario, cant_min, costo_total, activo, fecha
    ) VALUES (
      p_compra_id, v_articulo_id, v_articulo_nombre, v_edificio_id, v_edificio_nombre,
      v_cantidad, v_costo_unitario, v_cant_min, v_cantidad * v_costo_unitario, true, now()
    ) RETURNING id INTO v_detalle_id;

    UPDATE detalle_compras SET id_univoco = '(DTC)-' || lpad(v_detalle_id::text, 3, '0')
      WHERE id = v_detalle_id;
  END LOOP;
END;
$$;

-- ============================================================================
-- STOCK — mock: db.stock / db.stockEdificios / db.movimientosStock / db.salidasStock
-- ============================================================================

-- Mirrors mock stock.agregar(): increments the (articulo, edificio) row or
-- creates one, keeps the article master price in sync, writes one audit row.
-- Mock quirk ported verbatim: costo_anterior and stock_min_anterior are always
-- NULL in the audit row regardless of whether the stock row already existed.
CREATE OR REPLACE FUNCTION stock_agregar(
  p_articulo_id bigint, p_edificio_id bigint, p_cantidad numeric,
  p_precio_unitario numeric, p_usuario_id bigint
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
  WHERE s.articulo_id = p_articulo_id AND se.edificio_id = p_edificio_id
  LIMIT 1;

  IF v_stock_id IS NOT NULL THEN
    UPDATE stock SET cantidad = cantidad + p_cantidad, precio_unitario = p_precio_unitario
    WHERE id = v_stock_id
    RETURNING condicion_corte INTO v_condicion_corte;
  ELSE
    v_cant_anterior := 0;
    SELECT NULLIF(corte, '')::numeric INTO v_condicion_corte FROM articulos WHERE id = p_articulo_id;
    v_condicion_corte := coalesce(v_condicion_corte, 0);

    INSERT INTO stock (articulo_id, cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, desde)
    VALUES (p_articulo_id, p_cantidad, p_precio_unitario, v_condicion_corte, true, p_usuario_id, now(), 'Desktop')
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
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    p_articulo_id, p_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior + p_cantidad, NULL, p_precio_unitario,
    NULL, v_condicion_corte,
    p_edificio_id, v_edificio_nombre, 'Desktop - Stock',
    CASE WHEN v_cant_anterior = 0 THEN 'Nuevo' ELSE 'Editado' END,
    p_cantidad, p_usuario_id, now()
  );

  RETURN v_stock_id;
END;
$$;

-- Mirrors mock stock.salida(): debits the source row, writes the audit row,
-- and — only for tipo = 'TRASLADO' — credits/creates the destination row +
-- junction. p_tipo is plain text (not the enum) so PostgREST/RPC argument
-- marshaling never has to cross the JSON->enum boundary; cast internally.
CREATE OR REPLACE FUNCTION stock_salida(
  p_stock_id bigint, p_edificio_id bigint, p_tipo text, p_cantidad numeric,
  p_tecnico_id bigint, p_uso text, p_centro_de_costo text, p_usuario_id bigint,
  p_edificio_destino_id bigint DEFAULT NULL, p_fecha_salida date DEFAULT NULL
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
    edificio_id, edificio, edificio_traslado, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior - p_cantidad, v_precio, v_precio,
    v_corte, v_corte,
    p_edificio_id, v_edificio_nombre, v_edificio_traslado_nombre, 'Desktop - Salida Stock',
    p_tipo, p_cantidad, p_usuario_id, now()
  );

  IF p_tipo = 'TRASLADO' THEN
    SELECT s.id INTO v_destino_id
    FROM stock s
    JOIN stock_edificios se ON se.stock_id = s.id
    WHERE s.articulo_id = v_articulo_id AND se.edificio_id = p_edificio_destino_id
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
    articulo_id, stock_id, concat_articulo, tecnico_id, tipo,
    fecha_salida, uso, centro_de_costo, cantidad, usuario_id, fecha
  ) VALUES (
    v_articulo_id, p_stock_id, v_articulo_nombre, p_tecnico_id, p_tipo::tipo_salida_stock,
    coalesce(p_fecha_salida, current_date), p_uso, p_centro_de_costo, p_cantidad, p_usuario_id, now()
  ) RETURNING id INTO v_salida_id;

  RETURN v_salida_id;
END;
$$;

-- Mirrors mock stock.editar(): overwrites cantidad/precio_unitario/condicion_corte
-- directly (no delta logic) and writes the audit row.
CREATE OR REPLACE FUNCTION stock_editar(
  p_stock_id bigint, p_cantidad numeric, p_precio_unitario numeric,
  p_condicion_corte numeric, p_usuario_id bigint
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

  SELECT edificio_id INTO v_edificio_id FROM stock_edificios WHERE stock_id = p_stock_id LIMIT 1;
  SELECT nombre INTO v_articulo_nombre FROM articulos WHERE id = v_articulo_id;
  IF v_edificio_id IS NOT NULL THEN
    SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = v_edificio_id;
  END IF;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, p_cantidad, v_costo_anterior, p_precio_unitario,
    v_stock_min_anterior, p_condicion_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Stock', 'Editado', p_cantidad, p_usuario_id, now()
  );

  RETURN p_stock_id;
END;
$$;

-- Mirrors mock stock.editarSalida(): re-adjusts the credited stock row by the
-- delta between the old and new cantidad, never touching fecha_reingreso.
CREATE OR REPLACE FUNCTION stock_editar_salida(p_salida_id bigint, p_cantidad numeric, p_usuario_id bigint)
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
BEGIN
  SELECT articulo_id, stock_id, tipo::text, cantidad, fecha_reingreso
    INTO v_articulo_id, v_stock_id, v_tipo, v_cantidad_actual, v_fecha_reingreso
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

  UPDATE stock SET cantidad = cantidad + v_delta WHERE id = v_stock_id;
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
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior + v_delta, v_costo, v_costo,
    v_corte, v_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Salida Stock', v_tipo || ' - EDIT CANT', p_cantidad, p_usuario_id, now()
  );

  RETURN p_salida_id;
END;
$$;

-- Mirrors mock stock.confirmarDevolucion(): credits the full salida.cantidad
-- back, stamps fecha_reingreso + tipo='DEVUELTO', writes the audit row the PA
-- flow had commented out.
CREATE OR REPLACE FUNCTION stock_confirmar_devolucion(p_salida_id bigint, p_usuario_id bigint)
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
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    v_articulo_id, v_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior + v_cantidad, v_costo, v_costo,
    v_corte, v_corte,
    v_edificio_id, v_edificio_nombre, 'Desktop - Salida Stock', 'DEVOLUCION - REINGRESO', v_cantidad, p_usuario_id, now()
  );

  RETURN p_salida_id;
END;
$$;

-- ============================================================================
-- COMPRAS / APROBACIONES — mock: db.compras / db.detalleCompras / db.aprobaciones
-- ============================================================================

-- Mirrors mock compras.crear(): computes cantidad_total/monto_total from the
-- lineas (ignores whatever the caller sent for those + id_compra, exactly like
-- the mock's `{ ...input, id, id_compra: computed, cantidad_total, monto_total }`
-- override order), then inserts the lineas via insertar_detalle_lineas().
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

  PERFORM insertar_detalle_lineas(v_id, p_lineas);

  RETURN v_id;
END;
$$;

-- Mirrors mock compras.actualizar(): partial header patch (jsonb ? key check
-- so an absent key leaves the column untouched, matching Object.assign
-- semantics) + optional full line replacement + totals recompute, exactly
-- like the mock's `if (lineas) { reemplazarLineas(...); recompute totals }`.
CREATE OR REPLACE FUNCTION compras_actualizar(p_id bigint, p_patch jsonb, p_lineas jsonb DEFAULT NULL)
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
    PERFORM insertar_detalle_lineas(p_id, p_lineas);

    SELECT coalesce(sum((l->>'cantidad')::numeric), 0),
           coalesce(sum((l->>'cantidad')::numeric * (l->>'costo_unitario')::numeric), 0)
      INTO v_cantidad_total, v_monto_total
    FROM jsonb_array_elements(p_lineas) l;

    UPDATE compras SET cantidad_total = v_cantidad_total, monto_total = v_monto_total WHERE id = p_id;
  END IF;

  RETURN p_id;
END;
$$;

-- Mirrors mock compras.enviarAprobacion(): Status_C -> 'Aprobacion' + creates
-- the matching aprobaciones row from the compra's current header values.
CREATE OR REPLACE FUNCTION compras_enviar_aprobacion(p_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_urgencia text;
  v_usuario_compra text;
  v_observacion text;
  v_usuario_id bigint;
  v_cantidad_total numeric;
  v_monto_total numeric;
  v_aprob_id bigint;
BEGIN
  UPDATE compras SET status = 'Aprobacion'
  WHERE id = p_id
  RETURNING urgencia, usuario_compra, observacion, usuario_id, cantidad_total, monto_total
    INTO v_urgencia, v_usuario_compra, v_observacion, v_usuario_id, v_cantidad_total, v_monto_total;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada.', p_id;
  END IF;

  INSERT INTO aprobaciones (
    compra_id, status, fecha, urgencia, tecnico, obs_compra, user_gen_id, cantidad, monto, hora
  ) VALUES (
    p_id, 'Pendiente', current_date, v_urgencia, v_usuario_compra, v_observacion, v_usuario_id,
    v_cantidad_total, v_monto_total, current_time
  ) RETURNING id INTO v_aprob_id;

  RETURN v_aprob_id;
END;
$$;

-- Mirrors mock compras.recibir(): per line, stamps recibido + (when > 0)
-- credits/creates the matching stock row and writes the audit row
-- ('Nuevo' | 'Existente' — NOT the 'Nuevo'/'Editado' pair stock_agregar uses).
CREATE OR REPLACE FUNCTION compras_recibir(p_id bigint, p_lineas jsonb, p_obs_recibir text)
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

    UPDATE detalle_compras SET recibido = v_recibido
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
      WHERE s.articulo_id = v_articulo_id AND se.edificio_id = v_edificio_id
      LIMIT 1;

      IF v_stock_id IS NOT NULL THEN
        UPDATE stock SET cantidad = cantidad + v_recibido WHERE id = v_stock_id;
      ELSE
        v_cant_anterior := 0;
        INSERT INTO stock (articulo_id, cantidad, precio_unitario, condicion_corte, activo, usuario_id, fecha, desde)
        VALUES (v_articulo_id, v_recibido, v_costo_unitario, v_cant_min, true, v_usuario_id, now(), 'Desktop')
        RETURNING id INTO v_stock_id;
        INSERT INTO stock_edificios (stock_id, edificio_id) VALUES (v_stock_id, v_edificio_id);
      END IF;

      INSERT INTO movimientos_stock (
        articulo_id, articulo_raw, concat_articulo, articulo,
        cant_anterior, cant_posterior, costo_anterior, costo_posterior,
        stock_min_anterior, stock_min_posterior,
        edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
      ) VALUES (
        v_articulo_id, v_articulo_id::text, v_articulo, v_articulo,
        v_cant_anterior, v_cant_anterior + v_recibido, NULL, v_costo_unitario,
        NULL, v_cant_min,
        v_edificio_id, v_edificio, 'Desktop - Recibir Compra',
        CASE WHEN v_cant_anterior = 0 THEN 'Nuevo' ELSE 'Existente' END,
        v_recibido, v_usuario_id, now()
      );
    END IF;
  END LOOP;

  UPDATE aprobaciones SET status = 'Recibida' WHERE compra_id = p_id;

  RETURN p_id;
END;
$$;

-- Mirrors mock compras.anular(): Status_C -> 'Anulada' + every still-active
-- detalle line -> inactive. Schema has no 'Anulado' status on detalle_compras
-- (only boolean activo) — collapsed to activo=false per the adapter's schema
-- notes (same target state anular and rechazar both write).
CREATE OR REPLACE FUNCTION compras_anular(p_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE compras SET status = 'Anulada' WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compra % no encontrada.', p_id;
  END IF;

  UPDATE detalle_compras SET activo = false WHERE compra_id = p_id AND activo = true;

  RETURN p_id;
END;
$$;

-- Mirrors mock aprobaciones.aprobar(): aprobacion -> 'Aprobada' + compra -> 'Aprobada'.
CREATE OR REPLACE FUNCTION aprobaciones_aprobar(p_id bigint, p_user_aprob_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id bigint;
BEGIN
  UPDATE aprobaciones
  SET status = 'Aprobada', fecha_aprobada = current_date, user_aprob_id = p_user_aprob_id
  WHERE id = p_id
  RETURNING compra_id INTO v_compra_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobacion % no encontrada.', p_id;
  END IF;

  UPDATE compras SET status = 'Aprobada' WHERE id = v_compra_id;

  RETURN p_id;
END;
$$;

-- Mirrors mock aprobaciones.rechazar(): aprobacion -> 'Rechazada' + compra ->
-- 'Rechazada' + every active detalle line -> inactive.
CREATE OR REPLACE FUNCTION aprobaciones_rechazar(p_id bigint, p_motivo text, p_user_aprob_id bigint)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_compra_id bigint;
BEGIN
  UPDATE aprobaciones
  SET status = 'Rechazada', obs_rechazo = p_motivo, user_aprob_id = p_user_aprob_id
  WHERE id = p_id
  RETURNING compra_id INTO v_compra_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Aprobacion % no encontrada.', p_id;
  END IF;

  UPDATE compras SET status = 'Rechazada' WHERE id = v_compra_id;
  UPDATE detalle_compras SET activo = false WHERE compra_id = v_compra_id AND activo = true;

  RETURN p_id;
END;
$$;

-- Mirrors mock aprobaciones.editar(): replaces the underlying (still Pendiente)
-- compra's lines, recomputes cantidad/monto on both aprobacion and compra, and
-- optionally patches a few compra header fields + the aprobacion's own
-- urgencia snapshot (mock: `if (header?.urgencia) row.urgencia = header.urgencia`).
CREATE OR REPLACE FUNCTION aprobaciones_editar(p_id bigint, p_lineas jsonb, p_header jsonb DEFAULT NULL)
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
  PERFORM insertar_detalle_lineas(v_compra_id, p_lineas);

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
-- ORDENES DE TRABAJO — mock: db.bitacoras / db.fotosBitacora / db.repuestosOT
-- ============================================================================

-- Mirrors mock ots.bitacoras.crear(): inserts the bitacora, stamps its own id
-- into id_univoco_bitacora (mock's `BC-XXXX...` format), and — only when a
-- photo was attached — inserts the matching fotos_bitacora row.
CREATE OR REPLACE FUNCTION ot_bitacora_crear(
  p_orden_trabajo_id bigint, p_descripcion text, p_usuario_id bigint, p_foto_path text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO bitacoras (orden_trabajo_id, descripcion, fecha, usuario_id)
  VALUES (p_orden_trabajo_id, p_descripcion, now(), p_usuario_id)
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

-- Mirrors mock ots.repuestos.asignarRepuesto(): decrements the matching stock
-- row (raises if missing/insufficient), inserts the repuestos_ot row, writes
-- the 'Asignacion Repuesto' audit row.
CREATE OR REPLACE FUNCTION ot_asignar_repuesto(
  p_orden_trabajo_id bigint, p_articulo_id bigint, p_edificio_id bigint, p_cantidad numeric, p_usuario_id bigint
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
  WHERE s.articulo_id = p_articulo_id AND se.edificio_id = p_edificio_id
  LIMIT 1;

  IF v_stock_id IS NULL OR v_cant_anterior < p_cantidad THEN
    RAISE EXCEPTION 'Cantidad insuficiente.';
  END IF;

  UPDATE stock SET cantidad = cantidad - p_cantidad WHERE id = v_stock_id;

  SELECT nombre INTO v_articulo_nombre FROM articulos WHERE id = p_articulo_id;
  SELECT nombre INTO v_edificio_nombre FROM edificios WHERE id = p_edificio_id;

  INSERT INTO repuestos_ot (orden_trabajo_id, articulo_id, repuesto, cantidad, edificio, usuario_id, fecha, activo)
  VALUES (p_orden_trabajo_id, p_articulo_id, v_articulo_nombre, p_cantidad, v_edificio_nombre, p_usuario_id, now(), true)
  RETURNING id INTO v_id;

  INSERT INTO movimientos_stock (
    articulo_id, articulo_raw, concat_articulo, articulo,
    cant_anterior, cant_posterior, costo_anterior, costo_posterior,
    stock_min_anterior, stock_min_posterior,
    edificio_id, edificio, desde, tipo_movimiento, cantidad, usuario_id, fecha
  ) VALUES (
    p_articulo_id, p_articulo_id::text, v_articulo_nombre, v_articulo_nombre,
    v_cant_anterior, v_cant_anterior - p_cantidad, v_precio, v_precio,
    v_corte, v_corte,
    p_edificio_id, v_edificio_nombre, 'Mobile - OT', 'Asignacion Repuesto', p_cantidad, p_usuario_id, now()
  );

  RETURN v_id;
END;
$$;

-- NUEVO (no existe en Power Apps): registra cada repuesto consumido de una OT como una
-- fila del histórico de salidas (salidas_stock). Es record-only — el stock YA se descontó
-- en ot_asignar_repuesto, así que acá NO se toca stock. stock_id = NULL a propósito → estas
-- salidas no son editables ni devolvibles (stock_editar_salida / stock_confirmar_devolucion
-- rechazan un stock_id NULL), que es lo correcto: el débito ocurrió una sola vez.
CREATE OR REPLACE FUNCTION ot_registrar_salidas_repuestos(p_ot_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO salidas_stock (
    articulo_id, stock_id, concat_articulo, tecnico_id, tipo,
    fecha_salida, fecha_reingreso, uso, centro_de_costo, cantidad, usuario_id, fecha
  )
  SELECT r.articulo_id, NULL, r.repuesto, ot.tecnico_id, 'CONSUMIBLE'::tipo_salida_stock,
         current_date, NULL, ot.id_univoco, NULL, r.cantidad, r.usuario_id, now()
  FROM repuestos_ot r
  JOIN ordenes_trabajo ot ON ot.id = r.orden_trabajo_id
  WHERE r.orden_trabajo_id = p_ot_id AND r.activo = true;
END;
$$;

-- Mirrors mock ots.cerrar(): sets status + fecha_cierre and, on the FIRST close only,
-- spills the OT's active repuestos into salidas_stock (idempotent — a re-close of an
-- already-closed/anulada OT does not duplicate the salidas).
CREATE OR REPLACE FUNCTION ot_cerrar(p_id bigint, p_tipo text)
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

  UPDATE ordenes_trabajo SET status = p_tipo::estado_ot, fecha_cierre = current_date WHERE id = p_id;

  IF v_previo NOT IN ('Cerrada', 'Cerrada V', 'Cerrada F', 'Anulada') THEN
    PERFORM ot_registrar_salidas_repuestos(p_id);
  END IF;

  RETURN p_id;
END;
$$;

-- Mirrors mock ots.finalizar(): same close flow as ot_cerrar but forces status 'Cerrada'.
DROP FUNCTION IF EXISTS ot_finalizar(bigint);
CREATE OR REPLACE FUNCTION ot_finalizar(p_id bigint, p_tecnico_id bigint DEFAULT NULL)
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
    PERFORM ot_registrar_salidas_repuestos(p_id);
  END IF;

  RETURN p_id;
END;
$$;

-- ============================================================================
-- ARTICULOS — SharePoint-mirrored catalog table (Fase 3 write-back pending)
-- ============================================================================

-- articulos.actualizar is the one catalog write that is genuinely multi-table:
-- on top of updating the article row itself, it cascades the denormalized
-- precio_unitario/condicion_corte copies to every still-active stock row of
-- that article, so stock reads never show a stale price/corte after an edit.
-- (There is no "nombre" column on stock to cascade — only these two exist.)
CREATE OR REPLACE FUNCTION articulos_actualizar(p_id bigint, p_patch jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_precio numeric;
  v_corte text;
BEGIN
  UPDATE articulos SET
    codigo = CASE WHEN p_patch ? 'codigo' THEN p_patch->>'codigo' ELSE codigo END,
    nombre = CASE WHEN p_patch ? 'nombre' THEN p_patch->>'nombre' ELSE nombre END,
    precio_unitario = CASE WHEN p_patch ? 'precio_unitario' THEN (p_patch->>'precio_unitario')::numeric ELSE precio_unitario END,
    corte = CASE WHEN p_patch ? 'corte' THEN p_patch->>'corte' ELSE corte END,
    detalle = CASE WHEN p_patch ? 'detalle' THEN p_patch->>'detalle' ELSE detalle END,
    activo = CASE WHEN p_patch ? 'status' THEN (p_patch->>'status') = 'Activo' ELSE activo END,
    updated_at = now()
  WHERE id = p_id
  RETURNING precio_unitario, corte INTO v_precio, v_corte;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Articulo % no encontrado.', p_id;
  END IF;

  UPDATE stock SET
    precio_unitario = v_precio,
    condicion_corte = NULLIF(v_corte, '')::numeric
  WHERE articulo_id = p_id AND activo = true;

  -- TODO(Fase 3): write-back to 99.ABM_Articulos via Edge Function (SharePoint mirror).
  RETURN p_id;
END;
$$;

-- ============================================================================
-- HIGH-VALUE RLS HARDENING — writes to now-SELECT-only tables (see
-- 0002_rls_hardening.sql). usuarios lost its raw-UPDATE path (perfil/activo can no
-- longer be rewritten with direct table SQL), plus the articulos SharePoint mirror
-- insert and the unidades ventilation flags. Re-exposed here, vetted.
-- NOTE: these RPCs carry NO per-perfil check — an authenticated caller can still
-- invoke usuario_actualizar with any perfil. Fully preventing self-promotion is the
-- separate per-perfil-authz layer (deliberately deferred). DEFINER only narrows the
-- write surface to this vetted, typed path; it is NOT authorization.
-- ============================================================================

-- usuarios ABM insert. usuario_app + perfil are NOT NULL (the form always sends them);
-- every other column is optional and maps to NULL / the table default when the key is absent.
CREATE OR REPLACE FUNCTION usuario_crear(p_payload jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id bigint;
BEGIN
  INSERT INTO usuarios (
    nombre, apellido, concat_name, usuario_app, dni, fecha_nac, mail, num_cel,
    edificio_id, edificio_default, pais, perfil, validado, wapp_default, mnt_global,
    aplicacion, es_testing, activo, legacy_id_usr, updated_at
  ) VALUES (
    p_payload->>'nombre', p_payload->>'apellido', p_payload->>'concat_name', p_payload->>'usuario_app',
    (p_payload->>'dni')::numeric, (p_payload->>'fecha_nac')::date, p_payload->>'mail', p_payload->>'num_cel',
    (p_payload->>'edificio_id')::bigint, p_payload->>'edificio_default', p_payload->>'pais', (p_payload->>'perfil')::perfil_usuario,
    (p_payload->>'validado')::boolean, p_payload->>'wapp_default', p_payload->>'mnt_global',
    p_payload->>'aplicacion', (p_payload->>'es_testing')::boolean, coalesce((p_payload->>'activo')::boolean, true),
    (p_payload->>'legacy_id_usr')::numeric, now()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- usuarios ABM update. Partial patch, present-key semantics (mock's Object.assign): only
-- keys present in p_patch are written; everything else stays as-is.
CREATE OR REPLACE FUNCTION usuario_actualizar(p_id bigint, p_patch jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE usuarios SET
    nombre           = CASE WHEN p_patch ? 'nombre'           THEN p_patch->>'nombre'                   ELSE nombre END,
    apellido         = CASE WHEN p_patch ? 'apellido'         THEN p_patch->>'apellido'                 ELSE apellido END,
    concat_name      = CASE WHEN p_patch ? 'concat_name'      THEN p_patch->>'concat_name'              ELSE concat_name END,
    usuario_app      = CASE WHEN p_patch ? 'usuario_app'      THEN p_patch->>'usuario_app'              ELSE usuario_app END,
    dni              = CASE WHEN p_patch ? 'dni'              THEN (p_patch->>'dni')::numeric           ELSE dni END,
    fecha_nac        = CASE WHEN p_patch ? 'fecha_nac'        THEN (p_patch->>'fecha_nac')::date        ELSE fecha_nac END,
    mail             = CASE WHEN p_patch ? 'mail'             THEN p_patch->>'mail'                     ELSE mail END,
    num_cel          = CASE WHEN p_patch ? 'num_cel'          THEN p_patch->>'num_cel'                  ELSE num_cel END,
    edificio_id      = CASE WHEN p_patch ? 'edificio_id'      THEN (p_patch->>'edificio_id')::bigint    ELSE edificio_id END,
    edificio_default = CASE WHEN p_patch ? 'edificio_default' THEN p_patch->>'edificio_default'         ELSE edificio_default END,
    pais             = CASE WHEN p_patch ? 'pais'             THEN p_patch->>'pais'                     ELSE pais END,
    perfil           = CASE WHEN p_patch ? 'perfil'           THEN (p_patch->>'perfil')::perfil_usuario ELSE perfil END,
    validado         = CASE WHEN p_patch ? 'validado'         THEN (p_patch->>'validado')::boolean      ELSE validado END,
    wapp_default     = CASE WHEN p_patch ? 'wapp_default'     THEN p_patch->>'wapp_default'             ELSE wapp_default END,
    mnt_global       = CASE WHEN p_patch ? 'mnt_global'       THEN p_patch->>'mnt_global'               ELSE mnt_global END,
    aplicacion       = CASE WHEN p_patch ? 'aplicacion'       THEN p_patch->>'aplicacion'               ELSE aplicacion END,
    es_testing       = CASE WHEN p_patch ? 'es_testing'       THEN (p_patch->>'es_testing')::boolean    ELSE es_testing END,
    activo           = CASE WHEN p_patch ? 'activo'           THEN (p_patch->>'activo')::boolean        ELSE activo END,
    legacy_id_usr    = CASE WHEN p_patch ? 'legacy_id_usr'    THEN (p_patch->>'legacy_id_usr')::numeric ELSE legacy_id_usr END,
    updated_at       = now()
  WHERE id = p_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario % no encontrado.', p_id;
  END IF;
  RETURN p_id;
END;
$$;

-- usuarios ABM soft-delete: Status_Usr -> 'BAJA' (activo=false), nothing else touched.
CREATE OR REPLACE FUNCTION usuario_eliminar(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE usuarios SET activo = false WHERE id = p_id;
END;
$$;

-- articulos SharePoint-mirror insert: the app creates the article in SharePoint first
-- (Edge Function) and inserts the local mirror with the SAME explicit id here. articulos
-- is a SELECT-only catalog, so this DEFINER RPC is the only in-app path that writes it.
CREATE OR REPLACE FUNCTION articulo_insert_mirror(
  p_id bigint, p_codigo text, p_nombre text, p_precio numeric, p_corte text, p_activo boolean, p_detalle text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO articulos (id, codigo, nombre, precio_unitario, corte, activo, detalle, updated_at)
  VALUES (p_id, p_codigo, p_nombre, p_precio, p_corte, p_activo, p_detalle, now());
  RETURN p_id;
END;
$$;

-- unidades is a SELECT-only catalog (SharePoint mirror), but the ventilaciones flow flips
-- two of its flags. These DEFINER RPCs are the vetted write path; the SharePoint mirror of
-- the same flags is written separately by the Edge Function.
CREATE OR REPLACE FUNCTION unidad_set_ventilacion(p_unidad_id bigint, p_requiere boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE unidades SET requiere_ventilacion = p_requiere WHERE id = p_unidad_id;
END;
$$;

CREATE OR REPLACE FUNCTION unidad_set_frecuencia(p_unidad_id bigint, p_dias numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE unidades SET frecuencia_ventilacion_dias = p_dias WHERE id = p_unidad_id;
END;
$$;

-- ============================================================================
-- EXECUTE privileges — CRITICAL companion to the SECURITY DEFINER above.
-- Postgres/Supabase grant EXECUTE to PUBLIC + anon by default. Because every
-- function here is DEFINER (it bypasses RLS), leaving anon able to call them
-- would let a holder of the public anon key mutate everything — WIDER than
-- before this change. Restrict execution to logged-in app users + service_role.
-- Guarded so the file still applies on plain Postgres (where these roles don't
-- exist), same stance as schema.sql's `TO authenticated` RLS. Must be last —
-- it targets ALL FUNCTIONS created above.
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated, service_role;
  END IF;
END;
$$;
