"use client";

import { ProBadge } from "@/features/subscriptions/components/pro-badge";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, CheckCircle2, DatabaseZap, Globe2, History, Info, LockKeyhole,
  MapPinned, RefreshCw, Scale, ShieldCheck, TrendingDown, TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { CareerScenarioRole } from "@/features/career-scenarios/domain/career-scenarios";
import type { ChangeProposal, ProfileComparison, SkillSignal, StudentTaxonomyUpdate, TaxonomyVersion } from "@/features/market-taxonomy/domain/market-taxonomy";
import {
  decideStudentTaxonomyUpdate, decideTaxonomyProposal, getMarketGovernance, getMarketSignals, getMarketSources,
  getProfileComparison, getStudentTaxonomyUpdates, getTaxonomyProposals, getTaxonomyVersions, MarketTaxonomyApiError,
  submitTaxonomyProposal,
} from "@/features/market-taxonomy/services/market-taxonomy";
import { useLocale } from "@/i18n";
import { useDemo } from "@/state/demo-provider";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";

const REGION_OPTIONS = ["none", "lk"] as const;

function pct(value: number) { return `${Math.round(value * 100)}%`; }

export default function MarketSignalsPage() {
  const { state } = useDemo();
  const { subscription } = useSubscription();
  const canGovern = subscription?.entitlements.taxonomy_governance?.enabled === true;
  const { t, formatDate } = useLocale();
  const studentId = state.student.id;
  const [tab, setTab] = useState("student");
  const [roles, setRoles] = useState<CareerScenarioRole[]>([]);
  const [roleId, setRoleId] = useState("devops-engineer");
  const [region, setRegion] = useState("none");
  const [comparison, setComparison] = useState<ProfileComparison | null>(null);
  const [updates, setUpdates] = useState<StudentTaxonomyUpdate[]>([]);
  const [studentLoading, setStudentLoading] = useState(true);
  const [studentError, setStudentError] = useState("");
  const [selectedUpdate, setSelectedUpdate] = useState<StudentTaxonomyUpdate | null>(null);
  const [recalcConfirmed, setRecalcConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  const [signals, setSignals] = useState<SkillSignal[]>([]);
  const [proposals, setProposals] = useState<ChangeProposal[]>([]);
  const [versions, setVersions] = useState<TaxonomyVersion[]>([]);
  const [sourceCount, setSourceCount] = useState(0);
  const [governanceSummary, setGovernanceSummary] = useState("");
  const [curatorLoading, setCuratorLoading] = useState(false);
  const [curatorError, setCuratorError] = useState("");
  const [decisionProposal, setDecisionProposal] = useState<ChangeProposal | null>(null);
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [decisionRationale, setDecisionRationale] = useState("");

  const loadStudent = useCallback(async () => {
    if (!studentId) return;
    setStudentLoading(true); setStudentError("");
    try {
      const rolesResponse = await fetch("/api/career-scenarios/roles", { cache: "no-store", headers: { "X-Luma-Student-Id": studentId } });
      const roleBody = await rolesResponse.json().catch(() => []) as CareerScenarioRole[] | { detail?: string };
      if (!rolesResponse.ok || !Array.isArray(roleBody)) throw new Error(!Array.isArray(roleBody) ? roleBody.detail : "Career catalogue is unavailable.");
      setRoles(roleBody);
      const chosen = roleBody.some((item) => item.id === roleId) ? roleId : roleBody[0]?.id;
      if (chosen) setRoleId(chosen);
      const [profile, impactRows] = await Promise.all([
        chosen ? getProfileComparison(studentId, chosen, region === "none" ? undefined : region) : Promise.resolve(null),
        getStudentTaxonomyUpdates(studentId),
      ]);
      setComparison(profile); setUpdates(impactRows);
    } catch (error) {
      setStudentError(error instanceof Error ? error.message : t("marketSignals.studentLoadError"));
    } finally { setStudentLoading(false); }
  }, [region, roleId, studentId, t]);

  const refreshComparison = useCallback(async () => {
    if (!studentId || !roleId) return;
    setStudentLoading(true); setStudentError("");
    try { setComparison(await getProfileComparison(studentId, roleId, region === "none" ? undefined : region)); }
    catch (error) { setStudentError(error instanceof Error ? error.message : t("marketSignals.studentLoadError")); }
    finally { setStudentLoading(false); }
  }, [region, roleId, studentId, t]);

  const loadCurator = useCallback(async () => {
    setCuratorLoading(true); setCuratorError("");
    try {
      const [signalRows, proposalRows, versionRows, sourceRows, governance] = await Promise.all([
        getMarketSignals(), getTaxonomyProposals(), getTaxonomyVersions(), getMarketSources(), getMarketGovernance(),
      ]);
      setSignals(signalRows); setProposals(proposalRows); setVersions(versionRows); setSourceCount(sourceRows.length);
      setGovernanceSummary(`${governance.minimum_source_count} sources · sample ≥ ${governance.minimum_sample_size} · confidence ≥ ${pct(governance.publication_confidence)}`);
    } catch (error) {
      setCuratorError(error instanceof MarketTaxonomyApiError ? error.message : t("marketSignals.curatorLoadError"));
    } finally { setCuratorLoading(false); }
  }, [t]);

  useEffect(() => { void loadStudent(); }, [loadStudent]);
  useEffect(() => { if (tab === "curator" && canGovern) void loadCurator(); }, [tab, loadCurator, canGovern]);

  const decideUpdate = async (decisionValue: "keep_current" | "recalculate" | "dismiss") => {
    if (!selectedUpdate || !studentId || busy) return;
    setBusy(true);
    try {
      const updated = await decideStudentTaxonomyUpdate(studentId, selectedUpdate.id, decisionValue, decisionValue === "recalculate" ? recalcConfirmed : false);
      setUpdates((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(decisionValue === "recalculate" ? t("marketSignals.draftCreated") : t("marketSignals.preferenceSaved"));
      setSelectedUpdate(null); setRecalcConfirmed(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : t("marketSignals.actionFailed")); }
    finally { setBusy(false); }
  };

  const openProposalDecision = (proposal: ChangeProposal, value: "approve" | "reject") => {
    setDecisionProposal(proposal); setDecision(value); setDecisionRationale("");
  };

  const saveProposalDecision = async () => {
    if (!decisionProposal || decisionRationale.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const updated = await decideTaxonomyProposal(decisionProposal.id, decision, decisionRationale.trim());
      setProposals((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success(decision === "approve" ? t("marketSignals.proposalApproved") : t("marketSignals.proposalRejected"));
      setDecisionProposal(null); await loadCurator();
    } catch (error) { toast.error(error instanceof Error ? error.message : t("marketSignals.actionFailed")); }
    finally { setBusy(false); }
  };

  const submitProposal = async (proposal: ChangeProposal) => {
    setBusy(true);
    try { const updated = await submitTaxonomyProposal(proposal.id); setProposals((current) => current.map((item) => item.id === updated.id ? updated : item)); toast.success(t("marketSignals.sentForReview")); }
    catch (error) { toast.error(error instanceof Error ? error.message : t("marketSignals.actionFailed")); }
    finally { setBusy(false); }
  };

  const latestDefault = useMemo(() => versions.find((version) => version.is_default), [versions]);

  return (
    <div className="mx-auto max-w-[1500px] px-4 pb-12 pt-5 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-3xl">
          <p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><DatabaseZap className="size-3.5" />{t("marketSignals.eyebrow")}</p>
          <TypographyH1>{t("marketSignals.title")}</TypographyH1>
          <TypographyP className="mt-2 max-w-3xl">{t("marketSignals.description")}</TypographyP>
        </div>
        <Badge variant="outline" className="w-fit rounded-xl px-3 py-2"><ShieldCheck className="mr-1.5 size-3.5 text-primary" />{t("marketSignals.humanReviewed")}</Badge>
      </div>

      <Tabs value={canGovern ? tab : "student"} onValueChange={setTab} className="mt-5">
        <TabsList className="h-10 rounded-xl bg-muted/45 p-1">
          <TabsTrigger value="student" className="rounded-lg text-xs">{t("marketSignals.studentView")}</TabsTrigger>
          {canGovern && <TabsTrigger value="curator" className="rounded-lg text-xs">{t("marketSignals.curatorView")}</TabsTrigger>}
        </TabsList>

        <TabsContent value="student" className="mt-4 space-y-4">
          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardContent className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[1fr_0.8fr_auto] lg:items-end">
              <div><label className="mb-2 block text-[0.62rem] font-medium text-muted-foreground">{t("marketSignals.career")}</label><Select value={roleId} onValueChange={setRoleId}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{roles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="mb-2 block text-[0.62rem] font-medium text-muted-foreground">{t("marketSignals.profile")}<ProBadge /></label><Select value={region} onValueChange={setRegion}><SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{REGION_OPTIONS.map((item) => <SelectItem key={item} value={item}>{item === "none" ? t("marketSignals.internationalOnly") : t("marketSignals.sriLanka")}</SelectItem>)}</SelectContent></Select></div>
              <Button className="h-10 rounded-xl" onClick={() => void refreshComparison()} disabled={studentLoading || !roleId}><RefreshCw className={`size-3.5 ${studentLoading ? "animate-spin" : ""}`} />{t("marketSignals.compare")}</Button>
            </CardContent>
          </Card>

          {studentError && <StateCard icon={LockKeyhole} title={t("marketSignals.unavailable")} description={studentError} />}
          {studentLoading && <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-[360px] rounded-[20px]" /><Skeleton className="h-[360px] rounded-[20px]" /></div>}
          {!studentLoading && comparison && <>
            <div className="grid gap-4 lg:grid-cols-2">
              <ProfileCard profile={comparison.international} title={t("marketSignals.international")} icon={Globe2} />
              {comparison.regional ? <ProfileCard profile={comparison.regional} title={t("marketSignals.regional", { region: comparison.regional.region_code?.toUpperCase() ?? "" })} icon={MapPinned} /> : <StateCard icon={MapPinned} title={t("marketSignals.noRegionalProfile")} description={comparison.notes.at(-1) ?? t("marketSignals.noRegionalHint")} />}
            </div>
            <div className="rounded-[16px] border border-border/75 bg-muted/15 p-4"><div className="flex items-start gap-3"><Info className="mt-0.5 size-4 shrink-0 text-primary" /><div>{comparison.notes.map((note) => <p key={note} className="text-[0.64rem] leading-5 text-muted-foreground">{note}</p>)}</div></div></div>
          </>}

          <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
            <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-center justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">{t("marketSignals.pathwayImpact")}</p><CardTitle className="type-section-title">{t("marketSignals.reviewUpdates")}</CardTitle></div><Badge variant="outline">{updates.filter((item) => item.status === "pending").length} {t("marketSignals.pending")}</Badge></div></CardHeader>
            <CardContent className="space-y-3 px-4 pb-5 sm:px-5">
              {!updates.length && <StateCard compact icon={CheckCircle2} title={t("marketSignals.noUpdates")} description={t("marketSignals.noUpdatesHint")} />}
              {updates.map((update) => <div key={update.id} className="rounded-[16px] border border-border/70 bg-background/30 p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold">{update.target_role}</p><Badge variant={update.status === "pending" ? "secondary" : "outline"}>{update.status.replaceAll("_", " ")}</Badge></div><p className="mt-1 text-[0.62rem] text-muted-foreground">{update.from_version} → {update.to_version}</p><p className="mt-3 max-w-3xl text-xs leading-5 text-muted-foreground">{update.explanation}</p></div><p className="shrink-0 text-[0.58rem] text-muted-foreground">{formatDate(update.created_at, { month: "short", day: "numeric", year: "numeric" })}</p></div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">{update.changes.map((change) => <div key={change.skill_id} className="rounded-xl border border-border/65 p-3"><p className="text-xs font-medium">{change.skill_name}</p><p className="mt-1 text-[0.61rem] leading-5 text-muted-foreground">{change.change}</p><p className="mt-1 text-[0.58rem] text-muted-foreground">{change.before_required_proficiency ?? "—"}% → {change.after_required_proficiency ?? "—"}% · {t("marketSignals.creditPreserved")}</p></div>)}</div>
                {update.status === "pending" && <div className="mt-3 flex flex-wrap gap-2"><Button variant="outline" size="sm" className="rounded-lg" onClick={() => { setSelectedUpdate(update); setRecalcConfirmed(false); }}>{t("marketSignals.reviewRecalculate")}</Button><Button variant="ghost" size="sm" className="rounded-lg" onClick={() => { setSelectedUpdate(update); void decideStudentTaxonomyUpdate(studentId, update.id, "keep_current").then((next) => { setUpdates((current) => current.map((item) => item.id === next.id ? next : item)); toast.success(t("marketSignals.preferenceSaved")); }).catch((error) => toast.error(error instanceof Error ? error.message : t("marketSignals.actionFailed"))); }}>{t("marketSignals.keepCurrent")}</Button></div>}
                {update.draft_pathway_id && <Button asChild variant="link" className="mt-2 h-auto p-0 text-xs"><Link href="/roadmap">{t("marketSignals.openDraft")}<ArrowRight className="size-3.5" /></Link></Button>}
              </div>)}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="curator" className="mt-4 space-y-4">
          {curatorError && <StateCard icon={LockKeyhole} title={t("marketSignals.curatorUnavailable")} description={curatorError} />}
          {curatorLoading && <div className="grid gap-4 sm:grid-cols-3"><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-28 rounded-[20px]" /><Skeleton className="h-28 rounded-[20px]" /></div>}
          {!curatorLoading && !curatorError && <>
            <div className="grid gap-3 sm:grid-cols-3"><MiniStat icon={ShieldCheck} label={t("marketSignals.governedSources")} value={String(sourceCount)} /><MiniStat icon={Scale} label={t("marketSignals.reviewProposals")} value={String(proposals.filter((item) => item.status === "review").length)} /><MiniStat icon={History} label={t("marketSignals.currentVersion")} value={latestDefault?.version ?? "—"} /></div>
            <div className="rounded-[16px] border border-border/75 bg-muted/15 p-4"><p className="text-xs font-medium">{t("marketSignals.publicationGate")}</p><p className="mt-1 text-[0.62rem] leading-5 text-muted-foreground">{governanceSummary}. {t("marketSignals.aiCannotApprove")}</p></div>

            <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
              <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">{t("marketSignals.observedEvidence")}</p><CardTitle className="type-section-title">{t("marketSignals.marketSignals")}</CardTitle></CardHeader><CardContent className="space-y-3 px-4 pb-5 sm:px-5">{signals.length ? signals.slice(0, 12).map((signal) => <SignalCard key={signal.id} signal={signal} />) : <StateCard compact icon={DatabaseZap} title={t("marketSignals.noSignals")} description={t("marketSignals.noSignalsHint")} />}</CardContent></Card>
              <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">{t("marketSignals.humanReview")}</p><CardTitle className="type-section-title">{t("marketSignals.changeProposals")}</CardTitle></CardHeader><CardContent className="space-y-3 px-4 pb-5 sm:px-5">{proposals.length ? proposals.map((proposal) => <ProposalCard key={proposal.id} proposal={proposal} busy={busy} onSubmit={() => void submitProposal(proposal)} onDecision={(value) => openProposalDecision(proposal, value)} />) : <StateCard compact icon={CheckCircle2} title={t("marketSignals.noProposals")} description={t("marketSignals.noProposalsHint")} />}</CardContent></Card>
            </div>
          </>}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(selectedUpdate)} onOpenChange={(open) => { if (!open) { setSelectedUpdate(null); setRecalcConfirmed(false); } }}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{t("marketSignals.recalculateTitle")}</DialogTitle><DialogDescription>{t("marketSignals.recalculateDescription")}</DialogDescription></DialogHeader><div className="flex items-start gap-3 rounded-xl border border-border/70 p-3"><Checkbox id="recalc-confirm" checked={recalcConfirmed} onCheckedChange={(value) => setRecalcConfirmed(Boolean(value))} /><label htmlFor="recalc-confirm" className="text-xs leading-5 text-muted-foreground">{t("marketSignals.recalculateConfirm")}</label></div><DialogFooter><Button variant="outline" onClick={() => setSelectedUpdate(null)}>{t("common.cancel")}</Button><Button disabled={!recalcConfirmed || busy} onClick={() => void decideUpdate("recalculate")}>{busy ? t("common.loading") : t("marketSignals.createDraft")}</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={Boolean(decisionProposal)} onOpenChange={(open) => { if (!open) setDecisionProposal(null); }}>
        <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{decision === "approve" ? t("marketSignals.approveProposal") : t("marketSignals.rejectProposal")}</DialogTitle><DialogDescription>{t("marketSignals.decisionDescription")}</DialogDescription></DialogHeader><Textarea value={decisionRationale} onChange={(event) => setDecisionRationale(event.target.value)} placeholder={t("marketSignals.rationalePlaceholder")} className="min-h-28" /><DialogFooter><Button variant="outline" onClick={() => setDecisionProposal(null)}>{t("common.cancel")}</Button><Button variant={decision === "reject" ? "destructive" : "default"} disabled={decisionRationale.trim().length < 5 || busy} onClick={() => void saveProposalDecision()}>{busy ? t("common.loading") : decision === "approve" ? t("marketSignals.approve") : t("marketSignals.reject")}</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );
}

function ProfileCard({ profile, title, icon: Icon }: { profile: ProfileComparison["international"]; title: string; icon: typeof Globe2 }) {
  const { t } = useLocale();
  return <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><div className="flex items-start justify-between gap-3"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-muted-foreground"><Icon className="size-3.5" />{title}</p><CardTitle className="type-section-title">{profile.role_name}</CardTitle></div><Badge variant="outline" className="max-w-48 truncate">{profile.version}</Badge></div></CardHeader><CardContent className="space-y-2 px-4 pb-5 sm:px-5">{profile.skills.map((skill) => <div key={skill.skill_id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-xl border border-border/65 bg-background/25 p-3"><div className="min-w-0"><p className="truncate text-xs font-medium">{skill.name}</p><p className="mt-1 text-[0.57rem] text-muted-foreground">{skill.prerequisites.length ? t("marketSignals.prerequisites", { skills: skill.prerequisites.join(", ") }) : t("marketSignals.foundationSkill")}</p></div><p className="text-sm font-semibold">{skill.required_proficiency}%</p></div>)}</CardContent></Card>;
}

function SignalCard({ signal }: { signal: SkillSignal }) {
  const { t, formatDate } = useLocale();
  const Icon = signal.label === "emerging" ? TrendingUp : signal.label === "declining" ? TrendingDown : Scale;
  return <div className="rounded-[16px] border border-border/70 bg-background/25 p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><Icon className="size-4 text-primary" /><p className="text-xs font-semibold">{signal.skill_id.replaceAll("-", " ")}</p><Badge variant="outline">{signal.label}</Badge>{signal.profile_scope === "regional" && <Badge variant="secondary">{signal.region_code?.toUpperCase()}</Badge>}</div><p className="mt-2 text-[0.59rem] text-muted-foreground">Δ {signal.delta >= 0 ? "+" : ""}{Math.round(signal.delta * 100)} pp · n={signal.sample_size} · confidence {pct(signal.confidence)} · {t("marketSignals.sourcesCount", { count: signal.source_count })}</p></div><Badge variant={signal.publication_eligible ? "secondary" : "outline"}>{signal.publication_eligible ? t("marketSignals.proposalEligible") : t("marketSignals.observationOnly")}</Badge></div><p className="mt-3 text-[0.61rem] leading-5 text-muted-foreground">{signal.methodology}</p><p className="mt-1 text-[0.56rem] text-muted-foreground">{t("marketSignals.signalMetadata", { methodology: signal.methodology_version, days: Math.round(signal.recency_days) })}</p><div className="mt-3 space-y-2">{signal.observations.slice(0, 4).map((row) => <a key={row.id} href={row.provenance_url} target="_blank" rel="noreferrer" className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg border border-border/60 px-2.5 py-2 text-[0.58rem] text-muted-foreground transition-colors hover:text-foreground"><span className="min-w-0"><span className="block truncate">{row.source_name} · {row.source_type.replaceAll("_", " ")} · n={row.sample_size}</span><span className="mt-0.5 block text-[0.53rem]">{t("marketSignals.observationPeriod", { date: formatDate(row.period_end, { month: "short", day: "numeric", year: "numeric" }) })}</span></span><span className="shrink-0 self-center">{Math.round(row.skill_share * 100)}%</span></a>)}</div>{signal.limitations.length > 0 && <div className="mt-3 rounded-lg bg-muted/30 p-2.5 text-[0.58rem] leading-5 text-muted-foreground">{signal.limitations.join(" ")}</div>}</div>;
}

function ProposalCard({ proposal, busy, onSubmit, onDecision }: { proposal: ChangeProposal; busy: boolean; onSubmit: () => void; onDecision: (value: "approve" | "reject") => void }) {
  const { t } = useLocale();
  return <div className="rounded-[16px] border border-border/70 bg-background/25 p-4"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-semibold">{proposal.role_name} · {proposal.skill_name}</p><Badge variant={proposal.status === "review" ? "secondary" : "outline"}>{proposal.status}</Badge><Badge variant={proposal.impact_level === "high" ? "destructive" : "outline"}>{proposal.impact_level} impact</Badge></div><p className="mt-2 text-[0.6rem] text-muted-foreground">{proposal.current_required_proficiency ?? "—"}% → {proposal.proposed_required_proficiency ?? "—"}% · signal {proposal.observed_signal} ({pct(proposal.signal_confidence)})</p>{proposal.candidate_version && <p className="mt-1 truncate text-[0.54rem] text-muted-foreground">{t("marketSignals.candidateVersion", { candidate: proposal.candidate_version, base: proposal.base_version })}</p>}<p className="mt-3 text-[0.62rem] leading-5 text-muted-foreground">{proposal.rationale}</p>{proposal.resulting_version && <p className="mt-2 text-[0.58rem] text-muted-foreground">{t("marketSignals.publishedAs", { version: proposal.resulting_version })}</p>}<div className="mt-3 flex flex-wrap gap-2">{proposal.status === "draft" && <Button size="sm" variant="outline" disabled={busy} onClick={onSubmit}>{t("marketSignals.sendForReview")}</Button>}{proposal.status === "review" && <><Button size="sm" disabled={busy} onClick={() => onDecision("approve")}>{t("marketSignals.approve")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => onDecision("reject")}>{t("marketSignals.reject")}</Button></>}</div></div>;
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) { return <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardContent className="p-4 sm:p-5"><Icon className="size-4 text-muted-foreground" /><p className="mt-4 truncate text-xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-[0.62rem] text-muted-foreground">{label}</p></CardContent></Card>; }

function StateCard({ icon: Icon, title, description, compact = false }: { icon: typeof Info; title: string; description: string; compact?: boolean }) { return <div className={`flex items-start gap-3 rounded-[16px] border border-border/70 bg-background/20 ${compact ? "p-3" : "p-4"}`}><Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p className="text-xs font-medium">{title}</p><p className="mt-1 text-[0.62rem] leading-5 text-muted-foreground">{description}</p></div></div>; }
