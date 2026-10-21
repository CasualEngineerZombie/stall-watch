-- RLS helper functions.
--
-- WHY. Every policy asks the same two questions: which orgs does the caller belong to,
-- and is the caller staff? Putting the membership lookup in one place keeps policies
-- readable and avoids recursive RLS on public.memberships (a policy on memberships that
-- selects from memberships would recurse). The functions are SECURITY DEFINER and owned
-- by postgres, which has BYPASSRLS on Supabase, so they can read memberships that the
-- caller cannot.
--
-- These are the one sanctioned exception to "a definer function checks its caller": they
-- take no arguments, derive everything from auth.uid(), and return only the caller's own
-- facts. A signed-in user with no membership gets an empty array and false.
--
-- current_user_org_ids returns uuid[] rather than setof uuid so policies can use the
-- brief's exact predicate `org_id = any (private.current_user_org_ids())`.
--
-- WHAT.
-- 1. private.current_user_org_ids() — the caller's org ids.
-- 2. private.is_staff() — membership of an org whose type is 'staff'.
--
-- ROLLBACK:
--   drop function private.is_staff();
--   drop function private.current_user_org_ids();

create or replace function private.current_user_org_ids()
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.org_id order by m.org_id), '{}'::uuid[])
    from public.memberships m
   where m.user_id = (select auth.uid());
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.memberships m
      join public.orgs o on o.id = m.org_id
     where m.user_id = (select auth.uid())
       and o.org_type = 'staff'
  );
$$;

revoke all on function private.current_user_org_ids() from public, anon;
revoke all on function private.is_staff() from public, anon;

grant execute on function private.current_user_org_ids() to authenticated;
grant execute on function private.is_staff() to authenticated;
