import { scenarioAt, scenarioDate } from "../demo-data/scenario";
import type { DemoState, PlanBlock, Task, TaskStatus } from "../demo-data/types";
import type { LmsAssignment } from "../integrations/lms/types";
import { availableCapacity } from "./dashboard";
import { endAtMinutes } from "./planner";
import { buildNextBestAction } from "./priority";

export function assignmentKey(assignment: Pick<LmsAssignment, "source" | "externalId">): string {
  return `${assignment.source}:${assignment.externalId}`;
}

export function deadlineRiskScore(dueAt: string, now = scenarioAt(0, "08:00:00")): number {
  const hours = (new Date(dueAt).getTime() - new Date(now).getTime()) / 3_600_000;
  if (!Number.isFinite(hours) || hours <= 0) return 98;
  if (hours <= 24) return 94;
  if (hours <= 72) return 84;
  if (hours <= 7 * 24) return 72;
  if (hours <= 14 * 24) return 52;
  return 30;
}

function taskStatus(assignment: LmsAssignment, existing?: Task): TaskStatus {
  if (existing?.status === "completed" || assignment.status === "submitted") return "completed";
  if (assignment.status === "closed") return "missed";
  return existing?.status === "in-progress" ? "in-progress" : "upcoming";
}

function findTask(tasks: Task[], assignment: LmsAssignment): Task | undefined {
  const linked = tasks.find((task) => task.source === assignment.source && task.externalId === assignment.externalId);
  if (linked) return linked;
  // Attach a unique manual academic task with the same title on first import.
  const manual = tasks.filter((task) => task.category === "Academic" && !task.externalId && task.title.trim().toLowerCase() === assignment.title.trim().toLowerCase());
  return manual.length === 1 ? manual[0] : undefined;
}

function scheduleBlock(task: Task, blocks: PlanBlock[], state: DemoState): PlanBlock | null {
  if (!task.dueAt || task.status === "completed") return null;
  const due = new Date(task.dueAt).getTime();
  const minutes = Math.min(90, task.estimatedMinutes);
  const capacity = availableCapacity(state.capacity);
  if (capacity < minutes) return null;
  for (let offset = 0; offset <= 21 && scenarioDate(offset) <= task.dueAt.slice(0, 10); offset++) {
    const date = scenarioDate(offset);
    const dailyBlocks = blocks.filter((block) => block.startAt.slice(0, 10) === date);
    const dailyMinutes = dailyBlocks.reduce((total, block) => total + Math.max(0, (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000), 0);
    if (dailyMinutes + minutes > capacity) continue;
    for (const hour of [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
      const startAt = scenarioAt(offset, `${hour}:00:00`);
      const endAt = endAtMinutes(startAt, minutes);
      const start = new Date(startAt).getTime();
      const end = new Date(endAt).getTime();
      if (end >= due || endAt.slice(0, 10) !== date) continue;
      if (dailyBlocks.some((block) => start < new Date(block.endAt).getTime() && end > new Date(block.startAt).getTime())) continue;
      return { id: `block-${task.id}-lms`, taskId: task.id, title: task.title, category: "Academic", startAt, endAt };
    }
  }
  return null;
}

export function importLmsAssignments(state: DemoState, incoming: readonly LmsAssignment[]): DemoState {
  if (!incoming.length) return state;
  const assignments = [...new Map(incoming.map((assignment) => [assignmentKey(assignment), assignment])).values()];
  const tasks = [...state.tasks];
  const blocks = [...state.planBlocks];
  let newlyCompleted = 0;

  for (const assignment of assignments) {
    const existing = findTask(tasks, assignment);
    const status = taskStatus(assignment, existing);
    const task: Task = {
      id: existing?.id ?? `lms-${encodeURIComponent(assignmentKey(assignment))}`,
      title: assignment.title,
      category: "Academic",
      status,
      estimatedMinutes: existing?.estimatedMinutes ?? 90,
      dueAt: assignment.dueAt,
      progress: status === "completed" ? 100 : existing?.progress ?? 0,
      difficulty: existing?.difficulty ?? 3,
      careerSkillIds: existing?.careerSkillIds ?? [],
      riskScore: status === "completed" ? 0 : deadlineRiskScore(assignment.dueAt),
      careerRelevance: existing?.careerRelevance ?? 35,
      description: assignment.description,
      source: assignment.source,
      externalId: assignment.externalId,
      module: assignment.module,
      url: assignment.url,
    };
    if (status === "completed" && existing?.status !== "completed") newlyCompleted++;
    if (existing) tasks[tasks.findIndex((item) => item.id === existing.id)] = task;
    else tasks.push(task);

    const taskBlocks = blocks.filter((block) => block.taskId === task.id);
    const blocksStillValid = taskBlocks.some((block) => new Date(block.endAt).getTime() < new Date(assignment.dueAt).getTime());
    if (taskBlocks.length && blocksStillValid) {
      for (const block of taskBlocks) {
        const index = blocks.findIndex((item) => item.id === block.id);
        blocks[index] = { ...block, title: assignment.title };
      }
    } else {
      if (taskBlocks.length) blocks.splice(0, blocks.length, ...blocks.filter((block) => block.taskId !== task.id));
      const scheduled = scheduleBlock(task, blocks, state);
      if (scheduled) blocks.push(scheduled);
    }
  }

  const next = tasks.filter((task) => task.status !== "completed" && task.dueAt)
    .sort((a, b) => b.riskScore - a.riskScore || a.dueAt!.localeCompare(b.dueAt!))[0];
  return {
    ...state,
    tasks,
    planBlocks: blocks,
    completedTaskCount: state.completedTaskCount + newlyCompleted,
    activeAction: next ? buildNextBestAction(next) : state.activeAction,
  };
}
