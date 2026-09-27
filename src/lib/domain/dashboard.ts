import type { CareerSkill, DemoState, PlanBlock, StudentCapacity, Task } from "../demo-data/types";
import { demoPlanBlocks, demoTasks } from "../demo-data/seed";
import { scenarioDate } from "../demo-data/scenario";
import { buildLowCapacityPlan, endAtMinutes } from "./planner";
import { buildNextBestAction, riskLevel } from "./priority";
import { hasLifeLoadFactors, planningCapacityMinutes } from "./life-load";
import { replanLifeLoadBlocks } from "./planner";

export const capacityStages = ["Capacity updated", "Checking deadlines", "Recalculating priorities", "Optimizing schedule", "Updating recommendation"];
export const capacityPresets: { label: string; icon: string; capacity: StudentCapacity }[] = [
  { label: "Low Capacity", icon: "😴", capacity: { availableMinutes: 120, energy: 1, focus: "low", workload: "heavy", unexpectedCommitmentMinutes: 0 } },
  { label: "Normal Day", icon: "🙂", capacity: { availableMinutes: 270, energy: 3, focus: "high", workload: "moderate", unexpectedCommitmentMinutes: 0 } },
  { label: "High Focus", icon: "⚡", capacity: { availableMinutes: 360, energy: 5, focus: "high", workload: "light", unexpectedCommitmentMinutes: 0 } },
];
export const availableCapacity = planningCapacityMinutes;
export const isLowCapacity = (capacity: StudentCapacity) => availableCapacity(capacity) <= 120 || capacity.energy <= 2 || capacity.focus === "low";

const percentage = (completed: number, total: number) => total ? Math.round(100 * completed / total) : 0;
// Milestones with more prerequisites represent more pathway work in this demo.
const milestoneWeight = (skill: CareerSkill) => 1 + skill.prerequisites.length;

export function selectDeadlineRiskTasks(state: DemoState): Task[] {
  return state.tasks.filter((task) => task.status !== "completed" && task.dueAt).sort((a, b) => b.riskScore - a.riskScore || a.dueAt!.localeCompare(b.dueAt!));
}

export function selectCurrentCareerSkill(state: DemoState): CareerSkill | undefined {
  return state.careerSkills.find((skill) => skill.status === "in-progress")
    ?? state.careerSkills.find((skill) => skill.status === "available")
    ?? state.careerSkills.find((skill) => skill.status === "locked");
}

export function selectTodayTimeline(state: DemoState, today = scenarioDate()): PlanBlock[] {
  return state.planBlocks.filter((block) => block.startAt.startsWith(today) || block.previousStartAt?.startsWith(today))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function selectNextBestAction(state: DemoState) {
  const activeTask = state.tasks.find((task) => task.id === state.activeAction.taskId && task.status !== "completed");
  const task = activeTask ?? selectDeadlineRiskTasks(state)[0] ?? state.tasks.find((item) => item.status !== "completed");
  if (!task) return { ...state.activeAction, taskId: "", title: "All planned tasks complete", durationMinutes: 0, score: 0, deadlineRisk: "low" as const, rationale: "Your current plan is complete.", reasons: [] };
  const action = activeTask ? state.activeAction : buildNextBestAction(task);
  const minutes = availableCapacity(state.capacity);
  return {
    ...action,
    deadlineRisk: riskLevel(task.riskScore),
    durationMinutes: Math.min(action.durationMinutes, minutes),
    energyFit: isLowCapacity(state.capacity) ? (minutes ? "Fair" as const : "Rest first" as const) : "Good" as const,
    metrics: { ...action.metrics, urgency: task.riskScore, capacityFit: Math.round(100 * Math.min(minutes, task.estimatedMinutes) / Math.max(1, task.estimatedMinutes)) },
  };
}

export function dashboardMetrics(state: DemoState) {
  const scheduled = state.planBlocks.filter((block) => block.taskId && !block.isFocusBlock);
  const completed = new Set(state.tasks.filter((task) => task.status === "completed").map((task) => task.id));
  const milestoneTotal = state.careerSkills.reduce((sum, skill) => sum + milestoneWeight(skill), 0);
  const milestoneCompleted = state.careerSkills.reduce((sum, skill) => sum + (skill.status === "verified" || skill.status === "completed" ? milestoneWeight(skill) : 0), 0);
  return {
    completedTasks: completed.size,
    totalTasks: state.tasks.length,
    taskCompletion: percentage(completed.size, state.tasks.length),
    planCompletion: percentage(scheduled.filter((block) => completed.has(block.taskId!)).length, scheduled.length),
    careerProgress: percentage(milestoneCompleted, milestoneTotal),
    productiveHours: Number((state.productiveMinutes / 60).toFixed(1)),
  };
}

/** Apply each phase to the latest state so interactions during a run are retained. */
export function adaptCapacityStage(state: DemoState, capacity: StudentCapacity, stage: number): DemoState {
  if (stage === 0) return { ...state, capacity };
  const low = isLowCapacity(capacity);
  if (stage === 1) return { ...state, tasks: state.tasks.map((task) => {
    if (task.status === "completed" || !task.dueAt) return task;
    const baseline = demoTasks.find((seed) => seed.id === task.id)?.riskScore ?? task.riskScore;
    const urgent = task.dueAt.slice(0, 10) <= scenarioDate(1);
    return { ...task, riskScore: Math.min(99, baseline + (low ? 6 : 0) + (urgent ? 4 : 0)) };
  }) };
  if (stage === 3) {
    const replacements = buildLowCapacityPlan(capacity).map((block) => ({ ...block, id: ({ "db-outline": "block-database", "docker-lesson": "block-docker", "review-notes": "block-review" } as Record<string, string>)[block.id] ?? block.id }));
    // Only adapt known flexible blocks. Preserve user-created, fixed, and completed work.
    const planBlocks = state.planBlocks.map((block) => {
      if (block.isFixed || state.tasks.find((task) => task.id === block.taskId)?.status === "completed") return block;
      if (low && block.id === "block-aws") return { ...block, previousStartAt: block.previousStartAt ?? block.startAt, startAt: `${scenarioDate(3)}T17:30:00`, endAt: `${scenarioDate(3)}T18:30:00` };
      const replacement = replacements.find((item) => item.id === block.id);
      if (low && replacement) return { ...replacement, previousStartAt: block.previousStartAt ?? block.startAt };
      if (low && ["block-database", "block-docker", "block-review"].includes(block.id) && !replacement) {
        const startAt = `${scenarioDate(1)}T${block.startAt.slice(11)}`;
        const minutes = (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000;
        return { ...block, previousStartAt: block.previousStartAt ?? block.startAt, startAt, endAt: endAtMinutes(startAt, minutes) };
      }
      if (!low && !state.planBlocks.some((item) => item.id === "urgent-database-block")) {
        const original = demoPlanBlocks.find((item) => item.id === block.id);
        if (original) return { ...original, previousStartAt: block.previousStartAt ?? block.startAt };
      }
      return block;
    }).filter((block) => low || !["protected-focus-a", "protected-focus-b"].includes(block.id));
    const added = low ? replacements.filter((block) => block.isFocusBlock && !planBlocks.some((item) => item.id === block.id)) : [];
    const updatedBlocks = [...planBlocks, ...added].map((block) => {
      if (hasLifeLoadFactors(capacity) || !block.lifeLoadOriginalMinutes) return block;
      const { lifeLoadOriginalMinutes, ...rest } = block;
      return { ...rest, endAt: endAtMinutes(block.startAt, lifeLoadOriginalMinutes) };
    });
    return { ...state, planBlocks: low && hasLifeLoadFactors(capacity) ? replanLifeLoadBlocks(updatedBlocks, state.planBlocks, state.tasks, capacity) : updatedBlocks };
  }
  if (stage === 4) {
    const open = state.tasks.filter((task) => task.status !== "completed");
    const task = open.find((task) => task.riskScore >= 95) ?? open.find((task) => task.id === (low ? "database-assignment" : "docker-lab")) ?? open[0];
    if (!task) return state;
    const block = state.planBlocks.find((block) => block.taskId === task.id && block.startAt.startsWith(scenarioDate()));
    const duration = !availableCapacity(capacity) ? 0 : block ? (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000 : task.estimatedMinutes;
    return { ...state, activeAction: buildNextBestAction(task, low && task.id === "database-assignment" ? {
      title: duration ? "Start the database research outline" : "Make room for your next focus block", durationMinutes: duration,
      rationale: `Limited capacity + ${task.riskScore}% deadline risk. Start with the outline to protect your submission before returning to career learning.`,
      reasons: [{ label: "Deadline urgency", points: 32 }, { label: "Career relevance", points: 19 }, { label: "Prerequisite importance", points: 12 }, { label: "Academic impact", points: 21 }, { label: "Available capacity", points: 15 }, { label: "Effort penalty", points: -11 }],
    } : { durationMinutes: duration }) };
  }
  return state;
}

export function recoverDatabase(state: DemoState): DemoState {
  const task = state.tasks.find((task) => task.id === "database-assignment" && task.status !== "completed");
  if (!task) return state;
  const startAt = `${scenarioDate()}T20:00:00`;
  const durationMinutes = Math.min(90, availableCapacity(state.capacity));
  if (!durationMinutes) return state;
  const low = isLowCapacity(state.capacity);
  const remainingFocus = Math.max(0, availableCapacity(state.capacity) - durationMinutes);
  const planBlocks = state.planBlocks.filter((block) => block.taskId !== task.id).flatMap((block) => {
    const completed = state.tasks.find((item) => item.id === block.taskId)?.status === "completed";
    if (block.isFixed || completed) return [block];
    if (block.id === "block-aws") return [{ ...block, previousStartAt: block.previousStartAt ?? block.startAt, startAt: `${scenarioDate(3)}T17:30:00`, endAt: `${scenarioDate(3)}T18:30:00` }];
    if (low && block.startAt.startsWith(scenarioDate())) {
      if (block.isFocusBlock) {
        const minutes = Math.floor(remainingFocus / 2);
        return minutes ? [{ ...block, endAt: endAtMinutes(block.startAt, minutes) }] : [];
      }
      const movedStart = `${scenarioDate(1)}T${block.startAt.slice(11)}`;
      const duration = (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000;
      return [{ ...block, previousStartAt: block.previousStartAt ?? block.startAt, startAt: movedStart, endAt: endAtMinutes(movedStart, duration) }];
    }
    return [block];
  });
  planBlocks.push({ id: "block-database", taskId: task.id, title: task.title, category: task.category, startAt, endAt: endAtMinutes(startAt, durationMinutes) });
  const recovered = { ...task, riskScore: Math.min(task.riskScore, durationMinutes >= 90 ? 68 : 82) };
  return { ...state, planBlocks, tasks: state.tasks.map((item) => item.id === task.id ? recovered : item), activeAction: buildNextBestAction(recovered, { durationMinutes, rationale: "Your recovery window is reserved tonight. AWS learning moved to Thursday to protect this deadline." }) };
}

export function weeklyPlannedHours(state: DemoState) {
  return Array.from({ length: 7 }, (_, index) => {
    const date = scenarioDate(index);
    const blocks = state.planBlocks.filter((block) => block.startAt.startsWith(date) && !block.isFocusBlock);
    const hours = (categories: string[]) => Number((blocks.filter((block) => categories.includes(block.category)).reduce((sum, block) => sum + (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 3_600_000, 0)).toFixed(1));
    return { day: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short" }), academic: hours(["Academic"]), career: hours(["Career", "career-learning", "AI Recommended", "Internship"]) };
  });
}
