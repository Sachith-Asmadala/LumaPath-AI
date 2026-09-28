"use client";

import { scenarioWeekLabel } from "@/lib/demo-data/scenario";

import { scenarioAt } from "@/lib/demo-data/scenario";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Plus, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/motion/animated";
import { SectionHeading } from "@/components/shared/section-heading";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { PlannerAgenda } from "@/features/planner/components/planner-agenda";
import { ViewSwitch } from "@/components/workspace/workspace-controls";
import { TaskEditorDialog } from "@/features/planner/components/task-editor-dialog";
import { useDemo } from "@/lib/state/demo-provider";
import { demoPlanBlocks } from "@/lib/demo-data/seed";
import type { PlanBlock } from "@/lib/demo-data/types";

const PlannerCalendar = dynamic(() => import("@/features/planner/components/planner-calendar").then((module) => module.PlannerCalendar), {
  ssr: false,
  loading: () => <div className="h-[620px] animate-pulse rounded-[20px] border border-border/70 bg-surface-raised motion-reduce:animate-none" role="status" aria-label="Loading weekly planner" />,
});

export default function PlannerPage() {
  const [view, setView] = useState<"calendar" | "agenda">("calendar");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<PlanBlock | null>(null);
  const { state, generatePlan, replanWeek } = useDemo();
  const busy = state.simulation.kind === "generate" || state.simulation.kind === "replan";
  const openNew = () => {
    setSelectedBlock({ ...demoPlanBlocks[0], id: "new-plan-block", taskId: null, title: "", startAt: scenarioAt(2, "19:00:00"), endAt: scenarioAt(2, "19:45:00") });
    setEditorOpen(true);
  };
  const editBlock = (block: PlanBlock) => {
    setSelectedBlock(block);
    setEditorOpen(true);
  };

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("add") !== "assignment") return;
    setSelectedBlock({ ...demoPlanBlocks[0], id: "new-plan-block", taskId: null, title: "", startAt: scenarioAt(2, "19:00:00"), endAt: scenarioAt(2, "19:45:00") });
    setEditorOpen(true);
    window.history.replaceState(null, "", "/planner");
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
      <Reveal>
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><CalendarDays className="size-3.5" />Adaptive planning</p><TypographyH1>Plan the week you actually have</TypographyH1><TypographyP className="mt-2">Time blocks adapt when deadlines or capacity change.</TypographyP></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => replanWeek()} className="h-11 rounded-[13px] border-border/80 bg-transparent px-3 text-xs sm:h-10 sm:text-[0.7rem]"><CalendarDays className={`size-3.5 ${busy ? "animate-pulse motion-reduce:animate-none" : ""}`} />Re-plan week</Button><Button variant="outline" disabled={busy} onClick={() => generatePlan()} className="h-11 rounded-[13px] border-primary/20 bg-primary/[0.035] px-3 text-xs text-primary sm:h-10 sm:text-[0.7rem]"><Sparkles className={`size-3.5 ${busy ? "animate-pulse motion-reduce:animate-none" : ""}`} />{state.simulation.kind === "generate" ? state.simulation.step ?? "Generating…" : "Generate plan"}</Button><Button onClick={openNew} className="h-11 rounded-[13px] px-4 text-xs font-semibold sm:h-10"><Plus className="size-4" />Add task</Button></div>
        </div>
      </Reveal>
      {Object.keys(state.scheduledPathBySkill).length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success/[0.05] px-4 py-3"><p className="text-sm text-foreground">Your learning path is scheduled alongside your academic work. <Link href="/learning" className="text-primary underline underline-offset-4">Open learning workspace</Link></p><Button asChild className="h-11 gap-2 rounded-xl"><Link href="/overview">Continue to Overview<ArrowRight className="size-4" aria-hidden="true" /></Link></Button></div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none sm:flex-row sm:items-center sm:gap-3"><span className="grid size-8 place-items-center rounded-[10px] border border-primary/15 bg-primary/[0.05] text-primary"><Sparkles className="size-4" /></span><div><p className="text-[0.7rem] font-medium text-foreground">Adaptive schedule</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">Conflicts surfaced before the plan shifts.</p></div></Card>
        <Card className="flex flex-col gap-1 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none sm:flex-row sm:items-center sm:gap-3"><span className="grid size-8 place-items-center rounded-[10px] border border-success/15 bg-success/[0.04] text-success"><ShieldCheck className="size-4" /></span><div><p className="text-[0.7rem] font-medium text-foreground">Deadline protection</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">Fixed lectures and focus blocks stay visible.</p></div></Card>
        <Card className="flex flex-col gap-1 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none sm:flex-row sm:items-center sm:gap-3"><span className="grid size-8 place-items-center rounded-[10px] border border-pathway/15 bg-pathway/[0.04] text-pathway"><CalendarDays className="size-4" /></span><div><p className="text-[0.7rem] font-medium text-foreground">Student context</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">Academic, career, and personal commitments.</p></div></Card>
      </div>
      <section aria-label="Weekly plan"><div className="mb-3 flex items-center justify-between gap-3"><SectionHeading eyebrow="Weekly plan" title="Time blocks" aside={<Badge variant="outline" className="rounded-full border-border text-[0.62rem] text-muted-foreground">Scenario week · {scenarioWeekLabel()}</Badge>} /></div><div className="mb-4"><ViewSwitch label="Planner view" value={view} onChange={setView} options={[{ value: "calendar", label: "Calendar" }, { value: "agenda", label: "Agenda" }]} /></div>{view === "calendar" ? <PlannerCalendar onEditTask={editBlock} /> : <PlannerAgenda onEditTask={editBlock} />}</section>
      <TaskEditorDialog block={selectedBlock} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
