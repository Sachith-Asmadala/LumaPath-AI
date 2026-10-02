import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { buildAnalyticsSyncPayload } from "@/features/analytics/domain/analytics";

describe("DOC-F18 analytics normalization bridge", () => {
  it("sends metric-safe task fields without descriptions or titles", () => {
    const state = createDemoState();
    const payload = buildAnalyticsSyncPayload(state);
    const serialized = JSON.stringify(payload);
    expect(payload.tasks.length).toBe(state.tasks.length);
    expect(serialized).not.toContain(state.tasks[0].description);
    expect(Object.keys(payload.tasks[0])).not.toContain("title");
    expect(Object.keys(payload.tasks[0])).not.toContain("description");
  });

  it("keeps planner adjustments and readiness snapshots structured", () => {
    const state = createDemoState();
    state.planBlocks[0].previousStartAt = "2026-09-27T09:00:00";
    state.readinessStartingScore = 68;
    const payload = buildAnalyticsSyncPayload(state);
    expect(payload.plan_blocks[0].previous_start_at).toBe("2026-09-27T09:00:00");
    expect(payload.readiness.starting_score).toBe(68);
    expect(payload.readiness.score).toBe(state.readiness.score);
  });
});
