"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Check, ChevronDown, Clock3, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CategoryBadge, RiskBadge } from "@/components/shared/status-badge";
import { AnimatedProgress } from "@/components/motion/animated";
import { riskLevel } from "@/features/planner/domain/priority";
import { useLocale } from "@/i18n/locale-provider";
import type { Task } from "@/data/demo/types";

export function TaskListRow({ task, onComplete, onFocus }: { task: Task; onComplete: () => void; onFocus: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const { t, formatNumber, formatDate } = useLocale();
  const complete = task.status === "completed";
  const latestNote = task.focusNotes?.at(-1);
  return <article className="task-list-item" data-complete={complete} data-priority={!complete && task.riskScore >= 70}>
    <div className="task-list-main"><span className="task-status-mark" aria-hidden="true">{complete ? <Check size={15} /> : <span />}</span>
      <div className="task-list-text"><div className="task-list-title"><h2>{task.title}</h2><CategoryBadge category={task.category} /></div><div className="task-list-meta"><span><Clock3 size={13} />{t("common.minutes", { count: formatNumber(task.estimatedMinutes) })}</span>{task.dueAt && <span><CalendarClock size={13} />{t("common.due", { date: formatDate(task.dueAt, { month: "short", day: "numeric" }) })}</span>}{!complete && task.riskScore > 0 && <RiskBadge level={riskLevel(task.riskScore)} label={t("common.risk", { value: formatNumber(task.riskScore) })} />}{["completed", "missed"].includes(task.status) && <span className="capitalize">{task.status}</span>}</div></div>
      <div className="task-list-actions">{!complete && <Button variant="default" onClick={onFocus} className="h-9 rounded-xl text-xs" aria-label={t("tasks.focusOn", { task: task.title })}><Play size={13} />{t("tasks.focus")}</Button>}<Button variant="outline" onClick={onComplete} disabled={complete} className="h-9 rounded-xl text-xs"><Check size={14} />{complete ? t("tasks.completed") : t("tasks.complete")}</Button><button className="task-details-toggle" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={`task-details-${task.id}`} aria-label={`${expanded ? "Hide" : "Show"} details for ${task.title}`}><ChevronDown size={17} /></button></div>
    </div>
    <div id={`task-details-${task.id}`} hidden={!expanded} className="task-list-detail"><p>{task.description}</p><div className="task-detail-progress"><AnimatedProgress value={task.progress} className="h-1.5" /><span>{task.progress}%</span></div>{task.source && <p className="text-xs text-muted-foreground">{task.source}</p>}{latestNote && <p><strong>{t("tasks.latestFocusNote")}</strong> {latestNote.note || latestNote.nextStep}</p>}{!complete && <Button asChild variant="ghost" className="mt-2 h-10 text-xs text-primary"><Link href={`/study-assistant?task=${encodeURIComponent(task.id)}&mode=${task.category === "Academic" ? "assignment_breakdown" : "todays_study_suggestion"}`} aria-label={t("tasks.studyHelpFor", { task: task.title })}><Sparkles size={14} />{t("tasks.studyHelp")}</Link></Button>}</div>
  </article>;
}
