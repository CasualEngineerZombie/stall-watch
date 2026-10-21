# Migration ledger

Every schema change lives in `supabase/migrations/` and is listed here. Files are numbered
`YYYYMMDDHHMMSS_snake_case_description.sql` and are applied in filename order. Each file
starts with `WHY`, `WHAT` and `ROLLBACK`; the table below is the index, not a replacement
for those headers.

Never change an applied migration. Add a new one, and add a row here in the same commit.

| # | Migration | What it does | Rollback |
| --- | --- | --- | --- |
| 1 | `20251021090000_create_schemas.sql` | Creates `builder` (exposed, RLS) and `private` (never exposed). Grants usage to `authenticated` only. | `drop schema builder cascade; drop schema private cascade;` |
| 2 | `20251021090500_public_identity_tables.sql` | `public.orgs`, `public.users`, `public.memberships`; `private.touch_row()` and its triggers. | Drop the three tables, then `private.touch_row()`. |
| 3 | `20251021091000_private_rls_helpers.sql` | `private.current_user_org_ids()` and `private.is_staff()` — the only definer functions that return the caller's own facts without an in-body caller check. | Drop both functions. |
| 4 | `20251021091500_public_identity_rls.sql` | Enables and forces RLS on the identity tables; members read their own memberships, staff read all; no write policies (setup SQL owns writes). | Drop policies; tables stay. |
| 5 | `20251021092000_auth_mirror_trigger.sql` | `private.sync_auth_user()` + `trg_auth_users_mirror` on `auth.users`. The only writer of `public.users`. | Drop trigger, then function. |
| 6 | `20251021092500_builder_projects_and_slots.sql` | `builder.projects` and `builder.project_slots`, composite keys `(id, org_id)`, org RLS, grants. | Drop slots, then projects. |
| 7 | `20251021093000_builder_selections_and_history.sql` | `selections` (one per slot) + append-only `selection_history`; history trigger derives `actor_kind`; read-only history grants. | Drop history, selections, then the trigger function. |
| 8 | `20251021094000_builder_alerts.sql` | `builder.alerts`, recipient-scoped RLS, column grant `update (read_at)`, unique `(project_id, kind, dedupe_key, user_id)`, composite project FK. | `drop table builder.alerts;` |
| 9 | `20251021095000_builder_job_runs.sql` | `builder.job_runs`, no `org_id`, staff-only select policy. | `drop table builder.job_runs;` |
| 10 | `20251021096000_project_status_view.sql` | `builder.v_project_status` — the single stall definition, counts and quiet anchor; `security_invoker`. | `drop view builder.v_project_status;` |
| 11 | `20251021097000_stall_detector_function.sql` | `builder._run_stall_detector(text)` — definer, revoked from every API role, run-row before work, no re-raise. | Drop the function. |
| 12 | `20251021098000_stall_detector_rpc.sql` | `builder.run_stall_detector_now()` — authenticated execute, in-body `private.is_staff()` check. | Drop the function. |
| 13 | `20251021099000_stall_detector_schedule.sql` | pg_cron job `stall_watch_detector`, daily 02:00 UTC. No-op with a notice when the extension is absent. | `select cron.unschedule('stall_watch_detector');` |
| 14 | `20251021100000_late_change_alerts.sql` | Bonus: `private.alert_late_change()` + `trg_history_late_change`, fans out to staff on a builder change after revision, dedupe per history row. | Drop trigger, then function. |
| 15 | `20251021101000_selection_history_uuid_primary_key.sql` | Replaces `selection_history`'s bigint identity primary key with a UUID default `gen_random_uuid()`, matching every other business table. | Lossy; restore the table from a pre-migration backup. |
| 16 | `20251021102000_harden_rls_auto_enable.sql` | If Supabase's platform-managed `public.rls_auto_enable()` event-trigger helper is installed, pins `search_path = ''` and revokes `EXECUTE` from `public`, `anon` and `authenticated`. | Restore `search_path = pg_catalog` and grant execute to `public`. |

## Rules for the next change

1. One logical change per file. Do not edit an existing file.
2. New table in `public` or `builder`: `enable row level security`, `force row level
   security`, at least one policy, and explicit grants (`revoke all ... from anon` first).
3. Org-scoped policies use `org_id = any (private.current_user_org_ids()) or
   private.is_staff()`, with a matching `with check` on insert/update.
4. Keep the composite foreign keys that stop a child row disagreeing with its parent's
   org. Do not replace them with a single-column FK plus an org policy.
5. Every `SECURITY DEFINER` function: `set search_path = ''`, schema-qualified names,
   revoked from `public`/`anon`, in-body caller check if `authenticated` may execute it.
6. A view in an exposed schema needs `security_invoker = true`, re-applied after any
   `create or replace view`.
7. Add the row above in the same commit, and run `npm run test:db`.

If a change alters a decision (not just the schema), update `DESIGN.md` too.
