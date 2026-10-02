"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, ChevronDown, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AnimatedCounter, Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/features/workspace/components/workspace-controls";
import { useDemo } from "@/state/demo-provider";
import { LearningPathCompletionCard } from "@/features/career/components/learning-path-completion";
import { selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";
import { selectTaskCollection, type TaskView, type TaskSort } from "@/features/workspace/domain/workspace";
import { TaskListRow } from "@/features/tasks/components/task-list-row";
import { useLocale } from "@/i18n/locale-provider";

export default function TasksPage() {
  const router = useRouter();
  const { state, completeTask, selectAlternative } = useDemo();
  const { t, formatNumber } = useLocale();
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
    <div className="task-list">{filtered.map((task) => <TaskListRow key={task.id} task={task} onComplete={() => completeTask(task.id)} onFocus={() => { selectAlternative(task.id); router.push(`/focus?task=${encodeURIComponent(task.id)}`); }} />)}
      {filtered.length === 0 && <EmptyCollection title={t("tasks.emptyTitle")} description={t("tasks.emptyDescription")} onReset={resetFilters} />}
    </div>
  </div>;
}
