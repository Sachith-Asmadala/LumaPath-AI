import { describe, expect, it } from "vitest";
import { createDemoState } from "../demo-data/seed";
import { scenarioDate } from "../demo-data/scenario";
import { demoReducer } from "../state/demo-provider";
import { buildRecoveryCandidate, recoveryPreviewRows } from "./recovery-mode";

function checkedIn() {
  const seed = createDemoState();
  const capacity = { ...seed.capacity, availableMinutes: 120, energy: 1 as const, focus: "low" as const, lifeLoadFactors: { "Family responsibilities": "High" as const, "Relationship pressure": "Medium" as const } };
  return { seed, pending: demoReducer(seed, { type: "begin-recovery", capacity }) };
}

describe("Recovery Mode", () => {
  it("records a high check-in without changing the plan before a choice", () => {
    const { seed, pending } = checkedIn();
    expect(pending.recoveryPending).toBe(true);
    expect(pending.planBlocks).toEqual(seed.planBlocks);
    expect(pending.tasks).toEqual(seed.tasks);
    expect(pending.activeAction).toEqual(seed.activeAction);
    const preview = buildRecoveryCandidate(pending, "recommended");
    expect(pending.planBlocks).toEqual(seed.planBlocks);
    expect(preview.planBlocks).not.toEqual(seed.planBlocks);
    expect(recoveryPreviewRows(pending, preview).some((row) => row.after !== row.before)).toBe(true);
  });

  it("applies a recommended schedule through the existing risk and action selectors", () => {
    const { pending } = checkedIn();
    const next = demoReducer(pending, { type: "apply-recovery-choice", choice: "recommended" });
    expect(next.recoveryPending).toBe(false);
    expect(next.planBlocks.find((block) => block.id === "block-database")?.startAt.startsWith(scenarioDate())).toBe(true);
    expect(next.planBlocks.find((block) => block.id === "block-aws")?.startAt).toBe(`${scenarioDate(3)}T17:30:00`);
    expect(next.tasks.find((task) => task.id === "database-assignment")!.riskScore).toBeGreaterThan(pending.tasks.find((task) => task.id === "database-assignment")!.riskScore);
    expect(next.activeAction.taskId).toBe("database-assignment");
    expect(demoReducer(next, { type: "apply-recovery-choice", choice: "recommended" })).toBe(next);
  });

  it("honors the selected option, including keeping the schedule unchanged", () => {
    const { pending } = checkedIn();
    const kept = demoReducer(pending, { type: "keep-recovery-plan" });
    expect(kept.planBlocks).toEqual(pending.planBlocks);
    expect(kept.tasks).toEqual(pending.tasks);
    expect(kept.recoveryPending).toBe(false);
    const career = buildRecoveryCandidate(pending, "career");
    expect(career.planBlocks.find((block) => block.id === "block-database")?.startAt).toBe(pending.planBlocks.find((block) => block.id === "block-database")?.startAt);
    expect(career.planBlocks.find((block) => block.id === "block-docker")?.startAt.startsWith(scenarioDate())).toBe(false);
    const critical = buildRecoveryCandidate(pending, "critical");
    expect(critical.planBlocks.filter((block) => block.startAt.startsWith(scenarioDate()) && !block.isFixed).every((block) => block.category === "Academic")).toBe(true);
    const lighter = buildRecoveryCandidate(pending, "lighter");
    expect(lighter.capacity.unexpectedCommitmentMinutes).toBe(pending.capacity.unexpectedCommitmentMinutes + 30);
  });
});
