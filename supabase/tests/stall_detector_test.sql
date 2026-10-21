-- Stall Watch database tests.
--
-- Run against a fresh database after 00_bootstrap.sql, every migration and seed.sql.
-- psql stops at the first failed assertion (ON_ERROR_STOP is set by scripts/test-db.mjs).
--
-- These are behavioural tests, not snapshots: they log in as the real roles and check
-- what the database lets them see and do. The seed scenarios are the fixtures.

create or replace function pg_temp.assert_true(cond boolean, msg text)
returns void
language plpgsql
as $$
begin
  if cond is not true then
    raise exception 'ASSERTION FAILED: %', msg;
  end if;
end;
$$;

-- ── 1. Structure: RLS is on, forced, and every table has a policy ────────────────────

do $$
declare
  r record;
  v_tables integer := 0;
begin
  for r in
    select c.oid, n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname in ('public', 'builder')
       and c.relkind = 'r'
     order by n.nspname, c.relname
  loop
    v_tables := v_tables + 1;
    perform pg_temp.assert_true(r.relrowsecurity,
      format('RLS is not enabled on %I.%I', r.nspname, r.relname));
    perform pg_temp.assert_true(r.relforcerowsecurity,
      format('RLS is not forced on %I.%I', r.nspname, r.relname));
    perform pg_temp.assert_true(
      exists (select 1 from pg_policy p where p.polrelid = r.oid),
      format('%I.%I has RLS but no policy (deny-all is a bug)', r.nspname, r.relname));
  end loop;

  perform pg_temp.assert_true(v_tables >= 9,
    format('expected at least 9 tables, found %s', v_tables));
end;
$$;

-- Every SECURITY DEFINER function pins search_path.
do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, p.proconfig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'builder', 'private')
       and p.prosecdef
  loop
    perform pg_temp.assert_true(
      r.proconfig is not null
      and exists (select 1 from unnest(r.proconfig) cfg where cfg like 'search_path=%'),
      format('SECURITY DEFINER function %I.%I() does not pin search_path', r.nspname, r.proname));
  end loop;
end;
$$;

-- No SECURITY DEFINER function in an exposed schema is executable by anon.
do $$
declare
  r record;
begin
  for r in
    select n.nspname, p.proname, p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'builder')
       and p.prosecdef
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    raise exception 'ASSERTION FAILED: anon can execute %.%()', r.nspname, r.proname;
  end loop;
end;
$$;

do $$
begin
  perform pg_temp.assert_true(
    not has_function_privilege('authenticated', 'builder._run_stall_detector(text)', 'execute'),
    'authenticated must not be able to call the detector internals');
  perform pg_temp.assert_true(
    not has_function_privilege('anon', 'builder.run_stall_detector_now()', 'execute'),
    'anon must not be able to call the staff RPC');
  perform pg_temp.assert_true(
    (select reloptions @> array['security_invoker=true']
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'builder' and c.relname = 'v_project_status'),
    'v_project_status must be security_invoker');
end;
$$;

-- ── 2. The seed's stall scenarios ────────────────────────────────────────────────────

do $$
declare
  v_names text;
begin
  select string_agg(name, ',' order by name)
    into v_names
    from builder.v_project_status
   where is_stalled;

  perform pg_temp.assert_true(v_names = 'Lot 12,Unit 4B,Unit 7C',
    format('stalled set should be Lot 12,Unit 4B,Unit 7C but was %s', v_names));

  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Lot 14') = false,
    'Lot 14 had builder activity yesterday and must not be stalled');
  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Lot 3') = false,
    'archived Lot 3 must not be stalled');
  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Lot 15') = false,
    'Lot 15 is in revision and must not be stalled');
end;
$$;

-- ── 3. Test users and memberships (the auth mirror must populate public.users) ───────

insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'staff@stallwatch.test'),
  ('22222222-2222-2222-2222-222222222222', 'ana@builder-a.test'),
  ('33333333-3333-3333-3333-333333333333', 'bruno@builder-b.test'),
  ('44444444-4444-4444-4444-444444444444', 'mia@builder-a.test')
on conflict (id) do nothing;

do $$
declare
  v_users integer;
begin
  select count(*) into v_users
    from public.users
   where email in ('staff@stallwatch.test', 'ana@builder-a.test',
                   'bruno@builder-b.test', 'mia@builder-a.test');
  perform pg_temp.assert_true(v_users = 4,
    format('auth mirror should create 4 public.users rows, found %s', v_users));
end;
$$;

insert into public.memberships (user_id, org_id, role) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-0000000000f0', 'admin'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-0000000000a0', 'admin'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-0000000000b0', 'admin'),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-0000000000a0', 'admin')
on conflict (user_id, org_id) do nothing;

-- ── 4. Detector run #1: flags three projects, alerts Builder A x2 and Builder B x1 ───

select builder._run_stall_detector('scheduled');

do $$
declare
  r record;
  v_lot12_message text;
begin
  select * into r from builder.job_runs order by started_at desc limit 1;
  perform pg_temp.assert_true(r.status = 'succeeded', 'run #1 should succeed');
  perform pg_temp.assert_true(r.projects_flagged = 3,
    format('run #1 should flag 3 projects, flagged %s', r.projects_flagged));
  perform pg_temp.assert_true(r.alerts_created = 4,
    format('run #1 should create 4 alerts (2 Builder A admins + 1 per B project), created %s', r.alerts_created));

  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'stall') = 4,
    'there should be four stall alerts');

  perform pg_temp.assert_true(
    (select count(*) from builder.alerts
      where kind = 'stall' and user_id = '22222222-2222-2222-2222-222222222222') = 1,
    'Ana should get exactly one alert (Lot 12)');
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts
      where kind = 'stall' and user_id = '44444444-4444-4444-4444-444444444444') = 1,
    'Mia should get exactly one alert (Lot 12)');
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts
      where kind = 'stall' and user_id = '33333333-3333-3333-3333-333333333333') = 2,
    'Bruno should get two alerts (Unit 4B and Unit 7C)');

  select message into v_lot12_message
    from builder.alerts a
    join builder.projects p on p.id = a.project_id
   where p.name = 'Lot 12'
     and a.user_id = '22222222-2222-2222-2222-222222222222';

  perform pg_temp.assert_true(
    v_lot12_message = 'Lot 12 has had no builder activity for 7 days. 3 slots are still empty.',
    format('unexpected Lot 12 message: %s', v_lot12_message));
end;
$$;

-- ── 5. Run #2: idempotent ────────────────────────────────────────────────────────────

select builder._run_stall_detector('scheduled');

do $$
declare
  r record;
begin
  select * into r from builder.job_runs order by started_at desc limit 1;
  perform pg_temp.assert_true(r.status = 'succeeded', 'run #2 should succeed');
  perform pg_temp.assert_true(r.projects_flagged = 3, 'run #2 should still flag 3 projects');
  perform pg_temp.assert_true(r.alerts_created = 0,
    format('run #2 must create no duplicate alerts, created %s', r.alerts_created));
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'stall') = 4,
    'running twice must not duplicate alerts');
end;
$$;

-- ── 6. Staff can run it on demand; builders and anon cannot ──────────────────────────

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select builder.run_stall_detector_now();
commit;

do $$
declare
  r record;
begin
  select * into r from builder.job_runs order by started_at desc limit 1;
  perform pg_temp.assert_true(r.trigger_kind = 'manual', 'the on-demand run should be manual');
  perform pg_temp.assert_true(r.status = 'succeeded', 'the on-demand run should succeed');
  perform pg_temp.assert_true(r.alerts_created = 0, 'the on-demand run should create no new alerts');
end;
$$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  begin
    perform builder.run_stall_detector_now();
    raise exception 'ASSERTION FAILED: a builder was able to run the detector';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;

begin;
set local role anon;
do $$
begin
  begin
    perform count(*) from builder.projects;
    raise exception 'ASSERTION FAILED: anon could read builder.projects';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- ── 7. Builder A cannot read or write Builder B's data ──────────────────────────────

-- Capture a Builder B slot id before switching to the authenticated role.
select set_config(
  'test.unit4b_countertop',
  (select ps.id::text
     from builder.project_slots ps
     join builder.projects p on p.id = ps.project_id
    where p.name = 'Unit 4B' and ps.category = 'Countertop'),
  false
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from builder.projects
   where org_id = '00000000-0000-0000-0000-0000000000b0';
  perform pg_temp.assert_true(v_count = 0, 'Ana must not see Builder B projects');

  select count(*) into v_count from builder.projects;
  perform pg_temp.assert_true(v_count = 5, format('Ana should see her 5 projects, saw %s', v_count));

  select count(*) into v_count
    from builder.v_project_status
   where org_name = 'Builder B';
  perform pg_temp.assert_true(v_count = 0, 'Ana must not see Builder B through the view');

  select count(*) into v_count from builder.job_runs;
  perform pg_temp.assert_true(v_count = 0, 'a builder must not see the detector run log');

  begin
    insert into builder.selections (org_id, slot_id, product_name, selected_by)
    values (
      '00000000-0000-0000-0000-0000000000a0',
      current_setting('test.unit4b_countertop')::uuid,
      'Hijacked product',
      '22222222-2222-2222-2222-222222222222'
    );
    raise exception 'ASSERTION FAILED: cross-tenant selection insert succeeded';
  exception
    when foreign_key_violation or insufficient_privilege then null;
  end;

  begin
    delete from builder.selection_history;
    raise exception 'ASSERTION FAILED: a builder could delete history';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- ── 8. Staff activity must not reset the quiet clock (Unit 7C) ───────────────────────

select set_config(
  'test.unit7c_faucet',
  (select ps.id::text
     from builder.project_slots ps
     join builder.projects p on p.id = ps.project_id
    where p.name = 'Unit 7C' and ps.category = 'Faucet'),
  false
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
insert into builder.selections (org_id, slot_id, product_name, selected_by)
values (
  '00000000-0000-0000-0000-0000000000b0',
  current_setting('test.unit7c_faucet')::uuid,
  'Staff pick',
  '11111111-1111-1111-1111-111111111111'
);
commit;

do $$
declare
  v_kind text;
begin
  select actor_kind into v_kind
    from builder.selection_history
   where slot_id = current_setting('test.unit7c_faucet')::uuid
   order by changed_at desc
   limit 1;

  perform pg_temp.assert_true(v_kind = 'staff',
    format('the library should record staff activity as staff, got %s', v_kind));
  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Unit 7C'),
    'a staff edit must not un-stall Unit 7C');
  perform pg_temp.assert_true(
    (select days_quiet from builder.v_project_status where name = 'Unit 7C') >= 9,
    'a staff edit must not move the builder quiet clock');
end;
$$;

select builder._run_stall_detector('scheduled');

do $$
declare
  v_alert_count integer;
begin
  select count(*) into v_alert_count
    from builder.alerts a
    join builder.projects p on p.id = a.project_id
   where p.name = 'Unit 7C';
  perform pg_temp.assert_true(v_alert_count = 1,
    format('staff activity must not create another Unit 7C alert, found %s', v_alert_count));
end;
$$;

-- ── 9. Builder activity un-stalls; going quiet again creates a new alert ────────────

select set_config(
  'test.lot12_wall_tile',
  (select ps.id::text
     from builder.project_slots ps
     join builder.projects p on p.id = ps.project_id
    where p.name = 'Lot 12' and ps.room = 'Primary Bath' and ps.category = 'Wall Tile'),
  false
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into builder.selections (org_id, slot_id, product_name, selected_by)
values (
  '00000000-0000-0000-0000-0000000000a0',
  current_setting('test.lot12_wall_tile')::uuid,
  'Fresh tile',
  '22222222-2222-2222-2222-222222222222'
);
commit;

do $$
begin
  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Lot 12') = false,
    'Lot 12 must stop being stalled the moment a builder selects');
  perform pg_temp.assert_true(
    (select actor_kind
       from builder.selection_history
      where slot_id = current_setting('test.lot12_wall_tile')::uuid
      order by changed_at desc limit 1) = 'builder',
    'a builder write must be recorded as builder');
end;
$$;

select builder._run_stall_detector('scheduled');

do $$
begin
  perform pg_temp.assert_true(
    (select alerts_created from builder.job_runs order by started_at desc limit 1) = 0,
    'a project that just became active must not alert');
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'stall') = 4,
    'the un-stall must not remove or duplicate existing alerts');
end;
$$;

-- Time travel, test-only: move the new history row six days into the past so the
-- project has been quiet long enough to count as a new stall. Nothing in the app can
-- write history, so this is a fixture operation, not a supported path.
update builder.selection_history
   set changed_at = now() - interval '6 days'
 where slot_id = current_setting('test.lot12_wall_tile')::uuid;

do $$
begin
  perform pg_temp.assert_true(
    (select is_stalled from builder.v_project_status where name = 'Lot 12'),
    'Lot 12 should stall again after six quiet days');
end;
$$;

select builder._run_stall_detector('scheduled');

do $$
declare
  v_lot12 integer;
  v_distinct_keys integer;
begin
  select count(*) into v_lot12
    from builder.alerts a
    join builder.projects p on p.id = a.project_id
   where p.name = 'Lot 12';
  perform pg_temp.assert_true(v_lot12 = 4,
    format('a re-stall should add 2 alerts to Lot 12 (2 old + 2 new), found %s', v_lot12));

  select count(distinct dedupe_key) into v_distinct_keys
    from builder.alerts a
    join builder.projects p on p.id = a.project_id
   where p.name = 'Lot 12';
  perform pg_temp.assert_true(v_distinct_keys = 2,
    'the old and new stalls must have distinct dedupe keys');
end;
$$;

-- ── 10. Bonus: late-change alert goes to staff, once, and is read-only otherwise ────

select set_config(
  'test.lot15_countertop',
  (select s.id::text
     from builder.selections s
     join builder.project_slots ps on ps.id = s.slot_id
     join builder.projects p on p.id = ps.project_id
    where p.name = 'Lot 15' and ps.room = 'Kitchen' and ps.category = 'Countertop'),
  false
);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
update builder.selections
   set product_name = 'New Granite',
       selected_by = '22222222-2222-2222-2222-222222222222'
 where id = current_setting('test.lot15_countertop')::uuid;
commit;

do $$
declare
  v_message text;
  v_recipient uuid;
begin
  select message, user_id into v_message, v_recipient
    from builder.alerts
   where kind = 'late_change';

  perform pg_temp.assert_true(v_recipient = '11111111-1111-1111-1111-111111111111',
    'the late-change alert must go to the staff user');
  perform pg_temp.assert_true(
    v_message = 'Builder A changed Kitchen – Countertop on Lot 15 after revision.',
    format('unexpected late-change message: %s', v_message));
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'late_change') = 1,
    'one history row must produce exactly one late-change alert');
end;
$$;

-- Ana must not see the staff alert; staff must see only their own.
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'late_change') = 0,
    'a builder must not read a staff alert');
end;
$$;
rollback;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
begin
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'late_change') = 1,
    'staff should see their own late-change alert');
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where user_id = '22222222-2222-2222-2222-222222222222') = 0,
    'staff must not read other users'' alerts');
end;
$$;

update builder.alerts set read_at = now() where kind = 'late_change';

do $$
begin
  perform pg_temp.assert_true(
    (select read_at is not null from builder.alerts where kind = 'late_change'),
    'marking an alert read should set read_at');
end;
$$;

do $$
begin
  begin
    update builder.alerts set message = 'tampered' where kind = 'late_change';
    raise exception 'ASSERTION FAILED: staff could update an alert message';
  exception
    when insufficient_privilege then null;
  end;
end;
$$;
rollback;

-- ── 11. Alarm counts add up ──────────────────────────────────────────────────────────

do $$
begin
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'stall') = 6,
    'six stall alerts after the second Lot 12 stall');
  perform pg_temp.assert_true(
    (select count(*) from builder.alerts where kind = 'late_change') = 1,
    'one late-change alert');
  perform pg_temp.assert_true(
    (select count(*) from builder.job_runs) = 6,
    format('six detector runs should be logged, found %s',
           (select count(*) from builder.job_runs)));
end;
$$;
