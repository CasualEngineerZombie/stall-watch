# Database tests

These are behavioural tests, not snapshots. They create the real Supabase-shaped roles,
apply the real migrations and the provided seed, then sign in as those roles
(`set role authenticated` plus `request.jwt.claim.sub`) and assert what the database
lets them see and do.

## Run

From the repository root:

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stall_test npm run test:db
```

`scripts/test-db.mjs` runs, against an existing **empty** database:

1. `00_bootstrap.sql` — a minimal `auth` schema, `auth.users`, `auth.uid()`, and the
   `anon`/`authenticated` roles. This file is a test fixture; it is **never** applied to a
   Supabase project (Supabase already has all of it).
2. Every `supabase/migrations/*.sql` in filename order.
3. `supabase/seed.sql` — the provided fixtures and the expected stall scenarios.
4. `stall_detector_test.sql` — the assertions.

`psql` must be on `PATH` (override with `PSQL`), and `ON_ERROR_STOP=1` is set, so the first
failed assertion fails the run. The seed requires the database owner because it temporarily
disables the two insert-side history triggers while it loads; the CI service runs as
`postgres`.

## What is covered

- Every table in `public`/`builder` has RLS enabled **and forced**, and at least one
  policy. No table is left deny-all by accident.
- Every `SECURITY DEFINER` function pins `search_path`; none is executable by `anon`;
  detector internals are not executable by `authenticated`.
- Builder A cannot read or write Builder B's rows at the Data API boundary, including a
  forged `org_id` and a selection pointing at another org's slot.
- Staff see all orgs; a builder cannot read `job_runs` or run the detector RPC.
- `selection_history` is not writable by `authenticated`; `actor_kind` is derived by the
  trigger, and a staff edit is recorded as `staff`.
- The stalled set is exactly **Lot 12, Unit 4B, Unit 7C**, including the Unit 7C trap
  (recent staff activity must not reset the builder's quiet clock).
- The detector creates one alert per builder admin, is idempotent on a second run, records
  `projects_flagged` separately from `alerts_created`, creates a new alert after a
  re-stall, and keeps a `failed` run row with its error while rolling back half-written
  alerts.
- A builder change on a `revision` project creates a staff `late_change` alert; a staff
  change does not.
- `authenticated` can update `alerts.read_at` but not `message`, `user_id` or `read_at`
  on someone else's row.

## Add a test

Append to `stall_detector_test.sql` using `pg_temp.assert_true(condition, message)`.
If the stall rule itself changes, change `builder.v_project_status` in a new migration and
update the expectations here in the same commit. The tests must pass on a fresh database,
not on one that already has state from a previous run.
