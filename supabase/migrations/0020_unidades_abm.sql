-- 0020 — Rooms ABM in the Tecnoapp: unidades.qr_generado_at, app-created ids >= 1000000 and the "Habitaciones" menu row.
--
-- Context: the Tecnoapp gets a rooms ABM (create / edit / deactivate rooms of a building, generate the room QR). Rooms live in
-- public.unidades, shared with TopRentals (same DB), and the SharePoint sync keeps inserting rows with explicit ids.
--
-- 1. qr_generado_at: when the Tecnoapp generated the QR of the room (NULL = never). Lets the UI ask for confirmation only the first time.
-- 2. unidades.id identity moved to >= 1000000 (same idea as 0017): rooms created by the app can never collide with a SharePoint item id.
--    The sequence sat at 669 while max(id) is 723, so the next app-created room would have failed on the primary key.
-- 3. Menu row "Habitaciones" in permisos_menu_hotel (Admin + Recepcion), only if it does not exist yet.
--
-- Deliberately NO unique constraint on unidades (torre, depto): 3 duplicate pairs already exist (one active + one inactive each)
-- and the SharePoint sync would start failing on them. The BFF checks for duplicates among ACTIVE rooms instead.
-- Does not update or delete any existing row.
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase. Idempotent (safe to run more than once).

-- 1. qr_generado_at
alter table public.unidades add column if not exists qr_generado_at timestamptz;
comment on column public.unidades.qr_generado_at is 'When the Tecnoapp generated the room QR; NULL = never';

-- 2. identity to >= 1000000 (only moves it forward)
do $$
declare
  v_seq  text := pg_get_serial_sequence('public.unidades', 'id');
  v_last bigint;
begin
  if v_seq is null then raise exception 'unidades: id has no sequence'; end if;
  execute format('select last_value from %s', v_seq) into v_last;
  if v_last < 1000000 then
    execute format('select setval(%L, greatest(1000000, (select coalesce(max(id), 0) from public.unidades)), true)', v_seq);
  end if;
end $$;

-- 3. menu row (permisos_menu_hotel.id comes from its identity, already >= 1000000 after 0017)
insert into public.permisos_menu_hotel (modulo, admin, operador, tecnico, recepcion, supervision, gerente, compras, orden, aplicacion, status)
select 'Habitaciones', 'SI', 'NO', 'NO', 'SI', 'NO', 'NO', 'NO',
       (select coalesce(max(orden), 0) + 1 from public.permisos_menu_hotel where aplicacion = 'Hotel'),
       'Hotel', 'Activo'
where not exists (select 1 from public.permisos_menu_hotel where modulo = 'Habitaciones' and aplicacion = 'Hotel');

-- The check: column, sequence and menu row, or it fails.
do $$
declare
  v_last bigint;
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'unidades' and column_name = 'qr_generado_at'
                    and data_type = 'timestamp with time zone') then
    raise exception 'unidades.qr_generado_at (timestamptz) is missing';
  end if;
  execute format('select last_value from %s', pg_get_serial_sequence('public.unidades', 'id')) into v_last;
  if v_last < 1000000 then raise exception 'unidades: the id sequence is still below 1000000 (%)', v_last; end if;
  if not exists (select 1 from public.permisos_menu_hotel where modulo = 'Habitaciones' and aplicacion = 'Hotel') then
    raise exception 'permisos_menu_hotel: the Habitaciones row is missing';
  end if;
end $$;
