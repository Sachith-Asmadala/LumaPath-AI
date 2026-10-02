"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, CalendarSync, Check, Clock3, Route, ChevronDown, Download, Plus, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryBadge, RiskBadge } from "@/components/shared/status-badge";
import { AnimatedCounter, AnimatedProgress, Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/features/workspace/components/workspace-controls";
import { useDemo } from "@/state/demo-provider";
import { LearningPathCompletionCard } from "@/features/career/components/learning-path-completion";
import { selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";
import { selectTaskCollection, type TaskView, type TaskSort } from "@/features/workspace/domain/workspace";
import { riskLevel } from "@/features/planner/domain/priority";
import { useLocale } from "@/i18n/locale-provider";

export default function TasksPage() {
  const router = useRouter();
  const { state, completeTask, selectAlternative } = useDemo();
  const { t, formatDate, formatNumber } = useLocale();
  const [view, setView] = useState<TaskView>("active");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<TaskSort>("priority");
  const filtered = selectTaskCollection(state.tasks, { view, query, category, sort });
  const resetFilters = () => { setView("active"); setQuery(""); setCategory("all"); };
  return <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Check className="size-3.5" />{t("tasks.eyebrow")}</p><TypographyH1>{t("tasks.title")}</TypographyH1><TypographyP className="mt-2">{t("tasks.subtitle")}</TypographyP></div><div className="flex flex-wrap gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-11 rounded-xl text-xs"><Download className="size-4" />{t("tasks.import")}<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => router.push("/tasks/import/university-lms")}>University LMS</DropdownMenuItem><DropdownMenuItem onSelect={() => router.push("/calendar-sync")}>{t("calendar.importMenu")}</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button asChild className="h-11 rounded-xl text-xs"><Link href="/planner?add=assignment"><Plus className="size-4" />{t("tasks.add")}</Link></Button></div></div></Reveal>
    <div className="task-summary" aria-label={t("tasks.summaryLabel")}>
      <div><span className="task-summary-number"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.status !== "missed").length} /></span><span className="task-summary-label">{t("tasks.onList")}</span></div>
      <div><span className="task-summary-number text-primary"><AnimatedCounter value={state.tasks.filter((task) => task.status === "completed").length} /></span><span className="task-summary-label">{t("tasks.completedCount")}</span></div>
      <div><span className="task-summary-number text-warning"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.riskScore >= 70).length} /></span><span className="task-summary-label">{t("tasks.needAttention")}</span></div>
    </div>
    {selectLearningPathCompletion(state, "docker")?.pathComplete && <div className="mb-4"><LearningPathCompletionCard skillId="docker" /></div>}
    <div className="workspace-toolbar"><ViewSwitch label="Filter tasks" value={view} onChange={setView} options={[{ label: t("tasks.active"), value: "active" }, { label: t("tasks.completed"), value: "completed" }, { label: t("tasks.missed"), value: "missed" }, { label: t("tasks.all"), value: "all" }]} /><WorkspaceSearch value={query} onChange={setQuery} label={t("tasks.search")} /></div>
    <div className="mb-4 flex flex-wrap items-center gap-2"><select className="workspace-select" aria-label={t("tasks.categoryLabel")} value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">{t("tasks.allCategories")}</option>{[...new Set(state.tasks.map((task) => task.category))].map((item) => <option key={item} value={item}>{item === "career-learning" ? "Career learning" : item}</option>)}</select><select className="workspace-select" aria-label={t("tasks.sortLabel")} value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}><option value="priority">{t("tasks.highestRisk")}</option><option value="deadline">{t("tasks.soonestDeadline")}</option><option value="duration">{t("tasks.shortestTask")}</option></select><p className="ml-auto text-xs text-muted-foreground" role="status">{t("tasks.taskCount", { count: formatNumber(filtered.length) })}</p></div>
    <div className="space-y-3">{filtered.map((task) => <Card key={task.id} data-priority={task.riskScore >= 70} data-complete={task.status === "completed"} className="task-row rounded-2xl bg-surface-raised py-0"><div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className={`text-sm font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</h2><CategoryBadge category={task.category} />{["completed", "missed"].includes(task.status) && <span className="text-xs capitalize text-muted-foreground">{task.status}</span>}</div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{t("common.minutes", { count: formatNumber(task.estimatedMinutes) })}</span>{task.dueAt && <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />{t("common.due", { date: formatDate(task.dueAt, { month: "short", day: "numeric" }) })}</span>}{task.riskScore > 0 && <RiskBadge level={riskLevel(task.riskScore)} label={t("common.risk", { value: formatNumber(task.riskScore) })} />}{task.source?.startsWith("Calendar") && <span className="flex items-center gap-1 text-[0.68rem] text-primary"><CalendarSync className="size-3" aria-hidden="true" />{task.source}</span>}{task.source?.startsWith("Roadmap") && <span className="flex items-center gap-1 text-[0.68rem] text-pathway"><Route className="size-3" aria-hidden="true" />{task.source}</span>}</div><div className="mt-3 flex max-w-sm items-center gap-3"><AnimatedProgress value={task.progress} className="h-1" indicatorClassName={task.status === "completed" ? "bg-success/75" : "bg-primary/75"} /><span className="text-xs tabular-nums text-muted-foreground">{task.progress}%</span></div>{task.focusNotes?.length ? <p className="mt-2 max-w-xl text-[0.68rem] leading-5 text-muted-foreground"><span className="font-medium text-foreground/80">{t("tasks.latestFocusNote")}</span> {task.focusNotes[task.focusNotes.length - 1].note || task.focusNotes[task.focusNotes.length - 1].nextStep}</p> : null}</div><div className="flex items-center gap-2 sm:flex-col"><Button variant="outline" onClick={() => completeTask(task.id)} disabled={task.status === "completed"} className="h-11 rounded-xl text-xs"><Check className="size-4" />{task.status === "completed" ? t("tasks.completed") : t("tasks.complete")}</Button>{task.status !== "completed" && <><Button variant="ghost" className="h-11 rounded-xl text-xs text-primary" onClick={() => { selectAlternative(task.id); router.push(`/focus?task=${encodeURIComponent(task.id)}`); }} aria-label={t("tasks.focusOn", { task: task.title })}><Play className="size-3.5" />{t("tasks.focus")}</Button><Button asChild variant="ghost" className="h-11 rounded-xl text-xs"><Link href={`/study-assistant?task=${encodeURIComponent(task.id)}&mode=${task.category === "Academic" ? "assignment_breakdown" : "todays_study_suggestion"}`} aria-label={t("tasks.studyHelpFor", { task: task.title })}><Sparkles className="size-3.5" />{t("tasks.studyHelp")}</Link></Button></>}</div></div></Card>)}
      {filtered.length === 0 && <EmptyCollection title={t("tasks.emptyTitle")} description={t("tasks.emptyDescription")} onReset={resetFilters} />}
    </div>
  </div>;
}
