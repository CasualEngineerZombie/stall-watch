-- Staff "Run now" RPC.
--
-- WHY. Staff need to trigger the detector without waiting for 02:00, and the internal
-- function is intentionally unreachable by authenticated. This wrapper is the only
-- API-reachable entry point. It is SECURITY DEFINER (it must call the revoked internal
-- function), so it checks the caller itself before doing anything: authority comes from
-- public.memberships, never from a parameter or JWT metadata.
--
-- A builder calling it gets 42501 insufficient_privilege, not an empty success.
--
-- WHAT: builder.run_stall_detector_now() -> run id; granted to authenticated only.
--
-- ROLLBACK: drop function builder.run_stall_detector_now();

create or replace function builder.run_stall_detector_now()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'only staff can run the stall detector'
      using errcode = '42501';
  end if;

  return builder._run_stall_detector('manual');
end;
$$;

revoke all on function builder.run_stall_detector_now() from public, anon;
grant execute on function builder.run_stall_detector_now() to authenticated;
