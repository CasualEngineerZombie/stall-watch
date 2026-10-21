# Stall Watch

A small Next.js + Supabase app for Reverie3D's trial brief. Builders pick finishes for a
home; when a project sits in `selection_phase` with empty slots and no **builder**
activity for five days, a scheduled database job raises in-app alerts for that builder's
admins. Staff can see every project, run the detector on demand, and watch the run log.
As a bonus, a builder changing a finish after the project reached `revision` alerts the
staff team.

Deployment (Vercel + Supabase) is in [`SETUP.md`](./SETUP.md#8-deploy-to-vercel).

## What it does

- **Sign-in only.** Email + password against Supabase Auth. No sign-up, invites or
  password reset (out of scope).
- **Projects.** A builder sees only their org's projects, with a live stalled badge
  computed by the database, slot counts and due dates. Staff see everything.
- **Selections.** Set, change or clear the finish for a slot. Every event appends to
  `selection_history`; the app never writes history directly and never claims who acted.
- **Alerts.** Each user sees only their own alerts and can only mark them read.
- **Detector.** Staff-only page with the last 50 runs (trigger, status, projects flagged,
  alerts created, duration, error) and a **Run now** button.
- **Two alert kinds.** `stall` (no builder activity for 5 days) and `late_change`
  (builder changed a selection after revision — Part 3 bonus).

## Stack

Next.js 16 (App Router, Server Components, Server Actions) · TypeScript · Supabase
(Postgres, Auth, RLS) · `@supabase/ssr` · plain CSS. No UI framework, no client-side data
fetching, no service-role key.

## Run it

The full rebuild — Supabase project, migrations, seed, pg_cron, test users, Vercel — is in
[`SETUP.md`](./SETUP.md). The short version, once the project exists and `.env.local` has
the two public Supabase values:

```bash
npm ci
npm run dev
```

Test accounts after `link-test-users.sql`: `staff@stallwatch.test`,
`ana@builder-a.test` (Builder A admin), `bruno@builder-b.test` (Builder B admin),
`mia@builder-a.test` (Builder A member).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (flat config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:db` | Applies bootstrap + migrations + seed + SQL tests to a disposable Postgres |

## Verification

The app was exercised in a real browser (Edge via Playwright) against the local Supabase
stack: sign-in, Builder A / Builder B isolation, saving a finish, the live stalled badge
clearing after fresh activity, a first detector run (3 projects flagged, 3 alerts) and a
second run (3 flagged, 0 alerts), marking an alert read, the late-change bonus alert, and
a builder being denied `/detector` with a 404. The public surface was checked separately:
`/login` is indexable and canonical, the private routes are noindex, `/og.png` is
1200 × 630, and `/robots.txt`, `/sitemap.xml` and `/manifest.webmanifest` load without a
session. The database suite in `npm run test:db` covers the same security and detector
behaviour at the SQL boundary.

## How the pieces fit

```
Browser
  └─ Next.js server (Server Components / Server Actions)
       └─ cookie-bound Supabase client, anon key
            └─ PostgREST → Postgres RLS → data
                                   └─ pg_cron → builder._run_stall_detector()
                                                   └─ builder.v_project_status
```

There is no trusted app server in the security model. The browser holds the anon key; the
Next.js server only forwards the user's cookies; every protected query and write is
decided by Postgres policies. That is why the app never filters by org in JavaScript.

The stall rule exists in exactly one place, `builder.v_project_status`:
`status = 'selection_phase'`, not archived, at least one empty slot, and
`now() - greatest(last builder history event, selection_phase_started_at) >= 5 days`.
The badge and the detector both read it. `selections.updated_at` is deliberately not used
(a staff edit would otherwise reset a builder's quiet clock — seed case Unit 7C).

Duplicate alerts are prevented by data, not by run timing: the quiet anchor is the dedupe
key, and `builder.alerts` is unique on `(project_id, kind, dedupe_key, user_id)` with
`on conflict do nothing`. Running twice creates zero rows; a run after new builder
activity can alert the new stall. `user_id` is in the key because one stall alerts several
admins.

A failed run is recorded and **not re-raised**, so the `job_runs` row survives with
`status = 'failed'` and the SQL error. See `supabase/migrations/20251021097000_*`.

## Repo map

```
src/app/login/            email + password sign-in
src/app/projects/         live list; detail + selection writes
src/app/alerts/           own alerts, mark read
src/app/detector/         staff-only run history + Run now
src/app/*/actions.ts      server actions
src/lib/supabase/         SSR client, session refresh, env guard
src/lib/session.ts        current user + membership/role lookup
src/lib/seo.ts            public title, description, origin and index policy
src/lib/types.ts          row types used by the UI
public/brand/             handoff SVGs, icon sources and the share-card source
public/og.png             1200 × 630 Open Graph / Twitter card
src/app/robots.ts         public crawl rules; private app routes disallowed
src/app/sitemap.ts        the single public login URL
src/app/manifest.ts       installable web-app metadata
supabase/migrations/      the whole schema; source of truth
supabase/tests/           bootstrap + behavioural SQL tests
scripts/test-db.mjs       applies the above to a disposable database
```

## Database rules

The non-negotiables are in [`AGENTS.md`](./AGENTS.md) and enforced by tests:

- RLS enabled **and forced** on every `public`/`builder` table, each with a policy.
- Org scope is `org_id = any (private.current_user_org_ids()) or private.is_staff()`.
- Composite foreign keys keep children in their parent's org.
- `selection_history` is append-only; a definer trigger derives `actor_kind`.
- `alerts` is recipient-scoped (`user_id = auth.uid()`), and `authenticated` may update
  only `read_at`.
- `job_runs` is staff-only.
- Every definer function pins `search_path`, is revoked from `public`/`anon`, and checks
  its caller when `authenticated` can execute it.

Schema changes go through `supabase/migrations/` only, with a header (`WHY`/`WHAT`/
`ROLLBACK`) and a row in [`MIGRATIONS.md`](./MIGRATIONS.md).

## Detector trade-off

Scheduling runs in Postgres via pg_cron (daily, 02:00 UTC). No Vercel route, no shared
secret, no service-role key. The cost is that enabling the extension is a dashboard step,
not something the repo can do; `SETUP.md` covers it, and the app degrades to **Run now**
if it is absent. The reasoning, the rejected Vercel Cron option and the failure semantics
are in [`DESIGN.md`](./DESIGN.md).

## Deliberately out of scope

Email/SMS, sign-up and account management, org/member/slot CRUD, optimistic concurrency in
the UI, file uploads, product catalogues, and automatic purchase-order holds. The asked for the smallest thing that makes the stall visible; this is it.
