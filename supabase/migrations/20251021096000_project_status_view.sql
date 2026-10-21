-- Live project status, including the stalled flag.
--
-- WHY. The badge on /projects has to be true *right now*, not a value some job wrote
-- yesterday. The same rule also feeds the detector, so there is exactly one definition:
-- this view. If badge and alert disagree, one of them is wrong; sharing the view makes
-- that impossible.
--
-- The quiet anchor is greatest(last builder history event, selection_phase_started_at).
-- greatest() ignores nulls in Postgres, so:
--   - never selected + phase started 8 days ago -> anchor = phase start -> stalled
--   - staff changed a selection yesterday      -> builder history unchanged -> still stalled
--   - builder changed a selection yesterday    -> anchor moves -> not stalled
--   - no history and no phase start            -> anchor null -> never stalled
--
-- security_invoker is essential: without it the view would run as its owner and show
-- every org's rows. It is re-applied after create because CREATE OR REPLACE VIEW
-- silently drops the setting.
--
-- WHAT: builder.v_project_status with slot counts, quiet anchor, days quiet, is_stalled.
--
-- ROLLBACK: drop view builder.v_project_status;

create or replace view builder.v_project_status as
select
  p.id,
  p.org_id,
  o.name as org_name,
  p.name,
  p.status,
  p.selection_due_date,
  p.selection_phase_started_at,
  p.archived_at,
  coalesce(s.total_slots, 0) as total_slots,
  coalesce(s.filled_slots, 0) as filled_slots,
  coalesce(s.total_slots, 0) - coalesce(s.filled_slots, 0) as empty_slots,
  q.quiet_since,
  case
    when q.quiet_since is null then null
    else floor(extract(epoch from (now() - q.quiet_since)) / 86400)::integer
  end as days_quiet,
  (
    p.status = 'selection_phase'
    and p.archived_at is null
    and coalesce(s.total_slots, 0) > coalesce(s.filled_slots, 0)
    and q.quiet_since is not null
    and now() - q.quiet_since >= interval '5 days'
  ) as is_stalled
from builder.projects p
join public.orgs o on o.id = p.org_id
left join lateral (
  select
    count(*)::integer as total_slots,
    count(sel.id)::integer as filled_slots
  from builder.project_slots ps
  left join builder.selections sel on sel.slot_id = ps.id
  where ps.project_id = p.id
) s on true
left join lateral (
  select greatest(
    (
      select max(h.changed_at)
      from builder.selection_history h
      join builder.project_slots ps2
        on ps2.id = h.slot_id and ps2.org_id = h.org_id
      where ps2.project_id = p.id
        and h.actor_kind = 'builder'
    ),
    p.selection_phase_started_at
  ) as quiet_since
) q on true;

alter view builder.v_project_status set (security_invoker = true);

comment on view builder.v_project_status is
  'Live stall computation. security_invoker so the caller''s RLS applies to every base table.';

grant select on builder.v_project_status to authenticated;
