-- Daily schedule for the stall detector.
--
-- WHY. The detector is required to run with nobody pressing anything. pg_cron runs the
-- internal function as the database owner, which is why that function can be revoked
-- from every API role and still work. The job name is stable so re-running this
-- migration replaces the schedule instead of adding a second one.
--
-- WHAT: pg_cron job `stall_watch_detector`, daily at 02:00 UTC, calling
--       builder._run_stall_detector('scheduled').
--
-- NOT SELF-CONTAINED (documented in SETUP.md): pg_cron must be enabled in the Supabase
-- dashboard (Database -> Extensions). If it is not, this migration raises a notice and
-- does nothing rather than failing the rebuild. Enable pg_cron and re-run this file to
-- install the schedule; until then staff can still use "Run now".
--
-- ROLLBACK: select cron.unschedule('stall_watch_detector');

do $$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'stall_watch_detector') then
      perform cron.unschedule('stall_watch_detector');
    end if;

    perform cron.schedule(
      'stall_watch_detector',
      '0 2 * * *',
      $cron$select builder._run_stall_detector('scheduled')$cron$
    );

    raise notice 'stall_watch_detector scheduled daily at 02:00 UTC';
  else
    raise notice
      'pg_cron is not enabled: enable it in Database -> Extensions, then re-run migration 20251021099000_stall_detector_schedule.sql. The detector has no automatic schedule until then.';
  end if;
end;
$$;
