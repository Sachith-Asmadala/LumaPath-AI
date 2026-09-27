"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertTriangle, ArrowRight, CalendarClock, ChevronDown, ChevronUp, CircleDot, Clock3, GitBranch, Gauge, RotateCcw, Sparkles, Target } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { riskLevel } from "@/lib/domain/priority";
import { AnimatedCounter, AnimatedProgress, MotionButton } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";
import { availableCapacity, selectDeadlineRiskTasks } from "@/lib/domain/dashboard";

export function DeadlineRiskPanel() {
  const { state, applyRecoveryPlan } = useDemo();
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const reduceMotion = useReducedMotion();
  const riskItems = selectDeadlineRiskTasks(state).slice(0, 4);
  const recovery = async () => {
    setApplying(true);
    await applyRecoveryPlan();
    setApplying(false);
  };

  return (
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
        <div><p className="type-eyebrow mb-2 text-muted-foreground">Workload signals</p><CardTitle className="type-section-title flex items-center gap-2"><AlertTriangle className="size-4 text-warning" aria-hidden="true" />Deadline risk</CardTitle></div>
        <Button asChild variant="ghost" className="h-8 gap-1 px-2 text-[0.68rem] text-muted-foreground hover:text-foreground"><Link href="/planner">View plan<ArrowRight className="size-3" /></Link></Button>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="mb-3 flex flex-wrap gap-3 text-[0.61rem] text-muted-foreground">{["Critical", "High", "Moderate", "Low"].map((level) => <span key={level}>{level}</span>)}<span className="w-full">Select a task to see why</span></div>
        <div className="space-y-1.5">
          {riskItems.map((task, index) => {
            const open = selectedTask === task.id;
            const risk = riskLevel(task.riskScore);
            const recoveryScheduled = task.id === "database-assignment" && state.planBlocks.some((block) => block.taskId === task.id && block.startAt.endsWith("20:00:00"));
            return <div key={task.id} className={`rounded-[13px] border px-3 py-2.5 transition-colors ${open ? "border-border bg-background/55" : "border-transparent hover:bg-white/[0.025]"}`}>
              <button type="button" aria-expanded={open} onClick={() => setSelectedTask(open ? null : task.id)} className="w-full rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex items-center justify-between gap-3"><span className="flex min-w-0 items-center gap-2.5"><span className={`size-1.5 shrink-0 rounded-full ${risk === "critical" || risk === "high" ? "bg-risk" : risk === "moderate" ? "bg-warning" : "bg-success"}`} /><span className="truncate text-[0.72rem] font-medium text-foreground/90">{task.title}</span></span><span className="flex shrink-0 items-center gap-2"><span className="font-mono text-[0.67rem] text-muted-foreground"><AnimatedCounter value={task.riskScore} suffix="%" /></span>{open ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}</span></span>
                <span className="mt-2 block text-[0.62rem] capitalize text-muted-foreground">{risk} · Due {task.dueAt ? new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                <span className="mt-1 block text-[0.62rem] leading-4 text-muted-foreground">{task.progress}% complete · {task.description}</span>
                <AnimatedProgress value={task.riskScore} className="mt-2 h-[3px]" indicatorClassName={risk === "critical" || risk === "high" ? "bg-risk/80" : risk === "moderate" ? "bg-warning/75" : "bg-success/65"} delay={index * 70} />
              </button>
              <AnimatePresence initial={false}>
                {open && <motion.div initial={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }} animate={reduceMotion ? { opacity: 1 } : { height: "auto", opacity: 1 }} exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }} transition={{ duration: reduceMotion ? 0.08 : 0.22 }} className="overflow-hidden">
                  <div className="pt-3">
                    <div className="grid grid-cols-2 gap-2">
                      {[[Clock3, "Remaining work", `${Math.max(0, Math.round(task.estimatedMinutes * (100 - task.progress) / 100))} min`], [CalendarClock, "Available time", `${availableCapacity(state.capacity)} min`], [Gauge, "Progress", `${task.progress}%`], [Target, "Competing deadlines", `${riskItems.filter((item) => item.dueAt && task.dueAt && item.id !== task.id && Math.abs(new Date(item.dueAt).getTime() - new Date(task.dueAt).getTime()) < 48 * 60 * 60_000).length} within 48h`], [Sparkles, "Task difficulty", `${task.difficulty}/5`], [GitBranch, "Dependency risk", task.careerSkillIds.length ? `${task.careerSkillIds.length} pathway links` : "Low"]].map(([Icon, label, value]) => {
                        const MetricIcon = Icon as typeof Clock3;
                        return <div key={label as string} className="rounded-[10px] border border-border/60 bg-background/45 px-2.5 py-2"><p className="flex items-center gap-1.5 text-[0.59rem] text-muted-foreground"><MetricIcon className="size-3" />{label as string}</p><p className="mt-1 text-[0.65rem] font-medium text-foreground">{value as string}</p></div>;
                      })}
                    </div>
                    {task.id === "database-assignment" ? <><p className="mt-3 flex items-start gap-2 text-[0.65rem] leading-5 text-foreground/80"><CircleDot className="mt-1 size-3 shrink-0 text-warning" aria-hidden="true" />{recoveryScheduled ? "A recovery window is reserved tonight for database implementation." : `Reserve up to ${Math.min(90, availableCapacity(state.capacity))} minutes tonight for database implementation.`}</p>
                    <MotionButton onClick={recovery} disabled={applying || state.recoveryPending || recoveryScheduled || availableCapacity(state.capacity) === 0 || state.simulation.kind !== null} size="sm" className="mt-3 h-8 rounded-[10px] text-[0.65rem]"><RotateCcw className={`size-3 ${applying ? "animate-spin motion-reduce:animate-none" : ""}`} />{applying ? state.simulation.step ?? "Applying…" : state.recoveryPending ? "Choose in Recovery Mode" : recoveryScheduled ? "Recovery Plan Applied" : "Apply Recovery Plan"}</MotionButton></> : <Link href="/planner" className="mt-3 inline-flex text-xs text-primary">Reserve a focus block in Planner →</Link>}
                  </div>
                </motion.div>}
              </AnimatePresence>
            </div>;
          })}
        </div>
        {state.simulation.result.length > 0 && <div className="mt-3 rounded-[11px] border border-success/15 bg-success/[0.04] px-3 py-2 text-[0.63rem] text-success" aria-live="polite">Plan update · {state.simulation.result.join(" · ")}</div>}
      </CardContent>
    </Card>
  );
}
