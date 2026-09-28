"use client";

import { CheckCircle2, ChevronRight, LockKeyhole } from "lucide-react";
import { CategoryBadge } from "@/components/shared/status-badge";
import { EmptyCollection } from "@/components/workspace/workspace-controls";
import { useDemo } from "@/lib/state/demo-provider";
import { selectAgenda } from "@/lib/domain/workspace";
import type { PlanBlock } from "@/lib/demo-data/types";

const time = (value: string) => new Date(value).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
export function PlannerAgenda({ onEditTask }: { onEditTask: (block: PlanBlock) => void }) {
  const { state } = useDemo();
  const days = selectAgenda(state);
  if (!days.length) return <EmptyCollection title="A fresh page for your week" description="Add a task or schedule a learning path to start shaping your plan." />;
  return <div aria-label="Plan agenda">{days.map(({ day, blocks, minutes }) => <section key={day} className="agenda-day" aria-label={day}>
    <div><h3 className="font-heading text-lg font-medium">{new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" })}</h3><p className="mt-1 text-xs text-muted-foreground">{new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {(minutes / 60).toFixed(1)}h planned</p></div>
    <ol className="space-y-2">{blocks.map((block) => {
      const done = state.tasks.some((task) => task.id === block.taskId && task.status === "completed");
      return <li key={block.id}><button type="button" className="agenda-block" onClick={() => onEditTask(block)} aria-label={`View ${block.title}`}><span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{time(block.startAt)}<span className="mt-1 block opacity-70">{time(block.endAt)}</span></span><span className="min-w-0 flex-1"><span className={`block text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{block.title}</span><span className="mt-2 flex flex-wrap items-center gap-2"><CategoryBadge category={block.category} />{block.isFixed && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3" />Fixed</span>}{done && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" />Completed</span>}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button></li>;
    })}</ol>
  </section>)}</div>;
}
