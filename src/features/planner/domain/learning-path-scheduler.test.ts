import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { freePathForSkill } from "@/data/demo/free-learning-paths";
import { scenarioDate } from "@/data/demo/scenario";
import { scheduleLearningPath } from "@/features/planner/domain/learning-path-scheduler";

const path = freePathForSkill("docker")!;

describe("scheduleLearningPath", () => {
  it("schedules every step without moving existing work or using protected deadline days", () => {
    const state = createDemoState();
    state.onboarding.weeklyLearningHours = 6;
    const originalBlocks = JSON.stringify(state.planBlocks);
    const plan = scheduleLearningPath(state, path)!;
    expect(plan).not.toBeNull();
    expect(JSON.stringify(state.planBlocks)).toBe(originalBlocks);
    expect(plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBe(path.durationHours * 60);
    expect(plan.blocks).toHaveLength(plan.tasks.length);
    expect(plan.tasks.every((task) => task.category === "career-learning" && task.skill === "Docker" && task.careerSkillIds.includes("docker"))).toBe(true);
    expect(plan.blocks.every((block) => !["2026-09-29", "2026-09-30", "2026-10-01"].includes(block.startAt.slice(0, 10)))).toBe(true);
    for (const block of plan.blocks) {
      const start = new Date(block.startAt).getTime();
      const end = new Date(block.endAt).getTime();
      expect([...state.planBlocks, ...plan.blocks.filter((item) => item.id !== block.id)].some((other) => start < new Date(other.endAt).getTime() && end > new Date(other.startAt).getTime())).toBe(false);
    }
    expect(plan.blocks.map((block) => block.startAt)).toEqual([...plan.blocks.map((block) => block.startAt)].sort());
    for (let week = 0; week < 12; week++) {
      const dates = new Set(Array.from({ length: 7 }, (_, day) => scenarioDate(week * 7 + day)));
      const learningMinutes = [...state.planBlocks, ...plan.blocks]
        .filter((block) => dates.has(block.startAt.slice(0, 10)) && (block.category === "Career" || block.category === "career-learning"))
        .reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
      expect(learningMinutes).toBeLessThanOrEqual(6 * 60);
    }
    expect(scheduleLearningPath(state, path)).toEqual(plan);
  });

  it("does not schedule when there is no usable daily capacity", () => {
    const state = createDemoState();
    state.capacity.availableMinutes = 0;
    expect(scheduleLearningPath(state, path)).toBeNull();
  });

  it("supports a one-hour weekly learning preference without exceeding it", () => {
    const state = createDemoState();
    state.onboarding.weeklyLearningHours = 1;
    const plan = scheduleLearningPath(state, path)!;
    expect(plan.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)).toBe(path.durationHours * 60);
    expect(plan.blocks.at(-1)!.startAt.slice(0, 10) > scenarioDate(12 * 7)).toBe(true);
    for (let week = 1; week < 24; week++) {
      const dates = new Set(Array.from({ length: 7 }, (_, day) => scenarioDate(week * 7 + day)));
      const minutes = plan.blocks.filter((block) => dates.has(block.startAt.slice(0, 10))).reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
      expect(minutes).toBeLessThanOrEqual(60);
    }
  });
});
