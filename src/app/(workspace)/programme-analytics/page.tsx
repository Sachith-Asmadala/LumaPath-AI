"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Download,
  Gauge,
  GraduationCap,
  Info,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Line, LineChart, XAxis, YAxis } from "recharts";
import { toast } from "sonner";

import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { AggregateMetric, CohortSummary, Governance, InstitutionalDashboard, MetricDefinition } from "@/features/institutional-analytics/domain/institutional-analytics";
import {
  downloadInstitutionalExport,
  getInstitutionalCohorts,
  getInstitutionalDashboard,
  getInstitutionalGovernance,
  getMetricDefinitions,
  InstitutionalAnalyticsApiError,
  refreshInstitutionalDashboard,
} from "@/features/institutional-analytics/services/institutional-analytics";
import { useLocale } from "@/i18n";

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultRange() {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 29);
  return { start: isoDate(start), end: isoDate(end) };
}

function metricIcon(key: string) {
  if (key === "skill_gap_points") return GraduationCap;
  if (key === "readiness_average") return Gauge;
  if (key === "workload_hours") return Activity;
  if (key === "engagement_rate") return UsersRound;
  if (key === "internship_preparation_rate") return BriefcaseBusiness;
  return Sparkles;
}

function metricValue(metric: AggregateMetric) {
  if (metric.suppressed || metric.value === null) return "—";
  if (metric.unit === "%") return `${metric.value}%`;
  if (metric.unit === "points") return `${metric.value}`;
  return `${metric.value} ${metric.unit}`;
}

export default function ProgrammeAnalyticsPage() {
  const { t, formatDate, formatTime } = useLocale();
  const initial = useMemo(() => defaultRange(), []);
  const [cohorts, setCohorts] = useState<CohortSummary[]>([]);
  const [cohortId, setCohortId] = useState("");
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const [draftStart, setDraftStart] = useState(initial.start);
  const [draftEnd, setDraftEnd] = useState(initial.end);
  const [dashboard, setDashboard] = useState<InstitutionalDashboard | null>(null);
  const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
  const [governance, setGovernance] = useState<Governance | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [definitionOpen, setDefinitionOpen] = useState(false);
  const [selectedDefinition, setSelectedDefinition] = useState<MetricDefinition | null>(null);

  const chartConfig = useMemo(() => ({ trend: { label: t("programmeAnalytics.trend"), color: "var(--primary)" } }) satisfies ChartConfig, [t]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cohortRows, definitionRows, governanceRow] = await Promise.all([
        getInstitutionalCohorts(),
        getMetricDefinitions(),
        getInstitutionalGovernance(),
      ]);
      setCohorts(cohortRows);
      setDefinitions(definitionRows);
      setGovernance(governanceRow);
      setCohortId((current) => current || cohortRows[0]?.id || "");
    } catch (cause) {
      setError(cause instanceof InstitutionalAnalyticsApiError ? cause.message : t("programmeAnalytics.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadDashboard = useCallback(async () => {
    if (!cohortId) {
      setDashboard(null);
      return;
    }
    if (!start || !end || start > end) {
      setError(t("programmeAnalytics.invalidPeriod"));
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setDashboard(await getInstitutionalDashboard(cohortId, start, end));
    } catch (cause) {
      setDashboard(null);
      setError(cause instanceof InstitutionalAnalyticsApiError ? cause.message : t("programmeAnalytics.loadError"));
    } finally {
      setLoading(false);
    }
  }, [cohortId, end, start, t]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { if (cohortId) void loadDashboard(); }, [cohortId, loadDashboard]);

  const selectedCohort = cohorts.find((cohort) => cohort.id === cohortId) ?? null;
  const visibleMetrics = dashboard?.metrics ?? [];
  const suppressedCount = visibleMetrics.filter((metric) => metric.suppressed).length;

  const openDefinition = (key: string) => {
    const definition = definitions.find((item) => item.key === key) ?? null;
    setSelectedDefinition(definition);
    setDefinitionOpen(Boolean(definition));
  };

  const refresh = async () => {
    if (!cohortId || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      await refreshInstitutionalDashboard(cohortId, start, end);
      await loadDashboard();
      toast.success(t("programmeAnalytics.refreshSuccess"));
    } catch (cause) {
      const message = cause instanceof InstitutionalAnalyticsApiError ? cause.message : t("programmeAnalytics.refreshError");
      setError(message);
      toast.error(message);
    } finally {
      setRefreshing(false);
    }
  };

  const exportAggregates = async () => {
    if (!cohortId || exporting) return;
    setExporting(true);
    try {
      const { blob, filename } = await downloadInstitutionalExport(cohortId, start, end);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast.success(t("programmeAnalytics.exportSuccess"));
    } catch (cause) {
      toast.error(cause instanceof InstitutionalAnalyticsApiError ? cause.message : t("programmeAnalytics.exportError"));
    } finally {
      setExporting(false);
    }
  };

  const applyPeriod = () => {
    if (!draftStart || !draftEnd || draftStart > draftEnd) {
      setError(t("programmeAnalytics.invalidPeriod"));
      return;
    }
    const startMs = new Date(`${draftStart}T12:00:00`).getTime();
    const endMs = new Date(`${draftEnd}T12:00:00`).getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || Math.round((endMs - startMs) / 86_400_000) < 6) {
      setError(t("programmeAnalytics.minimumPeriod"));
      return;
    }
    if (draftStart === start && draftEnd === end) {
      void loadDashboard();
      return;
    }
    setError(null);
    setStart(draftStart);
    setEnd(draftEnd);
  };

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="type-eyebrow mb-2 text-primary">{t("programmeAnalytics.eyebrow")}</p>
          <TypographyH1>{t("programmeAnalytics.title")}</TypographyH1>
          <TypographyP className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("programmeAnalytics.description")}</TypographyP>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" className="h-10 rounded-xl text-xs" onClick={() => void refresh()} disabled={!dashboard?.capabilities.can_refresh || refreshing || !cohortId}>
            <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />{refreshing ? t("common.loading") : t("programmeAnalytics.refresh")}
          </Button>
          <Button className="h-10 rounded-xl text-xs" onClick={() => void exportAggregates()} disabled={!dashboard?.capabilities.can_export || exporting || !cohortId || dashboard?.empty}>
            <Download className="size-3.5" />{exporting ? t("common.loading") : t("programmeAnalytics.export")}
          </Button>
        </div>
      </div>

      <Card className="mt-5 rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(14rem,1.3fr)_minmax(10rem,0.8fr)_minmax(10rem,0.8fr)_auto] sm:p-5">
          <div>
            <label htmlFor="cohort" className="mb-2 block text-[0.62rem] font-medium text-muted-foreground">{t("programmeAnalytics.cohort")}</label>
            <Select value={cohortId} onValueChange={setCohortId} disabled={!cohorts.length}>
              <SelectTrigger id="cohort" className="h-10 rounded-xl bg-background/55 text-xs"><SelectValue placeholder={t("programmeAnalytics.selectCohort")} /></SelectTrigger>
              <SelectContent>{cohorts.map((cohort) => <SelectItem key={cohort.id} value={cohort.id}>{cohort.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <label htmlFor="programme-start" className="mb-2 block text-[0.62rem] font-medium text-muted-foreground">{t("programmeAnalytics.startDate")}</label>
            <input id="programme-start" type="date" value={draftStart} onChange={(event) => setDraftStart(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background/55 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div>
            <label htmlFor="programme-end" className="mb-2 block text-[0.62rem] font-medium text-muted-foreground">{t("programmeAnalytics.endDate")}</label>
            <input id="programme-end" type="date" value={draftEnd} onChange={(event) => setDraftEnd(event.target.value)} className="h-10 w-full rounded-xl border border-input bg-background/55 px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </div>
          <div className="flex items-end"><Button variant="secondary" className="h-10 w-full rounded-xl px-4 text-xs lg:w-auto" onClick={applyPeriod} disabled={!cohortId || loading}>{t("programmeAnalytics.apply")}</Button></div>
        </CardContent>
      </Card>

      {error && <div role="alert" className="mt-4 flex items-start gap-3 rounded-[16px] border border-destructive/25 bg-destructive/5 p-4 text-sm"><Info className="mt-0.5 size-4 shrink-0 text-destructive" /><div><p className="font-medium">{t("programmeAnalytics.couldNotLoad")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p></div></div>}

      {!loading && !cohorts.length && !error && <Card className="mt-4 rounded-[20px] border-dashed border-border/80 bg-surface-raised py-0 shadow-none"><CardContent className="flex min-h-56 flex-col items-center justify-center p-6 text-center"><UsersRound className="size-7 text-muted-foreground" /><p className="mt-4 text-sm font-medium">{t("programmeAnalytics.noCohorts")}</p><p className="mt-2 max-w-lg text-xs leading-5 text-muted-foreground">{t("programmeAnalytics.noCohortsHint")}</p></CardContent></Card>}

      {loading && <DashboardLoading />}

      {!loading && dashboard && <>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[0.61rem] text-muted-foreground">
          <Badge variant="outline" className="rounded-lg"><ShieldCheck className="mr-1 size-3" />{dashboard.cohort.privacy_status === "eligible" ? t("programmeAnalytics.privacyProtected") : t("programmeAnalytics.thresholdNotMet")}</Badge>
          <Badge variant="outline" className="rounded-lg">{t("programmeAnalytics.metricVersion", { value: dashboard.freshness.metric_version })}</Badge>
          <Badge variant="outline" className="rounded-lg">{dashboard.freshness.refreshed_at ? t("programmeAnalytics.updated", { value: `${formatDate(dashboard.freshness.refreshed_at, { month: "short", day: "numeric" })} ${formatTime(dashboard.freshness.refreshed_at)}` }) : t("programmeAnalytics.notRefreshed")}</Badge>
          {dashboard.freshness.source_latest_at && <Badge variant="outline" className="rounded-lg">{t("programmeAnalytics.sourceLatest", { value: `${formatDate(dashboard.freshness.source_latest_at, { month: "short", day: "numeric" })} ${formatTime(dashboard.freshness.source_latest_at)}` })}</Badge>}
          {dashboard.freshness.is_stale && <Badge variant="secondary" className="rounded-lg">{t("programmeAnalytics.stale")}</Badge>}
        </div>

        {dashboard.message && <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-border/80 bg-muted/20 p-4"><LockKeyhole className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-medium">{suppressedCount ? t("programmeAnalytics.privacySuppression") : t("programmeAnalytics.noSnapshot")}</p><p className="mt-1 text-[0.64rem] leading-5 text-muted-foreground">{dashboard.message}</p></div></div>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visibleMetrics.map((metric) => <MetricCard key={metric.key} metric={metric} onDefinition={() => openDefinition(metric.key)} />)}
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)]">
          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">{t("programmeAnalytics.trends")}</p><CardTitle className="type-section-title">{t("programmeAnalytics.aggregateTrend")}</CardTitle></div><Badge variant="outline" className="rounded-lg">{selectedCohort?.name}</Badge></div></CardHeader>
            <CardContent className="px-3 pb-5 sm:px-5">
              {visibleMetrics.some((metric) => metric.trend.some((point) => point.value !== null)) ? <div className="grid gap-4 lg:grid-cols-2">{visibleMetrics.filter((metric) => metric.trend.length).slice(0, 4).map((metric) => {
                const data = metric.trend.map((point) => ({ period: point.period.slice(5), trend: point.value }));
                return <div key={metric.key} className="rounded-[14px] border border-border/65 bg-background/25 p-3"><div className="mb-2 flex items-center justify-between gap-2"><p className="text-xs font-medium">{metric.label}</p>{metric.suppressed && <LockKeyhole className="size-3.5 text-muted-foreground" />}</div><ChartContainer config={chartConfig} className="h-[145px] w-full"><LineChart data={data} margin={{ top: 10, right: 8, left: -18, bottom: 0 }}><XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 9 }} /><ChartTooltip cursor={false} content={<ChartTooltipContent />} /><Line type="monotone" dataKey="trend" connectNulls={false} stroke="var(--color-trend)" strokeWidth={2} dot={{ r: 2.5 }} /></LineChart></ChartContainer></div>;
              })}</div> : <SmallEmpty text={t("programmeAnalytics.noTrendData")} />}
            </CardContent>
          </Card>

          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">{t("programmeAnalytics.skills")}</p><CardTitle className="type-section-title">{t("programmeAnalytics.skillGapSlices")}</CardTitle></CardHeader>
            <CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
              {dashboard.skill_slices.slice(0, 8).map((slice) => <div key={slice.dimension_key} className="flex items-center justify-between gap-3 rounded-[13px] border border-border/65 bg-background/30 p-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{slice.dimension_label}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{slice.suppressed ? t("programmeAnalytics.sliceSuppressed") : t("programmeAnalytics.sampleSize", { value: slice.sample_size ?? 0 })}</p></div><p className="shrink-0 text-sm font-semibold">{slice.suppressed || slice.value === null ? "—" : `${slice.value} ${slice.unit}`}</p></div>)}
              {!dashboard.skill_slices.length && <SmallEmpty text={t("programmeAnalytics.noSkillSlices")} />}
            </CardContent>
          </Card>
        </div>

        <Card className="mt-4 rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
          <CardContent className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" /><div><p className="text-xs font-medium">{t("programmeAnalytics.governanceTitle")}</p><p className="mt-1 text-[0.63rem] leading-5 text-muted-foreground">{dashboard.governance_notice}</p>{selectedCohort && <p className="mt-2 text-[0.59rem] leading-5 text-muted-foreground">{t("programmeAnalytics.cohortDefinition")}: {Object.entries(selectedCohort.definition).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ") || t("programmeAnalytics.noDefinition")}</p>}</div></div>
            <div className="rounded-[14px] border border-border/65 bg-background/30 p-3"><p className="text-[0.62rem] font-medium">{t("programmeAnalytics.controls")}</p><p className="mt-2 text-[0.59rem] leading-5 text-muted-foreground">{t("programmeAnalytics.controlsHint", { threshold: governance?.privacy_threshold ?? dashboard.cohort.privacy_threshold, days: governance?.retention_days ?? dashboard.freshness.retention_days })}</p></div>
          </CardContent>
        </Card>
      </>}

      <Dialog open={definitionOpen} onOpenChange={setDefinitionOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>{selectedDefinition?.label ?? t("programmeAnalytics.metricDefinition")}</DialogTitle><DialogDescription>{selectedDefinition?.explanation ?? ""}</DialogDescription></DialogHeader>
          {selectedDefinition && <div className="space-y-3"><div className="rounded-xl border border-border/70 bg-background/35 p-3"><p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("programmeAnalytics.formula")}</p><p className="mt-2 text-xs leading-5">{selectedDefinition.formula}</p></div><div className="rounded-xl border border-border/70 p-3"><p className="text-[0.6rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">{t("programmeAnalytics.sources")}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{selectedDefinition.source_domains.join(" · ")}</p></div><div className="flex flex-wrap gap-2"><Badge variant="outline">{selectedDefinition.metric_version}</Badge><Badge variant={selectedDefinition.approved ? "secondary" : "destructive"}>{selectedDefinition.approved ? t("programmeAnalytics.approved") : t("programmeAnalytics.notApproved")}</Badge></div></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetricCard({ metric, onDefinition }: { metric: AggregateMetric; onDefinition: () => void }) {
  const { t } = useLocale();
  const Icon = metricIcon(metric.key);
  return <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardContent className="p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><Icon className="size-4 text-muted-foreground" /><Button variant="ghost" size="sm" className="h-8 px-2 text-[0.6rem]" onClick={onDefinition}><Info className="size-3" />{t("programmeAnalytics.definition")}</Button></div><p className="mt-5 text-2xl font-semibold tracking-tight">{metricValue(metric)}</p><p className="mt-1 text-xs font-medium">{metric.label}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{metric.suppressed ? t("programmeAnalytics.suppressed") : t("programmeAnalytics.sampleSize", { value: metric.sample_size ?? 0 })}</p>{metric.suppression_reason && <p className="mt-3 flex items-start gap-2 text-[0.6rem] leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />{metric.suppression_reason}</p>}</CardContent></Card>;
}

function SmallEmpty({ text }: { text: string }) {
  return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-border/70 p-4 text-center text-[0.62rem] leading-5 text-muted-foreground">{text}</div>;
}

function DashboardLoading() {
  return <div className="mt-4 space-y-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40 rounded-[20px]" />)}</div><div className="grid gap-4 xl:grid-cols-2"><Skeleton className="h-[360px] rounded-[20px]" /><Skeleton className="h-[360px] rounded-[20px]" /></div></div>;
}
