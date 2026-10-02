import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { buildNotificationCandidates } from "@/features/notifications/domain/notifications";

describe("DOC-F20 notification candidate normalization", () => {
  it("creates explainable task/risk/priority candidates without notes, CV text, or unrelated private content", () => {
    const state = createDemoState();
    const candidates = buildNotificationCandidates(state, new Date("2026-09-28T08:00:00Z"));
    expect(candidates.some((item) => item.notification_type === "top_priority")).toBe(true);
    expect(candidates.every((item) => item.reason.length > 0 && item.action_href.startsWith("/"))).toBe(true);
    const serialized = JSON.stringify(candidates);
    expect(serialized).not.toContain(state.capacity.lifeLoadNote ?? "__no_private_note__");
    expect(serialized).not.toContain("contact_email");
  });

  it("marks completed task notification sources resolved instead of producing current alerts", () => {
    const state = createDemoState();
    const task = state.tasks[0];
    task.status = "completed";
    task.completedAt = "2026-09-28T07:00:00Z";
    const candidates = buildNotificationCandidates(state, new Date("2026-09-28T08:00:00Z"));
    const taskItems = candidates.filter((item) => item.source_type === "task" && item.source_id === task.id);
    expect(taskItems.filter((item) => ["deadline","risk","missed_work"].includes(item.notification_type)).every((item) => item.source_state === "resolved")).toBe(true);
  });

  it("uses stable idempotency keys for unchanged source state", () => {
    const state = createDemoState();
    const at = new Date("2026-09-28T08:00:00Z");
    const one = buildNotificationCandidates(state, at).map((item) => item.idempotency_key);
    const two = buildNotificationCandidates(state, at).map((item) => item.idempotency_key);
    expect(two).toEqual(one);
  });

  it("never emits external URLs as deep links", () => {
    const items = buildNotificationCandidates(createDemoState(), new Date("2026-09-28T08:00:00Z"));
    expect(items.every((item) => item.action_href.startsWith("/") && !item.action_href.startsWith("//"))).toBe(true);
  });
});
