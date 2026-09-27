"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, CalendarClock, Check, Circle, Clock3, ChevronDown, Download, Plus, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CategoryBadge, RiskBadge } from "@/components/shared/status-badge";
import { AnimatedCounter, AnimatedProgress } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/lib/state/demo-provider";
import { LearningPathCompletionCard } from "@/features/career/components/learning-path-completion";
import { selectLearningPathCompletion } from "@/lib/domain/skill-reassessment";

export default function TasksPage() {
  const router = useRouter();
  const { state, completeTask } = useDemo();
  const [filter, setFilter] = useState("active");
  const filtered = state.tasks.filter((task) => filter === "all" || (filter === "active" && task.status !== "completed" && task.status !== "missed") || task.status === filter);
  return <div className="mx-auto w-full max-w-[1100px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Check className="size-3.5" />Student success engine</p><TypographyH1>Your work, in one place</TypographyH1><TypographyP className="mt-2">Tasks retain their academic deadline, career relevance, and pathway evidence.</TypographyP></div><div className="flex flex-wrap gap-2"><DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" className="h-9 rounded-[11px] text-xs"><Download className="size-3.5" />Import<ChevronDown className="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => router.push("/tasks/import/university-lms")}>University LMS</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button asChild className="h-9 rounded-[11px] text-xs"><Link href="/planner"><Plus className="size-3.5" />Add a task to Planner</Link></Button></div></div>
    <div className="task-summary" aria-label="Task summary">
      <div><span className="task-summary-number"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.status !== "missed").length} /></span><span className="task-summary-label">On your list</span></div>
      <div><span className="task-summary-number text-primary"><AnimatedCounter value={state.tasks.filter((task) => task.status === "completed").length} /></span><span className="task-summary-label">Made it happen</span></div>
      <div><span className="task-summary-number text-warning"><AnimatedCounter value={state.tasks.filter((task) => task.status !== "completed" && task.riskScore >= 70).length} /></span><span className="task-summary-label">Need attention</span></div>
    </div>
    {selectLearningPathCompletion(state, "docker")?.pathComplete && <div className="mb-4"><LearningPathCompletionCard skillId="docker" /></div>}
    <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter tasks">{[{ label: "Active", value: "active" }, { label: "Completed", value: "completed" }, { label: "Missed", value: "missed" }, { label: "All", value: "all" }].map((option) => <button key={option.value} type="button" onClick={() => setFilter(option.value)} aria-pressed={filter === option.value} className={`rounded-full border px-3 py-1.5 text-[0.65rem] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === option.value ? "border-primary/20 bg-primary/[0.05] text-primary" : "border-border/75 text-muted-foreground hover:text-foreground"}`}>{option.label}</button>)}<span className="ml-auto flex items-center gap-1.5 text-[0.62rem] text-muted-foreground"><ShieldAlert className="size-3.5 text-warning" />{state.tasks.filter((task) => task.riskScore >= 65 && task.status !== "completed").length} elevated deadline risks</span></div>
    <div className="space-y-2.5">{filtered.map((task) => <Card key={task.id} className="rounded-[16px] border-border/80 bg-surface-raised py-0 shadow-none"><div className="grid gap-3 px-4 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className={`truncate text-[0.79rem] font-medium ${task.status === "completed" ? "text-muted-foreground line-through" : "text-foreground"}`}>{task.title}</h2><CategoryBadge category={task.category} />{task.status === "completed" && <span className="rounded-full border border-success/15 bg-success/[0.035] px-2 py-0.5 text-[0.57rem] text-success">Completed</span>}{task.status === "missed" && <span className="rounded-full border border-risk/15 bg-risk/[0.035] px-2 py-0.5 text-[0.57rem] text-risk">Missed</span>}</div><p className="mt-1.5 line-clamp-1 text-[0.64rem] text-muted-foreground">{task.description}</p><div className="mt-2.5 flex flex-wrap items-center gap-3 text-[0.61rem] text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3" />{task.estimatedMinutes} min</span>{task.dueAt && <span className="flex items-center gap-1.5"><CalendarClock className="size-3" />Due {new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}{task.riskScore > 0 && <RiskBadge level={task.riskScore >= 90 ? "critical" : task.riskScore >= 65 ? "high" : task.riskScore >= 38 ? "moderate" : "low"} label={`${task.riskScore}% risk`} />}</div><div className="mt-3 flex max-w-sm items-center gap-2"><AnimatedProgress value={task.progress} className="h-1" indicatorClassName={task.status === "completed" ? "bg-success/75" : "bg-primary/75"} /><span className="w-8 font-mono text-[0.6rem] text-muted-foreground">{task.progress}%</span></div></div><div className="flex items-center gap-2 sm:justify-end"><Button variant="outline" onClick={() => completeTask(task.id)} disabled={task.status === "completed"} className="h-8 rounded-[10px] border-border px-2.5 text-[0.62rem]"><Check className="size-3.5" />Complete</Button><Button asChild variant="ghost" size="icon-sm" className="size-8 text-muted-foreground"><Link href="/planner" aria-label={`Open the planner for ${task.title}`}><ArrowRight className="size-4" /></Link></Button></div></div></Card>)}
      {filtered.length === 0 && <Card className="rounded-[16px] border-border bg-surface-raised py-10 text-center"><Circle className="mx-auto size-5 text-muted-foreground" /><p className="mt-3 text-sm text-foreground">No {filter} tasks</p><p className="mt-1 text-xs text-muted-foreground">Your shared plan will show them here when they change.</p></Card>}
    </div>
  </div>;
}
