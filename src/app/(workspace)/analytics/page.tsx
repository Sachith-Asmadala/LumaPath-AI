"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Gauge,
  History,
  Info,
  RefreshCw,
  SlidersHorizontal,
  Target,
  TrendingUp,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { AnimatedCard, AnimatedCounter } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { scenarioDate } from "@/data/demo/scenario";
import type { AnalyticsDashboard, AnalyticsDrilldown, AnalyticsMeasurementKind } from "@/features/analytics/domain/analytics";
import { analyticsSourceLabel, buildAnalyticsSyncPayload } from "@/features/analytics/domain/analytics";
import { AnalyticsApiError, getAnalyticsDashboard, getAnalyticsDrilldown, syncAnalytics } from "@/features/analytics/services/analytics";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n";

const periodOptions = [7, 30, 90] as const;

function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sourceHref(sourceType: string) {
  if (sourceType === "task") return "/tasks";
  if (sourceType === "plan_block") return "/planner";
  if (sourceType === "skill" || sourceType === "readiness") return "/career-path";
  return "/analytics";
}

function metricValue(value: number | null, unit: string | null) {
  if (value === null) return "—";
  if (unit === "%") return `${value}%`;
  if (unit === "h") return `${value}h`;
  return `${value}${unit === "tasks" ? "" : unit ? ` ${unit}` : ""}`;
}

export default function AnalyticsPage() {
  const { state } = useDemo();
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const reducedMotion = useReducedMotion();
  const [periodDays, setPeriodDays] = useState<7 | 30 | 90>(7);
  const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drilldown, setDrilldown] = useState<AnalyticsDrilldown | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const endDate = scenarioDate(6);
  const startDate = useMemo(() => addDays(endDate, -(periodDays - 1)), [endDate, periodDays]);
  const studentId = state.student.id || "student-onboarded";
  const shortDay = useCallback((value: string) => formatDate(`${value.slice(0, 10)}T12:00:00`, { month: "short", day: "numeric" }), [formatDate]);
  const freshnessLabel = useCallback((value: string | null) => {
    if (!value) return t("analytics.noRecorded");
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t("analytics.freshnessUnavailable");
    return t("analytics.updated", { date: `${formatDate(date, { month: "short", day: "numeric" })} ${formatTime(date)}` });
  }, [formatDate, formatTime, t]);
  const measurementLabel = useCallback((kind: AnalyticsMeasurementKind) => kind === "measured" ? t("analytics.measured") : kind === "estimated" ? t("analytics.estimated") : t("analytics.partial"), [t]);
  const headlineLabel = useCallback((key: string, fallback: string) => ({
    completed_tasks: t("analytics.completedTasks"),
    missed_deadlines: t("analytics.missedDeadlines"),
    completion_rate: t("analytics.completionRate"),
    productive_hours: t("analytics.productiveHours"),
  }[key] ?? fallback), [t]);
  const activityConfig = useMemo(() => ({ completed: { label: t("tasks.completed"), color: "var(--primary)" }, missed: { label: t("tasks.missed"), color: "var(--destructive)" } }) satisfies ChartConfig, [t]);
  const workloadConfig = useMemo(() => ({ workload: { label: t("analytics.workload"), color: "var(--primary)" }, difficulty: { label: "Difficulty", color: "var(--pathway)" } }) satisfies ChartConfig, [t]);
  const readinessConfig = useMemo(() => ({ readiness: { label: t("analytics.readiness"), color: "var(--pathway)" } }) satisfies ChartConfig, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      await syncAnalytics(studentId, buildAnalyticsSyncPayload(state));
      const result = await getAnalyticsDashboard(studentId, startDate, endDate);
      setDashboard(result);
    } catch (cause) {
      setDashboard(null);
      setError(cause instanceof AnalyticsApiError ? cause.message : "Analytics could not be loaded safely.");
    } finally {
      setLoading(false);
    }
  }, [endDate, startDate, state, studentId]);

  useEffect(() => { void load(); }, [load]);

  const openMetric = useCallback(async (metric: string) => {
    setDialogOpen(true);
    setDrilldown(null);
    setDrilldownLoading(true);
    try {
      setDrilldown(await getAnalyticsDrilldown(studentId, metric, startDate, endDate));
    } catch (cause) {
      setDrilldown({
        metric,
        start_date: startDate,
        end_date: endDate,
        timezone: "Asia/Colombo",
        definition: "Source details are temporarily unavailable.",
        explanation: cause instanceof AnalyticsApiError ? cause.message : "The source list could not be loaded.",
        sources: [],
        freshness: dashboard?.freshness ?? { latest_event_at: null, aggregate_computed_at: null, event_count: 0, is_partial: true, note: "Unavailable" },
      });
    } finally {
      setDrilldownLoading(false);
    }
  }, [dashboard?.freshness, endDate, startDate, studentId]);

  const dailyChart = dashboard?.daily_completion.map((point) => ({
    day: shortDay(point.period),
    completed: point.value ?? 0,
    missed: point.secondary_value ?? 0,
  })) ?? [];

  const workloadChart = dashboard?.module_trends.slice(0, 6).map((module) => ({
    module: module.module.length > 18 ? `${module.module.slice(0, 16)}…` : module.module,
    workload: module.workload_hours,
    difficulty: module.average_difficulty ?? 0,
  })) ?? [];

  const readinessHistory = dashboard?.readiness.history.map((point) => ({
    day: shortDay(point.period),
    readiness: point.value ?? 0,
  })) ?? [];

  return (
    <div className="mx-auto w-full max-w-[1300px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
      <div className="mb-6 flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Activity className="size-3.5" />{t("analytics.eyebrow")}</p>
          <TypographyH1>{t("analytics.title")}</TypographyH1>
          <TypographyP className="mt-2 max-w-3xl">{t("analytics.subtitle")}</TypographyP>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2" aria-label={t("analytics.period")}>
            {periodOptions.map((days) => (
              <Button
                key={days}
                type="button"
                size="sm"
                variant={periodDays === days ? "default" : "outline"}
                className="h-9 rounded-xl text-xs"
                aria-pressed={periodDays === days}
                onClick={() => setPeriodDays(days)}
              >
                {t("common.days", { count: formatNumber(days) })}
              </Button>
            ))}
          </div>
          <p className="text-[0.62rem] text-muted-foreground">{shortDay(startDate)} – {shortDay(endDate)} · Asia/Colombo</p>
        </div>
      </div>

      {loading ? <AnalyticsLoading /> : error ? (
        <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-4 p-6 text-center">
            <AlertCircle className="size-6 text-destructive" />
            <div><p className="text-sm font-medium">{t("analytics.unavailable")}</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{error} {t("analytics.noFabrication")}</p></div>
            <Button variant="outline" onClick={() => void load()}><RefreshCw className="size-4" />{t("common.retry")}</Button>
          </CardContent>
        </Card>
      ) : dashboard ? <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border/70 bg-background/30 px-3 py-2.5 text-[0.64rem] text-muted-foreground">
          <span className="flex items-center gap-2"><History className="size-3.5" />{freshnessLabel(dashboard.freshness.latest_event_at)} · {t("analytics.privateEvents", { count: formatNumber(dashboard.freshness.event_count) })}</span>
          <span className="flex items-center gap-2"><Badge variant="outline" className="rounded-lg text-[0.58rem]">Metric {dashboard.metric_version}</Badge>{dashboard.freshness.is_partial ? t("analytics.somePartial") : t("analytics.allCurrent")}</span>
        </div>

        {dashboard.empty && (
          <Card className="mb-5 rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center">
              <Activity className="size-6 text-muted-foreground" />
              <div><p className="text-sm font-medium">{t("analytics.noActivity")}</p><p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">{dashboard.empty_message ?? t("analytics.emptyPeriodHint")}</p></div>
            </CardContent>
          </Card>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {dashboard.headline.map((metric, index) => {
            const icons = [CalendarCheck2, AlertCircle, Target, Clock3];
            const Icon = icons[index] ?? Activity;
            return (
              <AnimatedCard key={metric.key} className="analytics-stat" delay={index * 0.045} hover={false}>
                <div className="mb-4 flex items-center justify-between"><Icon className="size-4 text-muted-foreground" strokeWidth={1.5} /><Badge variant="outline" className="rounded-lg px-2 py-0.5 text-[0.54rem]">{measurementLabel(metric.measurement_kind)}</Badge></div>
                <p className="stat-number">{metric.value === null ? "—" : <AnimatedCounter value={metric.value} suffix={metric.unit === "%" ? "%" : metric.unit === "h" ? "h" : ""} animateOnMount formatValue={formatNumber} />}</p>
                <div className="mt-2 flex items-center justify-between gap-2"><p className="text-xs text-muted-foreground">{headlineLabel(metric.key, metric.label)}</p><Button variant="ghost" size="sm" className="h-8 px-2 text-[0.6rem]" onClick={() => void openMetric(metric.key)}>{t("common.sources")}</Button></div>
              </AnimatedCard>
            );
          })}
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)]">
          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">{t("analytics.outcomes")}</p><CardTitle className="type-section-title">{t("analytics.completedMissed")}</CardTitle><p className="mt-1 text-[0.66rem] text-muted-foreground">{t("analytics.noAutomaticMiss")}</p></CardHeader>
            <CardContent className="px-3 pb-4 sm:px-5">
              <ChartContainer id="activity-trend" config={activityConfig} className="h-[285px] w-full">
                <BarChart data={dailyChart} margin={{ top: 12, right: 8, left: -18, bottom: 0 }} barCategoryGap={14}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickMargin={9} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Bar isAnimationActive={!reducedMotion} animationDuration={450} dataKey="completed" radius={[5, 5, 0, 0]} fill="var(--color-completed)" />
                  <Bar isAnimationActive={!reducedMotion} animationDuration={450} dataKey="missed" radius={[5, 5, 0, 0]} fill="var(--color-missed)" />
                </BarChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">{t("analytics.workload")}</p><CardTitle className="type-section-title">{t("analytics.workloadDifficulty")}</CardTitle></div><Button variant="ghost" size="sm" className="h-8 text-[0.6rem]" onClick={() => void openMetric("module_workload")}>{t("common.sources")}</Button></div><p className="mt-1 text-[0.66rem] text-muted-foreground">{t("analytics.workloadCaution")}</p></CardHeader>
            <CardContent className="px-3 pb-4 sm:px-5">
              {workloadChart.length ? <ChartContainer id="module-workload" config={workloadConfig} className="h-[285px] w-full">
                <BarChart data={workloadChart} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 0 }}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={(value: number) => `${value}h`} />
                  <YAxis width={105} dataKey="module" type="category" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => [`${value} hours`, "Workload"]} />} />
                  <Bar isAnimationActive={!reducedMotion} animationDuration={450} dataKey="workload" radius={[0, 5, 5, 0]} fill="var(--color-workload)" />
                </BarChart>
              </ChartContainer> : <SmallEmpty text={t("analytics.noModuleWorkload")} />}
              <div className="mt-2 space-y-2">
                {dashboard.module_trends.slice(0, 4).map((item) => {
                  const first = item.history.find((point) => point.value !== null)?.value ?? item.workload_hours;
                  const change = Number((item.workload_hours - first).toFixed(1));
                  return <div key={item.module} className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2"><span className="truncate text-[0.65rem]">{item.module}</span><span className="shrink-0 text-right text-[0.6rem] text-muted-foreground">{t("analytics.workloadRow", { hours: formatNumber(item.workload_hours), difficulty: item.average_difficulty ?? "—" })}<br /><span>{t("analytics.hoursInPeriod", { value: `${change >= 0 ? "+" : ""}${formatNumber(change)}` })}</span></span></div>;
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(20rem,0.95fr)]">
          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">{t("analytics.careerMovement")}</p><CardTitle className="type-section-title">{t("analytics.readinessHistory")}</CardTitle></div><Button variant="ghost" size="sm" className="h-8 text-[0.6rem]" onClick={() => void openMetric("readiness")}>{t("common.sources")}</Button></div></CardHeader>
            <CardContent className="px-3 pb-5 sm:px-5">
              <div className="mb-3 flex flex-wrap items-center gap-3"><p className="text-3xl font-semibold tracking-tight">{dashboard.readiness.current_score ?? "—"}%</p>{dashboard.readiness.movement !== null && <span className={`flex items-center gap-1 text-xs ${dashboard.readiness.movement >= 0 ? "text-success" : "text-muted-foreground"}`}>{dashboard.readiness.movement >= 0 ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}{t("analytics.inPeriod", { value: `${dashboard.readiness.movement >= 0 ? "+" : ""}${formatNumber(dashboard.readiness.movement)}` })}</span>}</div>
              {readinessHistory.length ? <ChartContainer id="readiness-history" config={readinessConfig} className="h-[210px] w-full">
                <LineChart data={readinessHistory} margin={{ top: 10, right: 8, left: -15, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                  <Line isAnimationActive={!reducedMotion} animationDuration={450} type="monotone" dataKey="readiness" stroke="var(--color-readiness)" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ChartContainer> : <SmallEmpty text={t("analytics.readinessNeedsHistory")} />}
              <div className="mt-3 space-y-2">{dashboard.readiness.reasons.map((reason) => <p key={reason} className="flex items-center gap-2 text-[0.62rem] text-muted-foreground"><CheckCircle2 className="size-3.5 shrink-0 text-success" />{reason}</p>)}</div>
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">{t("analytics.skillHistory")}</p><CardTitle className="type-section-title">{t("analytics.proficiencyMovement")}</CardTitle></div><Button variant="ghost" size="sm" className="h-8 text-[0.6rem]" onClick={() => void openMetric("skill_progress")}>{t("common.sources")}</Button></div></CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
              {dashboard.skills.slice(0, 6).map((skill) => {
                const label = state.careerSkills.find((item) => item.id === skill.skill_id)?.name ?? skill.skill_id;
                const first = skill.history[0]?.value ?? skill.current_proficiency;
                const delta = skill.current_proficiency - first;
                return <div key={skill.skill_id} className="rounded-[13px] border border-border/65 bg-background/35 p-3"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="truncate text-[0.68rem] font-medium">{label}</p><p className="mt-1 text-[0.59rem] capitalize text-muted-foreground">{skill.status.replaceAll("-", " ")} · {t("analytics.recordedPoints", { count: formatNumber(skill.history.length) })}</p></div><div className="text-right"><p className="text-sm font-semibold">{skill.current_proficiency}%</p><p className="text-[0.58rem] text-muted-foreground">{t("analytics.recordedDelta", { value: `${delta >= 0 ? "+" : ""}${formatNumber(delta)}` })}</p></div></div></div>;
              })}
              {!dashboard.skills.length && <SmallEmpty text={t("analytics.noSkillHistory")} />}
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <SignalCard icon={Gauge} title={t("analytics.estimateAccuracy")} value={metricValue(dashboard.estimate_accuracy.value, dashboard.estimate_accuracy.unit)} meta={`${measurementLabel(dashboard.estimate_accuracy.measurement_kind)} · ${dashboard.estimate_accuracy.data_status}`} description={dashboard.estimate_accuracy.explanation} onSources={() => void openMetric("estimate_accuracy")} />
          <SignalCard icon={Target} title={t("analytics.planAcceptance")} value={dashboard.plan_patterns.acceptance_rate === null ? "—" : `${dashboard.plan_patterns.acceptance_rate}%`} meta={t("analytics.planAcceptanceMeta", { accepted: formatNumber(dashboard.plan_patterns.accepted), reviewed: formatNumber(dashboard.plan_patterns.reviewed) })} description={t("analytics.planAcceptanceDesc")} onSources={() => void openMetric("plan_acceptance")} />
          <SignalCard icon={SlidersHorizontal} title={t("analytics.planAdjustments")} value={dashboard.plan_patterns.adjustment_rate === null ? "—" : `${dashboard.plan_patterns.adjustment_rate}%`} meta={t("analytics.planAdjustmentMeta", { count: formatNumber(dashboard.plan_patterns.adjusted) })} description={t("analytics.planAdjustmentDesc")} onSources={() => void openMetric("plan_adjustment")} />
        </div>

        <Card className="mt-4 rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
          <CardContent className="flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-medium">{t("analytics.privateExplainable")}</p><p className="mt-1 max-w-3xl text-[0.62rem] leading-5 text-muted-foreground">{t("analytics.privateExplainableHint")}</p></div></div>
            <div className="flex shrink-0 flex-wrap gap-2"><Button asChild variant="outline" className="h-10 rounded-xl text-xs"><Link href="/planner"><SlidersHorizontal className="size-3.5" />{t("analytics.reviewPlanner")}</Link></Button><Button variant="outline" className="h-10 rounded-xl text-xs" onClick={() => void load()}><RefreshCw className="size-3.5" />{t("common.refresh")}</Button></div>
          </CardContent>
        </Card>
      </> : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[82vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{drilldown ? drilldown.metric.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : t("analytics.metricSources")}</DialogTitle>
            <DialogDescription>{drilldown?.definition ?? t("analytics.loadingSources")}</DialogDescription>
          </DialogHeader>
          {drilldownLoading ? <div className="space-y-2 py-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div> : drilldown ? <div className="space-y-4">
            <div className="rounded-xl border border-border/65 bg-background/35 p-3"><p className="text-[0.64rem] leading-5 text-muted-foreground">{drilldown.explanation}</p></div>
            <div className="space-y-2">
              {drilldown.sources.map((source, index) => <div key={`${source.source_type}-${source.source_id}-${index}`} className="rounded-xl border border-border/65 p-3"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-medium">{source.source_available ? analyticsSourceLabel(state, source.source_type, source.source_id) : t("analytics.deletedSource")}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{source.module ?? source.source_type.replaceAll("_", " ")} · {`${formatDate(source.occurred_at, { month: "short", day: "numeric", year: "numeric" })} ${formatTime(source.occurred_at)}`}</p></div><Badge variant="outline" className="rounded-lg text-[0.54rem]">{measurementLabel(source.measurement_kind)}</Badge></div>{source.source_available && Object.keys(source.values).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{Object.entries(source.values).slice(0, 6).map(([key, value]) => <span key={key} className="rounded-lg bg-muted/40 px-2 py-1 text-[0.56rem] text-muted-foreground">{key.replaceAll("_", " ")}: {String(value)}</span>)}</div>}{source.source_available && source.source_type !== "productivity" && <Button asChild variant="ghost" size="sm" className="mt-2 h-8 px-2 text-[0.58rem]"><Link href={sourceHref(source.source_type)}>{t("analytics.reviewSource")}<ArrowRight className="size-3" /></Link></Button>}{!source.source_available && <p className="mt-2 text-[0.6rem] text-muted-foreground">{t("analytics.deletedPrivate")}</p>}</div>)}
              {!drilldown.sources.length && <SmallEmpty text={t("analytics.noSources")} />}
            </div>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignalCard({ icon: Icon, title, value, meta, description, onSources }: { icon: typeof Gauge; title: string; value: string; meta: string; description: string; onSources: () => void }) {
  const { t } = useLocale();
  return <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardContent className="p-4 sm:p-5"><div className="flex items-center justify-between"><Icon className="size-4 text-muted-foreground" /><Button variant="ghost" size="sm" className="h-8 px-2 text-[0.6rem]" onClick={onSources}>{t("analytics.sourcesButton")}<ArrowRight className="size-3" /></Button></div><p className="mt-5 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs font-medium">{title}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{meta}</p><p className="mt-3 text-[0.61rem] leading-5 text-muted-foreground">{description}</p></CardContent></Card>;
}

function SmallEmpty({ text }: { text: string }) {
  return <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-border/70 p-4 text-center text-[0.62rem] leading-5 text-muted-foreground">{text}</div>;
}

function AnalyticsLoading() {
  return <div className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-36 rounded-[20px]" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-[390px] rounded-[20px]" /><Skeleton className="h-[390px] rounded-[20px]" /></div></div>;
}
