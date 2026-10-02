import type { DemoState, Task } from "@/data/demo/types";

export type TaskView = "active" | "completed" | "missed" | "all";
export type TaskSort = "priority" | "deadline" | "duration";
export function selectTaskCollection(tasks: Task[], { view, query, category, sort }: { view: TaskView; query: string; category: string; sort: TaskSort }) {
  const search = query.trim().toLowerCase();
  return tasks.filter((task) =>
    (view === "all" || (view === "active" ? task.status !== "completed" && task.status !== "missed" : task.status === view)) &&
    (category === "all" || task.category === category) &&
    `${task.title} ${task.description} ${task.module ?? ""}`.toLowerCase().includes(search),
  ).sort((a, b) => {
    const difference = sort === "duration" ? a.estimatedMinutes - b.estimatedMinutes : sort === "deadline" ? (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity) : b.riskScore - a.riskScore;
    return difference || a.title.localeCompare(b.title);
  });
}

export function selectActionableSkill(state: Pick<DemoState, "careerSkills" | "skillGap">) {
  const actionable = state.careerSkills.filter((skill) => ["in-progress", "available"].includes(skill.status) && skill.prerequisites.every((id) => state.careerSkills.some((parent) => parent.id === id && ["verified", "completed"].includes(parent.status))));
  return actionable.find((skill) => skill.name === state.skillGap?.recommendedSkill) ?? actionable.find((skill) => skill.status === "in-progress") ?? actionable[0];
}

export function selectAgenda(state: Pick<DemoState, "planBlocks" | "tasks">) {
  const groups = new Map<string, typeof state.planBlocks>();
  for (const block of [...state.planBlocks].sort((a, b) => a.startAt.localeCompare(b.startAt))) {
    const day = block.startAt.slice(0, 10);
    groups.set(day, [...(groups.get(day) ?? []), block]);
  }
  return [...groups].map(([day, blocks]) => ({ day, blocks, minutes: blocks.reduce((sum, block) => sum + Math.max(0, (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000), 0) }));
}
