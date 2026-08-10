-- 0004 — Fix two defects in finalizar_ventilacion's "next cycle" INSERT, so the
-- production RPC matches the authoritative behavior spec (services/mock/adapter.ts
-- finalizar). Both surface only on the just-created Pendiente successor row:
--
--   1) Next-cycle date fallback on a NULL frecuencia_dias: the RPC used
--      coalesce(v_frecuencia_dias, 0) -> proxima_limpieza = TODAY (immediately due),
--      while the mock uses `?? 90`. Legacy/migrated rows can carry a NULL frecuencia,
--      so the first finalizar on them scheduled the next cleaning for today instead of
--      +90 days. Aligned to the mock (coalesce(..., 90)).
--
--   2) es_incidente was omitted from the INSERT column list and the column had no
--      DEFAULT, so the new row landed with es_incidente = NULL. The app read layer
--      (rows.ts bool()) masks it, but raw SQL filtering `WHERE es_incidente = false`
--      silently skips NULL rows. Fixed at the root: es_incidente now has a column
--      DEFAULT false (protects every insert path), the RPC also sets it explicitly,
--      and existing NULL rows are backfilled.
--
-- frecuencia_dias itself is intentionally left NULLable (it's a value-copy from
-- unidades, per schema.sql) — the fallback lives in the function, mirroring the mock.

-- Root-cause guard: any INSERT that omits es_incidente now gets false, never NULL.
alter table ventilaciones alter column es_incidente set default false;

-- Backfill rows already created with es_incidente = NULL by the buggy RPC.
update ventilaciones set es_incidente = false where es_incidente is null;

create or replace function finalizar_ventilacion(
  p_id bigint,
  p_obs text,
  p_foto_path text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unidad_id bigint;
  v_direccion_edificio text;
  v_edificio text;
  v_habitacion text;
  v_frecuencia_dias numeric;
  v_new_id bigint;
begin
  update ventilaciones
  set
    estado = 'Realizada',
    obs_resuelto = p_obs,
    foto_path = coalesce(p_foto_path, foto_path),
    fecha_finalizacion = now(),
    orden = 1  -- PA re-stamps Orden_VE:1 on the closed row (drives the desktop list sort)
  where id = p_id
  returning
    unidad_id, direccion_edificio, edificio, habitacion, frecuencia_dias
    into v_unidad_id, v_direccion_edificio, v_edificio, v_habitacion, v_frecuencia_dias;

  if not found then
    raise exception 'finalizar_ventilacion: ventilacion % not found', p_id;
  end if;

  -- Next cycle is always UNASSIGNED (PA leaves IDAsignado_VE blank; the back office re-assigns it),
  -- starts at Orden_VE:4, es_incidente = false, and proxima_limpieza = today + frecuencia_dias
  -- (fallback 90 days when the unit has no frequency, matching the mock — NOT 0/today).
  insert into ventilaciones (
    estado, unidad_id, direccion_edificio, edificio, habitacion,
    frecuencia_dias, fecha_ultima, proxima_limpieza, asignado_id, es_incidente, orden
  )
  values (
    'Pendiente', v_unidad_id, v_direccion_edificio, v_edificio, v_habitacion,
    v_frecuencia_dias, current_date, current_date + coalesce(v_frecuencia_dias, 90)::int, null, false, 4
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;
