-- 0017 — Tecnoapp tables: new ids start at 1000000, and an `extra` jsonb column on the 14 typed tables.
--
-- Context: `npm run migrate:tecnoapp` loads the 14 tables of 0016 (and sharepoint_archivo) with the SharePoint item id as `id`,
-- insert-only (ON CONFLICT DO NOTHING; it never deletes or resets anything). Until the cutover SharePoint keeps assigning
-- small ids, and the loader keeps adding them. Rows the Tecnoapp creates on Supabase must therefore never take an id in
-- that range: every identity is moved to >= 1000000, so the app-created ids are 1000001, 1000002, ... and can never collide
-- with a SharePoint item id. (Same idea as articulos.id in 0016.)
--
-- `extra` (section 2): every SharePoint field that no typed column takes (internal names, untouched; only SharePoint system
-- noise is left out), so nothing is lost at the cutover. Filled by the loader; NULL when the item has no such field.
--
-- Only moves a sequence that is still below 1000000 (never backwards, never touches rows). Does not touch any other table.
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase. Idempotent (safe to run more than once).

-- 1. identities to >= 1000000
do $$
declare
  t      text;
  v_seq  text;
  v_last bigint;
begin
  foreach t in array array[
    'tipo_prendas', 'articulos_inventario', 'calendario_orden_lavado', 'segmentos_metricas', 'acceso_sin_qr',
    'permisos_menu_hotel', 'ordenes_limpieza', 'ordenes_limpieza_detalle', 'inventarios', 'habitaciones_inventariadas',
    'ordenes_lavado', 'ordenes_lavado_detalle', 'ordenes_reproceso', 'uso_metricas', 'sharepoint_archivo'
  ] loop
    v_seq := pg_get_serial_sequence('public.' || t, 'id');
    if v_seq is null then raise exception '%: id has no sequence (apply 0016 first)', t; end if;
    execute format('select last_value from %s', v_seq) into v_last;
    if v_last < 1000000 then
      -- at least the current max(id), in case rows were already loaded with ids above 1000000 (not expected)
      execute format('select setval(%L, greatest(1000000, (select coalesce(max(id), 0) from public.%I)), true)', v_seq, t);
    end if;
  end loop;
end $$;

-- 2. extra jsonb on the 14 typed tables (not on sharepoint_archivo, which already keeps the whole item in `fields`)
do $$
declare
  t text;
begin
  foreach t in array array[
    'tipo_prendas', 'articulos_inventario', 'calendario_orden_lavado', 'segmentos_metricas', 'acceso_sin_qr',
    'permisos_menu_hotel', 'ordenes_limpieza', 'ordenes_limpieza_detalle', 'inventarios', 'habitaciones_inventariadas',
    'ordenes_lavado', 'ordenes_lavado_detalle', 'ordenes_reproceso', 'uso_metricas'
  ] loop
    execute format('alter table public.%I add column if not exists extra jsonb', t);
    execute format('comment on column public.%I.extra is %L', t,
      'SharePoint fields not mapped to a typed column, internal names, untouched');
  end loop;
end $$;

-- The check: every identity is at >= 1000000, or it fails.
do $$
declare
  t      text;
  v_last bigint;
begin
  foreach t in array array[
    'tipo_prendas', 'articulos_inventario', 'calendario_orden_lavado', 'segmentos_metricas', 'acceso_sin_qr',
    'permisos_menu_hotel', 'ordenes_limpieza', 'ordenes_limpieza_detalle', 'inventarios', 'habitaciones_inventariadas',
    'ordenes_lavado', 'ordenes_lavado_detalle', 'ordenes_reproceso', 'uso_metricas', 'sharepoint_archivo'
  ] loop
    execute format('select last_value from %s', pg_get_serial_sequence('public.' || t, 'id')) into v_last;
    if v_last < 1000000 then raise exception '%: the id sequence is still below 1000000 (%)', t, v_last; end if;
    if t <> 'sharepoint_archivo' and not exists (
         select 1 from pg_attribute a
          where a.attrelid = ('public.' || t)::regclass and a.attname = 'extra' and not a.attisdropped
            and a.atttypid = 'jsonb'::regtype and col_description(a.attrelid, a.attnum) is not null) then
      raise exception '%: extra jsonb (with its comment) is missing', t;
    end if;
  end loop;
end $$;
