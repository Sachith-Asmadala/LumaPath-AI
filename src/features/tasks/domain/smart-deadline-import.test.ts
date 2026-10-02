import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { scenarioAt } from "@/data/demo/scenario";
import { mockUniversityLms } from "@/integrations/lms/mock-university-lms";
import { deadlineRiskScore, importLmsAssignments } from "@/features/tasks/domain/smart-deadline-import";

describe("smart deadline import", () => {
  it("uses the typed mock LMS and updates the existing academic task", async () => {
    const assignments = await mockUniversityLms.listAssignments();
    const original = createDemoState();
    const imported = importLmsAssignments(original, assignments);
    const database = imported.tasks.find((task) => task.id === "database-assignment");

    expect(assignments).toHaveLength(3);
    expect(imported.tasks).toHaveLength(original.tasks.length + 2);
    expect(database).toMatchObject({ source: mockUniversityLms.id, externalId: assignments[0].externalId, module: "Database Systems", dueAt: assignments[0].dueAt });
    expect(imported.planBlocks).toEqual(expect.arrayContaining(original.planBlocks));
    expect(imported.activeAction.taskId).toBe(imported.tasks.filter((task) => task.status !== "completed" && task.dueAt).sort((a, b) => b.riskScore - a.riskScore || a.dueAt!.localeCompare(b.dueAt!))[0].id);
  });

  it("deduplicates source and external ID and refreshes changed deadlines", async () => {
    const assignments = await mockUniversityLms.listAssignments();
    const initial = createDemoState();
    const imported = importLmsAssignments(initial, [assignments[1]]);
    const all = importLmsAssignments(imported, assignments);
    const refreshed = importLmsAssignments(all, [assignments[1], { ...assignments[1], dueAt: scenarioAt(1, "17:00:00") }]);

    expect(all.tasks).toHaveLength(initial.tasks.length + 2);
    expect(refreshed.tasks).toHaveLength(all.tasks.length);
    expect(refreshed.tasks.filter((task) => task.source === assignments[1].source && task.externalId === assignments[1].externalId)).toHaveLength(1);
    expect(refreshed.planBlocks.filter((block) => block.taskId === imported.tasks.find((task) => task.externalId === assignments[1].externalId)?.id)).toHaveLength(1);
    expect(deadlineRiskScore(scenarioAt(1, "17:00:00"))).toBeGreaterThan(deadlineRiskScore(assignments[1].dueAt));
  });

  it("does not place imported blocks on top of existing planner work", async () => {
    const imported = importLmsAssignments(createDemoState(), await mockUniversityLms.listAssignments());
    const lmsBlocks = imported.planBlocks.filter((block) => block.taskId && imported.tasks.some((task) => task.id === block.taskId && task.source === mockUniversityLms.id));
    for (const block of lmsBlocks) {
      const overlapping = imported.planBlocks.filter((other) => other.id !== block.id && new Date(block.startAt).getTime() < new Date(other.endAt).getTime() && new Date(block.endAt).getTime() > new Date(other.startAt).getTime());
      expect(overlapping).toEqual([]);
    }
  });
});
