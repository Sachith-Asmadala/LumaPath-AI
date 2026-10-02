export type FocusStatus = "running" | "paused" | "break_due" | "completed" | "interrupted" | "abandoned";
export type PersistedFocusStatus = Exclude<FocusStatus, "break_due">;
export type EstimateFeedback = "much_less" | "slightly_less" | "about_right" | "slightly_more" | "much_more";

export interface FocusSessionRecord {
  id: string;
  task_id: string;
  task_title: string;
  objective: string;
  planned_work_minutes: number;
  planned_break_minutes: number;
  task_estimated_minutes: number;
  task_progress_before: number;
  task_progress_after: number | null;
  status: FocusStatus;
  persisted_status: PersistedFocusStatus;
  started_at: string;
  active_segment_started_at: string | null;
  last_heartbeat_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  accumulated_active_seconds: number;
  elapsed_work_seconds: number;
  remaining_work_seconds: number;
  break_due: boolean;
  notes: string;
  next_step: string;
  result: string | null;
  estimate_feedback: EstimateFeedback | null;
  suggested_estimated_minutes: number | null;
  estimate_explanation: string | null;
  productive_minutes: number;
  updated_at: string;
}

export interface FocusTimerProjection {
  elapsedSeconds: number;
  remainingSeconds: number;
  breakDue: boolean;
  displayStatus: FocusStatus;
  progressPercent: number;
}

export function projectFocusTimer(session: FocusSessionRecord, nowMs = Date.now()): FocusTimerProjection {
  let elapsed = Math.max(0, session.accumulated_active_seconds);
  if (session.persisted_status === "running" && session.active_segment_started_at) {
    const segmentStart = new Date(session.active_segment_started_at).getTime();
    const heartbeatAt = new Date(session.last_heartbeat_at ?? session.active_segment_started_at).getTime();
    const safeNow = Number.isFinite(heartbeatAt) ? Math.min(nowMs, heartbeatAt + 30_000) : nowMs;
    if (Number.isFinite(segmentStart)) elapsed += Math.max(0, Math.floor((safeNow - segmentStart) / 1000));
  }
  if (!["running", "paused"].includes(session.persisted_status)) elapsed = Math.max(elapsed, session.elapsed_work_seconds);
  const planned = Math.max(1, session.planned_work_minutes * 60);
  const breakDue = session.persisted_status === "running" && elapsed >= planned;
  return {
    elapsedSeconds: elapsed,
    remainingSeconds: Math.max(0, planned - elapsed),
    breakDue,
    displayStatus: breakDue ? "break_due" : session.persisted_status,
    progressPercent: Math.min(100, Math.max(0, elapsed / planned * 100)),
  };
}

export function formatFocusClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function isFocusSession(value: unknown): value is FocusSessionRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FocusSessionRecord>;
  return typeof item.id === "string" && typeof item.task_id === "string" && typeof item.objective === "string"
    && typeof item.planned_work_minutes === "number" && typeof item.persisted_status === "string"
    && typeof item.accumulated_active_seconds === "number";
}
