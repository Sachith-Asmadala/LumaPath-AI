import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { scenarioDate } from "@/data/demo/scenario";
import { adaptCapacityStage, availableCapacity, capacityPresets, dashboardMetrics, recoverDatabase, selectCurrentCareerSkill, selectDeadlineRiskTasks, selectNextBestAction, selectTodayTimeline } from "@/features/dashboard/domain/dashboard";
import { demoReducer } from "@/state/demo-provider";

const low = capacityPresets[0].capacity;
function adapt(state = createDemoState()) {
  return [0, 1, 2, 3, 4].reduce((current, stage) => adaptCapacityStage(current, low, stage), state);
}
describe("connected dashboard", () => {
  it("uses life load only as a planning buffer and protects urgent academic work", () => {
    const seed = createDemoState();
    const capacity = { ...seed.capacity, availableMinutes: 120, energy: 1 as const, focus: "low" as const, lifeLoadFactors: { "Family responsibilities": "High" as const, "Relationship pressure": "Medium" as const }, lifeLoadNote: "I need to help my family tonight." };
    expect(availableCapacity(capacity)).toBe(45);
    expect(availableCapacity({ ...capacity, lifeLoadNote: "" })).toBe(45);
    const optional = { id: "optional-meeting", taskId: "optional-meeting", title: "Optional catch-up", category: "Personal" as const, startAt: `${scenarioDate()}T16:00:00`, endAt: `${scenarioDate()}T16:45:00` };
    const withOptional = { ...seed, tasks: [...seed.tasks, { id: "optional-meeting", title: "Optional catch-up", category: "Personal" as const, status: "upcoming" as const, estimatedMinutes: 45, progress: 0, difficulty: 1, careerSkillIds: [], riskScore: 10, careerRelevance: 0, description: "Optional" }], planBlocks: [...seed.planBlocks, optional] };
    const next = [0, 1, 2, 3, 4].reduce((current, stage) => adaptCapacityStage(current, capacity, stage), withOptional);
    expect(next.capacity.lifeLoadFactors).toEqual(capacity.lifeLoadFactors);
    expect(next.planBlocks.find((block) => block.id === "block-database")?.startAt.startsWith(scenarioDate())).toBe(true);
    expect(next.planBlocks.find((block) => block.id === "block-aws")?.startAt).toBe(`${scenarioDate(3)}T17:30:00`);
    expect(next.planBlocks.some((block) => block.id === optional.id)).toBe(false);
    expect(next.tasks.some((task) => task.id === optional.id)).toBe(true);
    expect(next.activeAction.taskId).toBe("database-assignment");
  });
  it("shortens a flexible career-learning session when today's capacity is limited", () => {
    const seed = createDemoState();
    const learningTask = { id: "learning-docker", title: "Docker fundamentals", category: "career-learning" as const, status: "upcoming" as const, estimatedMinutes: 90, progress: 0, difficulty: 2, careerSkillIds: ["docker"], skill: "Docker", riskScore: 20, careerRelevance: 90, description: "Practice containers." };
    seed.tasks = [...seed.tasks, learningTask];
    seed.planBlocks = [...seed.planBlocks, { id: "block-learning-docker", taskId: learningTask.id, title: learningTask.title, category: "career-learning", startAt: `${scenarioDate()}T21:00:00`, endAt: `${scenarioDate()}T22:30:00` }];
    seed.tasks = seed.tasks.map((task) => task.id === "docker-lab" || task.id === "se-presentation" ? { ...task, status: "completed" as const } : task);
    const capacity = { ...seed.capacity, availableMinutes: 180, energy: 1 as const, lifeLoadFactors: { "Family responsibilities": "High" as const } };
    const next = [0, 1, 2, 3, 4].reduce((current, stage) => adaptCapacityStage(current, capacity, stage), seed);
    const block = next.planBlocks.find((item) => item.id === "block-learning-docker")!;
    expect(block.startAt.startsWith(scenarioDate())).toBe(true);
    expect((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000).toBe(30);
    expect(next.tasks.find((task) => task.id === learningTask.id)?.estimatedMinutes).toBe(90);
    const restored = [0, 1, 2, 3, 4].reduce((current, stage) => adaptCapacityStage(current, { ...seed.capacity, lifeLoadFactors: {} }, stage), next);
    const restoredBlock = restored.planBlocks.find((item) => item.id === block.id)!;
    expect((new Date(restoredBlock.endAt).getTime() - new Date(restoredBlock.startAt).getTime()) / 60_000).toBe(90);
  });
  it("sequences risk, schedule and recommendation without dropping future work", () => {
    const seed = createDemoState();
    const risk = adaptCapacityStage(seed, low, 1);
    expect(risk.tasks[0].riskScore).toBeGreaterThan(seed.tasks[0].riskScore);
    expect(risk.activeAction).toEqual(seed.activeAction);
    expect(risk.planBlocks).toEqual(seed.planBlocks);
    const next = adapt(seed);
    expect(next.planBlocks.find((block) => block.id === "block-aws")?.startAt).toBe(`${scenarioDate(3)}T17:30:00`);
    expect(next.activeAction.taskId).toBe("database-assignment");
    expect(next.activeAction.reasons.reduce((sum, factor) => sum + factor.points, 0)).toBe(next.activeAction.score);
    expect(new Set(next.planBlocks.map((block) => block.id)).size).toBe(next.planBlocks.length);
    expect(adapt(next).planBlocks).toHaveLength(next.planBlocks.length);
  });
  it("keeps user-created work and completed tasks intact during replanning", () => {
    const seed = createDemoState();
    const completed = demoReducer(seed, { type: "complete-task", taskId: "database-assignment" });
    completed.planBlocks.push({ id: "custom", taskId: null, title: "Meeting", category: "Personal", startAt: `${scenarioDate(2)}T15:00:00`, endAt: `${scenarioDate(2)}T16:00:00` });
    const next = adapt(completed);
    expect(next.tasks[0].riskScore).toBe(0);
    expect(next.activeAction.taskId).not.toBe("database-assignment");
    expect(next.planBlocks.some((block) => block.id === "custom")).toBe(true);
  });
  it("restores normal capacity without duplicate AWS blocks", () => {
    const next = [0, 1, 2, 3, 4].reduce((state, stage) => adaptCapacityStage(state, capacityPresets[1].capacity, stage), adapt());
    expect(next.planBlocks.filter((block) => block.id === "block-aws")).toHaveLength(1);
    expect(next.planBlocks.find((block) => block.id === "block-aws")?.startAt.startsWith(scenarioDate())).toBe(true);
  });
  it("recovery actually reduces risk and reserves one database block", () => {
    const before = adapt();
    const next = recoverDatabase(before);
    expect(next.tasks[0].riskScore).toBeLessThan(before.tasks[0].riskScore);
    expect(next.planBlocks.filter((block) => block.taskId === "database-assignment")).toHaveLength(1);
    expect(next.activeAction.deadlineRisk).toBe("moderate");
    const flexibleMinutes = next.planBlocks.filter((block) => !block.isFixed && block.startAt.startsWith(scenarioDate())).reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000, 0);
    expect(flexibleMinutes).toBeLessThanOrEqual(low.availableMinutes);
    expect(recoverDatabase(next).planBlocks).toHaveLength(next.planBlocks.length);
  });
  it("verification advances tasks, milestones and readiness exactly once", () => {
    const seed = createDemoState();
    const next = demoReducer(seed, { type: "complete-skill", skillId: "docker" });
    expect(next.readiness.score).toBe(74);
    expect(next.careerSkills.find((skill) => skill.id === "cicd")?.status).toBe("available");
    expect(next.tasks.find((task) => task.id === "docker-lab")?.riskScore).toBe(0);
    expect(demoReducer(next, { type: "complete-skill", skillId: "docker" })).toBe(next);
    expect(demoReducer(next, { type: "complete-task", taskId: "docker-lab" })).toBe(next);
    expect(dashboardMetrics(next).planCompletion).toBe(25);
    expect(dashboardMetrics(next).careerProgress).toBeGreaterThan(dashboardMetrics(seed).careerProgress);
  });
  it("planning an intelligence item is idempotent and shared by the planner", () => {
    const seed = createDemoState();
    const next = demoReducer(seed, { type: "plan-intelligence", itemId: "container-release" });
    expect(next.planBlocks).toHaveLength(seed.planBlocks.length + 1);
    expect(next.tasks).toHaveLength(seed.tasks.length + 1);
    expect(demoReducer(next, { type: "plan-intelligence", itemId: "container-release" })).toBe(next);
  });
  it("derives completion from the current tasks, schedule, and weighted milestones", () => {
    const seed = createDemoState();
    const added = demoReducer(seed, { type: "plan-intelligence", itemId: "container-release" });
    const verified = demoReducer(added, { type: "complete-skill", skillId: "docker" });
    const metrics = dashboardMetrics(verified);
    expect(metrics.completedTasks).toBe(1);
    expect(metrics.totalTasks).toBe(8);
    expect(metrics.taskCompletion).toBe(13);
    expect(metrics.planCompletion).toBe(20);
    expect(metrics.careerProgress).toBe(28);
    expect(metrics.productiveHours).toBe(0.5);
    expect(selectCurrentCareerSkill(verified)?.id).toBe("cicd");
  });
  it("keeps capacity, recovery, risk, timeline, and next action aligned", () => {
    const lowState = adapt();
    expect(selectNextBestAction(lowState).taskId).toBe("database-assignment");
    expect(selectNextBestAction(lowState).durationMinutes).toBeLessThanOrEqual(120);
    expect(selectTodayTimeline(lowState).some((block) => block.id === "block-aws")).toBe(true);
    const recovered = recoverDatabase(lowState);
    expect(selectDeadlineRiskTasks(recovered).find((task) => task.id === "database-assignment")?.riskScore).toBe(68);
    expect(selectNextBestAction(recovered).deadlineRisk).toBe("moderate");
    expect(selectTodayTimeline(recovered).some((block) => block.taskId === "database-assignment" && block.startAt.endsWith("20:00:00"))).toBe(true);
    const completed = demoReducer(recovered, { type: "complete-task", taskId: "database-assignment" });
    expect(selectDeadlineRiskTasks(completed).some((task) => task.id === "database-assignment")).toBe(false);
    expect(selectNextBestAction(completed).taskId).not.toBe("database-assignment");
  });
});
