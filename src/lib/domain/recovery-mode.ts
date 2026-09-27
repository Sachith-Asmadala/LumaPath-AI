import { scenarioDate } from "../demo-data/scenario";
import type { DemoState, PlanBlock, Task } from "../demo-data/types";
import { adaptCapacityStage } from "./dashboard";
import { endAtMinutes } from "./planner";

export type RecoveryChoice = "critical" | "lighter" | "keep" | "career" | "recommended";

function blockMinutes(block: PlanBlock): number {
  return Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000);
}

function protectedDates(tasks: Task[]): Set<string> {
  const dates = new Set<string>();
  for (const task of tasks) {
    if (task.category !== "Academic" || task.status === "completed" || !task.dueAt) continue;
    const due = task.dueAt.slice(0, 10);
    dates.add(due);
    const before = new Date(`${due}T12:00:00`);
    before.setDate(before.getDate() - 1);
    dates.add(`${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`);
  }
  return dates;
}

function moveCareerLearning(state: DemoState): PlanBlock[] {
  const today = scenarioDate();
  const deadlines = protectedDates(state.tasks);
  const careerToday = state.planBlocks.filter((block) => block.startAt.startsWith(today) && !block.isFixed && (block.category === "Career" || block.category === "career-learning") && state.tasks.find((task) => task.id === block.taskId)?.status !== "completed");
  const scheduled = state.planBlocks.filter((block) => !careerToday.includes(block));
  for (const block of careerToday) {
    const minutes = blockMinutes(block);
    let placed: PlanBlock | null = null;
    for (let offset = 1; offset <= 28 && !placed; offset++) {
      const date = scenarioDate(offset);
      if (deadlines.has(date)) continue;
      for (let start = 17 * 60; start + minutes <= 22 * 60; start += 30) {
        const startAt = `${date}T${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}:00`;
        const endAt = endAtMinutes(startAt, minutes);
        const startMs = new Date(startAt).getTime();
        const endMs = new Date(endAt).getTime();
        if (scheduled.some((item) => startMs < new Date(item.endAt).getTime() && endMs > new Date(item.startAt).getTime())) continue;
        placed = { ...block, startAt, endAt, previousStartAt: block.previousStartAt ?? block.startAt };
        break;
      }
    }
    if (placed) scheduled.push(placed);
  }
  return scheduled;
}

/** Pure preview and apply calculation: no planner changes happen when this is called. */
export function buildRecoveryCandidate(state: DemoState, choice: RecoveryChoice): DemoState {
  if (choice === "keep") return state;
  if (choice === "career") {
    const risk = adaptCapacityStage(state, state.capacity, 1);
    const moved = { ...risk, planBlocks: moveCareerLearning(risk) };
    return adaptCapacityStage(moved, state.capacity, 4);
  }
  const capacity = choice === "lighter"
    ? { ...state.capacity, unexpectedCommitmentMinutes: Math.min(120, state.capacity.unexpectedCommitmentMinutes + 30) }
    : state.capacity;
  const base = { ...state, capacity };
  const risk = adaptCapacityStage(base, capacity, 1);
  const scheduled = adaptCapacityStage(risk, capacity, 3);
  if (choice !== "critical") return adaptCapacityStage(scheduled, capacity, 4);
  const today = scenarioDate();
  const tasks = new Map(scheduled.tasks.map((task) => [task.id, task]));
  const criticalOnly = scheduled.planBlocks.filter((block) => {
    if (block.isFixed || !block.startAt.startsWith(today)) return true;
    const task = tasks.get(block.taskId ?? "");
    return block.category === "Academic" && Boolean(task?.dueAt && task.dueAt.slice(0, 10) <= scenarioDate(3) && task.riskScore >= 70);
  });
  return adaptCapacityStage({ ...scheduled, planBlocks: criticalOnly }, capacity, 4);
}

export function formatRecoveryMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}

export function recoveryPreviewRows(before: DemoState, after: DemoState) {
  const today = scenarioDate();
  return before.planBlocks.filter((block) => block.taskId && !block.isFixed && !block.isFocusBlock && block.startAt.startsWith(today)).map((block) => {
    const updated = after.planBlocks.find((item) => item.id === block.id);
    const afterLabel = !updated ? "Unscheduled" : updated.startAt.slice(0, 10) !== today
      ? `${new Date(`${updated.startAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })} · ${formatRecoveryMinutes(blockMinutes(updated))}`
      : formatRecoveryMinutes(blockMinutes(updated));
    return { id: block.id, title: block.title, before: formatRecoveryMinutes(blockMinutes(block)), after: afterLabel };
  });
}
