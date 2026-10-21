# AGENTS.md

Guidance for coding agents working in this repository. Read `DESIGN.md` first — it
explains the product and why the database is shaped the way it is. `SETUP.md` explains
how to rebuild the environment. `MIGRATIONS.md` is the migration ledger.

## What this is

Stall Watch: a Next.js (App Router) + TypeScript app on Supabase. Builders pick finishes
for their projects; a scheduled detector flags projects in `selection_phase` that still
have empty slots and have had no **builder** activity for 5+ days, and creates in-app
alerts for the builder's admins.

## Commands

```bash
npm run dev          # local dev server (needs .env.local)
npm run build        # production build (must pass in CI)
npm run lint         # ESLint, flat config
npm run typecheck    # tsc --noEmit
npm run test:db      # applies migrations + seed + SQL tests to a local Postgres
```

`test:db` requires `psql` on PATH and a disposable database; see
`supabase/tests/README.md`. CI runs the equivalent in `.github/workflows/ci.yml`.

Do not add a service-role key, connection string or any secret to the repo, `.env.example`,
Vercel, or a migration. The only app credentials are the two `NEXT_PUBLIC_*` values.

## Map

```
src/app/login/            email + password sign-in
src/app/projects/         live stalled list; project detail + selection writes
src/app/alerts/           own alerts, mark read
src/app/detector/         staff-only run history + Run now
src/app/*/actions.ts      server actions (auth, selection, alerts, detector)
src/lib/supabase/         SSR client + middleware session refresh
src/lib/session.ts        current user + membership/role lookup
src/lib/types.ts          row types used by the UI
supabase/migrations/      the entire schema; source of truth
supabase/tests/           bootstrap + SQL assertions run in CI
```

Everything is a Server Component unless a file says `"use client"`. Protected data is
read on the server with the cookie-bound Supabase client, so Postgres RLS applies as the
signed-in user. Never fetch protected rows from the browser and never "filter by org" in
JavaScript — the policy is the filter.

## Non-negotiables (these are graded)

1. **Schema changes only via `supabase/migrations/`.** Never the dashboard, never ad-hoc
   SQL. New file name: `YYYYMMDDHHMMSS_snake_case_description.sql`. One logical change
   per file. Add a row to `MIGRATIONS.md`. Header must contain `WHY`, `WHAT`, and
   `ROLLBACK`.
2. **RLS on every table in `public` and `builder`: ENABLE and FORCE**, plus at least one
   policy. No policy is a bug, not a lockdown.
3. Org scope is `org_id = any (private.current_user_org_ids()) or private.is_staff()`.
   Every `INSERT`/`UPDATE` policy needs a matching `WITH CHECK`. A writable table also
   needs a `SELECT` policy.
4. **Children cannot disagree with their parent's org.** Keep the composite foreign keys:
   `selections (slot_id, org_id) → project_slots (id, org_id)`,
   `selection_history (slot_id, org_id) → project_slots (id, org_id)`,
   `alerts (project_id, org_id) → projects (id, org_id)`. Do not "simplify" them to a
   single-column FK plus an org policy.
5. `selection_history` is append-only: no grants and no policies for insert/update/delete.
   The `SECURITY DEFINER` trigger writes it. `actor_kind` is derived from memberships by
   that trigger — never accept it from the client.
6. `alerts` is narrower than org scope: `user_id = auth.uid()` only, and the only column
   `authenticated` may update is `read_at` (column grant). Staff must not read other
   people's alerts.
7. `job_runs` has no `org_id`; it is staff-only via `private.is_staff()`.
8. **Every `SECURITY DEFINER` function** sets `search_path = ''`, schema-qualifies every
   name, is revoked from `public` and `anon`, grants execute only to the roles that need
   it, and checks its caller in-body if `authenticated` can call it. Detector internals
   are revoked from `authenticated` too. The RLS helpers are the narrow exception: they
   only return the caller's own facts.
9. `created_at`, `updated_at`, `lock_version int not null default 0` on mutable business
   tables; the shared `private.touch_row()` trigger stamps updates. History and log
   tables may skip `updated_at`/`lock_version`.
10. Statuses/kinds are `text` + `check (...)`, not enums. Policies are
    `p_<table>_<command>`. Triggers are `trg_<what>`. Primary keys are
    `uuid default gen_random_uuid()`.
11. Views in exposed schemas are `security_invoker`. `create or replace view` silently
    drops the setting — always re-apply `alter view ... set (security_invoker = true)`.
12. No hard deletes for business records. Projects are archived. Clearing a selection
    deletes only its current-state row; history keeps the `clear`.

## The stall rule: one definition

`builder.v_project_status` owns the rule. `builder._run_stall_detector` selects
`where is_stalled` from that view. Do not duplicate the logic in TypeScript or in a
second SQL expression. If the rule changes, change the view, add a migration, and update
`supabase/tests/stall_detector_test.sql`.

Quiet anchor = `greatest(last builder history event, selection_phase_started_at)`,
`null` means never stalled. A project stalls when: `status = 'selection_phase'`, not
archived, at least one empty slot, and `now() - anchor >= 5 days`.

Duplicate prevention is the unique index `(project_id, kind, dedupe_key, user_id)` on
`builder.alerts` plus `on conflict do nothing`. `user_id` is part of the key because one
stall alerts several admins. For stalls, `dedupe_key` is the anchor timestamp; do not
replace it with "did a run happen today".

## Failure semantics

The detector inserts its `job_runs` row **before** the work and catches errors inside a
sub-block. It records `status = 'failed'` and `error_message`, then returns normally.
Do not re-raise: the raise would abort the transaction and delete the failure row. Do not
move the run-row insert inside the sub-block.

## Conventions

- Server actions validate input, derive `org_id` from the database (never from the
  form), and set `selected_by = auth.uid()`. Revalidate the affected path after a write.
- Use the generated-ish row types in `src/lib/types.ts`; do not use `any`.
- Keep UI plain and server-rendered. No client-side Supabase calls for protected data.
- SQL: snake_case, lowercase keywords, explicit schemas, comments explain *why*.
- Commits: conventional commits (`feat(stall): ...`, `fix(rls): ...`). Small and
  logical, not one dump.

## Definition of done

- `npm run lint && npm run typecheck && npm run build` pass.
- `npm run test:db` passes on a fresh database, including: Builder A cannot read or
  write Builder B's rows; the detector is idempotent; a builder cannot run it; staff
  activity does not reset the quiet clock.
- RLS is enabled and forced on every `public`/`builder` table, verified by query, not by
  eyeballing the migration.
- No secrets in the diff; no service-role key anywhere.
- `DESIGN.md` and `MIGRATIONS.md` updated if the change alters a decision or the schema.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
