"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Check, Clock3, ChevronDown, Download, Plus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryBadge, RiskBadge } from "@/components/shared/status-badge";
import { AnimatedCounter, AnimatedProgress, Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/components/workspace/workspace-controls";
import { useDemo } from "@/lib/state/demo-provider";
import { LearningPathCompletionCard } from "@/features/career/components/learning-path-completion";
import { selectLearningPathCompletion } from "@/lib/domain/skill-reassessment";
import { selectTaskCollection, type TaskView, type TaskSort } from "@/lib/domain/workspace";
import { riskLevel } from "@/lib/domain/priority";

export default function TasksPage() {
  const router = useRouter();
  const { state, completeTask, selectAlternative } = useDemo();
  const [view, setView] = useState<TaskView>("active");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [sort, setSort] = useState<TaskSort>("priority");
  const filtered = selectTaskCollection(state.tasks, { view, query, category, sort });
  const resetFilters = () => { setView("active"); setQuery(""); setCategory("all"); };
  return <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Check className="size-3.5" />A little more done</p><TypographyH1>Your work, in one place</TypographyH1><TypographyP className="mt-2">Find your next task. Make room for a focused start.</TypographyP></div><div className="flex flex-wrap gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-11 rounded-xl text-xs"><Download className="size-4" />Import<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => router.push("/tasks/import/university-lms")}>University LMS</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button asChild className="h-11 rounded-xl text-xs"><Link href="/planner?add=assignment"><Plus className="size-4" />Add a task to Planner</Link></Button></div></div></Reveal>
    <div className="task-summary" aria-label="Task summary">
      <div><span className="task-summary-number"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.status !== "missed").length} /></span><span className="task-summary-label">On your list</span></div>
      <div><span className="task-summary-number text-primary"><AnimatedCounter value={state.tasks.filter((task) => task.status === "completed").length} /></span><span className="task-summary-label">Made it happen</span></div>
      <div><span className="task-summary-number text-warning"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.riskScore >= 70).length} /></span><span className="task-summary-label">Need attention</span></div>
    </div>
    {selectLearningPathCompletion(state, "docker")?.pathComplete && <div className="mb-4"><LearningPathCompletionCard skillId="docker" /></div>}
    <div className="workspace-toolbar"><ViewSwitch label="Filter tasks" value={view} onChange={setView} options={[{ label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Missed", value: "missed" }, { label: "All", value: "all" }]} /><WorkspaceSearch value={query} onChange={setQuery} label="Search tasks" /></div>
    <div className="mb-4 flex flex-wrap items-center gap-2"><select className="workspace-select" aria-label="Task category" value={category} onChange={(event) => setCategory(event.target.value)}><option value="all">All categories</option>{[...new Set(state.tasks.map((task) => task.category))].map((item) => <option key={item} value={item}>{item === "career-learning" ? "Career learning" : item}</option>)}</select><select className="workspace-select" aria-label="Sort tasks" value={sort} onChange={(event) => setSort(event.target.value as TaskSort)}><option value="priority">Highest risk first</option><option value="deadline">Soonest deadline</option><option value="duration">Shortest task</option></select><p className="ml-auto text-xs text-muted-foreground" role="status">{filtered.length} {filtered.length === 1 ? "task" : "tasks"}</p></div>
    <div className="space-y-3">{filtered.map((task) => <Card key={task.id} data-priority={task.riskScore >= 70} data-complete={task.status === "completed"} className="task-row rounded-2xl bg-surface-raised py-0"><div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto] sm:items-center sm:p-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className={`text-sm font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</h2><CategoryBadge category={task.category} />{["completed", "missed"].includes(task.status) && <span className="text-xs capitalize text-muted-foreground">{task.status}</span>}</div><p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{task.description}</p><div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{task.estimatedMinutes} min</span>{task.dueAt && <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5" />Due {new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}{task.riskScore > 0 && <RiskBadge level={riskLevel(task.riskScore)} label={`${task.riskScore}% risk`} />}</div><div className="mt-3 flex max-w-sm items-center gap-3"><AnimatedProgress value={task.progress} className="h-1" indicatorClassName={task.status === "completed" ? "bg-success/75" : "bg-primary/75"} /><span className="text-xs tabular-nums text-muted-foreground">{task.progress}%</span></div></div><div className="flex items-center gap-2 sm:flex-col"><Button variant="outline" onClick={() => completeTask(task.id)} disabled={task.status === "completed"} className="h-11 rounded-xl text-xs"><Check className="size-4" />{task.status === "completed" ? "Completed" : "Complete"}</Button>{task.status !== "completed" && <Button variant="ghost" className="h-11 rounded-xl text-xs text-primary" onClick={() => { selectAlternative(task.id); router.push("/focus"); }} aria-label={`Focus on ${task.title}`}><Play className="size-3.5" />Focus</Button>}</div></div></Card>)}
      {filtered.length === 0 && <EmptyCollection title="A little breathing room" description="No tasks match this view. Try another category or clear your filters." onReset={resetFilters} />}
    </div>
  </div>;
}
