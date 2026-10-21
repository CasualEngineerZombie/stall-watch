-- Harden Supabase's platform-managed auto-RLS event-trigger helper.
--
-- WHY. A hosted Supabase project may install public.rls_auto_enable() as a
-- SECURITY DEFINER event trigger that enables RLS on new public tables. It is not
-- created by this repo and is absent from the local test fixture, but it was present
-- in the linked production project with PUBLIC/anon/authenticated EXECUTE. It cannot
-- be called as an RPC because it returns event_trigger, but the database rules still
-- require a pinned empty search_path and no anon execute for every definer function.
--
-- WHAT. If the platform function exists, pin search_path = '' and revoke EXECUTE from
-- public, anon and authenticated. The event trigger runs as its owner (postgres), so
-- auto-RLS continues to work; no application role calls it directly.
--
-- ROLLBACK: alter function public.rls_auto_enable() set search_path = pg_catalog;
--           grant execute on function public.rls_auto_enable() to public;
--
-- The function uses only pg_catalog routines and schema-qualified table references,
-- so an empty search_path is safe.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'alter function public.rls_auto_enable() set search_path = ''''';
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
    execute $comment$comment on function public.rls_auto_enable() is 'Supabase-managed RLS auto-enable event trigger; hardened by Stall Watch migration 20251021102000.'$comment$;
  else
    raise notice 'public.rls_auto_enable() is not installed; platform RLS auto-enable hardening skipped';
  end if;
end;
$$;
