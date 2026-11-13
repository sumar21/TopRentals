-- 0021 — emails_notificacion.incluir_ejecutor: "also send to the user who performs the action".
--
-- Context: the Tecnoapp gets an ABM for the notification recipients (Configuración > Emails). Besides the fixed addresses
-- in emails_notificacion.emails, a row can say "also send this mail to the user who triggers it at that moment" (e.g. the
-- operator who closes the Orden de Lavado). The BFF adds that user's email (usuarios.mail) to the recipients, deduplicated.
--
-- Default false, so every existing row (including the ones TopRentals reads) behaves exactly as before.
-- Does not update or delete any existing row.
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase. Idempotent (safe to run more than once).

alter table public.emails_notificacion add column if not exists incluir_ejecutor boolean not null default false;
comment on column public.emails_notificacion.incluir_ejecutor is 'true = also send to the user who performs the action that triggers the mail (Tecnoapp); false = only the addresses in emails';

-- The check: the column exists with the right type and no default drift.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'emails_notificacion' and column_name = 'incluir_ejecutor'
                    and data_type = 'boolean' and is_nullable = 'NO' and column_default = 'false') then
    raise exception 'emails_notificacion.incluir_ejecutor (boolean not null default false) is missing';
  end if;
end $$;
