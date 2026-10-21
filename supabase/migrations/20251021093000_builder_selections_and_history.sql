-- Current selections and append-only selection history.
--
-- WHY. The current pick lives in selections (at most one per slot) so the UI read is
-- simple. Every set/change/clear is also appended to selection_history, which is what
-- the stall rule reads: staff activity must not reset a builder's quiet clock, so the
-- history has to say *who kind of user* acted, and the app must not be trusted to say it.
--
-- The history trigger is SECURITY DEFINER for that reason: it looks up the caller's
-- membership in the project's builder org and derives actor_kind itself. A signed-in
-- builder cannot forge a staff row, and a staff change is recorded as staff even though
-- staff can also write selections. No auth.uid() (SQL editor, job) records staff, per
-- the brief.
--
-- Clearing deletes the current-state row; the history row with action='clear' is the
-- durable record. selection_history has no insert/update/delete grants or policies at
-- all, so it is append-only even for SQL sent straight to the Data API.
--
-- Both tables carry their own org_id and a composite FK to project_slots (id, org_id),
-- so a selection cannot point at another org's slot while claiming its own org.
--
-- WHAT.
-- 1. builder.selections — unique (slot_id).
-- 2. builder.selection_history — append-only.
-- 3. private.record_selection_history() + trg_selections_history.
-- 4. RLS + policies + grants: org members write selections; history is read-only.
--
-- ROLLBACK:
--   drop table builder.selection_history;
--   drop table builder.selections;
--   drop function private.record_selection_history();

create table builder.selections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id),
  slot_id uuid not null,
  product_name text not null check (length(btrim(product_name)) > 0),
  selected_by uuid references public.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  lock_version integer not null default 0,
  constraint selections_slot_key unique (slot_id),
  constraint selections_slot_fk
    foreign key (slot_id, org_id) references builder.project_slots (id, org_id)
);

comment on table builder.selections is
  'The current pick per slot. Clearing deletes the row; history keeps the clear.';

create table builder.selection_history (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id),
  slot_id uuid not null,
  action text not null check (action in ('set', 'change', 'clear')),
  product_name text,
  changed_by uuid references public.users (id),
  actor_kind text not null check (actor_kind in ('builder', 'staff')),
  changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint selection_history_slot_fk
    foreign key (slot_id, org_id) references builder.project_slots (id, org_id)
);

comment on table builder.selection_history is
  'Append-only set/change/clear log. actor_kind is derived by trigger, never supplied by the client.';
comment on column builder.selection_history.product_name is
  'Null for a clear, as provided by seed.sql.';

create index selection_history_org_changed_at_idx
  on builder.selection_history (org_id, changed_at desc);
create index selection_history_slot_changed_at_idx
  on builder.selection_history (slot_id, changed_at desc);

-- ── history trigger ─────────────────────────────────────────────────────────────────

create or replace function private.record_selection_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
  v_slot_id uuid;
  v_action text;
  v_product_name text;
  v_actor_kind text;
begin
  if tg_op = 'DELETE' then
    v_org_id := old.org_id;
    v_slot_id := old.slot_id;
    v_action := 'clear';
    v_product_name := null;
  elsif tg_op = 'INSERT' then
    v_org_id := new.org_id;
    v_slot_id := new.slot_id;
    v_action := 'set';
    v_product_name := new.product_name;
  else
    -- An update that does not change the product (e.g. touching selected_by) is not a
    -- builder action and must not move the quiet clock.
    if new.product_name is not distinct from old.product_name then
      return new;
    end if;
    v_org_id := new.org_id;
    v_slot_id := new.slot_id;
    v_action := 'change';
    v_product_name := new.product_name;
  end if;

  select case
           when exists (
             select 1
               from public.memberships m
               join public.orgs o on o.id = m.org_id
              where m.user_id = (select auth.uid())
                and m.org_id = v_org_id
                and o.org_type = 'builder'
           ) then 'builder'
           else 'staff'
         end
    into v_actor_kind;

  insert into builder.selection_history
    (org_id, slot_id, action, product_name, changed_by, actor_kind, changed_at)
  values
    (v_org_id, v_slot_id, v_action, v_product_name, (select auth.uid()), v_actor_kind, now());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.record_selection_history() from public, anon, authenticated;

create trigger trg_selections_history
  after insert or update or delete on builder.selections
  for each row execute function private.record_selection_history();

create trigger trg_selections_touch
  before update on builder.selections
  for each row execute function private.touch_row();

-- ── RLS ──────────────────────────────────────────────────────────────────────────────

alter table builder.selections enable row level security;
alter table builder.selections force row level security;

alter table builder.selection_history enable row level security;
alter table builder.selection_history force row level security;

create policy p_selections_select on builder.selections
  for select to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff());

create policy p_selections_insert on builder.selections
  for insert to authenticated
  with check (
    (org_id = any (private.current_user_org_ids()) or private.is_staff())
    and selected_by = (select auth.uid())
  );

create policy p_selections_update on builder.selections
  for update to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff())
  with check (
    (org_id = any (private.current_user_org_ids()) or private.is_staff())
    and selected_by = (select auth.uid())
  );

create policy p_selections_delete on builder.selections
  for delete to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff());

create policy p_selection_history_select on builder.selection_history
  for select to authenticated
  using (org_id = any (private.current_user_org_ids()) or private.is_staff());

-- No insert/update/delete policy on selection_history: only the definer trigger writes.

revoke all on builder.selections, builder.selection_history from anon, authenticated;
grant select, insert, update, delete on builder.selections to authenticated;
grant select on builder.selection_history to authenticated;
