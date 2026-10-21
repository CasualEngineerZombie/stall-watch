import Link from "next/link";
import { notFound } from "next/navigation";
import { NoAccess } from "@/components/no-access";
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatStatus,
} from "@/lib/format";
import { getSession } from "@/lib/session";
import type {
  ProjectStatusRow,
  SelectionRow,
  SlotRow,
} from "@/lib/types";
import { clearSelection, setSelection } from "../actions";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const { id } = await params;
  const { error: flashError, saved } = await searchParams;

  const { supabase, memberships } = await getSession();

  if (!memberships.length) {
    return <NoAccess />;
  }

  const { data: projectData } = await supabase
    .schema("builder")
    .from("v_project_status")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  const project = projectData as ProjectStatusRow | null;

  if (!project) {
    notFound();
  }

  const { data: slotsData, error: slotsError } = await supabase
    .schema("builder")
    .from("project_slots")
    .select("id, room, category")
    .eq("project_id", project.id)
    .order("room")
    .order("category");

  const slots = (slotsData ?? []) as SlotRow[];

  const slotIds = slots.map((slot) => slot.id);
  let selections: SelectionRow[] = [];

  if (slotIds.length > 0) {
    const { data: selectionData } = await supabase
      .schema("builder")
      .from("selections")
      .select("id, slot_id, product_name, selected_by, updated_at")
      .in("slot_id", slotIds);

    selections = (selectionData ?? []) as SelectionRow[];
  }

  const selectionBySlot = new Map(
    selections.map((selection) => [selection.slot_id, selection]),
  );

  const rooms = [...new Set(slots.map((slot) => slot.room))];
  const readOnly = Boolean(project.archived_at);
  const progress =
    project.total_slots > 0
      ? Math.round((project.filled_slots / project.total_slots) * 100)
      : 0;

  return (
    <main className="page">
      <Link href="/projects" className="back-link">
        ← All projects
      </Link>

      <div className="page-head">
        <div>
          <h1>{project.name}</h1>
          <p className="muted">
            {project.org_name} · {formatStatus(project.status)}
            {project.archived_at ? " · archived" : ""}
          </p>
        </div>
        <div className="head-badges">
          {project.is_stalled ? (
            <span className="badge badge-stalled">Stalled</span>
          ) : (
            <span className="badge badge-ok">No stall</span>
          )}
        </div>
      </div>

      {flashError ? (
        <p className="notice notice-error" role="alert">
          {flashError}
        </p>
      ) : null}
      {saved ? (
        <p className="notice notice-success" role="status">
          {saved}
        </p>
      ) : null}

      {project.is_stalled ? (
        <div className="notice notice-warning">
          <strong>This project has gone quiet.</strong> No builder activity for{" "}
          {formatDays(project.days_quiet)}, and {project.empty_slots} of{" "}
          {project.total_slots} slots are still empty.
        </div>
      ) : null}

      {readOnly ? (
        <div className="notice">
          This project is archived. Selections are read-only.
        </div>
      ) : null}

      <div className="stat-row">
        <div className="card stat-card">
          <span className="stat-label">Selections</span>
          <span className="stat-number">
            {project.filled_slots}
            <span className="muted"> / {project.total_slots}</span>
          </span>
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Quiet for</span>
          <span className="stat-number">
            {project.status === "selection_phase"
              ? formatDays(project.days_quiet)
              : "—"}
          </span>
          <span className="muted small">
            Last builder activity:{" "}
            {formatDateTime(project.quiet_since)}
          </span>
        </div>
        <div className="card stat-card">
          <span className="stat-label">Due</span>
          <span className="stat-number">
            {formatDate(project.selection_due_date)}
          </span>
          <span className="muted small">
            Phase started {formatDate(project.selection_phase_started_at)}
          </span>
        </div>
      </div>

      {slotsError ? (
        <p className="notice notice-error" role="alert">
          Could not load slots: {slotsError.message}
        </p>
      ) : null}

      {slots.length === 0 ? (
        <div className="card empty-card">
          <h2>No slots</h2>
          <p className="muted">
            This project has nothing to select yet. Reverie3D adds the slots.
          </p>
        </div>
      ) : (
        rooms.map((room) => {
          const roomSlots = slots.filter((slot) => slot.room === room);
          return (
            <section key={room} className="card slot-card">
              <div className="slot-head">
                <h2>{room}</h2>
                <span className="muted small">
                  {roomSlots.filter((slot) => selectionBySlot.has(slot.id)).length}{" "}
                  of {roomSlots.length} picked
                </span>
              </div>

              <div className="slot-list">
                {roomSlots.map((slot) => {
                  const selection = selectionBySlot.get(slot.id);

                  return (
                    <div key={slot.id} className="slot-row">
                      <div className="slot-label">
                        <span className="slot-category">{slot.category}</span>
                        <span
                          className={
                            selection ? "slot-product" : "slot-product muted"
                          }
                        >
                          {selection ? selection.product_name : "Not selected"}
                        </span>
                        {selection ? (
                          <span className="muted small">
                            updated {formatDateTime(selection.updated_at)}
                          </span>
                        ) : null}
                      </div>

                      {readOnly ? null : (
                        <div className="slot-actions">
                          <form
                            action={setSelection.bind(null, project.id, slot.id)}
                            className="slot-form"
                          >
                            <input
                              name="product_name"
                              defaultValue={selection?.product_name ?? ""}
                              placeholder="Product name"
                              maxLength={120}
                              required
                              aria-label={`${slot.room} ${slot.category} product`}
                            />
                            <button type="submit" className="btn btn-small">
                              Save
                            </button>
                          </form>
                          {selection ? (
                            <form
                              action={clearSelection.bind(
                                null,
                                project.id,
                                slot.id,
                              )}
                            >
                              <button
                                type="submit"
                                className="btn btn-small btn-ghost"
                              >
                                Clear
                              </button>
                            </form>
                          ) : null}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </main>
  );
}
