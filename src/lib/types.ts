export type OrgType = "staff" | "builder";
export type Role = "admin" | "member";
export type ProjectStatus =
  | "pending_kickoff"
  | "selection_phase"
  | "revision"
  | "complete";
export type AlertKind = "stall" | "late_change";
export type RunStatus = "running" | "succeeded" | "failed";

export interface Membership {
  org_id: string;
  org_name: string;
  org_type: OrgType;
  role: Role;
}

export interface ProjectStatusRow {
  id: string;
  org_id: string;
  org_name: string;
  name: string;
  status: ProjectStatus;
  selection_due_date: string | null;
  selection_phase_started_at: string | null;
  archived_at: string | null;
  total_slots: number;
  filled_slots: number;
  empty_slots: number;
  quiet_since: string | null;
  days_quiet: number | null;
  is_stalled: boolean;
}

export interface SlotRow {
  id: string;
  room: string;
  category: string;
}

export interface SelectionRow {
  id: string;
  slot_id: string;
  product_name: string;
  selected_by: string | null;
  updated_at: string;
}

export interface AlertRow {
  id: string;
  kind: AlertKind;
  message: string;
  read_at: string | null;
  created_at: string;
  project_id: string;
}

export interface JobRunRow {
  id: string;
  job: string;
  trigger_kind: "scheduled" | "manual";
  status: RunStatus;
  started_at: string;
  finished_at: string | null;
  projects_flagged: number;
  alerts_created: number;
  error_message: string | null;
}
