import { scenarioAt, scenarioDate } from "@/data/demo/scenario";
import { freePathForSkill, type FreeLearningPath, type FreePathStep } from "@/data/demo/free-learning-paths";
import type { LearningResource } from "@/data/demo/resources";
import type { DemoState, PlanBlock, Task } from "@/data/demo/types";
import { availableCapacity } from "@/features/dashboard/domain/dashboard";
import { endAtMinutes } from "@/features/planner/domain/planner";

const minute = 60_000;

function duration(block: PlanBlock): number {
  return Math.max(0, (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / minute);
}

function isCareerLearning(block: PlanBlock): boolean {
  return block.category === "Career" || block.category === "career-learning";
}

/** Append-only scheduling: existing work keeps its exact start and end times. */
export type SchedulableLearningPath = Pick<FreeLearningPath, "id" | "skillId" | "durationHours"> & { steps: readonly Pick<FreePathStep, "id" | "title" | "durationHours" | "outcome">[] };

export function resourceLearningPath(resource: LearningResource): SchedulableLearningPath {
  return {
    id: resource.id, skillId: resource.skill, durationHours: resource.durationHours + 4,
    steps: [{ id: "course", title: resource.title, durationHours: resource.durationHours, outcome: `${resource.provider} learning path · estimated study time` },
      { id: "lab", title: "Practice what you learned", durationHours: 1, outcome: freePathForSkill(resource.skill)?.steps.find((step) => step.id === "lab")?.outcome ?? "Practice the skills covered in this course." },
      { id: "project", title: "Build your portfolio evidence", durationHours: 2, outcome: freePathForSkill(resource.skill)?.steps.find((step) => step.id === "project")?.outcome ?? "Document a practical project." },
      { id: "verification", title: "LumaPath skill verification", durationHours: 1, outcome: "Take the local knowledge check after completing your study and practice." }],
  };
}

export function scheduleLearningPath(state: DemoState, path: SchedulableLearningPath): { tasks: Task[]; blocks: PlanBlock[] } | null {
  const weeklyLimit = Math.floor(state.onboarding.weeklyLearningHours * 60 / 30) * 30;
  const dailyLimit = Math.floor(Math.min(120, availableCapacity(state.capacity)) / 30) * 30;
  if (weeklyLimit < 30 || dailyLimit < 30) return null;
  const horizonDays = Math.max(84, Math.ceil(path.durationHours * 60 / weeklyLimit) * 7 + 28);

  const blocks = [...state.planBlocks];
  const tasks: Task[] = [];
  let lastEnd = 0;
  const protectedDates = new Set<string>();
  for (const task of state.tasks) {
    if (task.category !== "Academic" || task.status === "completed" || !task.dueAt) continue;
    const dueDate = task.dueAt.slice(0, 10);
    protectedDates.add(dueDate);
    const before = new Date(`${dueDate}T12:00:00`);
    before.setDate(before.getDate() - 1);
    protectedDates.add(`${before.getFullYear()}-${String(before.getMonth() + 1).padStart(2, "0")}-${String(before.getDate()).padStart(2, "0")}`);
  }

  for (const step of path.steps) {
    let remaining = step.durationHours * 60;
    let part = 0;
    while (remaining > 0) {
      let placed = false;
      for (let offset = 0; offset < horizonDays && !placed; offset++) {
        const date = scenarioDate(offset);
        if (protectedDates.has(date)) continue;
        const weekStart = offset - offset % 7;
        const weekDates = new Set(Array.from({ length: 7 }, (_, day) => scenarioDate(weekStart + day)));
        const weeklyUsed = blocks.filter((block) => isCareerLearning(block) && weekDates.has(block.startAt.slice(0, 10))).reduce((total, block) => total + duration(block), 0);
        const dailyBlocks = blocks.filter((block) => block.startAt.slice(0, 10) === date);
        const dailyUsed = dailyBlocks.reduce((total, block) => total + duration(block), 0);
        const dailyLearning = dailyBlocks.filter(isCareerLearning).reduce((total, block) => total + duration(block), 0);
        const budget = Math.floor(Math.min(90, remaining, weeklyLimit - weeklyUsed, dailyLimit - dailyLearning, availableCapacity(state.capacity) - dailyUsed) / 30) * 30;
        if (budget < 30) continue;

        const weekend = offset % 7 >= 5;
        const firstHour = weekend ? 10 : 17;
        const lastHour = weekend ? 18 : 22;
        for (let start = firstHour * 60; start + budget <= lastHour * 60; start += 30) {
          const startAt = scenarioAt(offset, `${String(Math.floor(start / 60)).padStart(2, "0")}:${String(start % 60).padStart(2, "0")}`);
          const endAt = endAtMinutes(startAt, budget);
          const startMs = new Date(startAt).getTime();
          const endMs = new Date(endAt).getTime();
          if (startMs < lastEnd) continue;
          if (dailyBlocks.some((block) => startMs < new Date(block.endAt).getTime() && endMs > new Date(block.startAt).getTime())) continue;
          part += 1;
          const id = `learning-${path.id}-${step.id}-${part}`;
          const title = `${step.title}${step.durationHours * 60 > budget ? ` · Part ${part}` : ""}`;
          tasks.push({ id, title, learningPathId: path.id, learningStepId: step.id, category: "career-learning", status: "upcoming", estimatedMinutes: budget, progress: 0, difficulty: 2, careerSkillIds: [path.skillId], skill: state.careerSkills.find((item) => item.id === path.skillId)?.name ?? path.skillId, riskScore: 20, careerRelevance: 90, description: step.outcome });
          blocks.push({ id: `block-${id}`, taskId: id, title, category: "career-learning", startAt, endAt });
          lastEnd = endMs;
          remaining -= budget;
          placed = true;
          break;
        }
      }
      if (!placed) return null;
    }
  }
  return { tasks, blocks: blocks.slice(state.planBlocks.length) };
}
