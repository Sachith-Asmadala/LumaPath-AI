import { describe, expect, it } from "vitest";
import { projectFocusTimer, type FocusSessionRecord } from "@/features/focus/domain/focus";

function session(patch: Partial<FocusSessionRecord> = {}): FocusSessionRecord {
  return {
    id: "focus-1", task_id: "task-1", task_title: "Assignment", objective: "Draft section",
    planned_work_minutes: 25, planned_break_minutes: 5, task_estimated_minutes: 90,
    task_progress_before: 20, task_progress_after: null, status: "running", persisted_status: "running",
    started_at: "2026-10-01T10:00:00.000Z", active_segment_started_at: "2026-10-01T10:00:00.000Z", last_heartbeat_at: "2026-10-01T10:10:00.000Z",
    paused_at: null, ended_at: null, accumulated_active_seconds: 0, elapsed_work_seconds: 0,
    remaining_work_seconds: 1500, break_due: false, notes: "", next_step: "", result: null,
    estimate_feedback: null, suggested_estimated_minutes: null, estimate_explanation: null,
    productive_minutes: 0, updated_at: "2026-10-01T10:00:00.000Z", ...patch,
  };
}

describe("focus timer projection", () => {
  it("reconstructs running elapsed time from persisted timestamps", () => {
    const projected = projectFocusTimer(session(), Date.parse("2026-10-01T10:10:00.000Z"));
    expect(projected.elapsedSeconds).toBe(600);
    expect(projected.remainingSeconds).toBe(900);
  });

  it("does not add wall-clock time while paused", () => {
    const projected = projectFocusTimer(session({ persisted_status: "paused", status: "paused", active_segment_started_at: null, accumulated_active_seconds: 420 }), Date.parse("2026-10-01T18:00:00.000Z"));
    expect(projected.elapsedSeconds).toBe(420);
    expect(projected.remainingSeconds).toBe(1080);
  });

  it("derives break due after the planned duration", () => {
    const projected = projectFocusTimer(session({ last_heartbeat_at: "2026-10-01T10:26:00.000Z" }), Date.parse("2026-10-01T10:26:00.000Z"));
    expect(projected.breakDue).toBe(true);
    expect(projected.displayStatus).toBe("break_due");
    expect(projected.remainingSeconds).toBe(0);
  });

  it("keeps ended-session elapsed time stable", () => {
    const projected = projectFocusTimer(session({ persisted_status: "interrupted", status: "interrupted", active_segment_started_at: null, accumulated_active_seconds: 300, elapsed_work_seconds: 300 }), Date.parse("2026-10-02T10:00:00.000Z"));
    expect(projected.elapsedSeconds).toBe(300);
    expect(projected.displayStatus).toBe("interrupted");
  });
});
