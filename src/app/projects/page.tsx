import type { Metadata } from "next";
import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { formatDate, formatDays, formatStatus } from "@/lib/format";
import { getSession } from "@/lib/session";
import type { ProjectStatusRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects",
};

export default async function ProjectsPage() {
  const { supabase, memberships, isStaff, orgLabel } = await getSession();

  if (!memberships.length) {
    return <NoAccess />;
  }

  const { data, error } = await supabase
    .schema("builder")
    .from("v_project_status")
    .select("*")
    .order("archived_at", { ascending: true, nullsFirst: true })
    .order("name");

  const projects = (data ?? []) as ProjectStatusRow[];
  const stalled = projects.filter((project) => project.is_stalled).length;

  return (
    <main className="shell">
      <div className="page-head">
        <div>
          <p className="eyebrow">
            Portfolio / {isStaff ? "All builders" : orgLabel}
          </p>
          <h1>Projects</h1>
          <p className="page-lede">
            {isStaff
              ? "Every builder, every open selection, on one quiet page. The stall signal is computed live from the same view the detector reads."
              : "Your finishes, room by room. A project is stalled when it sits in selection with open slots and five quiet days."}
          </p>
        </div>
        <div
          className="head-stat"
          aria-label={`${stalled} stalled, ${projects.length} ${
            projects.length === 1 ? "project" : "projects"
          }`}
        >
          <span className="head-stat-label">Stalled right now</span>
          <span
            className={
              stalled > 0 ? "head-stat-value is-alert" : "head-stat-value"
            }
          >
            {String(stalled).padStart(2, "0")}
          </span>
          <span className="head-stat-note">
            of {projects.length} {projects.length === 1 ? "project" : "projects"}
          </span>
        </div>
      </div>

      {error ? (
        <p className="notice notice-error" role="alert">
          Could not load projects: {error.message}
        </p>
      ) : null}

      {projects.length === 0 ? (
        <section className="empty-state">
          <p className="eyebrow">No projects</p>
          <h2>A quiet portfolio.</h2>
          <p>
            Nothing has been created for your organisation yet. Projects appear
            here as soon as Reverie3D adds them.
          </p>
        </section>
      ) : (
        <div className="table-wrap project-table-wrap">
          <table className="table project-table">
            <caption className="visually-hidden">Projects</caption>
            <thead>
              <tr>
                <th scope="col">Project</th>
                <th scope="col" className="col-status">
                  Status
                </th>
                <th scope="col">Selections</th>
                <th scope="col" className="col-quiet">
                  Quiet for
                </th>
                <th scope="col" className="col-due">
                  Due
                </th>
                <th scope="col">
                  <span className="visually-hidden">Stall status</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project, index) => (
                <tr
                  key={project.id}
                  className={project.archived_at ? "is-archived" : undefined}
                >
                  <td className="project-cell">
                    <div className="project-cell-inner">
                      <span className="project-index" aria-hidden="true">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="project-identity">
                        <Link
                          href={`/projects/${project.id}`}
                          className="project-name"
                        >
                          {project.name}
                        </Link>
                        <span className="project-org">
                          {project.org_name}
                          {project.archived_at ? " · Archived" : ""}
                        </span>
                        <span className="project-mobile-meta">
                          {project.status === "selection_phase"
                            ? `${formatDays(project.days_quiet)} quiet`
                            : formatStatus(project.status)}
                          {` · Due ${formatDate(project.selection_due_date)}`}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="col-status">
                    <span
                      className="project-status"
                      data-status={project.status}
                    >
                      <span className="status-dot" aria-hidden="true" />
                      {formatStatus(project.status)}
                    </span>
                  </td>
                  <td>
                    <span className="selection-count">
                      {project.filled_slots}
                      <span className="selection-total">
                        {" "}
                        / {project.total_slots}
                      </span>
                    </span>
                    {project.empty_slots > 0 ? (
                      <span className="table-note">
                        {project.empty_slots} open
                      </span>
                    ) : null}
                  </td>
                  <td className="col-quiet">
                    {project.status === "selection_phase"
                      ? formatDays(project.days_quiet)
                      : "—"}
                  </td>
                  <td className="col-due">
                    {formatDate(project.selection_due_date)}
                  </td>
                  <td className="project-flag-cell">
                    {project.is_stalled ? (
                      <span className="badge badge-stalled">Stalled</span>
                    ) : (
                      <span className="table-dash" aria-hidden="true">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
