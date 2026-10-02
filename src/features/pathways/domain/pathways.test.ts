import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import {
  applyPathwayPlanActions,
  buildPathwayContext,
  buildRecalculationReasons,
  type PathwayView,
  type PlannerPathwayAction,
} from "@/features/pathways/domain/pathways";

describe("DOC-F13 roadmap client contract", () => {
  it("sends only scheduling/risk facts for academic obligations", () => {
    const state = createDemoState();
    state.onboarding.weeklyLearningHours = 8;
    state.tasks[0].description = "PRIVATE ASSIGNMENT NOTES MUST STAY IN THE CLIENT";
    const context = buildPathwayContext(state, {
      targetRole: "DevOps Engineer",
      goal: "Prepare for a DevOps internship",
      pace: "balanced",
      timezone: "Asia/Colombo",
      planningStart: "2026-11-02",
    });
    const serialized = JSON.stringify(context);
    expect(context.weekly_learning_minutes).toBe(480);
    expect(context.daily_available_minutes).toBeGreaterThanOrEqual(0);
    expect(context.academic_tasks[0]?.title).toBe("Academic obligation");
    expect(serialized).not.toContain("PRIVATE ASSIGNMENT NOTES MUST STAY IN THE CLIENT");
    expect(serialized).not.toContain("careerSkillIds");
  });

  it("explains capacity, pace, goal and new-evidence recalculation reasons", () => {
    const state = createDemoState();
    const context = buildPathwayContext(state, {
      targetRole: "Cloud Engineer",
      goal: "Prepare for a cloud internship",
      pace: "ambitious",
      timezone: "Asia/Colombo",
      planningStart: "2026-11-02",
    });
    context.skills.push({ skill_id: "new-skill", status: "verified", proficiency: 80, evidence_refs: ["evidence:new"] });
    const active = {
      target_role: "DevOps Engineer",
      goal: "Prepare for DevOps",
      pace: "balanced",
      weekly_learning_minutes: 120,
      daily_available_minutes: 60,
      steps: [],
    } as unknown as PathwayView;
    const reasons = buildRecalculationReasons(active, context);
    expect(reasons.some((item) => item.includes("Career goal changed"))).toBe(true);
    expect(reasons.some((item) => item.includes("pace changed"))).toBe(true);
    expect(reasons.some((item) => item.includes("Weekly learning capacity"))).toBe(true);
    expect(reasons.some((item) => item.includes("Daily planning capacity"))).toBe(true);
    expect(reasons.some((item) => item.includes("skill evidence"))).toBe(true);
  });

  it("applies only approved actions with roadmap traceability and remains idempotent", () => {
    const state = createDemoState();
    const action: PlannerPathwayAction = {
      plan_item_id: "roadmap-plan-1",
      internal_task_id: "roadmap-task-1",
      pathway_id: "pathway-1",
      pathway_version: 2,
      step_id: "step-docker",
      skill_id: "docker",
      title: "Docker · roadmap practice",
      start_at: "2026-11-05T12:30:00.000Z",
      end_at: "2026-11-05T13:30:00.000Z",
      planned_minutes: 60,
      source_label: "Roadmap · v2",
      description: "Approved weekly roadmap commitment.",
    };
    const first = applyPathwayPlanActions(state, [action]);
    const nextState = { ...state, ...first };
    const second = applyPathwayPlanActions(nextState, [action]);
    const task = first.tasks.find((item) => item.id === "roadmap-task-1");
    const block = first.planBlocks.find((item) => item.externalId === "roadmap-plan-1");
    expect(task).toMatchObject({ category: "career-learning", learningPathId: "pathway-1", learningStepId: "step-docker", source: "Roadmap · v2" });
    expect(block).toMatchObject({ taskId: "roadmap-task-1", source: "Roadmap · v2" });
    expect(second.tasks.filter((item) => item.id === "roadmap-task-1")).toHaveLength(1);
    expect(second.planBlocks.filter((item) => item.externalId === "roadmap-plan-1")).toHaveLength(1);
  });
});
