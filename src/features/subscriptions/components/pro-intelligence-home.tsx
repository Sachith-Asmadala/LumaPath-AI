"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BriefcaseBusiness, CalendarClock, Check, Globe2, History, LoaderCircle, ShieldCheck, Sparkles, TrendingUp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/state/demo-provider";
import { stateScenarioDate } from "@/data/demo/scenario";
import { getStudentTaxonomyUpdates } from "@/features/market-taxonomy/services/market-taxonomy";
import type { StudentTaxonomyUpdate } from "@/features/market-taxonomy/domain/market-taxonomy";
import { useSubscription } from "./subscription-provider";
import { useProExperience } from "./pro-experience-provider";
import type { PassportDashboard } from "@/features/evidence-passport/domain/evidence-passport";
import { type ProActivity } from "../pro-intelligence";
import { hasProFeatures } from "../entitlements";
import { ProBadge } from "./pro-badge";

export function ProUsageStrip() {
  const { subscription, loading } = useSubscription();
  if (!hasProFeatures(subscription?.plan)) return null;
  if (loading) return <div className="h-5 w-64 animate-pulse rounded bg-muted motion-reduce:animate-none" aria-label="Refreshing Pro allowances" />;
  return <div className="pro-usage" aria-label="Pro usage">{[["assistant_requests", "AI guidance", "today"], ["career_comparisons", "Career simulations", "this month"], ["cv_analyses", "CV analyses", "this month"]].map(([key, label, period]) => {
    const value = subscription?.entitlements[key];
    if (!value) return null;
    return <span key={key}>{label}: <strong>{value.remaining === null ? "Uncapped" : `${value.remaining} remaining`}</strong> {period}<span className="ml-1">· {value.used} used</span></span>;
  })}<Link href="/settings/subscription" className="text-primary">View allowances →</Link></div>;
}

export function ProIntelligenceHome() {
  const { state } = useDemo();
  const { history, preferences, busy, status, warnings, recalculate, undo, canUndo } = useProExperience();
  const [updates, setUpdates] = useState<StudentTaxonomyUpdate[]>([]);
  const [marketLoading, setMarketLoading] = useState(true);
  const [marketError, setMarketError] = useState(false);
  useEffect(() => {
    let active = true;
    getStudentTaxonomyUpdates(state.student.id).then(items => { if (active) setUpdates(items); }).catch(() => { if (active) setMarketError(true); }).finally(() => { if (active) setMarketLoading(false); });
    return () => { active = false; };
  }, [state.student.id]);
  const weekStart = stateScenarioDate(state), weekEnd = stateScenarioDate(state, 6);
  const due = state.tasks.filter(task => task.status !== "completed" && task.dueAt && task.dueAt.slice(0, 10) >= weekStart && task.dueAt.slice(0, 10) <= weekEnd);
  const academic = due.filter(task => task.category === "Academic").length;
  const career = due.filter(task => ["Career", "career-learning", "Internship"].includes(task.category)).length;
  const opportunity = state.competition?.opportunity;
  const gaps = opportunity?.eligibility_checks.filter(item => item.status !== "met") ?? [];
  const latestPlan = history.find(item => item.kind === "plan");
  const previousScore = state.readinessStartingScore ?? Math.max(0, state.readiness.score - state.readiness.weeklyDelta);
  const changesThisWeek = history.filter(item => item.kind === "plan" && item.title === "Automatic plan adapted" && Date.now() - Date.parse(item.at) < 7 * 86_400_000).length;
  const marketUpdate = updates.find(item => item.status === "pending");

  return <section id="pro-intelligence" aria-label="Your Pro Intelligence" className="mt-6 scroll-mt-24 space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="pro-card-label"><Sparkles size={14} />CONNECTED INTELLIGENCE <ProBadge /></p><h2 className="mt-2 font-heading text-xl font-semibold">Your Pro Intelligence</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Your next action, changing priorities and career progress, together.</p></div><Link href="/settings#pro-controls" className="text-xs font-medium text-primary">Tune my Pro experience →</Link></div>
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <article className="pro-card"><p className="pro-card-label"><CalendarClock size={15} />{latestPlan ? "Plan Adapted" : "Adaptive Plan"}</p><h3 className="mt-3 text-base font-medium">{preferences.automaticPlanning ? "Keeping your week in balance" : "You’re in control"}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground" role="status">{busy ? "Recalculating around your latest changes…" : status || (latestPlan ? latestPlan.detail : "Deadline, capacity and approved opportunity changes can update your flexible study blocks automatically.")}</p><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={busy} onClick={() => void recalculate("Plan reviewed")} className="rounded-lg text-xs">{busy ? <LoaderCircle size={13} className="animate-spin" /> : <Sparkles size={13} />}Recalculate my plan</Button>{canUndo && <Button variant="ghost" size="sm" onClick={undo} className="text-xs"><Undo2 size={13} />Undo adaptation</Button>}</div>{warnings.length > 0 && <p className="mt-3 text-xs leading-5 text-warning">Needs a manual slot: {warnings.join(" · ")}</p>}</article>
      <article className="pro-card"><p className="pro-card-label"><BriefcaseBusiness size={15} />Opportunity Readiness</p><h3 className="mt-3 text-base font-medium">{opportunity?.title ?? state.opportunities[0]?.role ?? "Your next opportunity"}</h3>{opportunity ? <><div className="mt-3 flex flex-wrap gap-2">{["met", "unmet", "unknown"].map(value => <span key={value} className="rounded-md border border-border px-2 py-1 text-[10px] uppercase">{opportunity.eligibility_checks.filter(item => item.status === value).length} {value}</span>)}</div><p className="mt-2 text-xs leading-5 text-muted-foreground">{gaps.length ? `Prepare ${gaps.map(item => item.label).join(" and ")}.` : "Current evidence supports the recorded requirements."}</p></> : <p className="mt-2 text-xs leading-5 text-muted-foreground">Check recorded evidence, identify missing proof, and turn preparation gaps into a plan.</p>}<HomeLink href="/opportunities">Check readiness & prepare</HomeLink></article>
      <article className="pro-card"><p className="pro-card-label"><Globe2 size={15} />Market Signal</p>{marketLoading ? <div className="mt-4 space-y-2" aria-label="Loading pathway market signals"><div className="h-4 w-3/4 animate-pulse rounded bg-muted motion-reduce:animate-none" /><div className="h-12 animate-pulse rounded bg-muted motion-reduce:animate-none" /></div> : <><h3 className="mt-3 text-base font-medium">{marketUpdate ? "What changed for your career?" : marketError ? "Market refresh is unavailable" : "Your pathway is ready for its next signal"}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{marketUpdate?.explanation ?? (marketError ? "Open Market Signals to retry the trusted-source refresh." : "Your next intelligence refresh will connect pathway progress, evidence and regional requirements.")}</p></>}<HomeLink href="/market-signals">Review regional & international signals</HomeLink></article>
      <article className="pro-card"><p className="pro-card-label"><TrendingUp size={15} />Career Progress</p><p className="mt-3 font-heading text-3xl font-semibold"><span className="text-xl text-muted-foreground">{previousScore}% → </span>{state.readiness.score}%</p><p className="mt-2 text-xs leading-5 text-muted-foreground">Baseline to current readiness · {state.evidence.filter(item => item.status === "verified").length} verified evidence items.</p><HomeLink href="/evidence">Review strengths & missing proof</HomeLink></article>
    </div>
    <div className="pro-card flex flex-wrap items-center justify-between gap-4"><div><p className="pro-card-label">Your week at a glance</p><p className="mt-2 text-sm leading-6">{academic} academic deadline{academic === 1 ? "" : "s"} · {career} career task{career === 1 ? "" : "s"} · {opportunity ? (gaps.length ? 1 : 0) : state.opportunities.filter(item => item.missingSkills.length).length} opportunities need preparation</p><p className="mt-1 text-xs text-muted-foreground">{changesThisWeek} automatic adaptation{changesThisWeek === 1 ? "" : "s"} recorded in the last 7 days · {preferences.weeklyHours} career-learning hours / week</p></div><Button asChild variant="outline" className="rounded-xl"><Link href="/intelligence">View my intelligence<ArrowRight size={14} /></Link></Button></div>
    <ProUsageStrip />
    <ProHistory />
  </section>;
}

export function ProHistory() {
  const { history } = useProExperience();
  const { subscription } = useSubscription();
  if (!hasProFeatures(subscription?.plan)) return null;
  return <details id="pro-history" className="pro-card scroll-mt-24"><summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><History size={16} className="text-primary" />Your intelligence history <span className="ml-auto text-xs text-muted-foreground">{history.length} recorded changes</span></summary>{history.length ? <ol className="mt-4 space-y-3">{history.slice(0, 12).map(item => <HistoryRow key={item.id} item={item} />)}</ol> : <p className="mt-4 text-xs leading-6 text-muted-foreground">Your next plan adaptation, readiness change, evidence update or preparation action will appear here. <Link href="/career-compare" className="text-primary underline">Saved career simulations</Link> have their own calculation history.</p>}</details>;
}
function HistoryRow({ item }: { item: ProActivity }) {
  return <li className="rounded-xl border border-border p-3"><div className="flex flex-wrap justify-between gap-2"><p className="text-xs font-medium">{item.title}</p><time className="text-[10px] text-muted-foreground" dateTime={item.at}>{new Date(item.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>{item.changes?.length ? <details className="mt-2"><summary className="cursor-pointer text-xs text-primary">What moved and why</summary><ul className="mt-2 space-y-2">{item.changes.map(change => <li key={change.id} className="text-xs leading-5"><strong>{change.title}</strong><p className="text-muted-foreground">{change.before?.replace("T", " ").slice(0, 16) ?? "Unscheduled"} → {change.after?.replace("T", " ").slice(0, 16) ?? "Removed"}</p><p className="text-muted-foreground">{change.reason}</p></li>)}</ul></details> : null}</li>;
}

export function ProEvidenceInsights({ passport }: { passport: PassportDashboard }) {
  const { subscription } = useSubscription();
  if (!hasProFeatures(subscription?.plan)) return null;
  const strongest = passport.skills.flatMap(skill => skill.evidence).filter(item => item.verification_status === "verified" && item.freshness === "fresh").sort((a,b) => b.confidence-a.confidence)[0];
  const weakest = [...passport.skills].filter(skill => skill.status !== 'supported').sort((a,b) => a.readiness_score-b.readiness_score)[0];
  const missing = passport.skills.filter(skill => !skill.evidence.some(item => item.verification_status === 'verified' && item.freshness === 'fresh'));
  return <section aria-label="Evidence Passport Pro" className="pro-card my-5"><p className="pro-card-label"><ShieldCheck size={15} />Evidence Passport <ProBadge /></p><div className="mt-4 grid gap-4 md:grid-cols-3">{[["Strongest evidence", strongest?.title ?? "Your first verified achievement will appear here", strongest ? `${Math.round(strongest.confidence*100)}% recorded confidence · ${strongest.skill_name}` : "Add proof and complete the verification step."], ["Weakest pathway gap", weakest?.skill_name ?? "All recorded skills supported", weakest?.gap_explanation ?? "Keep your evidence current."], ["Missing proof", `${missing.length} skills need current verified evidence`, missing.map(item => item.skill_name).join(" · ") || "Every recorded skill has current verified proof."]].map(([label, value, detail]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><h3 className="mt-2 text-sm font-medium">{value}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{detail}</p></div>)}</div><HomeLink href="/career-compare">Map evidence reuse across careers</HomeLink><div className="mt-3"><ProHistory /></div></section>;
}

function HomeLink({ href, children }: { href: string; children: React.ReactNode }) { return <Link href={href} className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-primary">{children}<ArrowRight size={12} className="shrink-0" /></Link>; }

export function ProActivationMoment() {
  const [visible, setVisible] = useState(1);
  const steps = ["LumaPath Pro is active", "Advanced Career Intelligence unlocked", "Adaptive Planning unlocked", "Regional Market Signals unlocked"];
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setVisible(steps.length); return; }
    let next = 1;
    const timer = window.setInterval(() => { next++; setVisible(next); if (next >= steps.length) window.clearInterval(timer); }, 550);
    return () => window.clearInterval(timer);
  }, [steps.length]);
  return <ol aria-label="Pro activation" aria-live="polite" className="my-6 space-y-2 rounded-2xl border border-primary/20 bg-primary/5 p-4">{steps.slice(0, visible).map(step => <li key={step} className="pro-activation-step flex items-center gap-2 text-xs"><Check size={14} className="text-primary" />{step}</li>)}</ol>;
}
