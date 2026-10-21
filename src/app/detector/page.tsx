import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import { formatDateTime, formatDuration } from "@/lib/format";
import { getSession } from "@/lib/session";
import type { JobRunRow } from "@/lib/types";
import { runDetectorNow } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Detector",
};

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
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Operations</p>
          <h1>Detector</h1>
          <p className="page-lede">
            Stall Watch runs daily and alerts each builder&apos;s admins. Run it
            on demand when you need the current signal now.
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

      <div className="summary-band detector-summary">
        <div className="summary-cell">
          <span className="summary-label">Stalled right now</span>
          <span className="summary-value">{stalledCount ?? 0}</span>
          <span className="summary-note">Across every builder</span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Last run</span>
          <span className="summary-value summary-value--status">
            {lastRun ? lastRun.status : "—"}
          </span>
          <span className="summary-note">
            {lastRun ? formatDateTime(lastRun.started_at) : "Never run"}
          </span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Schedule</span>
          <span className="summary-value">02:00 UTC</span>
          <span className="summary-note">Daily, via pg_cron</span>
        </div>
      </div>

      <section className="panel run-panel" aria-labelledby="run-history-title">
        <div className="panel-head">
          <div>
            <p className="eyebrow">Log</p>
            <h2 id="run-history-title" className="section-title section-title--small">
              Run history
            </h2>
          </div>
          <span className="section-note">Newest first · last 50 runs</span>
        </div>

        {runs.length === 0 ? (
          <div className="empty-state empty-state--inline">
            <p className="eyebrow">No runs</p>
            <h2>No runs recorded yet.</h2>
            <p>
              Use <strong>Run now</strong> to start the first detector run. The
              log will keep the flag count, alerts created and any failure.
            </p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table run-table">
              <caption className="visually-hidden">Detector run history</caption>
              <thead>
                <tr>
                  <th scope="col">Started</th>
                  <th scope="col">Trigger</th>
                  <th scope="col">Status</th>
                  <th scope="col">Flagged</th>
                  <th scope="col">Alerts</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Error</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr
                    key={run.id}
                    className={run.status === "failed" ? "is-failed" : undefined}
                  >
                    <td className="run-date">{formatDateTime(run.started_at)}</td>
                    <td className="run-trigger">{run.trigger_kind}</td>
                    <td>
                      <span
                        className="run-status"
                        data-status={run.status}
                      >
                        <span className="run-status-dot" aria-hidden="true" />
                        {run.status}
                      </span>
                    </td>
                    <td className="run-number">{run.projects_flagged}</td>
                    <td className="run-number">{run.alerts_created}</td>
                    <td className="run-date">
                      {formatDuration(run.started_at, run.finished_at)}
                    </td>
                    <td className="error-cell">
                      {run.error_message ? (
                        <span title={run.error_message}>{run.error_message}</span>
                      ) : (
                        <span className="table-dash">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="footnote">
        Automatic runs need pg_cron enabled in Supabase. If it is not, this page
        still works and <strong>Run now</strong> still runs the detector. See
        SETUP.md.
      </p>
    </main>
  );
}
