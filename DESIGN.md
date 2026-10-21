Candidate: Rian Barriga
Hours spent: 7

# Stall Watch — design note

## Problem

Builders select finishes for a home in our app, then go quiet. Reverie3D staff only
notice when they happen to open the project, usually after the selection due date has
passed, which holds up ordering and construction. The cost is not the missing click; it
is that nobody is told about it. The system has to notice and tell the right people
inside the app, without anyone going looking.

## Goals

- A builder admin sees only their own org's projects, slots and selections, and can set,
  change and clear a selection. Builder B's data is invisible and unwritable, including
  at the API.
- A project shows a **live** stalled badge on `/projects` whenever the stall rule is
  true right now.
- A scheduled detector, with nobody pressing anything, creates one in-app alert per
  admin of the project's builder org. Staff can run it on demand. Running it twice, or
  two runs overlapping, does not create duplicate alerts. When a project goes quiet
  again after new builder activity, a new alert is created.
- Every run is recorded: started/finished, scheduled/manual, projects flagged, outcome.
  A failed run survives with its error message.
- Each user can read only their own alerts, and can change only `read_at`.

## Non-goals

Email/SMS and any outside notification; sign-up, invites, password reset, magic links;
CRUD screens for orgs, members and slots; styling/design-system work; optimistic
conflict handling for `lock_version` in the UI; product catalogues, file uploads or
per-slot notes. These are deliberately out of scope per the brief.

## Data and permissions

Schemas: `public` (identity/tenancy), `builder` (everything a builder touches, plus
detector internals), `private` (RLS helpers and trigger functions, not exposed).

| Table | Purpose | Tenancy |
| --- | --- | --- |
| `public.orgs` | staff org + builder orgs | `org_type in ('staff','builder')` |
| `public.users` | mirror of `auth.users` | written by trigger only |
| `public.memberships` | user ↔ org, `role` admin/member | unique (user, org) |
| `builder.projects` | one home | `org_id`, composite key `(id, org_id)` |
| `builder.project_slots` | room + category | composite FK to project |
| `builder.selections` | current pick, one per slot | composite FK `(slot_id, org_id)` |
| `builder.selection_history` | append-only set/change/clear | composite FK to slot |
| `builder.alerts` | one row per recipient | recipient `user_id`, project org |
| `builder.job_runs` | detector run log | no org; staff-only RLS |

Two things carry the security model beyond ordinary RLS:

1. **Composite foreign keys.** `(slot_id, org_id)` references
   `project_slots (id, org_id)`, and `(project_id, org_id)` references
   `projects (id, org_id)`. An org-only policy would let Builder A insert a selection
   pointing at Builder B's slot while tagging it with their own `org_id`; the composite
   FK makes that row impossible, so the policy cannot be tricked.
2. **`actor_kind` is derived, never sent.** A `SECURITY DEFINER` history trigger looks
   up whether the caller is a member of the project's builder org and writes
   `builder`/`staff` itself. If there is no `auth.uid()` (SQL editor, job) it records
   `staff`. That is what lets the stall rule ignore a staff edit (seed scenario Unit 7C)
   without the app being trusted.

`selection_history` has no insert/update/delete grant or policy for `authenticated`;
only the definer trigger writes it. `alerts` grants `update (read_at)` only, and the
policy is `user_id = auth.uid()` — narrower than org scope, so staff cannot read other
people's alerts. `job_runs` is readable by staff only (`private.is_staff()`).

`private.current_user_org_ids()` returns `uuid[]` so policies read exactly as the brief
specifies: `org_id = any (private.current_user_org_ids()) or private.is_staff()`.
Both helpers are `SECURITY DEFINER`, owned by `postgres`, with `search_path = ''`; they
work because the owner has `BYPASSRLS` on Supabase, and they only ever return the
caller's own facts.

The stalled badge is a `security_invoker` view, `builder.v_project_status`, computed
from the rule rather than stored. The detector reads the same view. One definition, so
badge and alert cannot disagree.

## The detector: what I chose and what I gave up

**Where it runs: pg_cron (Option A).** `pg_cron` calls
`builder._run_stall_detector('scheduled')` daily at 02:00 UTC. The function is
`SECURITY DEFINER` and revoked from `public`, `anon` **and** `authenticated`, so it is
unreachable over the API. Staff "Run now" calls `builder.run_stall_detector_now()`,
which is granted to `authenticated` but starts with a `private.is_staff()` check and
raises `42501` otherwise. No Vercel route, no service-role key, no shared secret to
distribute.

**What prevents duplicate alerts.** Each run recomputes the quiet anchor — the later of
the last `actor_kind = 'builder'` history event and `selection_phase_started_at` — and
uses it as the dedupe key. `alerts` has a unique index on
`(project_id, kind, dedupe_key, user_id)`, and the insert is `on conflict do nothing`.
`user_id` is in the key because a stall fans out to several admins; without it the second
admin's alert would collide with the first. Two runs
in a row produce the same key and are harmless; two overlapping runs are serialised by
a transaction-scoped advisory lock. If a run is missed entirely, the next one still
computes the same key from the data, so nothing is lost. When a builder makes a
selection, the anchor moves; if the project later goes quiet for five days, the key is
different and a new alert is correct.

**What a failure looks like.** The run row is inserted before the work, and the work
runs in a `BEGIN … EXCEPTION` sub-block. On error the sub-block's half-written alerts
roll back, the failure is recorded on the run row, and the function returns normally
instead of re-raising. Re-raising would abort the caller's transaction and take the
failure row with it — the exact trap the brief warns about. `/detector` shows the failed
run and its `sqlstate: message`.

**What I gave up.** The schedule is a database object, not a file Vercel deploys;
enabling `pg_cron` is a dashboard step (documented in SETUP.md, and the schedule
migration is a loud no-op with a notice if the extension is missing). There is no
retry/backoff queue: recovery is "the next daily run recomputes from source". And staff
cannot see the cron schedule in the app without an extra staff-guarded RPC, so
`/detector` shows the last run rather than a "next run" promise.

I considered **Vercel Cron (Option B)** and rejected it for this trial: it moves the
schedule into the app but adds a second credential (a `CRON_SECRET` whose hash must be
inserted by hand on every fresh database) and a route that is publicly reachable and
must defend itself. pg_cron keeps scheduling, authorisation and work in one trusted
place. The trade-off is that the schedule is invisible to git — it is in the migration,
but the extension is not.

I also rejected a separate `stall_state` table with a `resolved_at` column. It needs
resolution logic that only runs when the detector runs; if runs are missed across a
resolution and a re-stall, the old open row suppresses a genuinely new alert. The
history-derived anchor has no such failure mode.

## What I'd build next

**Late-change alerts** — built as the bonus. When a builder (not staff) changes a
selection on a project that is already in `revision`, every staff user gets an in-app
alert: "Builder A changed Kitchen – Countertop on Lot 12 after revision." Today that
change is legal and silent, but it can invalidate a quote or an order already placed,
so staff are the people who need to know immediately.

It is an `AFTER INSERT` trigger on `selection_history`, which is already append-only and
already knows `actor_kind`, so no new write path and no app trust. It fans out to
members of the staff org, reusing the alerts table and RLS. Dedupe is per history row
(`kind = 'late_change'`, `dedupe_key = 'history:<id>'`), so a retried trigger or a
replayed migration cannot double-alert. What I would leave out for now: per-person
subscriptions, batching/digests, and any workflow that automatically holds a purchase
order — the alert is a signal, not an enforcement.

## Sandbox vs production

In real life I would run two Supabase projects: Sandbox and Production. Migrations are
the only path between them — the same files are applied to Sandbox in CI, exercised by
the SQL test suite, and then replayed on Production after review, with a recorded
migration ledger. Vercel Preview and local dev point at Sandbox; Production points at
Production. Secrets live per environment in Vercel/Supabase, never in the repo. For this
trial there is one project, and `SETUP.md` explains how to rebuild it from zero.

## Judgement calls / rules bent

- The brief's data-model table writes `org_type (staff | admin)`, but `seed.sql` uses
  `'staff'` and `'builder'`. The seed is executable and the model table is prose, so I
  followed the seed: `org_type in ('staff','builder')`.
- I did not add a `stalls` table; the unique dedupe index on `alerts` is the record of
  "this stall has been alerted". Explained above.
- `pg_cron` is enabled through the dashboard, not a migration. The migration guards the
  `cron.schedule` call and raises a notice if the extension is absent, so a fresh
  rebuild never fails because of it. This is listed in SETUP.md.
- No rule is silently broken. `lock_version` exists and is bumped on every update, but
  the UI does not do optimistic conflict handling — the brief explicitly does not ask
  for it.
