-- 0015 — app_releases: one row per PRODUCTION release, the push trigger of the "new version available" prompt.
--
-- Context: open tabs (back-office and /tecnico) used to keep an old bundle for days after a deploy. The GitHub
-- workflow .github/workflows/app-release.yml runs when Vercel marks a Production deployment successful and calls
-- `POST /api/app-release` (scripts/app-release/handler.ts, bundled to api/app-release.js) with the commit's APP_VERSION
-- (config/appVersion.ts). The function inserts the row (service_role) only when it runs that very version. Signed-in tabs
-- read the latest row and follow the inserts (Realtime: api.appReleases.latest + the 'appReleases' realtime topic) and
-- prompt when that version is newer than the bundle's (utils/appVersion.ts). Preview/develop builds never write here
-- and never prompt.
--
-- Columns:
--   version      the release's APP_VERSION, format v<YYYYMMDD>_<major>.<minor>.<patch>;
--   commit_sha   the deployed commit, 40 lowercase hex characters;
--   released_at  when the webhook recorded it (the tabs read the latest);
--   source       what recorded it: the deploy webhook.
-- A redeploy of a recorded (version, commit) adds no row.
--
-- Security: RLS on; a signed-in user may read it (versions and commits, nothing else), which Realtime needs to deliver
-- the inserts. anon reads nothing. Only the server writes (service_role: select and insert).
--
-- Aplicar: correr este archivo en el SQL Editor de Supabase. Additive and idempotent (safe to run more than once).

create table if not exists public.app_releases (
  id           bigint generated always as identity primary key,
  version      text not null constraint app_releases_version_format check (version ~ '^v\d{8}_\d+\.\d+\.\d+$'),
  commit_sha   text not null constraint app_releases_commit_sha_format check (commit_sha ~ '^[0-9a-f]{40}$'),
  released_at  timestamptz not null default now(),
  source       text not null default 'github-deployment-status',
  constraint app_releases_version_commit_sha_key unique (version, commit_sha)
);

comment on table public.app_releases is
  'One row per production release (APP_VERSION + commit), written by POST /api/app-release from the GitHub workflow app-release.yml. Signed-in tabs read the latest and subscribe to inserts (Realtime) to prompt for a reload.';

alter table public.app_releases enable row level security;
do $$
begin
  if not exists (select 1 from pg_catalog.pg_policies
                 where schemaname = 'public' and tablename = 'app_releases' and policyname = 'app_releases_select_authenticated') then
    create policy app_releases_select_authenticated on public.app_releases
      for select to authenticated using (true);
  end if;
end $$;

-- The schema's default privileges give every new table (and sequence) to anon, authenticated and service_role: take
-- them all back, then give each role exactly what it needs.
revoke all on public.app_releases from public, anon, authenticated, service_role;
revoke all on sequence public.app_releases_id_seq from public, anon, authenticated;
grant select on public.app_releases to authenticated;
grant select, insert on public.app_releases to service_role;

-- Realtime delivers a table's inserts only when the table is in its publication.
do $$
begin
  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_catalog.pg_publication_tables
                     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_releases') then
    alter publication supabase_realtime add table public.app_releases;
  end if;
end $$;

-- The check: what this file created, or it fails (and the migration with it).
do $$
declare
  v_oid  oid := to_regclass('public.app_releases');
  v_cols text;
  v_priv text;
  v_n    int;
begin
  if v_oid is null then raise exception 'app_releases: the table is missing'; end if;

  select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || (case when a.attnotnull then 'nn' else 'null' end), ',' order by a.attnum)
    into v_cols
    from pg_attribute a where a.attrelid = v_oid and a.attnum > 0 and a.atttypid <> 0;
  if v_cols is distinct from 'id:bigint:nn,version:text:nn,commit_sha:text:nn,released_at:timestamp with time zone:nn,source:text:nn' then
    raise exception 'app_releases: unexpected columns %', v_cols;
  end if;
  if (select attidentity from pg_attribute where attrelid = v_oid and attname = 'id') is distinct from 'a' then
    raise exception 'app_releases: id is not an always-generated identity column';
  end if;
  if (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = v_oid and a.attname = 'released_at') is distinct from 'now()' then
    raise exception 'app_releases: released_at must default to now()';
  end if;
  if (select pg_get_expr(d.adbin, d.adrelid) from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
       where d.adrelid = v_oid and a.attname = 'source') is distinct from '''github-deployment-status''::text' then
    raise exception 'app_releases: source must default to github-deployment-status';
  end if;

  if not exists (select 1 from pg_constraint where conrelid = v_oid and contype = 'c' and conname = 'app_releases_version_format'
                  and strpos(pg_get_constraintdef(oid), 'version ~ ''^v\d{8}_\d+\.\d+\.\d+$''') > 0) then
    raise exception 'app_releases: the version format check is missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_oid and contype = 'c' and conname = 'app_releases_commit_sha_format'
                  and strpos(pg_get_constraintdef(oid), 'commit_sha ~ ''^[0-9a-f]{40}$''') > 0) then
    raise exception 'app_releases: the commit_sha format check is missing';
  end if;
  if not exists (select 1 from pg_constraint where conrelid = v_oid and contype = 'u' and conname = 'app_releases_version_commit_sha_key'
                  and pg_get_constraintdef(oid) = 'UNIQUE (version, commit_sha)') then
    raise exception 'app_releases: the unique (version, commit_sha) is missing';
  end if;

  if not (select relrowsecurity from pg_class where oid = v_oid) then
    raise exception 'app_releases: RLS is not enabled';
  end if;
  if (select count(*) from pg_policies where schemaname = 'public' and tablename = 'app_releases') <> 1
     or not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_releases'
                     and policyname = 'app_releases_select_authenticated' and permissive = 'PERMISSIVE' and cmd = 'SELECT'
                     and roles = array['authenticated']::name[] and qual = 'true' and with_check is null) then
    raise exception 'app_releases: the only policy must be app_releases_select_authenticated (select, authenticated, true)';
  end if;

  select count(*) into v_n from pg_class c, aclexplode(c.relacl) x
   where c.oid = v_oid and x.grantee in (0, 'anon'::regrole);
  if v_n <> 0 then raise exception 'app_releases: anon / public still hold % privilege(s)', v_n; end if;

  select string_agg(x.privilege_type, ',' order by x.privilege_type) into v_priv
    from pg_class c, aclexplode(c.relacl) x where c.oid = v_oid and x.grantee = 'authenticated'::regrole;
  if v_priv is distinct from 'SELECT' then
    raise exception 'app_releases: authenticated must hold exactly SELECT, it holds %', v_priv;
  end if;

  select string_agg(x.privilege_type, ',' order by x.privilege_type) into v_priv
    from pg_class c, aclexplode(c.relacl) x where c.oid = v_oid and x.grantee = 'service_role'::regrole;
  if v_priv is distinct from 'INSERT,SELECT' then
    raise exception 'app_releases: service_role must hold exactly INSERT,SELECT, it holds %', v_priv;
  end if;

  select count(*) into v_n from pg_class c, aclexplode(c.relacl) x
   where c.oid = 'public.app_releases_id_seq'::regclass and x.grantee in (0, 'anon'::regrole, 'authenticated'::regrole);
  if v_n <> 0 then raise exception 'app_releases: anon / authenticated / public still hold the id sequence'; end if;

  if exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_catalog.pg_publication_tables
                   where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'app_releases') then
      raise exception 'app_releases: the table is not in the supabase_realtime publication';
    end if;
  else
    raise warning 'app_releases: there is no supabase_realtime publication, so no tab hears the inserts (the 5-minute check still runs)';
  end if;
end $$;

-- Reading it, the last releases:
--   select version, commit_sha, released_at, source from public.app_releases order by released_at desc limit 10;
