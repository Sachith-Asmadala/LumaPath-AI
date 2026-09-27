import { scenarioDate } from "../demo-data/scenario";
import type { PlanBlock, StudentCapacity, Task } from "../demo-data/types";
import { planningCapacityMinutes } from "./life-load";

const stamp = (day: string, time: string) => `${day}T${time}:00`;

export function buildLowCapacityPlan(capacity: StudentCapacity): PlanBlock[] {
  const day = scenarioDate(0);
  const availableMinutes = planningCapacityMinutes(capacity);
  const protectedMinutes = Math.min(45, Math.round(availableMinutes * 0.375));
  const focusedMinutes = Math.min(75, availableMinutes - protectedMinutes);
  const outlineMinutes = Math.min(30, Math.round(focusedMinutes * 0.4));
  const dockerMinutes = Math.min(25, Math.round(focusedMinutes * 0.333));
  const reviewMinutes = Math.max(0, focusedMinutes - outlineMinutes - dockerMinutes);
  const focusOneMinutes = Math.floor(protectedMinutes / 2);
  const focusTwoMinutes = protectedMinutes - focusOneMinutes;
  const from = (start: string, duration: number) => {
    const [hour, minute] = start.split(":").map(Number);
    const beginning = new Date(`${day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
    const end = new Date(beginning.getTime() + duration * 60_000);
    const time = (date: Date) => `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
    return { startAt: stamp(day, time(beginning)), endAt: stamp(day, time(end)) };
  };
  const outline = from("11:30", outlineMinutes);
  const docker = from("12:10", dockerMinutes);
  const review = from("12:50", reviewMinutes);
  const focusA = from("13:20", focusOneMinutes);
  const focusB = from("14:00", focusTwoMinutes);
  const blocks: PlanBlock[] = [
    { id: "lecture-monday", taskId: null, title: "Systems Lecture", category: "Academic", startAt: stamp(day, "09:00"), endAt: stamp(day, "10:30"), isFixed: true },
    { id: "db-outline", taskId: "database-assignment", title: "Research outline", category: "Academic", ...outline },
    { id: "docker-lesson", taskId: "docker-lab", title: "Docker lesson", category: "Career", ...docker },
    ...(reviewMinutes > 0 ? [{ id: "review-notes", taskId: "se-presentation", title: "Review notes", category: "Academic" as const, ...review }] : []),
    { id: "protected-focus-a", taskId: null, title: "Protected focus block", category: "AI Recommended", ...focusA, isFocusBlock: true },
    { id: "protected-focus-b", taskId: null, title: "Protected focus block", category: "AI Recommended", ...focusB, isFocusBlock: true },
  ];
  return blocks.filter((block) => block.endAt > block.startAt);
}

/** Reserve today's adjusted study time for urgent academics; carry flexible work forward. */
export function replanLifeLoadBlocks(planned: PlanBlock[], original: PlanBlock[], tasks: Task[], capacity: StudentCapacity): PlanBlock[] {
  const today = scenarioDate();
  let remaining = planningCapacityMinutes(capacity);
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const originalById = new Map(original.map((block) => [block.id, block]));
  const fixedOrFuture = planned.filter((block) => block.isFixed || !block.startAt.startsWith(today) || taskById.get(block.taskId ?? "")?.status === "completed");
  const flexibleToday = planned.filter((block) => !fixedOrFuture.includes(block) && !block.isFocusBlock);
  const priority = (block: PlanBlock) => {
    const task = taskById.get(block.taskId ?? "");
    if (block.category === "Academic" && task?.dueAt && task.dueAt.slice(0, 10) <= scenarioDate(3)) return 200 + task.riskScore;
    if (block.category === "Academic") return 150 + (task?.riskScore ?? 0);
    if (block.category === "Career" || block.category === "career-learning") return 50 + (task?.careerRelevance ?? 0) / 10;
    return 0;
  };
  const duration = (block: PlanBlock) => Math.max(0, Math.round((new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000));
  const results = [...fixedOrFuture];
  const protectedDates = new Set<string>();
  for (const task of tasks) {
    if (task.category !== "Academic" || task.status === "completed" || !task.dueAt) continue;
    const due = task.dueAt.slice(0, 10);
    protectedDates.add(due);
    const dayBefore = new Date(`${due}T12:00:00`);
    dayBefore.setDate(dayBefore.getDate() - 1);
    protectedDates.add(`${dayBefore.getFullYear()}-${String(dayBefore.getMonth() + 1).padStart(2, "0")}-${String(dayBefore.getDate()).padStart(2, "0")}`);
  }
  const relocate = (block: PlanBlock, minutes: number): PlanBlock | null => {
    for (let day = 1; day <= 21; day++) {
      const date = scenarioDate(day);
      if (block.category !== "Academic" && protectedDates.has(date)) continue;
      for (let hour = 17; hour <= 21; hour++) {
        const startAt = stamp(date, `${String(hour).padStart(2, "0")}:00`);
        const endAt = endAtMinutes(startAt, minutes);
        if (endAt.slice(0, 10) !== date || Number(endAt.slice(11, 13)) > 22) continue;
        const startMs = new Date(startAt).getTime();
        const endMs = new Date(endAt).getTime();
        if (results.some((item) => startMs < new Date(item.endAt).getTime() && endMs > new Date(item.startAt).getTime())) continue;
        return { ...block, startAt, endAt, previousStartAt: block.previousStartAt ?? block.startAt };
      }
    }
    return null;
  };

  for (const block of flexibleToday.sort((a, b) => priority(b) - priority(a) || a.startAt.localeCompare(b.startAt))) {
    const source = originalById.get(block.id) ?? block;
    const originalMinutes = source.lifeLoadOriginalMinutes ?? duration(source);
    const academic = block.category === "Academic";
    const career = block.category === "Career" || block.category === "career-learning";
    if (!academic && !career) continue; // Optional work stays as an open task, without a calendar block.
    const minimum = academic ? 15 : 25;
    const plannedMinutes = remaining >= minimum ? Math.min(originalMinutes, academic ? 45 : 30, remaining) : 0;
    if (plannedMinutes > 0) {
      results.push({ ...block, endAt: endAtMinutes(block.startAt, plannedMinutes), lifeLoadOriginalMinutes: plannedMinutes < originalMinutes ? originalMinutes : undefined });
      remaining -= plannedMinutes;
    }
    if (!plannedMinutes) {
      const moved = relocate(source, originalMinutes);
      if (moved) results.push(moved);
    }
  }
  return results;
}

export function replaceDaySchedule(current: PlanBlock[], replacement: PlanBlock[], day = scenarioDate(0)): PlanBlock[] {
  const future = current.filter((block) => block.startAt.slice(0, 10) !== day);
  return [...future, ...replacement];
}

export function blocksAfterUrgentDeadline(blocks: PlanBlock[]): PlanBlock[] {
  const moved: PlanBlock[] = [];
  for (const block of blocks) {
    if (block.id === "lecture-monday" || block.id === "urgent-database-block") {
      moved.push({ ...block, isConflict: false });
      continue;
    }
    if (block.isFocusBlock) {
      moved.push({ ...block, isConflict: false });
      continue;
    }
    if (block.id === "docker-lesson" || block.id === "block-docker") {
      moved.push({ ...block, startAt: stamp(scenarioDate(3), "19:00"), endAt: endAtMinutes(stamp(scenarioDate(3), "19:00"), (new Date(block.endAt).getTime() - new Date(block.startAt).getTime()) / 60_000), previousStartAt: block.previousStartAt ?? block.startAt, isConflict: false });
      continue;
    }
    if (block.id === "block-aws") {
      moved.push({ ...block, startAt: stamp(scenarioDate(3), "17:30"), endAt: stamp(scenarioDate(3), "18:30"), previousStartAt: block.previousStartAt ?? block.startAt, isConflict: false });
      continue;
    }
    if (block.id === "db-outline" || block.id === "block-database") {
      moved.push({ ...block, startAt: stamp(scenarioDate(0), "15:00"), endAt: stamp(scenarioDate(0), "15:30"), isConflict: false });
      continue;
    }
    moved.push({ ...block, isConflict: false });
  }
  return moved;
}

export function toLocalIso(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
}

export function endAtMinutes(startAt: string, minutes: number): string {
  const end = new Date(startAt);
  end.setMinutes(end.getMinutes() + minutes);
  return toLocalIso(end);
}
