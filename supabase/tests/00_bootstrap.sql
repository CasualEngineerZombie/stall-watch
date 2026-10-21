-- Minimal Supabase-shaped environment for a bare Postgres.
--
-- WHY. The migrations reference auth.users, auth.uid() and the anon/authenticated roles.
-- A disposable Postgres (CI service container, or a local Docker database) has none of
-- them. This file creates just enough of Supabase's shape to apply the real migrations
-- and exercise RLS as the real roles.
--
-- This is a test fixture, not a migration. It is never applied to a Supabase project.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'create role anon nologin noinherit';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    execute 'create role authenticated nologin noinherit';
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text unique not null,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Mirrors Supabase's auth.uid(): reads the JWT subject from the request settings.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
