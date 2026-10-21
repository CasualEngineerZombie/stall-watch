-- The stall detector (internal function).
--
-- WHY. The detector must run with no logged-in user, so it cannot rely on RLS; it is a
-- SECURITY DEFINER function owned by postgres. It is revoked from anon AND authenticated,
-- so it cannot be reached at /rest/v1/rpc at all. Only pg_cron (runs as postgres) and the
-- staff-guarded RPC in the next migration can call it.
--
-- Duplicate prevention is data, not time: every run recomputes the quiet anchor from
-- selection_history and uses it as dedupe_key. Unique
-- (project_id, kind, dedupe_key, user_id) plus ON CONFLICT DO NOTHING means a second
-- run, an overlapping run, or a run after a missed day all converge on the same row per
-- recipient. The advisory lock only avoids duplicate work; removing it would not create
-- duplicate alerts.
--
-- Failure handling is deliberately non-obvious. The run row is inserted before the work.
-- The work runs inside a BEGIN … EXCEPTION sub-block so a failure rolls back any
-- half-written alerts. The handler records status='failed' and then RETURNS NORMALLY
-- instead of re-raising: a raise would abort the caller's transaction and take the
-- failure row with it, which is the exact trap the brief warns about. /detector reads
-- the failed row. A cron run therefore "succeeds" from cron's point of view; the run log
-- is the source of truth for humans.
--
-- WHAT: builder._run_stall_detector(p_trigger_kind text) returns the run id.
--
-- ROLLBACK: drop function builder._run_stall_detector(text);

create or replace function builder._run_stall_detector(p_trigger_kind text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run_id uuid;
  v_flagged integer := 0;
  v_alerts integer := 0;
begin
  if p_trigger_kind not in ('scheduled', 'manual') then
    raise exception 'invalid trigger kind: %', p_trigger_kind
      using errcode = '22023';
  end if;

  insert into builder.job_runs (job, trigger_kind, status)
  values ('stall_detector', p_trigger_kind, 'running')
  returning id into v_run_id;

  -- Serialise overlapping invocations (manual + cron). Correctness still comes from the
  -- unique index; this just stops two runs doing the same work twice.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('builder.stall_detector')::bigint
  );

  begin
    with stalled as (
      select id, org_id, name, empty_slots, days_quiet, quiet_since
        from builder.v_project_status
       where is_stalled
    ),
    inserted as (
      insert into builder.alerts (org_id, user_id, project_id, kind, message, dedupe_key)
      select
        s.org_id,
        m.user_id,
        s.id,
        'stall',
        format(
          '%s has had no builder activity for %s days. %s %s still empty.',
          s.name,
          s.days_quiet,
          s.empty_slots,
          case when s.empty_slots = 1 then 'slot is' else 'slots are' end
        ),
        to_char(s.quiet_since at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US')
      from stalled s
      join public.memberships m
        on m.org_id = s.org_id
       and m.role = 'admin'
      on conflict (project_id, kind, dedupe_key, user_id) do nothing
      returning 1
    )
    select
      (select count(*)::integer from stalled),
      (select count(*)::integer from inserted)
    into v_flagged, v_alerts;

    update builder.job_runs
       set status = 'succeeded',
           finished_at = now(),
           projects_flagged = v_flagged,
           alerts_created = v_alerts
     where id = v_run_id;
  exception
    when others then
      -- Never re-raise here; see the header. The inner block has already undone its work.
      update builder.job_runs
         set status = 'failed',
             finished_at = now(),
             error_message = sqlstate || ': ' || sqlerrm
       where id = v_run_id;
  end;

  return v_run_id;
end;
$$;

revoke all on function builder._run_stall_detector(text) from public, anon, authenticated;
