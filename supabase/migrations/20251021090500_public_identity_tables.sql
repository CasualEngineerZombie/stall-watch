-- Identity and tenancy tables.
--
-- WHY. Authentication and authorisation are separate: a row in auth.users grants
-- nothing until a row in public.memberships says which org the user belongs to. Builder
-- orgs are external customers, so a user may only read their own tenancy rows. Identity
-- is written by the auth-mirror trigger or by seed/setup files run as the owner — never
-- by the app — so `authenticated` will get SELECT only (policies land in the next-but-one
-- migration, after the RLS helpers exist).
--
-- The shared touch_row function lives here because every mutable business table needs
-- it; it is SECURITY INVOKER (it only mutates the row being written) and pins
-- search_path.
--
-- WHAT.
-- 1. private.touch_row() — stamps updated_at and bumps lock_version on UPDATE.
-- 2. public.orgs — the single staff org and the builder orgs.
-- 3. public.users — mirror of auth.users (written by the auth-mirror trigger).
-- 4. public.memberships — user <-> org, with role admin|member.
-- 5. updated_at/lock_version triggers.
--
-- ROLLBACK:
--   drop table public.memberships;
--   drop table public.users;
--   drop table public.orgs;
--   drop function private.touch_row();

create or replace function private.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.lock_version := coalesce(old.lock_version, 0) + 1;
  return new;
end;
$$;

revoke all on function private.touch_row() from public, anon, authenticated;

-- ── orgs ─────────────────────────────────────────────────────────────────────────────

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  org_type text not null check (org_type in ('staff', 'builder')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0
);

comment on table public.orgs is
  'Tenants. Exactly one org has org_type = staff; every builder is an external customer.';
comment on column public.orgs.org_type is
  'staff | builder. The brief''s data-model table said staff|admin, but seed.sql uses '
  'builder; the executable file wins.';

-- ── users ────────────────────────────────────────────────────────────────────────────

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0
);

comment on table public.users is
  'Mirror of auth.users so the app never reads the auth schema. Written only by '
  'private.sync_auth_user (trigger) and by setup SQL run as the owner.';

-- ── memberships ──────────────────────────────────────────────────────────────────────

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  org_id uuid not null references public.orgs (id),
  role text not null check (role in ('admin', 'member')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint memberships_user_org_key unique (user_id, org_id)
);

comment on table public.memberships is
  'Authorisation source of truth. No membership means no access, even when signed in.';

-- ── updated_at / lock_version ────────────────────────────────────────────────────────

create trigger trg_orgs_touch
  before update on public.orgs
  for each row execute function private.touch_row();

create trigger trg_users_touch
  before update on public.users
  for each row execute function private.touch_row();

create trigger trg_memberships_touch
  before update on public.memberships
  for each row execute function private.touch_row();
