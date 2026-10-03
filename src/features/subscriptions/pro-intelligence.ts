import type { DemoState, PlanBlock, Task } from "@/data/demo/types";
import { stateScenarioDate } from "@/data/demo/scenario";
import { availableCapacity, selectNextBestAction } from "@/features/dashboard/domain/dashboard";

export type ProPreferences = {
  automaticPlanning: boolean;
  weeklyHours: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  planningStyle: "balanced" | "deadline-first" | "career-first";
  notificationIntensity: "quiet" | "balanced" | "focused";
  targetDate: string;
};
export type PlanChange = { id: string; title: string; before: string | null; after: string | null; reason: string };
export type ProActivity = { id: string; at: string; kind: "plan" | "readiness" | "evidence" | "preparation"; title: string; detail: string; changes?: PlanChange[]; before?: PlanBlock[]; after?: PlanBlock[] };

export function defaultProPreferences(state: DemoState): ProPreferences {
  return { automaticPlanning: true, weeklyHours: state.onboarding.weeklyLearningHours || 6, difficulty: "intermediate", planningStyle: "balanced", notificationIntensity: "balanced", targetDate: state.competition ? "2027-03-01" : stateScenarioDate(state, 84) };
}

export function planningInput(state: DemoState, preferences: ProPreferences) {
  return JSON.stringify({ student: state.student.id, capacity: state.capacity, tasks: state.tasks.map(task => [task.id, task.dueAt, task.estimatedMinutes, task.status, task.riskScore, task.careerRelevance]), hours: preferences.weeklyHours, style: preferences.planningStyle, target: preferences.targetDate });
}

export function changedBlocks(before: PlanBlock[], after: PlanBlock[]): PlanChange[] {
  const previous = new Map(before.map(block => [block.id, block]));
  const next = new Map(after.map(block => [block.id, block]));
  return [...new Set([...previous.keys(), ...next.keys()])].flatMap(id => {
    const from = previous.get(id), to = next.get(id);
    if (from?.startAt === to?.startAt && from?.endAt === to?.endAt) return [];
    return [{ id, title: (to ?? from)!.title, before: from?.startAt ?? null, after: to?.startAt ?? null, reason: to?.adaptationReason ?? "Your schedule changed." }];
  });
}

const careerTask = (task: Task) => ["Career", "career-learning", "Internship", "AI Recommended"].includes(task.category);
const duration = (block: PlanBlock) => Math.max(1, Math.round((Date.parse(block.endAt) - Date.parse(block.startAt)) / 60_000));
function localTimestamp(date: string, minutes: number) { return `${date}T${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`; }

/** Deterministic scheduling of existing work. Fixed events, completed work and focus reservations stay protected. */
export function buildAutomaticPlan(state: DemoState, preferences: ProPreferences) {
  const today = stateScenarioDate(state);
  const tasks = new Map(state.tasks.map(task => [task.id, task]));
  const protectedBlocks = state.planBlocks.filter(block => block.isFixed || block.isFocusBlock || !block.taskId || !tasks.has(block.taskId) || tasks.get(block.taskId)?.status === "completed" || block.startAt.slice(0, 10) < today);
  const candidates = state.planBlocks.filter(block => !protectedBlocks.includes(block));
  const budget = availableCapacity(state.capacity);
  const rank = (block: PlanBlock) => {
    const task = tasks.get(block.taskId ?? "");
    if (!task) return 0;
    const days = task.dueAt ? Math.max(0, (Date.parse(task.dueAt) - Date.parse(`${today}T08:00:00`)) / 86_400_000) : 30;
    return 1000 / (1 + days) + task.riskScore + (preferences.planningStyle === "career-first" ? task.careerRelevance : preferences.planningStyle === "deadline-first" && task.category === "Academic" ? 80 : task.careerRelevance / 3);
  };
  const placed = [...protectedBlocks];
  const used = new Map<string, number>();
  const careerUsed = new Map<number, number>();
  for (const block of protectedBlocks) {
    const date = block.startAt.slice(0, 10);
    if (date < today || block.isFixed) continue;
    // Completed study and reserved focus time still consume the day's learning allowance.
    if (block.taskId || block.isFocusBlock) used.set(date, (used.get(date) ?? 0) + duration(block));
    const task = tasks.get(block.taskId ?? "");
    const day = Math.round((Date.parse(`${date}T12:00:00`) - Date.parse(`${today}T12:00:00`)) / 86_400_000);
    if (task && careerTask(task)) careerUsed.set(Math.floor(day / 7), (careerUsed.get(Math.floor(day / 7)) ?? 0) + duration(block));
  }
  const unscheduled: string[] = [];
  for (const block of [...candidates].sort((a, b) => rank(b) - rank(a) || a.startAt.localeCompare(b.startAt))) {
    const task = tasks.get(block.taskId ?? "");
    const minutes = duration(block);
    let assigned: PlanBlock | null = null;
    for (let day = 0; day < 14 && !assigned; day++) {
      const date = stateScenarioDate(state, day);
      const week = Math.floor(day / 7);
      if ((used.get(date) ?? 0) + minutes > budget) continue;
      if (task && careerTask(task) && ((careerUsed.get(week) ?? 0) + minutes > preferences.weeklyHours * 60 || date > preferences.targetDate)) continue;
      const due = task?.dueAt ? Date.parse(task.dueAt) : Infinity;
      for (let start = 8 * 60; start + minutes <= 21 * 60; start += 15) {
        const startAt = localTimestamp(date, start), endAt = localTimestamp(date, start + minutes);
        if (Date.parse(endAt) > due) break;
        if (placed.some(other => Date.parse(startAt) < Date.parse(other.endAt) && Date.parse(endAt) > Date.parse(other.startAt))) continue;
        assigned = { ...block, startAt, endAt, isConflict: false, previousStartAt: block.startAt, adaptationReason: task?.dueAt ? "Scheduled before the deadline, within available capacity and around protected events." : "Fits your available capacity and career-learning allowance." };
        used.set(date, (used.get(date) ?? 0) + minutes);
        if (task && careerTask(task)) careerUsed.set(week, (careerUsed.get(week) ?? 0) + minutes);
        break;
      }
    }
    if (assigned) placed.push(assigned);
    else {
      unscheduled.push(block.title);
      placed.push({ ...block, isConflict: true, adaptationReason: "No safe slot fits the current capacity and deadline. Original time preserved; review this task manually." });
      // A preserved unresolved block must not silently overlap a block we just moved.
      for (let index = protectedBlocks.length; index < placed.length - 1; index++) {
        const other = placed[index];
        if (Date.parse(block.startAt) < Date.parse(other.endAt) && Date.parse(block.endAt) > Date.parse(other.startAt)) {
          placed[index] = { ...other, isConflict: true, adaptationReason: "Overlaps an unresolved task kept at its original time. Review both tasks manually." };
          if (!unscheduled.includes(other.title)) unscheduled.push(other.title);
        }
      }
    }
  }
  return { blocks: placed.sort((a, b) => a.startAt.localeCompare(b.startAt)), changes: changedBlocks(state.planBlocks, placed), unscheduled };
}

export function advancedPriorityFactors(state: DemoState) {
  const action = selectNextBestAction(state);
  const task = state.tasks.find(item => item.id === action.taskId);
  const skillIds = task?.careerSkillIds ?? [];
  const relevant = state.evidence.filter(item => skillIds.includes(item.skillId));
  const verified = relevant.filter(item => item.status === "verified");
  const dependencies = state.careerSkills.filter(skill => skill.prerequisites.some(id => skillIds.includes(id)));
  return [
    { label: "Deadline urgency", value: action.deadlineRisk, detail: task?.dueAt ? `Due ${new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. ${task.progress}% complete; ${task.estimatedMinutes} minutes estimated.` : "No deadline is recorded for this task." },
    { label: "Career relevance", value: action.careerImpact, detail: skillIds.length ? `Builds ${skillIds.join(", ")} toward ${state.student.targetRole}.` : "Protects academic progress so career learning can continue sustainably." },
    { label: "Dependency impact", value: `${dependencies.length} linked milestones`, detail: dependencies.length ? `Supports ${dependencies.map(skill => skill.name).join(", ")}. Prerequisites still need to be demonstrated.` : "No downstream skill prerequisite is recorded for this task." },
    { label: "Evidence confidence", value: relevant.length ? `${verified.length} / ${relevant.length} verified` : "Not yet evidenced", detail: verified.length ? `Supported by ${verified.map(item => item.label).join("; ")}.` : "There is no verified skill evidence linked to this task. Completion alone does not verify a skill." },
    { label: "Capacity fit", value: `${action.durationMinutes} / ${availableCapacity(state.capacity)} min`, detail: `${action.durationMinutes} minutes recommended within today's available time. Energy fit: ${action.energyFit.toLowerCase()}.` },
  ];
}

export function evidenceInsights(state: DemoState) {
  const strongest = [...state.evidence].filter(item => item.status === "verified").sort((a, b) => b.confidence - a.confidence)[0];
  const weakest = [...state.careerSkills].filter(skill => !["verified", "completed"].includes(skill.status)).sort((a, b) => a.proficiency - b.proficiency)[0];
  const missing = state.careerSkills.filter(skill => !state.evidence.some(item => item.skillId === skill.id && item.status === "verified"));
  return { strongest, weakest, missing };
}
