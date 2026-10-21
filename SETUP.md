# Setup — rebuild from zero

This is the literal path from an empty machine to a working Stall Watch. There are two
ways to get the database: a hosted Supabase project (what Vercel uses) or the local
Supabase stack. Both use the same migrations and the same seed.

The only app credentials are `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. There is no service-role key in this repository, in the
app, or in Vercel.

## 0. Prerequisites

- Node.js 22+ and npm
- A Supabase account, or Docker Desktop for the local stack
- The Supabase CLI (`npm install -g supabase`) for the migration commands
- `psql` only if you use the bare-Postgres test path in section 6

```bash
npm ci
```

## 1. Create the Supabase project

1. Create a project at <https://supabase.com/dashboard>. Save the database password in a
   password manager; never commit it.
2. Project Settings → API: copy **Project URL** and **anon public** key.
3. Project Settings → Database → Connection string: copy the URI (session pooler is
   fine). This is only for `psql`/`db push` from your machine, not for the app.

If you prefer everything local, skip to section 7 and come back to section 5 for the env
file.

## 2. Link and push the schema

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push --include-seed
```

`db push` applies every file in `supabase/migrations/` in filename order and records them
in `supabase_migrations.schema_migrations`. `--include-seed` then runs `supabase/seed.sql`.

If your CLI version rejects `--include-seed`, run the seed yourself as the owner:

```bash
psql "postgresql://postgres:<password>@<host>:5432/postgres" -v ON_ERROR_STOP=1 -f supabase/seed.sql
```

The seed disables triggers for the load (`session_replication_role = replica`), so run it
as `postgres`, not through the Data API. It creates three orgs and nine projects, and
leaves `public.users` empty on purpose.

Check the schema landed:

```sql
select count(*) from builder.v_project_status;   -- 9
select name from builder.v_project_status where is_stalled order by name;
-- Lot 12, Unit 4B, Unit 7C
```

## 3. Enable pg_cron (the automatic schedule)

The detector's schedule is a database object. Enabling the extension is a dashboard step
that migrations cannot do for you.

1. Dashboard → **Database → Extensions** → enable **pg_cron**.
2. Run the schedule migration once, as the owner:

```bash
psql "postgresql://postgres:<password>@<host>:5432/postgres" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20251021099000_stall_detector_schedule.sql
```

or paste that file into the SQL editor. It is idempotent: it unschedules the old job
before creating `stall_watch_detector` (daily, `0 2 * * *`, UTC).

Confirm:

```sql
select jobname, schedule, command from cron.job where jobname = 'stall_watch_detector';
```

If pg_cron stays disabled, the app still works and staff can use **Detector → Run now**;
there is simply no automatic run. The schedule migration raises a notice instead of
failing, so a rebuild never depends on the dashboard.

## 4. Create the test users

Authentication → **Add user** → **Create new user**, ticking **Auto Confirm User**.
Create these four, each with a password you choose and do not commit:

| Email | Belongs to | Role |
| --- | --- | --- |
| `staff@stallwatch.test` | Reverie3D Studio (staff) | admin |
| `ana@builder-a.test` | Builder A | admin |
| `bruno@builder-b.test` | Builder B | admin |
| `mia@builder-a.test` | Builder A | member (optional) |

The `trg_auth_users_mirror` trigger copies each one into `public.users` automatically.

Then run `supabase/link-test-users.sql` in the SQL editor (or with `psql`). It checks that
all three required users exist in `public.users` and stops with a clear message if the
mirror trigger did not fire. It is safe to run twice.

Why not sign up in the app: there is no sign-up. Accounts are created by Reverie3D, which
matches the brief.

## 5. Point the app at the project

```bash
cp .env.example .env.local
```

Fill in the URL and anon key from section 1:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
```

Run it:

```bash
npm run dev
```

Open <http://localhost:3000>, sign in as `ana@builder-a.test`, and check:

- `/projects` shows only Builder A's five projects, with **Lot 12** marked stalled.
- `/projects/<Lot 12 id>` shows 5 of 8 slots filled and lets you set or clear a finish.
- Signing in as `bruno@builder-b.test` shows Builder B only (Unit 4B and Unit 7C stalled).
- Signing in as `staff@stallwatch.test` shows all projects plus **Detector**.
- Detector → **Run now** records a run: 3 projects flagged, 3 alerts created (Ana 1,
  Bruno 2; Mia is a member, not an admin).
- Running it again: 3 flagged, 0 new alerts. That is the dedupe working.
- As Ana, `/alerts` shows the Lot 12 stall. Mark it read.
- As Ana, change a finish on **Lot 15** (already in revision). All staff users get a
  **Late change** alert. The staff user's own edit does not create one.

## 6. Database tests without a Supabase project

The SQL suite runs on a bare Postgres 15. This validates migrations, RLS and the
detector; it cannot serve the app, because the app needs Supabase Auth.

```bash
createdb stall_test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/stall_test npm run test:db
```

The script applies `supabase/tests/00_bootstrap.sql` (a minimal `auth` schema and the
`anon`/`authenticated` roles), every migration, `seed.sql`, then
`supabase/tests/stall_detector_test.sql`. On Windows, use a database URL your `psql`
accepts, or set `PSQL` to the full path of `psql.exe`.

With Docker instead of a local Postgres:

```bash
docker run --name stallwatch-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 -d postgres:15
docker exec stallwatch-pg createdb -U postgres stall_test
```

then point `DATABASE_URL` at `localhost:55432` and run the same command.

CI runs exactly this suite in `.github/workflows/ci.yml`.

## 7. Local Supabase stack (alternative to sections 1–3)

```bash
supabase start          # pulls containers; applies migrations + seed on first start
supabase status -o env  # API URL, anon key, DB URL
```

Put the printed `API_URL` and `ANON_KEY` into `.env.local`. If you change a migration:

```bash
supabase db reset       # re-applies every migration and the seed
```

Create the four users in Studio (<http://localhost:54323>) exactly as in section 4, then
run `link-test-users.sql` in the Studio SQL editor.

For a local automatic schedule, run `create extension if not exists pg_cron;` in the SQL
editor, then run the schedule migration file. Local cron jobs only fire while the stack is
running; this is fine for a demo, and the production schedule lives in the hosted project.

## 8. Deploy to Vercel

1. Push the repository to GitHub (the PDF brief is git-ignored; do not commit it).
2. Vercel → **Add New → Project** → import the repo. Framework preset: Next.js. No build
   command changes; `npm run build` is the default.
3. Environment Variables (Production and Preview):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Deploy. These values are inlined at build time; if you change them, redeploy.
5. In Supabase → Authentication → URL Configuration, set the Site URL to the Vercel
   domain. Add `http://localhost:3000` for local development.

Do **not** add `SUPABASE_SERVICE_ROLE_KEY`, a database URL, or `CRON_SECRET`. The app
never needs them; the detector runs inside Postgres.

## 9. Rebuild checklist

- [ ] `npm ci`
- [ ] `supabase db push --include-seed` (or `supabase db reset` locally)
- [ ] pg_cron enabled, schedule migration applied
- [ ] four auth users created, `link-test-users.sql` run
- [ ] `.env.local` has exactly the two public values
- [ ] `npm run lint && npm run typecheck && npm run build`
- [ ] `npm run test:db` on a fresh database
- [ ] Vercel has the same two values, and no secrets

## Troubleshooting

**"Missing NEXT_PUBLIC_SUPABASE_URL..."** — `.env.local` is absent or the dev server was
started before it was created. Restart `npm run dev`.

**Signed in but "No access"** — the user exists in `auth.users` but has no membership.
Run `link-test-users.sql`; check `select * from public.memberships`.

**No stall alerts after Run now** — only builder-org **admins** receive stall alerts.
Check `select * from builder.job_runs order by started_at desc limit 1` and
`select * from builder.alerts order by created_at desc`.

**Run row says failed** — the error is on the row (`sqlstate: message`). The function
deliberately does not re-raise, so the row survives. Fix the cause; the next run recovers
from the data.

**Schedule never fires** — pg_cron is not enabled, or the schedule migration was applied
before the extension existed. Enable it and re-run the migration.
