-- RLS for identity and tenancy.
--
-- WHY. public.memberships is the authorisation source of truth, so it must be readable
-- only for the caller's own row; orgs only for orgs the caller belongs to; users only
-- for themselves. Staff can see all three. There are deliberately no write policies:
-- identity writes go through the auth trigger or setup SQL, never the Data API
-- (SCHEMA-RULES rule 5). Grants are SELECT only for the same reason.
--
-- WHAT.
-- 1. RLS enabled+forced on orgs, users, memberships.
-- 2. p_orgs_select, p_users_select, p_memberships_select.
-- 3. revoke all from anon/authenticated, grant select.
--
-- ROLLBACK:
--   drop policy p_memberships_select on public.memberships;
--   drop policy p_users_select on public.users;
--   drop policy p_orgs_select on public.orgs;
--   alter table public.memberships disable row level security;
--   alter table public.users disable row level security;
--   alter table public.orgs disable row level security;

alter table public.orgs enable row level security;
alter table public.orgs force row level security;

alter table public.users enable row level security;
alter table public.users force row level security;

alter table public.memberships enable row level security;
alter table public.memberships force row level security;

create policy p_orgs_select on public.orgs
  for select to authenticated
  using (id = any (private.current_user_org_ids()) or private.is_staff());

create policy p_users_select on public.users
  for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());

create policy p_memberships_select on public.memberships
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_staff());

revoke all on public.orgs, public.users, public.memberships from anon, authenticated;
grant select on public.orgs, public.users, public.memberships to authenticated;
