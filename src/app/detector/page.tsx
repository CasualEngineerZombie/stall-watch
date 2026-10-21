import { notFound } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getSession } from "@/lib/session";
import type { JobRunRow } from "@/lib/types";
import { runDetectorNow } from "./actions";

export const dynamic = "force-dynamic";

function statusBadge(status: JobRunRow["status"]) {
  if (status === "succeeded") return "badge badge-ok";
  if (status === "failed") return "badge badge-stalled";
  return "badge badge-info";
}

export default async function DetectorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ran?: string }>;
}) {
  const { error: flashError, ran } = await searchParams;
  const { supabase, memberships, isStaff } = await getSession();

  if (!memberships.length) {
    return <NoAccess />;
  }

  if (!isStaff) {
    notFound();
  }

  const [{ data: runsData, error }, { count: stalledCount }] = await Promise.all([
    supabase
      .schema("builder")
      .from("job_runs")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(50),
    supabase
      .schema("builder")
      .from("v_project_status")
      .select("*", { count: "exact", head: true })
      .eq("is_stalled", true),
  ]);

  const runs = (runsData ?? []) as JobRunRow[];
  const lastRun = runs[0];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Detector</h1>
          <p className="muted">
            Stall Watch runs daily and alerts each builder&apos;s admins. You can
            also run it now.
          </p>
        </div>
        <form action={runDetectorNow}>
          <button type="submit" className="btn btn-primary">
            Run now
          </button>
        </form>
      </div>

      {flashError ? (
        <p className="notice notice-error" role="alert">
          {flashError}
        </p>
      ) : null}
      {ran ? (
        <p className="notice notice-success" role="status">
          Run finished. The history below has the outcome.
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-error" role="alert">
          Could not load the run history: {error.message}
        </p>
      ) : null}

      <div className="stat-row">
        <div className="card stat-card">
          <span className="stat-label">Stalled right now</span>
          <span className="stat-number">{stalledCount ?? 0}</span>
          <span className="muted small">Across every builder</span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Last run</span>
          <span className="stat-number">
            {lastRun ? lastRun.status : "—"}
          </span>
          <span className="muted small">
            {lastRun ? formatDateTime(lastRun.started_at) : "Never run"}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Schedule</span>
          <span className="stat-number">02:00 UTC</span>
          <span className="muted small">Daily, via pg_cron</span>
        </div>
      </div>

      <section className="card table-card">
        <div className="slot-head">
          <h2>Run history</h2>
          <span className="muted small">Newest first · last 50 runs</span>
        </div>

        {runs.length === 0 ? (
          <p className="muted empty-inline">
            No runs recorded yet. Use <strong>Run now</strong> to start one.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Trigger</th>
                <th>Status</th>
                <th>Flagged</th>
                <th>Alerts</th>
                <th>Duration</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.id} className={run.status === "failed" ? "row-failed" : undefined}>
                  <td>{formatDateTime(run.started_at)}</td>
                  <td>{run.trigger_kind}</td>
                  <td>
                    <span className={statusBadge(run.status)}>{run.status}</span>
                  </td>
                  <td>{run.projects_flagged}</td>
                  <td>{run.alerts_created}</td>
                  <td>{formatDuration(run.started_at, run.finished_at)}</td>
                  <td className="error-cell">
                    {run.error_message ? (
                      <span title={run.error_message}>{run.error_message}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="muted small">
        Automatic runs need pg_cron enabled in Supabase. If it is not, this page
        still works and <strong>Run now</strong> still runs the detector. See
        SETUP.md.
      </p>
    </main>
  );
}
