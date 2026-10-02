export type ApplicationStatus = "interested" | "preparing" | "applied" | "awaiting_response" | "interviewing" | "offer" | "rejected" | "withdrawn";
export type DeadlineState = "missing" | "unconfirmed" | "past_due" | "today" | "upcoming";
export interface ApplicationRequirement { id: string; skill_name: string; detail: string; required: boolean; evidence_status: "demonstrated" | "not_demonstrated" | "unknown"; evidence_refs: string[]; }
export interface ReadinessAction { skill_name: string; status: "evidence_available" | "evidence_gap" | "unknown"; title: string; rationale: string; evidence_refs: string[]; href: string; }
export interface ApplicationEvent { id: number; event_type: string; from_status: ApplicationStatus | null; to_status: ApplicationStatus | null; note: string; occurred_at: string; }
export interface ApplicationReminder { id: string; kind: string; title: string; remind_at: string; timezone: string; enabled: boolean; notifications_enabled: boolean; quiet_hours_start: string | null; quiet_hours_end: string | null; effective_notification_at: string | null; created_at: string; updated_at: string; }
export interface InternshipApplication {
  id: string; company: string; role: string; source_type: "manual" | "recommendation"; source_reference: string | null; source_url: string | null;
  application_deadline: string | null; application_deadline_confirmed: boolean; deadline_state: DeadlineState;
  contact_name: string; contact_email: string; interview_at: string | null; interview_at_confirmed: boolean; follow_up_at: string | null; follow_up_at_confirmed: boolean;
  notes: string; next_action: string; timezone: string; status: ApplicationStatus; archived: boolean; outcome_notes: string;
  requirements: ApplicationRequirement[]; readiness_actions: ReadinessAction[]; reminders: ApplicationReminder[]; history: ApplicationEvent[]; created_at: string; updated_at: string;
}
export interface ApplicationInput {
  company: string; role: string; source_type: "manual" | "recommendation"; source_reference?: string | null; source_url?: string | null;
  application_deadline?: string | null; application_deadline_confirmed: boolean; contact_name: string; contact_email: string;
  interview_at?: string | null; interview_at_confirmed: boolean; follow_up_at?: string | null; follow_up_at_confirmed: boolean;
  notes: string; next_action: string; timezone: string; requirements: { skill_name: string; detail?: string; required?: boolean }[]; idempotency_key: string;
}
export interface PlannerAction { id: string; application_id: string; kind: string; title: string; start_at: string; duration_minutes: number; category: "Internship"; description: string; idempotent_replay: boolean; }
export const CLOSED_APPLICATION_STATUSES: ApplicationStatus[] = ["offer", "rejected", "withdrawn"];
export const STATUS_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  interested: ["preparing", "withdrawn"], preparing: ["interested", "applied", "withdrawn"], applied: ["awaiting_response", "interviewing", "offer", "rejected", "withdrawn"],
  awaiting_response: ["interviewing", "offer", "rejected", "withdrawn"], interviewing: ["awaiting_response", "offer", "rejected", "withdrawn"], offer: [], rejected: [], withdrawn: [],
};
export function idempotencyKey(prefix: string) { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; }
