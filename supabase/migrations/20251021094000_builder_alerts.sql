-- In-app alerts.
--
-- WHY. An alert belongs to one recipient, not to an org. Org scope would let every
-- builder admin read every other admin's alerts and would let staff read builder alerts,
-- so the policy is `user_id = auth.uid()`. `org_id` still points at the builder org the
-- alert is *about* (even for a staff recipient, e.g. a late-change alert), which keeps
-- the alert anchored to its project.
--
-- RLS cannot restrict columns, so "mark as read" is enforced with a column grant:
-- authenticated may update read_at and nothing else. The touch trigger still bumps
-- updated_at/lock_version — a trigger assignment is not a column-privilege check — but
-- the client cannot write them.
--
-- Duplicate suppression is a unique index on (project_id, kind, dedupe_key, user_id).
-- For a stall the key is the quiet anchor timestamp, so the same stall always maps to
-- the same row *for the same recipient*, while a re-stall after new builder activity
-- gets a new key. user_id is part of the key on purpose: a stall fans out to several
-- admins, and without it the second admin would collide with the first. See the detector
-- migration.
--
-- WHAT.
-- 1. builder.alerts.
-- 2. RLS: select/update own alerts only; column-level update grant.
--
-- ROLLBACK: drop table builder.alerts;

create table builder.alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  user_id uuid not null references public.users (id),
  project_id uuid not null,
  kind text not null check (kind in ('stall', 'late_change')),
  message text not null check (length(btrim(message)) > 0),
  dedupe_key text not null,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint alerts_recipient_dedupe_key unique (project_id, kind, dedupe_key, user_id),
  constraint alerts_project_fk
    foreign key (project_id, org_id) references builder.projects (id, org_id)
);

comment on table builder.alerts is
  'One row per recipient. Created only by detector/trigger functions, never by the app.';
comment on column builder.alerts.org_id is
  'Builder org of the project the alert is about, even when user_id is a staff user.';

create index alerts_user_created_at_idx on builder.alerts (user_id, created_at desc);

create trigger trg_alerts_touch
  before update on builder.alerts
  for each row execute function private.touch_row();

alter table builder.alerts enable row level security;
alter table builder.alerts force row level security;

create policy p_alerts_select on builder.alerts
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy p_alerts_update on builder.alerts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- No insert/delete policy: alerts are written by SECURITY DEFINER functions only, and
-- nobody deletes an alert.

revoke all on builder.alerts from anon, authenticated;
grant select on builder.alerts to authenticated;
-- The whole point: "mark read" may change read_at and nothing else.
grant update (read_at) on builder.alerts to authenticated;
