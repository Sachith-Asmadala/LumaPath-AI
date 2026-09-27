import { scenarioDate } from "../demo-data/scenario";
import type { PlanBlock, StudentCapacity } from "../demo-data/types";

const stamp = (day: string, time: string) => `${day}T${time}:00`;

export function buildLowCapacityPlan(capacity: StudentCapacity): PlanBlock[] {
  const day = scenarioDate(0);
  const availableMinutes = Math.max(0, capacity.availableMinutes - capacity.unexpectedCommitmentMinutes);
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
