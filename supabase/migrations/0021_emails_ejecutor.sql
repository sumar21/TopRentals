-- 0021 — emails_notificacion.incluir_ejecutor: "also send to the user who performs the action".
--
-- Context: the Tecnoapp gets an ABM for the notification recipients (Configuración > Emails). Besides the fixed addresses
-- in emails_notificacion.emails, a row can say "also send this mail to the user who triggers it at that moment" (e.g. the
-- operator who closes the Orden de Lavado). The BFF adds that user's email (usuarios.mail) to the recipients, deduplicated.
--
-- Default false, so every existing row (including the ones TopRentals reads) behaves exactly as before.
--
-- Also moves the emails_notificacion id identity to >= 1000000 (same idea as 0017 / 0020): the SharePoint sync inserts
-- explicit ids, so the sequence sat at 99 while max(id) was 105 and the first rows created by the ABM would have failed
-- on the primary key (and later ones would collide with new SharePoint item ids).
-- Does not update or delete any existing row.
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase. Idempotent (safe to run more than once).

alter table public.emails_notificacion add column if not exists incluir_ejecutor boolean not null default false;
comment on column public.emails_notificacion.incluir_ejecutor is 'true = also send to the user who performs the action that triggers the mail (Tecnoapp); false = only the addresses in emails';

-- identity to >= 1000000 (only moves it forward)
do $$
declare
  v_seq  text := pg_get_serial_sequence('public.emails_notificacion', 'id');
  v_last bigint;
begin
  if v_seq is null then raise exception 'emails_notificacion: id has no sequence'; end if;
  execute format('select last_value from %s', v_seq) into v_last;
  if v_last < 1000000 then
    execute format('select setval(%L, greatest(1000000, (select coalesce(max(id), 0) from public.emails_notificacion)), true)', v_seq);
  end if;
end $$;

-- The check: the column exists with the right type and no default drift, and the sequence is >= 1000000.
do $$
declare
  v_last bigint;
begin
  execute format('select last_value from %s', pg_get_serial_sequence('public.emails_notificacion', 'id')) into v_last;
  if v_last < 1000000 then raise exception 'emails_notificacion: the id sequence is still below 1000000 (%)', v_last; end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'emails_notificacion' and column_name = 'incluir_ejecutor'
                    and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'emails_notificacion.incluir_ejecutor (boolean not null default false) is missing';
  end if;
end $$;
