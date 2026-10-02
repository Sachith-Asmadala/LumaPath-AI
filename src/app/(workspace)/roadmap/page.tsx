"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, CalendarPlus, Check, CheckCircle2, ChevronRight, Clock3, ExternalLink, Gauge, GitBranch, LockKeyhole, RefreshCcw, Route, Sparkles, Target, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatedProgress, Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import { planningCapacityMinutes } from "@/features/capacity/domain/life-load";
import {
  buildPathwayContext, buildRecalculationReasons, pathwayRequest, type CurrentRoadmapView, type PathwayPace,
  type PathwayStepView, type PathwayView, type PlannerPathwayAction, type WeeklyActionView,
} from "@/features/pathways/domain/pathways";
import { careerRequest, type SkillAssessmentView } from "@/features/career-engine/domain/career-engine";

const roles = ["DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"];
const paceKeys: Array<{ value: PathwayPace; key: string }> = [
  { value: "light", key: "roadmap.paceLight" },
  { value: "balanced", key: "roadmap.paceBalanced" },
  { value: "ambitious", key: "roadmap.paceAmbitious" },
];

export default function RoadmapPage() {
  const { state, applyPathwayActions } = useDemo();
  const { t, formatDate, formatTime, formatNumber, locale } = useLocale();
  const [current, setCurrent] = useState<CurrentRoadmapView>({ active: null, pending_draft: null });
  const [targetRole, setTargetRole] = useState(state.onboarding.careerGoal || state.student.targetRole || "DevOps Engineer");
  const [goal, setGoal] = useState(state.learningGoal?.title || t("roadmap.defaultGoal"));
  const [pace, setPace] = useState<PathwayPace>("balanced");
  const [targetDate, setTargetDate] = useState(() => new Date(Date.now() + 84 * 86_400_000).toISOString().slice(0, 10));
  const [assessmentReady, setAssessmentReady] = useState(false);
  const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
  const [resourceReasons, setResourceReasons] = useState<Record<string, string>>({});
  const [replacementIds, setReplacementIds] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const studentId = state.student.id;
  const visible = current.pending_draft ?? current.active;

  const refresh = useCallback(async () => {
    if (!studentId) return;
    try {
      const result = await pathwayRequest<CurrentRoadmapView>("/api/pathways/current", studentId);
      setCurrent(result);
      if (result.active) {
        setTargetRole(result.active.target_role);
        setGoal(result.active.goal);
        setPace(result.active.pace);
        if (result.active.target_date) setTargetDate(result.active.target_date);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("roadmap.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [studentId, t]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!studentId || !targetRole) return;
    let cancelled = false;
    careerRequest<SkillAssessmentView>(`/api/careers/assessments/current?target_role=${encodeURIComponent(targetRole)}`, studentId)
      .then(() => { if (!cancelled) setAssessmentReady(true); })
      .catch(() => { if (!cancelled) setAssessmentReady(false); });
    return () => { cancelled = true; };
  }, [studentId, targetRole]);

  const context = useMemo(() => buildPathwayContext(state, { targetRole, goal, pace, targetDate }), [goal, pace, state, targetDate, targetRole]);

  async function generateOrRecalculate() {
    setWorking(true); setError(""); setMessage("");
    try {
      if (current.active) {
        const reasons = buildRecalculationReasons(current.active, context);
        await pathwayRequest<PathwayView>(`/api/pathways/${current.active.id}/recalculate`, studentId, { method: "POST", body: JSON.stringify({ ...context, reasons }) });
        setMessage(t("roadmap.recalculationReady"));
      } else {
        await pathwayRequest<PathwayView>("/api/pathways/generate", studentId, { method: "POST", body: JSON.stringify(context) });
        setMessage(t("roadmap.draftReady"));
      }
      setSelectedActions(new Set());
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("roadmap.requestFailed")); }
    finally { setWorking(false); }
  }

  async function decideDraft(decision: "approve" | "reject") {
    if (!current.pending_draft) return;
    setWorking(true); setError(""); setMessage("");
    try {
      await pathwayRequest<PathwayView>(`/api/pathways/${current.pending_draft.id}/decision`, studentId, { method: "POST", body: JSON.stringify({ decision }) });
      setMessage(decision === "approve" ? t("roadmap.approved") : t("roadmap.rejected"));
      setSelectedActions(new Set());
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("roadmap.requestFailed")); }
    finally { setWorking(false); }
  }

  async function updateMilestone(step: PathwayStepView, next: "in_progress" | "completed" | "available") {
    if (!current.active) return;
    setWorking(true); setError("");
    try {
      await pathwayRequest<PathwayView>(`/api/pathways/${current.active.id}/steps/${step.id}`, studentId, { method: "PUT", body: JSON.stringify({ state: next, note: t("roadmap.milestoneUserNote") }) });
      setMessage(next === "completed" ? t("roadmap.milestoneCompleted") : t("roadmap.milestoneStarted"));
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("roadmap.requestFailed")); }
    finally { setWorking(false); }
  }

  async function resourceDecision(step: PathwayStepView, action: "accept" | "defer" | "replace") {
    if (!current.active) return;
    setWorking(true); setError("");
    try {
      await pathwayRequest<PathwayView>(`/api/pathways/${current.active.id}/steps/${step.id}/resource`, studentId, {
        method: "POST",
        body: JSON.stringify({ action, resource_id: action === "replace" ? replacementIds[step.id] : null, reason: resourceReasons[step.id] ?? "" }),
      });
      setMessage(t("roadmap.resourceUpdated"));
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("roadmap.requestFailed")); }
    finally { setWorking(false); }
  }

  async function addSelectedToPlanner() {
    if (!current.active || !selectedActions.size) return;
    setWorking(true); setError("");
    try {
      const result = await pathwayRequest<{ actions: PlannerPathwayAction[]; approved_count: number }>(`/api/pathways/${current.active.id}/weekly-actions/approve`, studentId, {
        method: "POST",
        body: JSON.stringify({
          action_ids: [...selectedActions],
          planner_blocks: state.planBlocks.map((block) => ({ id: block.id, start_at: block.startAt, end_at: block.endAt, category: block.category, is_fixed: Boolean(block.isFixed) })),
          daily_available_minutes: planningCapacityMinutes(state.capacity),
        }),
      });
      applyPathwayActions(result.actions);
      setSelectedActions(new Set());
      setMessage(t("roadmap.addedToPlanner", { count: result.approved_count }));
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("roadmap.requestFailed")); }
    finally { setWorking(false); }
  }

  if (loading) return <div className="mx-auto max-w-[1180px] px-4 py-10 text-sm text-muted-foreground" role="status">{t("roadmap.loading")}</div>;

  return <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-pathway"><Route className="size-3.5" />{t("roadmap.eyebrow")}</p><TypographyH1>{t("roadmap.title")}</TypographyH1><TypographyP className="mt-2 max-w-3xl">{t("roadmap.subtitle")}</TypographyP></div><Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/career-path"><GitBranch className="size-4" />{t("roadmap.openPathGraph")}</Link></Button></div></Reveal>

    <Card className="mb-5 rounded-[20px] border-border/80 bg-surface-raised p-4 shadow-none sm:p-5">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><div><Label htmlFor="roadmap-role">{t("roadmap.targetRole")}</Label><select id="roadmap-role" className="workspace-select mt-2 w-full" value={targetRole} onChange={(event) => setTargetRole(event.target.value)}>{roles.map((role) => <option key={role}>{role}</option>)}</select></div><div><Label htmlFor="roadmap-pace">{t("roadmap.pace")}</Label><select id="roadmap-pace" className="workspace-select mt-2 w-full" value={pace} onChange={(event) => setPace(event.target.value as PathwayPace)}>{paceKeys.map((item) => <option key={item.value} value={item.value}>{t(item.key)}</option>)}</select></div><div><Label htmlFor="roadmap-goal">{t("roadmap.goal")}</Label><Input id="roadmap-goal" className="mt-2 h-11" maxLength={220} value={goal} onChange={(event) => setGoal(event.target.value)} /></div><div><Label htmlFor="roadmap-target-date">{t("careerEngine.targetDate")}</Label><Input id="roadmap-target-date" type="date" className="mt-2 h-11" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} /></div></div>
      {!assessmentReady && <div className="mt-4 flex flex-col gap-2 rounded-xl border border-warning/20 bg-warning/[0.03] p-3 text-xs leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{t("careerEngine.assessmentRequiredForRoadmap")}</span><Button asChild variant="outline" size="sm" className="shrink-0"><Link href="/career-path">{t("careerEngine.openAssessment")}</Link></Button></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button disabled={working || !goal.trim() || !assessmentReady} onClick={() => void generateOrRecalculate()} className="h-11 rounded-xl"><RefreshCcw className="size-4" />{current.active ? t("roadmap.previewRecalculation") : t("roadmap.generateDraft")}</Button><span className="text-xs text-muted-foreground">{t("roadmap.capacitySummary", { weekly: formatNumber(context.weekly_learning_minutes), daily: formatNumber(context.daily_available_minutes) })}</span></div>
    </Card>

    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl border border-primary/15 bg-primary/[0.035] p-3 text-sm text-primary">{message}</div>}

    {locale !== "en" && <div className="mb-4 rounded-xl border border-border/70 bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">{t("roadmap.localeFallbackNotice")}</div>}

    {current.pending_draft && <DraftReview roadmap={current.pending_draft} working={working} onApprove={() => void decideDraft("approve")} onReject={() => void decideDraft("reject")} />}

    {!visible && <Card className="rounded-[20px] border-dashed p-8 text-center"><Sparkles className="mx-auto size-6 text-primary" /><h2 className="mt-3 font-heading text-xl">{t("roadmap.emptyTitle")}</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{t("roadmap.emptyDescription")}</p></Card>}

    {visible && <>
      <RoadmapSummary roadmap={visible} />
      <section className="mt-6" aria-labelledby="milestones-title"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="type-eyebrow text-muted-foreground">{t("roadmap.milestonesEyebrow")}</p><h2 id="milestones-title" className="mt-1 font-heading text-2xl">{t("roadmap.milestonesTitle")}</h2></div><span className="text-xs text-muted-foreground">v{visible.version} · {visible.definition_version}</span></div><div className="space-y-3">{visible.steps.map((step) => <MilestoneCard key={step.id} step={step} isActive={current.active?.id === visible.id && !current.pending_draft} working={working} reason={resourceReasons[step.id] ?? ""} replacementId={replacementIds[step.id] ?? step.alternative_resources[0]?.id ?? ""} setReason={(value) => setResourceReasons((prev) => ({ ...prev, [step.id]: value }))} setReplacement={(value) => setReplacementIds((prev) => ({ ...prev, [step.id]: value }))} onMilestone={updateMilestone} onResource={resourceDecision} />)}</div></section>

      <section className="mt-7 pb-10" aria-labelledby="weekly-actions-title"><div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="type-eyebrow text-muted-foreground">{t("roadmap.weeklyEyebrow")}</p><h2 id="weekly-actions-title" className="mt-1 font-heading text-2xl">{t("roadmap.weeklyTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("roadmap.weeklyDescription")}</p></div>{current.active && !current.pending_draft && <Button disabled={working || selectedActions.size === 0} onClick={() => void addSelectedToPlanner()} className="h-11 rounded-xl"><CalendarPlus className="size-4" />{t("roadmap.addSelected", { count: selectedActions.size })}</Button>}</div>
        {visible.weekly_actions.length ? <WeeklyActions actions={visible.weekly_actions} canSelect={current.active?.id === visible.id && !current.pending_draft} selected={selectedActions} onToggle={(id) => setSelectedActions((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; })} /> : <Card className="rounded-2xl border-dashed p-6 text-sm text-muted-foreground">{t("roadmap.noWeeklyActions")}</Card>}
      </section>
    </>}
  </div>;
}

function DraftReview({ roadmap, working, onApprove, onReject }: { roadmap: PathwayView; working: boolean; onApprove: () => void; onReject: () => void }) {
  const { t } = useLocale();
  const summary = roadmap.change_summary;
  return <Card className="mb-5 rounded-[20px] border-pathway/20 bg-pathway/[0.035] p-5 shadow-none"><div className="flex flex-col justify-between gap-4 md:flex-row"><div className="max-w-3xl"><div className="flex items-center gap-2"><Sparkles className="size-4 text-pathway" /><h2 className="font-heading text-xl">{roadmap.parent_pathway_id ? t("roadmap.changeDraftTitle") : t("roadmap.initialDraftTitle")}</h2></div><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("roadmap.draftDoesNotAffectPlan")}</p>{summary && <div className="mt-4 grid gap-3 sm:grid-cols-2"><ChangeList title={t("roadmap.whyChanged")} values={summary.explanations} /><ChangeList title={t("roadmap.preservedWork")} values={summary.preserved_completed_skills} /><ChangeList title={t("roadmap.movedActions")} values={summary.moved_weekly_actions} /><ChangeList title={t("roadmap.pathChanges")} values={[...summary.added_skills.map((item) => `+ ${item}`), ...summary.removed_skills.map((item) => `− ${item}`), ...summary.resource_changes]} /></div>}</div><div className="flex shrink-0 gap-2 md:flex-col"><Button disabled={working} onClick={onApprove} className="h-11 rounded-xl"><Check className="size-4" />{t("roadmap.approveDraft")}</Button><Button disabled={working} onClick={onReject} variant="outline" className="h-11 rounded-xl">{t("roadmap.rejectDraft")}</Button></div></div></Card>;
}

function ChangeList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return <div><h3 className="text-xs font-medium text-foreground">{title}</h3><ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">{values.slice(0, 5).map((value) => <li key={value}>• {value}</li>)}</ul></div>;
}

function RoadmapSummary({ roadmap }: { roadmap: PathwayView }) {
  const { t, formatNumber } = useLocale();
  const credited = roadmap.steps.filter((step) => ["credited", "completed"].includes(step.state)).length;
  const progress = roadmap.steps.length ? Math.round(credited / roadmap.steps.length * 100) : 0;
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard icon={Target} label={t("roadmap.summaryGoal")} value={roadmap.target_role} /><SummaryCard icon={Gauge} label={t("roadmap.summaryProgress")} value={`${formatNumber(progress)}%`} progress={progress} /><SummaryCard icon={Clock3} label={t("roadmap.summaryWeekly")} value={t("common.minutes", { count: formatNumber(roadmap.weekly_learning_minutes) })} /><SummaryCard icon={BookOpen} label={t("roadmap.summaryMilestones")} value={`${formatNumber(credited)} / ${formatNumber(roadmap.steps.length)}`} />{roadmap.warnings.length > 0 && <Card className="sm:col-span-2 lg:col-span-4 rounded-2xl border-warning/15 bg-warning/[0.025] p-4 shadow-none"><div className="flex gap-2"><TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" /><div><p className="text-xs font-medium">{t("roadmap.capacityWarnings")}</p><ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">{roadmap.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div></div></Card>}</div>;
}

function SummaryCard({ icon: Icon, label, value, progress }: { icon: typeof Target; label: string; value: string; progress?: number }) {
  return <Card className="rounded-2xl border-border/75 bg-surface-raised p-4 shadow-none"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><span className="text-xs">{label}</span></div><p className="mt-2 truncate text-sm font-medium text-foreground">{value}</p>{typeof progress === "number" && <AnimatedProgress value={progress} className="mt-3 h-1" />}</Card>;
}

function MilestoneCard({ step, isActive, working, reason, replacementId, setReason, setReplacement, onMilestone, onResource }: { step: PathwayStepView; isActive: boolean; working: boolean; reason: string; replacementId: string; setReason: (value: string) => void; setReplacement: (value: string) => void; onMilestone: (step: PathwayStepView, next: "in_progress" | "completed" | "available") => Promise<void>; onResource: (step: PathwayStepView, action: "accept" | "defer" | "replace") => Promise<void> }) {
  const { t, formatNumber } = useLocale();
  const statusLabel = t(`roadmap.state.${step.state}`);
  const done = ["credited", "completed"].includes(step.state);
  return <Card className="rounded-[18px] border-border/80 bg-surface-raised p-4 shadow-none sm:p-5"><div className="grid gap-4 lg:grid-cols-[1fr_0.9fr]"><div><div className="flex flex-wrap items-center gap-2"><span className="grid size-7 place-items-center rounded-full border border-border bg-background text-xs font-medium">{step.order}</span><h3 className="font-heading text-lg">{step.name}</h3><span className={`rounded-full border px-2 py-1 text-[0.62rem] ${done ? "border-success/20 bg-success/[0.05] text-success" : step.state === "locked" ? "border-border text-muted-foreground" : "border-primary/20 bg-primary/[0.05] text-primary"}`}>{statusLabel}</span>{step.transferable_credit && <span className="rounded-full border border-pathway/20 bg-pathway/[0.05] px-2 py-1 text-[0.62rem] text-pathway">{t("roadmap.transferableCredit")}</span>}</div><div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground"><span>{t("roadmap.estimatedEffort", { hours: formatNumber(step.estimated_minutes / 60, { maximumFractionDigits: 1 }) })}</span><span>{t("roadmap.proficiency", { value: formatNumber(step.proficiency) })}</span>{step.prerequisites.length > 0 && <span className="flex items-center gap-1"><LockKeyhole className="size-3" />{t("roadmap.prerequisites", { value: step.prerequisites.join(", ") })}</span>}</div><div className="mt-4"><p className="text-xs font-medium">{t("roadmap.targetEvidence")}</p><ul className="mt-1 space-y-1 text-xs leading-5 text-muted-foreground">{step.target_evidence.map((item) => <li key={item}>• {item}</li>)}</ul></div>{step.evidence_refs.length > 0 && <p className="mt-3 text-[0.66rem] text-muted-foreground">{t("roadmap.currentEvidence", { count: step.evidence_refs.length })}</p>}<div className="mt-4 flex flex-wrap gap-2">{isActive && step.state === "available" && <Button disabled={working} variant="outline" onClick={() => void onMilestone(step, "in_progress")} className="h-10 rounded-xl text-xs"><ChevronRight className="size-3.5" />{t("roadmap.startMilestone")}</Button>}{isActive && step.state === "in_progress" && <Button disabled={working} variant="outline" onClick={() => void onMilestone(step, "completed")} className="h-10 rounded-xl text-xs"><CheckCircle2 className="size-3.5" />{t("roadmap.markLearningComplete")}</Button>}</div>{isActive && step.state === "completed" && step.completion_source === "student_confirmed" && <p className="mt-2 text-[0.64rem] leading-5 text-muted-foreground">{t("roadmap.manualCompletionNote")}</p>}</div><div className="rounded-2xl border border-border/70 bg-background/35 p-4"><p className="type-eyebrow text-muted-foreground">{t("roadmap.learningResource")}</p>{step.selected_resource ? <><h4 className="mt-2 text-sm font-medium">{step.selected_resource.title}</h4><p className="mt-1 text-xs text-muted-foreground">{step.selected_resource.source}</p><div className="mt-3 flex flex-wrap gap-1.5">{[step.selected_resource.resource_type ?? t("roadmap.unknownMetadata"), step.selected_resource.cost_type ?? t("roadmap.unknownMetadata"), step.selected_resource.language ?? t("roadmap.unknownMetadata"), step.selected_resource.format ?? t("roadmap.unknownMetadata"), typeof step.selected_resource.quality_score === "number" ? t("careerEngine.resourceQuality", { value: formatNumber(step.selected_resource.quality_score) }) : null].filter(Boolean).map((value) => <span key={String(value)} className="rounded-lg border border-border px-2 py-1 text-[0.62rem] text-muted-foreground">{value}</span>)}</div><p className="mt-3 text-[0.66rem] leading-5 text-muted-foreground">{step.selected_resource.ranking_reason}</p>{step.selected_resource.source_url && <Button asChild variant="ghost" className="mt-2 h-9 px-2 text-xs"><a href={step.selected_resource.source_url} target="_blank" rel="noopener noreferrer">{t("roadmap.openSource")}<ExternalLink className="size-3.5" /></a></Button>}</> : <p className="mt-2 text-sm text-muted-foreground">{t("roadmap.noResource")}</p>}{isActive && !done && step.selected_resource && <div className="mt-4 border-t border-border/70 pt-4"><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("roadmap.resourceReasonPlaceholder")} className="h-10 text-xs" />{step.alternative_resources.length > 0 && <select aria-label={t("roadmap.replacementResource")} className="workspace-select mt-2 w-full" value={replacementId} onChange={(event) => setReplacement(event.target.value)}>{step.alternative_resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.title} · {resource.source}</option>)}</select>}<div className="mt-2 flex flex-wrap gap-2"><Button disabled={working} size="sm" onClick={() => void onResource(step, "accept")}>{t("roadmap.acceptResource")}</Button><Button disabled={working || reason.trim().length < 3} size="sm" variant="outline" onClick={() => void onResource(step, "defer")}>{t("roadmap.deferResource")}</Button><Button disabled={working || reason.trim().length < 3 || !replacementId} size="sm" variant="outline" onClick={() => void onResource(step, "replace")}>{t("roadmap.replaceResource")}</Button></div></div>}</div></div></Card>;
}

function WeeklyActions({ actions, canSelect, selected, onToggle }: { actions: WeeklyActionView[]; canSelect: boolean; selected: Set<string>; onToggle: (id: string) => void }) {
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const weeks = [...new Set(actions.map((action) => action.week_start))];
  return <div className="space-y-4">{weeks.map((week) => <Card key={week} className="rounded-[18px] border-border/80 bg-surface-raised p-4 shadow-none sm:p-5"><div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-heading text-lg">{t("roadmap.weekOf", { date: formatDate(`${week}T12:00:00`, { month: "short", day: "numeric" }) })}</h3><span className="text-xs text-muted-foreground">{t("roadmap.weekMinutes", { count: formatNumber(actions.filter((item) => item.week_start === week).reduce((sum, item) => sum + item.planned_minutes, 0)) })}</span></div><div className="space-y-2">{actions.filter((item) => item.week_start === week).map((action) => <label key={action.id} className={`flex gap-3 rounded-xl border p-3 ${action.status === "approved" ? "border-success/15 bg-success/[0.025]" : "border-border/70 bg-background/30"}`}><input type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.has(action.id)} disabled={!canSelect || action.status !== "draft" || !action.prerequisite_ready} onChange={() => onToggle(action.id)} aria-label={t("roadmap.selectWeeklyAction", { title: action.title })} /><span className="min-w-0 flex-1"><span className="flex flex-wrap items-center gap-2"><span className="text-sm font-medium">{action.title}</span>{!action.prerequisite_ready && <span className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] text-muted-foreground">{t("roadmap.waitingPrerequisite")}</span>}{action.status === "approved" && <span className="rounded-full border border-success/20 px-2 py-0.5 text-[0.6rem] text-success">{t("roadmap.inPlanner")}</span>}{action.status === "deferred" && <span className="rounded-full border border-warning/20 px-2 py-0.5 text-[0.6rem] text-warning">{t("roadmap.deferred")}</span>}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(action.start_at, { weekday: "short", month: "short", day: "numeric" })} · {formatTime(action.start_at)}–{formatTime(action.end_at)} · {t("common.minutes", { count: formatNumber(action.planned_minutes) })}</span><span className="mt-1 block text-[0.66rem] leading-5 text-muted-foreground">{action.rationale}</span></span></label>)}</div></Card>)}</div>;
}
