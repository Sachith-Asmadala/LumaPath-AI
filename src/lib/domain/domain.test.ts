import { describe, expect, it } from "vitest";
import { demoEvidence, demoReadiness } from "../demo-data/seed";
import { calculateEvidenceConfidence } from "./evidence";
import { riskLevel, calculatePriorityScore } from "./priority";
import { blocksAfterUrgentDeadline, buildLowCapacityPlan, replaceDaySchedule } from "./planner";
import { raiseReadiness } from "./readiness";

const lowCapacity = {
  availableMinutes: 120,
  energy: 2 as const,
  focus: "low" as const,
  workload: "heavy" as const,
  unexpectedCommitmentMinutes: 0,
};

describe("deterministic demo domain rules", () => {
  it("sums explainable priority reasons to the seeded score", () => {
    const result = calculatePriorityScore();
    expect(result.score).toBe(86);
    expect(result.reasons.map((reason) => reason.points)).toEqual([28, 24, 19, 12, 10, -7]);
  });

  it("maps deadline percentages to semantic risk levels", () => {
    expect(riskLevel(94)).toBe("critical");
    expect(riskLevel(72)).toBe("high");
    expect(riskLevel(44)).toBe("moderate");
    expect(riskLevel(19)).toBe("low");
  });

  it("updates readiness and the supporting skill breakdown together", () => {
    const next = raiseReadiness(demoReadiness, "technical", 2);
    expect(next.score).toBe(74);
    expect(next.weeklyDelta).toBe(6);
    expect(next.breakdown.find((item) => item.id === "technical")?.value).toBe(85);
  });

  it("keeps a low-capacity day to 75 minutes of work plus 45 protected minutes", () => {
    const blocks = buildLowCapacityPlan(lowCapacity);
    const taskMinutes = blocks
      .filter((block) => ["db-outline", "docker-lesson", "review-notes"].includes(block.id))
      .reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
    const focusMinutes = blocks.filter((block) => block.isFocusBlock).reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
    expect(taskMinutes).toBe(75);
    expect(focusMinutes).toBe(45);
  });

  it("replaces only Monday while preserving the rest of the week", () => {
    const monday = buildLowCapacityPlan(lowCapacity);
    const future = { id: "wednesday-resource", taskId: "resource", title: "Learning resource", category: "AI Recommended" as const, startAt: "2026-09-30T19:00:00", endAt: "2026-09-30T19:45:00" };
    const updated = replaceDaySchedule([...monday, future], [monday[0]]);
    expect(updated).toHaveLength(2);
    expect(updated.find((block) => block.id === "wednesday-resource")).toEqual(future);
    expect(updated.filter((block) => block.startAt.startsWith("2026-09-28"))).toHaveLength(1);
  });

  it("preserves focus blocks while moving career work to Thursday", () => {
    const before = buildLowCapacityPlan(lowCapacity);
    const after = blocksAfterUrgentDeadline(before);
    expect(after.find((block) => block.id === "docker-lesson")?.startAt).toBe("2026-10-01T19:00:00");
    expect(after.filter((block) => block.isFocusBlock)).toHaveLength(2);
    expect(after.some((block) => block.isConflict)).toBe(false);
  });

  it("raises confidence when evidence becomes independently verified", () => {
    const submitted = [demoEvidence[2], demoEvidence[6]];
    const verified = [{ ...demoEvidence[2], status: "verified" as const }, demoEvidence[6]];
    expect(calculateEvidenceConfidence(verified)).toBeGreaterThan(calculateEvidenceConfidence(submitted));
  });
});
