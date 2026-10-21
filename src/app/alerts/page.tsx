import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { formatDateTime } from "@/lib/format";
import { NO_INDEX } from "@/lib/seo";
import { getSession } from "@/lib/session";
import type { AlertRow } from "@/lib/types";
import { markAllRead, markRead } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Alerts",
  robots: NO_INDEX,
};

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
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">Notifications</p>
          <h1>Alerts</h1>
          <p className="page-lede">
            {unread === 0
              ? "Nothing unread. The detector and the late-change trigger will leave anything new here."
              : `${unread} unread ${unread === 1 ? "alert" : "alerts"}. Quiet projects and late finish changes land here.`}
          </p>
        </div>
        {unread > 0 ? (
          <form action={markAllRead}>
            <button type="submit" className="btn btn-outline">
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
        <section className="empty-state">
          <p className="eyebrow">No alerts</p>
          <h2>Nothing needs your attention.</h2>
          <p>
            You are all caught up. Alerts appear here when a project goes quiet,
            or when a builder changes a finish after revision.
          </p>
        </section>
      ) : (
        <ul className="alert-list">
          {alerts.map((alert) => {
            const read = Boolean(alert.read_at);

            return (
              <li
                key={alert.id}
                className={read ? "alert-row is-read" : "alert-row is-unread"}
              >
                <span className="alert-marker" aria-hidden="true" />

                <div className="alert-main">
                  <div className="alert-meta">
                    <span
                      className={
                        alert.kind === "stall"
                          ? "alert-kind alert-kind--stall"
                          : "alert-kind"
                      }
                    >
                      {alert.kind === "stall" ? "Stall" : "Late change"}
                    </span>
                    <time dateTime={alert.created_at}>
                      {formatDateTime(alert.created_at)}
                    </time>
                  </div>

                  <p className="alert-message">{alert.message}</p>

                  <div className="alert-actions">
                    <Link
                      href={`/projects/${alert.project_id}`}
                      className="text-link"
                    >
                      Open project <span aria-hidden="true">↗</span>
                    </Link>
                    {read ? (
                      <span className="read-state">Read</span>
                    ) : (
                      <form action={markRead.bind(null, alert.id)}>
                        <button
                          type="submit"
                          className="btn btn-small btn-ghost"
                        >
                          Mark as read
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
