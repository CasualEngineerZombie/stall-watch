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
    <main className="shell">
      <Link href="/projects" className="back-link">
        <span aria-hidden="true">←</span> All projects
      </Link>

      <div className="page-head detail-head">
        <div>
          <p className="eyebrow">
            {project.org_name} / {formatStatus(project.status)}
          </p>
          <h1>{project.name}</h1>
          <p className="page-lede">
            Every finish for this home, grouped by room. Each change is recorded
            against the people who made it.
          </p>
        </div>
        <div className="detail-status">
          {project.archived_at ? (
            <span className="badge badge-outline">Archived</span>
          ) : project.is_stalled ? (
            <span className="badge badge-stalled">Stalled</span>
          ) : (
            <span className="badge badge-outline">No stall</span>
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
        <aside className="stall-band" aria-label="Selection stalled">
          <div>
            <p className="eyebrow eyebrow--light">Selection stalled</p>
            <p className="stall-band-title">This project has gone quiet.</p>
            <p className="stall-band-copy">
              No builder activity for {formatDays(project.days_quiet)}, and{" "}
              {project.empty_slots} of {project.total_slots} slots are still
              empty.
            </p>
          </div>
          <a href="#slots" className="text-link text-link--light">
            Review open slots <span aria-hidden="true">↓</span>
          </a>
        </aside>
      ) : null}

      {readOnly ? (
        <p className="notice">
          This project is archived. Selections are read-only.
        </p>
      ) : null}

      <div className="summary-band">
        <div className="summary-cell">
          <span className="summary-label">Selections</span>
          <span className="summary-value">
            {project.filled_slots}
            <span className="summary-fraction"> / {project.total_slots}</span>
          </span>
          <div className="progress" aria-hidden="true">
            <div className="progress-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Quiet for</span>
          <span className="summary-value">
            {project.status === "selection_phase"
              ? formatDays(project.days_quiet)
              : "—"}
          </span>
          <span className="summary-note">
            Last builder activity {formatDateTime(project.quiet_since)}
          </span>
        </div>
        <div className="summary-cell">
          <span className="summary-label">Selection due</span>
          <span className="summary-value">
            {formatDate(project.selection_due_date)}
          </span>
          <span className="summary-note">
            Phase started {formatDate(project.selection_phase_started_at)}
          </span>
        </div>
      </div>

      {slotsError ? (
        <p className="notice notice-error" role="alert">
          Could not load slots: {slotsError.message}
        </p>
      ) : null}

      <section id="slots" className="slots-section" aria-labelledby="slots-title">
        <div className="section-head">
          <div>
            <p className="eyebrow">Finishes</p>
            <h2 id="slots-title" className="section-title">
              Room by room
            </h2>
          </div>
          <p className="section-note">
            {project.filled_slots} of {project.total_slots} selected ·{" "}
            {project.empty_slots} open
          </p>
        </div>

        {slots.length === 0 ? (
          <div className="empty-state">
            <p className="eyebrow">No slots</p>
            <h2>Nothing to select yet.</h2>
            <p>This project has no rooms or finishes. Reverie3D adds the slots.</p>
          </div>
        ) : (
          rooms.map((room, index) => {
            const roomSlots = slots.filter((slot) => slot.room === room);
            const roomSelected = roomSlots.filter((slot) =>
              selectionBySlot.has(slot.id),
            ).length;

            return (
              <section
                key={room}
                className="room"
                aria-labelledby={`room-title-${index}`}
              >
                <header className="room-head">
                  <span className="room-index" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <h3 id={`room-title-${index}`}>{room}</h3>
                  <span className="room-count">
                    {roomSelected} / {roomSlots.length} selected
                  </span>
                </header>

                <div className="slot-list">
                  {roomSlots.map((slot) => {
                    const selection = selectionBySlot.get(slot.id);

                    return (
                      <div key={slot.id} className="slot-row">
                        <div className="slot-label">
                          <span className="slot-category">{slot.category}</span>
                          <span
                            className={
                              selection
                                ? "slot-product"
                                : "slot-product slot-product--empty"
                            }
                          >
                            {selection ? selection.product_name : "Not selected"}
                          </span>
                          <span className="slot-updated">
                            {selection
                              ? `Updated ${formatDateTime(selection.updated_at)}`
                              : "Open selection"}
                          </span>
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
                              <button
                                type="submit"
                                className="btn btn-small btn-primary"
                              >
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
      </section>
    </main>
  );
}
