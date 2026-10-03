import { describe, expect, it } from "vitest";
import { competitionScenario, createCompetitionState, type CompetitionSnapshot } from "./competition";
import { createDemoState } from "./seed";
import { scenarioDate } from "./scenario";

describe("demo fixture consistency", () => {
  it("links scheduled work to tasks without conflicts or work beyond its deadline", () => {
    const state = createDemoState();
    const tasks = new Map(state.tasks.map((task) => [task.id, task]));
    const skills = new Set(state.careerSkills.map((skill) => skill.id));
    expect(tasks.size).toBe(state.tasks.length);
    expect(new Set(state.planBlocks.map((block) => block.id)).size).toBe(state.planBlocks.length);
    for (const task of state.tasks) {
      expect(task.careerSkillIds.every((id) => skills.has(id))).toBe(true);
      if (task.category === "Academic") expect(task.module).toBeTruthy();
    }
    for (const block of state.planBlocks) {
      const start = new Date(block.startAt).getTime();
      const end = new Date(block.endAt).getTime();
      expect(end).toBeGreaterThan(start);
      expect(state.planBlocks.some((other) => other.id !== block.id && start < new Date(other.endAt).getTime() && end > new Date(other.startAt).getTime())).toBe(false);
      if (block.taskId) {
        const task = tasks.get(block.taskId);
        expect(task).toBeDefined();
        if (task?.dueAt) expect(end).toBeLessThanOrEqual(new Date(task.dueAt).getTime());
      }
    }
    for (let day = 0; day < 7; day++) expect(state.planBlocks.some((block) => block.startAt.startsWith(scenarioDate(day)))).toBe(true);
    const week = new Set(Array.from({ length: 7 }, (_, day) => scenarioDate(day)));
    const careerMinutes = state.planBlocks.filter((block) => week.has(block.startAt.slice(0, 10)) && block.category === "Career")
      .reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
    expect(careerMinutes).toBeLessThanOrEqual(state.onboarding.weeklyLearningHours * 60);
  });

  it("matches completed sessions to progress totals and keeps resets isolated", () => {
    const state = createDemoState();
    const completed = state.tasks.filter((task) => task.status === "completed");
    expect(state.completedTaskCount).toBe(completed.length);
    expect(state.productiveMinutes).toBe(completed.reduce((sum, task) => sum + task.estimatedMinutes, 0));
    expect(completed.every((task) => task.progress === 100 && task.riskScore === 0 && task.completedAt && task.completedAt < scenarioDate())).toBe(true);
    state.tasks[0].careerSkillIds.push("changed");
    state.planBlocks[0].title = "Changed";
    expect(createDemoState().tasks[0].careerSkillIds).not.toContain("changed");
    expect(createDemoState().planBlocks[0].title).not.toBe("Changed");
  });

  it("does not copy regular student history into the competition walkthrough", () => {
    const snapshot = {
      version: competitionScenario.version, student_id: competitionScenario.student.id,
      opportunity: { id: competitionScenario.opportunityId, title: "Junior DevOps Internship", provider: "Northstar Labs", rank_score: 70, strengths: ["Git"], skill_gaps: ["Docker"], closes_on: "2026-10-14", summary: "Sample internship" }, comparison_roles: [],
    } as unknown as CompetitionSnapshot;
    const state = createCompetitionState(snapshot);
    expect(state.tasks).toHaveLength(4);
    expect(state.planBlocks).toHaveLength(4);
    expect(state.completedTaskCount).toBe(0);
    expect(state.productiveMinutes).toBe(0);
    expect(state.currentStreak).toBe(0);
    expect(state.intelligenceItems).toHaveLength(6);
    expect(state.notifications.some((notice) => !notice.read)).toBe(true);
    state.notifications[0].read = true;
    expect(createCompetitionState(snapshot).notifications[0].read).toBe(false);
  });
});
