-- 0018 — usuarios.cumple (birthday dd/MM).
--
-- SharePoint 00.Usuarios stores the birthday as 'dd/MM' WITHOUT a year, which does not fit usuarios.fecha_nac (date).
-- The Tecnoapp reads and writes the dd/MM text here; fecha_nac is left alone.
-- Filled for existing users by `npm run fix:usuarios` (scripts/migrate/src/fix-usuarios-sp.ts).
--
-- Additive and idempotent. Aplicar: correr este archivo en el SQL Editor de Supabase.

alter table public.usuarios add column if not exists cumple text;
comment on column public.usuarios.cumple is
  'Birthday dd/MM without year, as SharePoint 00.Usuarios stores it; written by the Tecnoapp';

-- The check
do $$
begin
  if not exists (
       select 1 from pg_attribute a
        where a.attrelid = 'public.usuarios'::regclass and a.attname = 'cumple' and not a.attisdropped
          and a.atttypid = 'text'::regtype and col_description(a.attrelid, a.attnum) is not null) then
    raise exception 'usuarios.cumple (text, with its comment) is missing';
  end if;
end $$;
