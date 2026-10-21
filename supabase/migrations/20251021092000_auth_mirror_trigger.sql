-- Mirror Supabase Auth users into public.users.
--
-- WHY. public.users is the foreign-key target for memberships, selections and alerts,
-- and the app needs email/display_name without reading the auth schema. The app must
-- never insert users (SCHEMA-RULES rule 5), so this trigger is the only writer. It is
-- SECURITY DEFINER because auth.users is owned by supabase_auth_admin and a caller
-- cannot read or write it directly.
--
-- The trigger fires AFTER INSERT and AFTER UPDATE OF email. On update it only refreshes
-- the email; display_name is not overwritten from user metadata on every login.
--
-- WHAT.
-- 1. private.sync_auth_user() — upsert into public.users.
-- 2. trg_auth_users_mirror on auth.users.
--
-- NOT SELF-CONTAINED: requires the Supabase `auth` schema and `auth.users` table.
--
-- ROLLBACK:
--   drop trigger trg_auth_users_mirror on auth.users;
--   drop function private.sync_auth_user();

create or replace function private.sync_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      split_part(new.email, '@', 1)
    )
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

revoke all on function private.sync_auth_user() from public, anon, authenticated;

drop trigger if exists trg_auth_users_mirror on auth.users;
create trigger trg_auth_users_mirror
  after insert or update of email on auth.users
  for each row execute function private.sync_auth_user();
