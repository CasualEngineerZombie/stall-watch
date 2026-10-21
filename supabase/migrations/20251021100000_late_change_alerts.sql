-- Bonus, Part 3: late-change alerts.
--
-- WHY. A builder may legally change a finish after the project has moved to revision.
-- That change can invalidate a quote or an order that staff already placed, and today it
-- is silent. Staff are the people who need to know, so every member of the staff org gets
-- one in-app alert. This is implemented as a trigger on selection_history because the
-- history row already carries the derived actor_kind — the app never gets to claim that
-- a staff edit was a builder edit, or vice versa.
--
-- Dedupe is per history row and recipient (`history:<id>` + user_id), so a retried
-- insert or a replayed event cannot alert twice, while every staff member still gets one. The trigger is SECURITY DEFINER because authenticated has no
-- insert grant on alerts; it is revoked from every API role and fires only as a trigger.
--
-- WHAT.
-- 1. private.alert_late_change() — fan out to staff org members when action is
--    set/change/clear, actor_kind='builder', and the project is in revision.
-- 2. trg_history_late_change on builder.selection_history.
--
-- ROLLBACK:
--   drop trigger trg_history_late_change on builder.selection_history;
--   drop function private.alert_late_change();

create or replace function private.alert_late_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_id uuid;
  v_project_org_id uuid;
  v_project_name text;
  v_org_name text;
  v_room text;
  v_category text;
  v_verb text;
begin
  if new.actor_kind <> 'builder' then
    return new;
  end if;

  select p.id, p.org_id, p.name, o.name, ps.room, ps.category
    into v_project_id, v_project_org_id, v_project_name, v_org_name, v_room, v_category
    from builder.project_slots ps
    join builder.projects p
      on p.id = ps.project_id
     and p.org_id = ps.org_id
     and p.status = 'revision'
    join public.orgs o on o.id = p.org_id
   where ps.id = new.slot_id
     and ps.org_id = new.org_id;

  -- Not a revision project (or the slot is gone): nothing to say.
  if not found then
    return new;
  end if;

  v_verb := case new.action
              when 'set' then 'set'
              when 'change' then 'changed'
              when 'clear' then 'cleared'
              else new.action
            end;

  insert into builder.alerts (org_id, user_id, project_id, kind, message, dedupe_key)
  select
    v_project_org_id,
    m.user_id,
    v_project_id,
    'late_change',
    format(
      '%s %s %s – %s on %s after revision.',
      v_org_name,
      v_verb,
      v_room,
      v_category,
      v_project_name
    ),
    'history:' || new.id::text
  from public.memberships m
  join public.orgs o on o.id = m.org_id
  where o.org_type = 'staff'
  on conflict (project_id, kind, dedupe_key, user_id) do nothing;

  return new;
end;
$$;

revoke all on function private.alert_late_change() from public, anon, authenticated;

create trigger trg_history_late_change
  after insert on builder.selection_history
  for each row execute function private.alert_late_change();
