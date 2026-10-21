import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { formatDateTime } from "@/lib/format";
import { getSession } from "@/lib/session";
import type { AlertRow } from "@/lib/types";
import { markAllRead, markRead } from "./actions";

export const dynamic = "force-dynamic";

export default async function AlertsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error: flashError } = await searchParams;
  const { supabase, memberships } = await getSession();

  if (!memberships.length) {
    return <NoAccess />;
  }

  const { data, error } = await supabase
    .schema("builder")
    .from("alerts")
    .select("id, kind, message, read_at, created_at, project_id")
    .order("created_at", { ascending: false });

  const alerts = (data ?? []) as AlertRow[];
  const unread = alerts.filter((alert) => !alert.read_at).length;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted">
            {unread === 0
              ? "Nothing unread."
              : `${unread} unread ${unread === 1 ? "alert" : "alerts"}.`}
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button type="submit" className="btn">
              Mark all as read
            </button>
          </form>
        ) : null}
      </div>

      {flashError ? (
        <p className="notice notice-error" role="alert">
          {flashError}
        </p>
      ) : null}
      {error ? (
        <p className="notice notice-error" role="alert">
          Could not load alerts: {error.message}
        </p>
      ) : null}

      {alerts.length === 0 ? (
        <div className="card empty-card">
          <h2>No alerts</h2>
          <p className="muted">
            You are all caught up. Alerts appear here when a project goes quiet,
            or when a builder changes a finish after revision.
          </p>
        </div>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert) => (
            <li
              key={alert.id}
              className={alert.read_at ? "card alert is-read" : "card alert"}
            >
              <div className="alert-head">
                <span
                  className={
                    alert.kind === "stall"
                      ? "badge badge-stalled"
                      : "badge badge-info"
                  }
                >
                  {alert.kind === "stall" ? "Stall" : "Late change"}
                </span>
                <span className="muted small">
                  {formatDateTime(alert.created_at)}
                </span>
              </div>

              <p className="alert-message">{alert.message}</p>

              <div className="alert-actions">
                <Link href={`/projects/${alert.project_id}`} className="text-link">
                  Open project
                </Link>
                {alert.read_at ? (
                  <span className="muted small">Read</span>
                ) : (
                  <form action={markRead.bind(null, alert.id)}>
                    <button type="submit" className="btn btn-small btn-ghost">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
