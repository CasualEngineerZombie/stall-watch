-- Projects and their slots.
--
-- WHY. A project is one home; a slot is one thing that home needs picked, written as
-- room + category. Builders may read them but never write them — status is staff's job —
-- so there is a read policy for builders and an update policy only for staff.
--
-- (id, org_id) is unique on projects so the child tables can use a composite foreign key
-- and cannot attach themselves to another org's project. That is the defence an org-only
-- policy cannot provide.
--
-- A project in selection_phase must know when the phase started: the stall rule needs an
-- anchor even when the builder has never touched the project. Without this check,
-- Unit 4B (no selections ever) would be invisible to the detector.
--
-- WHAT.
-- 1. builder.projects.
-- 2. builder.project_slots.
-- 3. RLS + policies + grants: builders read, staff may update projects.
--
-- ROLLBACK:
--   drop table builder.project_slots;
--   drop table builder.projects;

create table builder.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  name text not null check (length(btrim(name)) > 0),
  status text not null default 'pending_kickoff'
    check (status in ('pending_kickoff', 'selection_phase', 'revision', 'complete')),
  selection_phase_started_at timestamptz,
  selection_due_date date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint projects_id_org_key unique (id, org_id),
  constraint projects_selection_phase_anchor
    check (status <> 'selection_phase' or selection_phase_started_at is not null)
);

comment on table builder.projects is
  'One home a builder is building. Archived instead of deleted.';

create table builder.project_slots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  project_id uuid not null,
  room text not null check (length(btrim(room)) > 0),
  category text not null check (length(btrim(category)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint project_slots_id_org_key unique (id, org_id),
  constraint project_slots_project_room_category_key unique (project_id, room, category),
  constraint project_slots_project_fk
    foreign key (project_id, org_id) references builder.projects (id, org_id)
);

create index project_slots_project_id_idx on builder.project_slots (project_id);

comment on table builder.project_slots is
  'One thing a project needs picked, e.g. Kitchen – Countertop.';

create trigger trg_projects_touch
  before update on builder.projects
  for each row execute function private.touch_row();

create trigger trg_project_slots_touch
  before update on builder.project_slots
  for each row execute function private.touch_row();

alter table builder.projects enable row level security;
alter table builder.projects force row level security;

alter table builder.project_slots enable row level security;
alter table builder.project_slots force row level security;

create policy p_projects_select on builder.projects
  for select to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff());

-- Staff change project status; builders cannot write projects at all.
create policy p_projects_update on builder.projects
  for update to authenticated
  using (private.is_staff())
  with check (private.is_staff());

create policy p_project_slots_select on builder.project_slots
  for select to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff());

revoke all on builder.projects, builder.project_slots from anon, authenticated;
grant select on builder.projects, builder.project_slots to authenticated;
grant update on builder.projects to authenticated;
