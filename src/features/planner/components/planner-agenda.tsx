"use client";

import { CalendarSync, CheckCircle2, ChevronRight, LockKeyhole, Route } from "lucide-react";
import { CategoryBadge } from "@/components/shared/status-badge";
import { EmptyCollection } from "@/features/workspace/components/workspace-controls";
import { useDemo } from "@/state/demo-provider";
import { selectAgenda } from "@/features/workspace/domain/workspace";
import type { PlanBlock } from "@/data/demo/types";
import { useLocale } from "@/i18n/locale-provider";

export function PlannerAgenda({ onEditTask }: { onEditTask: (block: PlanBlock) => void }) {
  const { state } = useDemo();
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const days = selectAgenda(state);
  if (!days.length) return <EmptyCollection title={t("planner.emptyTitle")} description={t("planner.emptyDescription")} />;
  return <div aria-label={t("planner.agendaLabel")}>{days.map(({ day, blocks, minutes }) => <section key={day} className="agenda-day" aria-label={day}>
    <div><h3 className="font-heading text-lg font-medium">{formatDate(`${day}T12:00:00`, { weekday: "long" })}</h3><p className="mt-1 text-xs text-muted-foreground">{formatDate(`${day}T12:00:00`, { month: "short", day: "numeric" })} · {t("planner.plannedHours", { hours: formatNumber(minutes / 60, { maximumFractionDigits: 1 }) })}</p></div>
    <ol className="space-y-2">{blocks.map((block) => {
      const done = state.tasks.some((task) => task.id === block.taskId && task.status === "completed");
      return <li key={block.id}><button type="button" className="agenda-block" onClick={() => onEditTask(block)} aria-label={t("planner.viewTask", { title: block.title })}><span className="w-16 shrink-0 text-xs tabular-nums text-muted-foreground">{formatTime(block.startAt)}<span className="mt-1 block opacity-70">{formatTime(block.endAt)}</span></span><span className="min-w-0 flex-1"><span className={`block text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{block.title}</span><span className="mt-2 flex flex-wrap items-center gap-2"><CategoryBadge category={block.category} />{block.isFixed && <span className="flex items-center gap-1 text-xs text-muted-foreground"><LockKeyhole className="size-3" />{t("planner.fixed")}</span>}{done && <span className="flex items-center gap-1 text-xs text-success"><CheckCircle2 className="size-3" />{t("planner.completedLabel")}</span>}{block.source?.startsWith("Calendar") && <span className="flex items-center gap-1 text-xs text-primary"><CalendarSync className="size-3" aria-hidden="true" />{block.source}</span>}{block.source?.startsWith("Roadmap") && <span className="flex items-center gap-1 text-xs text-pathway"><Route className="size-3" aria-hidden="true" />{block.source}</span>}</span></span><ChevronRight className="size-4 shrink-0 text-muted-foreground" /></button></li>;
    })}</ol>
  </section>)}</div>;
}
