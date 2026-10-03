"use client";

import { ProBadge } from "@/features/subscriptions/components/pro-badge";
import { scenarioWeekLabel, stateScenarioDate } from "@/data/demo/scenario";

import { scenarioAt } from "@/data/demo/scenario";

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
import { ViewSwitch } from "@/features/workspace/components/workspace-controls";
import { TaskEditorDialog } from "@/features/planner/components/task-editor-dialog";
import { useDemo } from "@/state/demo-provider";
import { demoPlanBlocks } from "@/data/demo/seed";
import type { PlanBlock } from "@/data/demo/types";
import { useLocale } from "@/i18n/locale-provider";

function PlannerLoading() {
  const { t } = useLocale();
  return <div className="h-[620px] animate-pulse rounded-[20px] border border-border/70 bg-surface-raised motion-reduce:animate-none" role="status" aria-label={t("planner.loading")} />;
}

const PlannerCalendar = dynamic(() => import("@/features/planner/components/planner-calendar").then((module) => module.PlannerCalendar), {
  ssr: false,
  loading: PlannerLoading,
});

export default function PlannerPage() {
  const [view, setView] = useState<"calendar" | "agenda">("calendar");
  const [editorOpen, setEditorOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState<PlanBlock | null>(null);
  const { state, generatePlan, replanWeek } = useDemo();
  const { t } = useLocale();
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
    if (new URLSearchParams(window.location.search).get("view") === "agenda") setView("agenda");
    if (new URLSearchParams(window.location.search).get("add") !== "assignment") return;
    setSelectedBlock({ ...demoPlanBlocks[0], id: "new-plan-block", taskId: null, title: "", startAt: scenarioAt(2, "19:00:00"), endAt: scenarioAt(2, "19:45:00") });
    setEditorOpen(true);
    window.history.replaceState(null, "", "/planner");
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
      <Reveal>
        <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><CalendarDays className="size-3.5" />{t("planner.eyebrow")}</p><TypographyH1>{t("planner.title")}</TypographyH1><TypographyP className="mt-2">{t("planner.subtitle")}</TypographyP></div>
          <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={busy} onClick={() => replanWeek()} className="h-11 rounded-[13px] border-border/80 bg-transparent px-3 text-xs sm:h-10 sm:text-[0.7rem]"><CalendarDays className={`size-3.5 ${busy ? "animate-pulse motion-reduce:animate-none" : ""}`} />{t("planner.replan")}<ProBadge /></Button><Button variant="outline" disabled={busy} onClick={() => generatePlan()} className="h-11 rounded-[13px] border-primary/20 bg-primary/[0.035] px-3 text-xs text-primary sm:h-10 sm:text-[0.7rem]"><Sparkles className={`size-3.5 ${busy ? "animate-pulse motion-reduce:animate-none" : ""}`} />{state.simulation.kind === "generate" ? state.simulation.step ?? t("planner.generating") : t("planner.generate")}</Button><Button onClick={openNew} className="h-11 rounded-[13px] px-4 text-xs font-semibold sm:h-10"><Plus className="size-4" />{t("planner.addTask")}</Button></div>
        </div>
      </Reveal>
      {Object.keys(state.scheduledPathBySkill).length > 0 && <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/25 bg-success/[0.05] px-4 py-3"><p className="text-sm text-foreground">{t("planner.learningScheduled")} <Link href="/learning" className="text-primary underline underline-offset-4">{t("planner.openLearning")}</Link></p><Button asChild className="h-11 gap-2 rounded-xl"><Link href="/overview">{t("planner.continueOverview")}<ArrowRight className="size-4" aria-hidden="true" /></Link></Button></div>}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card className="flex min-w-0 flex-row items-start gap-3 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-primary/15 bg-primary/[0.05] text-primary"><Sparkles className="size-4" /></span><div className="min-w-0"><p className="text-[0.7rem] font-medium text-foreground">{t("planner.adaptiveSchedule")}</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">{t("planner.adaptiveDescription")}</p></div></Card>
        <Card className="flex min-w-0 flex-row items-start gap-3 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-success/15 bg-success/[0.04] text-success"><ShieldCheck className="size-4" /></span><div className="min-w-0"><p className="text-[0.7rem] font-medium text-foreground">{t("planner.deadlineProtection")}</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">{t("planner.deadlineDescription")}</p></div></Card>
        <Card className="flex min-w-0 flex-row items-start gap-3 rounded-[16px] border-border/75 bg-white/[0.02] px-4 py-3 shadow-none"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-pathway/15 bg-pathway/[0.04] text-pathway"><CalendarDays className="size-4" /></span><div className="min-w-0"><p className="text-[0.7rem] font-medium text-foreground">{t("planner.studentContext")}</p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">{t("planner.studentContextDescription")}</p></div></Card>
      </div>
      <section aria-label={t("planner.weeklyPlan")}><div className="mb-3 flex items-center justify-between gap-3"><SectionHeading eyebrow={t("planner.weeklyPlan")} title={t("planner.timeBlocks")} aside={<Badge variant="outline" className="rounded-full border-border text-[0.62rem] text-muted-foreground">{t("planner.scenarioWeek", { week: state.competition ? `${new Date(`${stateScenarioDate(state)}T12:00:00`).toLocaleDateString("en-US", {month:"short",day:"numeric"})} – ${new Date(`${stateScenarioDate(state,6)}T12:00:00`).toLocaleDateString("en-US", {month:"short",day:"numeric"})}` : scenarioWeekLabel() })}</Badge>} /></div><div className="mb-4"><ViewSwitch label={t("planner.view")} value={view} onChange={setView} options={[{ value: "calendar", label: t("planner.calendar") }, { value: "agenda", label: t("planner.agenda") }]} /></div>{view === "calendar" ? <PlannerCalendar onEditTask={editBlock} /> : <PlannerAgenda onEditTask={editBlock} />}</section>
      <TaskEditorDialog block={selectedBlock} open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  );
}
