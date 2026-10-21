-- Detector run log.
--
-- WHY. "Did it run, and did it work?" has to be answerable by staff without database
-- superuser access. The log has no org_id: a run covers every builder, so it cannot be
-- owned by one. That means its policy is private.is_staff() only.
--
-- The row is inserted as 'running' *before* the work and updated to succeeded/failed, so
-- a crashed run is visible as running or failed rather than vanishing. This is a log
-- table, so it skips updated_at/lock_version (SCHEMA-RULES rule 7).
--
-- alerts_created is separate from projects_flagged on purpose: a run can flag three
-- projects and create zero new alerts when they were already alerted. The difference is
-- how we prove idempotency.
--
-- WHAT.
-- 1. builder.job_runs.
-- 2. RLS: select for staff only; no write policies (detector functions write it).
--
-- ROLLBACK: drop table builder.job_runs;

create table builder.job_runs (
  id uuid primary key default gen_random_uuid(),
  job text not null check (job in ('stall_detector')),
  trigger_kind text not null check (trigger_kind in ('scheduled', 'manual')),
  status text not null check (status in ('running', 'succeeded', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  projects_flagged integer not null default 0 check (projects_flagged >= 0),
  alerts_created integer not null default 0 check (alerts_created >= 0),
  error_message text,
  created_at timestamptz not null default now(),
  constraint job_runs_failed_has_message
    check (status <> 'failed' or error_message is not null)
);

comment on table builder.job_runs is
  'One row per detector invocation. Survivors of failure by design: see the detector function.';

create index job_runs_started_at_idx on builder.job_runs (started_at desc);

alter table builder.job_runs enable row level security;
alter table builder.job_runs force row level security;

create policy p_job_runs_select on builder.job_runs
  for select to authenticated
  using (private.is_staff());

revoke all on builder.job_runs from anon, authenticated;
grant select on builder.job_runs to authenticated;
