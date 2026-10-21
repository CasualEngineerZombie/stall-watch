import Link from "next/link";
import { NoAccess } from "@/components/no-access";
import { formatDate, formatDays, formatStatus } from "@/lib/format";
import { getSession } from "@/lib/session";
import type { ProjectStatusRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const { supabase, memberships, isStaff } = await getSession();

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
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Projects</h1>
          <p className="muted">
            {isStaff ? "Every builder" : "Your organisation"} · {projects.length}{" "}
            {projects.length === 1 ? "project" : "projects"}
          </p>
        </div>
        <div className={stalled > 0 ? "stat stat-alert" : "stat"}>
          <span className="stat-number">{stalled}</span>
          <span className="stat-label">stalled right now</span>
        </div>
      </div>

      {error ? (
        <p className="notice notice-error" role="alert">
          Could not load projects: {error.message}
        </p>
      ) : null}

      {projects.length === 0 ? (
        <div className="card empty-card">
          <h2>No projects yet</h2>
          <p className="muted">
            Nothing has been created for your organisation. Projects appear here as
            soon as Reverie3D adds them.
          </p>
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                {isStaff ? <th>Builder</th> : null}
                <th>Status</th>
                <th>Selections</th>
                <th>Quiet for</th>
                <th>Due</th>
                <th aria-label="Stall status" />
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr
                  key={project.id}
                  className={project.archived_at ? "row-archived" : undefined}
                >
                  <td>
                    <Link
                      href={`/projects/${project.id}`}
                      className="project-link"
                    >
                      {project.name}
                    </Link>
                    {project.archived_at ? (
                      <span className="tag">archived</span>
                    ) : null}
                  </td>
                  {isStaff ? (
                    <td className="muted">{project.org_name}</td>
                  ) : null}
                  <td>
                    <span className="status-dot" data-status={project.status} />
                    {formatStatus(project.status)}
                  </td>
                  <td>
                    {project.filled_slots} of {project.total_slots}
                    {project.empty_slots > 0 ? (
                      <span className="muted small">
                        {" "}
                        · {project.empty_slots} empty
                      </span>
                    ) : null}
                  </td>
                  <td>
                    {project.status === "selection_phase"
                      ? formatDays(project.days_quiet)
                      : "—"}
                  </td>
                  <td>{formatDate(project.selection_due_date)}</td>
                  <td>
                    {project.is_stalled ? (
                      <span className="badge badge-stalled">Stalled</span>
                    ) : null}
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
