import type { DemoState } from "@/data/demo/types";
import { selectNextBestAction } from "@/features/dashboard/domain/dashboard";

export type NotificationType = "deadline" | "risk" | "top_priority" | "missed_work" | "study_session" | "application_date" | "roadmap_milestone" | "calendar_event";
export type NotificationUrgency = "critical" | "high" | "normal" | "low";
export type NotificationChannel = "in_app" | "push" | "email";

export interface NotificationCandidateInput {
  notification_type: NotificationType;
  source_type: "task" | "planner" | "internship" | "roadmap" | "calendar" | "system";
  source_id: string;
  source_state: "active" | "resolved";
  display_label: string;
  reason: string;
  action_href: string;
  urgency: NotificationUrgency;
  occurred_at: string;
  deliver_after?: string | null;
  expires_at?: string | null;
  sensitive: boolean;
  idempotency_key: string;
}

export interface NotificationPreferences {
  student_id: string;
  timezone: string;
  quiet_hours_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  mute_non_critical: boolean;
  max_non_critical_per_day: number;
  max_non_critical_per_hour: number;
  in_app_enabled: boolean;
  push_enabled: boolean;
  push_permission_granted: boolean;
  email_enabled: boolean;
  email_consent: boolean;
  categories: Record<NotificationType, boolean>;
  updated_at: string;
  push_provider_available: boolean;
  email_provider_available: boolean;
}

export interface NotificationInboxItem {
  id: string;
  delivery_id: string;
  notification_type: NotificationType;
  urgency: NotificationUrgency;
  title: string;
  description: string;
  reason: string;
  action_href: string;
  source_type: string;
  source_id: string;
  created_at: string;
  delivered_at: string;
  expires_at: string | null;
  opened_at: string | null;
  dismissed_at: string | null;
  acted_at: string | null;
}

export interface NotificationInbox {
  items: NotificationInboxItem[];
  unread_count: number;
  generated_at: string;
  partial: boolean;
  calendar_integration_available: boolean;
}

const addHours = (date: Date, hours: number) => new Date(date.getTime() + hours * 3_600_000).toISOString();
const addMinutes = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000).toISOString();
const stable = (value: string | number | undefined) => String(value ?? "none").replace(/[^a-zA-Z0-9_.:-]/g, "-").slice(0, 80);

/**
 * Privacy-minimized bridge from the current prototype Task/Planner state to the
 * server-owned notification policy engine. No notes, CV text, assistant prompts,
 * mentor content, or other unrelated private fields are sent.
 */
export function buildNotificationCandidates(state: DemoState, now = new Date()): NotificationCandidateInput[] {
  const items: NotificationCandidateInput[] = [];
  const nowIso = now.toISOString();
  const activeIds = new Set<string>();

  for (const task of state.tasks) {
    const href = `/tasks?task=${encodeURIComponent(task.id)}`;
    if (task.status === "completed") {
      for (const kind of ["deadline", "risk", "missed_work"] as const) {
        items.push({ notification_type: kind, source_type: "task", source_id: task.id, source_state: "resolved", display_label: "", reason: "Resolved", action_href: href, urgency: "low", occurred_at: nowIso, sensitive: true, idempotency_key: `resolve:${kind}:${task.id}:${stable(task.completedAt)}` });
      }
      continue;
    }

    if (task.dueAt) {
      const due = new Date(task.dueAt);
      const hours = (due.getTime() - now.getTime()) / 3_600_000;
      if (hours >= -24 && hours <= 72) {
        activeIds.add(`deadline:${task.id}`);
        const urgency: NotificationUrgency = hours <= 12 ? "critical" : hours <= 24 ? "high" : "normal";
        const reason = hours < 0 ? "This deadline has passed and still needs a manual status update." : hours <= 12 ? "Due within 12 hours. Review the remaining work and plan." : hours <= 24 ? "Due within 24 hours. Review the remaining work." : "Due within 3 days. Check that the current plan still fits.";
        items.push({ notification_type: "deadline", source_type: "task", source_id: task.id, source_state: "active", display_label: task.title, reason, action_href: href, urgency, occurred_at: nowIso, deliver_after: nowIso, expires_at: addHours(due, 24), sensitive: true, idempotency_key: `deadline:${task.id}:${stable(task.dueAt)}:${urgency}` });
      }
    }

    if (task.riskScore >= 70) {
      activeIds.add(`risk:${task.id}`);
      const urgency: NotificationUrgency = task.riskScore >= 90 ? "critical" : "high";
      items.push({ notification_type: "risk", source_type: "task", source_id: task.id, source_state: "active", display_label: task.title, reason: `${task.riskScore}% deadline-risk signal. Review the plan before the risk increases.`, action_href: "/planner", urgency, occurred_at: nowIso, deliver_after: nowIso, expires_at: task.dueAt && new Date(task.dueAt).getTime() > now.getTime() ? addHours(new Date(task.dueAt), 24) : addHours(now, 24), sensitive: true, idempotency_key: `risk:${task.id}:${task.riskScore}:${stable(task.dueAt)}` });
    }

    if (task.status === "missed") {
      activeIds.add(`missed_work:${task.id}`);
      items.push({ notification_type: "missed_work", source_type: "task", source_id: task.id, source_state: "active", display_label: task.title, reason: "This work is marked missed. Decide whether to reschedule, reduce scope, or close it.", action_href: href, urgency: "high", occurred_at: nowIso, deliver_after: nowIso, expires_at: addHours(now, 72), sensitive: true, idempotency_key: `missed:${task.id}:${stable(task.dueAt)}:${task.progress}` });
    }
  }

  const action = selectNextBestAction(state);
  if (action.taskId && action.durationMinutes > 0) {
    const task = state.tasks.find((item) => item.id === action.taskId);
    if (task && task.status !== "completed") {
      items.push({ notification_type: "top_priority", source_type: "task", source_id: task.id, source_state: "active", display_label: action.title, reason: action.rationale, action_href: "/overview", urgency: action.deadlineRisk === "critical" ? "critical" : "normal", occurred_at: nowIso, deliver_after: nowIso, expires_at: addHours(now, 12), sensitive: true, idempotency_key: `priority:${task.id}:${action.score}:${action.durationMinutes}` });
    }
  }

  for (const block of state.planBlocks.filter((item) => item.isFocusBlock && !item.isMissed)) {
    const start = new Date(block.startAt);
    const minutes = (start.getTime() - now.getTime()) / 60_000;
    if (minutes >= 0 && minutes <= 120) {
      items.push({ notification_type: "study_session", source_type: "planner", source_id: block.id, source_state: "active", display_label: block.title, reason: "A planned focus block is coming up. Open Focus when you are ready.", action_href: block.taskId ? `/focus?task=${encodeURIComponent(block.taskId)}` : "/focus", urgency: minutes <= 20 ? "high" : "normal", occurred_at: nowIso, deliver_after: minutes > 20 ? addMinutes(now, Math.max(0, minutes - 20)) : nowIso, expires_at: addHours(start, 2), sensitive: true, idempotency_key: `study:${block.id}:${stable(block.startAt)}` });
    }
  }

  for (const skill of state.careerSkills.filter((item) => item.status === "verified" || item.status === "completed")) {
    const evidence = state.evidence.filter((item) => item.skillId === skill.id && item.status === "verified" && item.verifiedAt).sort((a,b) => String(b.verifiedAt).localeCompare(String(a.verifiedAt)))[0];
    if (!evidence?.verifiedAt) continue;
    const verified = new Date(`${evidence.verifiedAt.slice(0,10)}T12:00:00`);
    const ageHours = (now.getTime() - verified.getTime()) / 3_600_000;
    if (ageHours < 0 || ageHours > 24 * 7) continue;
    items.push({ notification_type: "roadmap_milestone", source_type: "roadmap", source_id: skill.id, source_state: "active", display_label: skill.name, reason: "Recent verified evidence moved this roadmap milestone forward. Review the next available pathway step when useful.", action_href: "/career-path", urgency: "low", occurred_at: verified.toISOString(), deliver_after: nowIso, expires_at: addHours(now, 72), sensitive: false, idempotency_key: `roadmap:${skill.id}:${skill.status}:${stable(evidence.verifiedAt)}` });
  }

  // Resolve categories that no longer qualify. The backend resolves by type + source,
  // so clearing a deadline warning cannot accidentally clear a separate risk warning.
  for (const task of state.tasks.filter((item) => item.status !== "completed")) {
    if (!activeIds.has(`risk:${task.id}`)) items.push({ notification_type: "risk", source_type: "task", source_id: task.id, source_state: "resolved", display_label: "", reason: "Risk resolved", action_href: "/planner", urgency: "low", occurred_at: nowIso, sensitive: true, idempotency_key: `resolve:risk:${task.id}:${task.riskScore}` });
    if (!activeIds.has(`missed_work:${task.id}`) && task.status !== "missed") items.push({ notification_type: "missed_work", source_type: "task", source_id: task.id, source_state: "resolved", display_label: "", reason: "Missed-work state resolved", action_href: `/tasks?task=${encodeURIComponent(task.id)}`, urgency: "low", occurred_at: nowIso, sensitive: true, idempotency_key: `resolve:missed:${task.id}:${task.status}` });
  }
  return items.slice(0, 100);
}
