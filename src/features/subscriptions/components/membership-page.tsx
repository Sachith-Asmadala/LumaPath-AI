"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, Check, RefreshCw, Sparkles, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSubscription } from "./subscription-provider";
import { featureLabels, planNames, type PlanId } from "../entitlements";

const plans = [
  { id: "free" as const, icon: Sprout, title: "Find your rhythm", value: "$0", subtitle: "The complete basic student journey", features: ["Light theme", "1 active career pathway", "2 career comparisons / month · 2 roles", "15 assistant requests / day", "3 Career Intelligence items / day", "2 CV + 3 document analyses / month", "Manual opportunity preparation", "Basic planner, capacity & Next Best Action", "Learning, skills & Evidence Passport", "Opportunity browsing & international profile"] },
  { id: "pro" as const, icon: Sparkles, title: "Go deeper, move further", value: "USD 4.99", subtitle: "Higher limits, intelligence & automation", features: ["Light, dark & system themes", "1 active pathway + up to 3 saved scenarios", "30 career comparisons / month · 4 roles", "100 assistant requests / day", "Full available Career Intelligence feed", "15 CV + 25 document analyses / month", "30 preparation proposals / month", "Advanced adaptive replanning", "Regional + international market comparison", "Saved scenario history & advanced preparation"] },
  { id: "institution" as const, icon: Building2, title: "Support a whole community", value: "For universities", subtitle: "Institution access with staff permissions", features: ["Pro student capabilities included", "Institutional & cohort analytics", "Mentor and administrator tools", "Taxonomy governance & reviewed changes", "Existing role and consent controls", "Privacy-preserving aggregate reporting", "Institution-scoped access", "Student Pro does not grant staff access"] },
];
const metered = ["career_comparisons", "assistant_requests", "intelligence_items", "cv_analyses", "document_analyses", "opportunity_readiness", "saved_scenarios"];

export function MembershipPage() {
  const { subscription, loading, error, refresh, switchDemoPlan } = useSubscription();
  useEffect(() => { void refresh(); }, [refresh]);
  const [busy, setBusy] = useState(false);
  const [switchError, setSwitchError] = useState("");
  const plan = subscription?.plan;
  const demoEnabled = process.env.NODE_ENV !== "production" && subscription?.demo_switch_enabled === true;
  async function change(value: PlanId) {
    setBusy(true); setSwitchError("");
    try { await switchDemoPlan(value); } catch (cause) { setSwitchError(cause instanceof Error ? cause.message : "Could not change the demo plan."); } finally { setBusy(false); }
  }
  return <div className="membership-page" style={{ maxWidth: 1360 }}>
    <header className="membership-heading"><span className="membership-badge"><Sparkles size={14} />ROOM TO GROW</span><h1>Your ambition.<br /><span>A plan for your next chapter.</span></h1><p>Start with the complete basic journey. Go deeper with Pro.<br />Support your university community with Institution.</p><p className="mt-4"><Badge variant="outline">{loading ? "Loading your plan…" : subscription?.name ?? "Plan unavailable"}</Badge></p></header>
    {error && <Card className="mb-6 gap-3 p-5"><p role="status" className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => void refresh()} className="w-fit">Try again</Button></Card>}
    <div className="membership-grid" data-plans="three">{plans.map(({ id, icon: Icon, title, value, subtitle, features }) => <section key={id} className={`membership-card ${id === "pro" ? "membership-plus" : ""}`}>{plan === id && <Badge className="absolute right-5 top-5" variant="outline">CURRENT PLAN</Badge>}<div className="membership-plan-icon"><Icon size={24} /></div><p className="workspace-eyebrow">{title}</p><h2>{planNames[id]}</h2><p>{subtitle}</p><div className="membership-price">{value}<span>{id === "free" ? "your everyday essentials" : id === "pro" ? "per month · monthly membership" : "institution licence · tailored pricing"}</span></div><Button asChild variant={id === "pro" ? "default" : "outline"} className="h-12 w-full rounded-xl"><Link href={id === "institution" ? "/programme-analytics" : id === "pro" && plan !== "pro" && plan !== "institution" ? "/checkout" : "/overview"}>{plan === id || (id === "pro" && plan === "institution") ? "Open my workspace" : id === "institution" ? "Explore Institution" : id === "pro" ? "Upgrade to Pro" : "Continue my journey"}<ArrowRight size={16} /></Link></Button><div className="membership-divider" /><h3>{id === "institution" ? "Built for responsible support" : "Included with this plan"}</h3><ul>{features.map((item) => <li key={item}><Check size={16} />{item}</li>)}</ul></section>)}</div>
    <Card className="mt-7 rounded-2xl p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="workspace-eyebrow">COMPETITION PREVIEW</p><h2 className="mt-2 text-lg font-medium">Competition Demo Plan</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{demoEnabled ? "Switch the demo student's actual backend plan to explore the business model. Free uses light appearance and three basic demo updates. Pro unlocks dark mode, eight detailed demo updates, career scenario examples, regional insights, preparation, and adaptive planning previews. Open Overview after switching. Your tasks and recorded usage are preserved. No payments are collected." : "Demo plan switching is unavailable in production. Plan changes require a verified subscription process."}</p></div><select aria-label="Competition Demo Plan" className="workspace-select" disabled={!demoEnabled || busy || loading} value={plan ?? "free"} onChange={(event) => void change(event.target.value as PlanId)}><option value="free">Free</option><option value="pro">Pro</option><option value="institution">Institution</option></select></div>{busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Updating demo plan…</p>}{switchError && <p role="alert" className="mt-3 text-sm text-risk">{switchError}</p>}</Card>
    <section aria-label="Free and Pro comparison" className="mt-7 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="p-5 sm:p-6"><h2 className="text-xl font-medium">See the difference</h2><p className="mt-2 text-sm text-muted-foreground">Your everyday student workspace is included with both plans. Pro adds more depth and higher limits.</p></div>
      <table className="w-full table-fixed text-left text-xs sm:text-sm"><caption className="sr-only">LumaPath Free and Pro feature comparison</caption><thead className="bg-muted/50"><tr><th scope="col" className="w-[40%] p-3 sm:px-6">Feature</th><th scope="col" className="p-3">Free</th><th scope="col" className="p-3 text-primary">Pro</th></tr></thead><tbody>{[
        ["Appearance", "Light", "Light, dark & system"],
        ["Career Intelligence", "3 items / day", "Full available feed"],
        ["Career comparisons", "2 / month · 2 roles", "30 / month · 4 roles"],
        ["Saved career scenarios", "Included with Pro", "Up to 3 + history"],
        ["Regional comparison", "Included with Pro", "Local + international"],
        ["Opportunity preparation", "Manual preparation tasks", "30 evidence-based proposals / month"],
        ["Planning", "Basic planner & capacity", "Advanced adaptive replanning"],
        ["Assistant", "15 requests / day", "100 requests / day"],
        ["CV / document analyses", "2 / 3 per month", "15 / 25 per month"],
        ...(demoEnabled ? [["Overview demo examples", "3 concise updates", "8 updates + 4 detailed views"]] : []),
      ].map(([feature, free, pro]) => <tr key={feature} className="border-t border-border"><th scope="row" className="p-3 font-medium sm:px-6">{feature}</th><td className="p-3 text-muted-foreground">{free}</td><td className="p-3">{pro}</td></tr>)}</tbody></table>
      {demoEnabled && <div className="border-t border-border p-5"><Button asChild variant="outline" className="rounded-xl"><Link href="/overview#plan-demo">Explore my {plan === "free" ? "Free" : "Pro"} demo<ArrowRight size={15} /></Link></Button></div>}
    </section>
    <section className="mt-8"><div className="mb-5 flex items-center justify-between gap-4"><div><p className="workspace-eyebrow">YOUR CURRENT ALLOWANCES</p><h2 className="mt-2 text-xl font-medium">Room for your next step</h2></div><Button variant="outline" disabled={loading} onClick={() => void refresh()} className="rounded-xl"><RefreshCw size={15} />Refresh usage</Button></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{subscription && metered.map((feature) => { const rule = subscription.entitlements[feature]; if (!rule) return null; return <Card key={feature} className="gap-3 rounded-2xl p-5"><div className="flex items-center justify-between gap-3"><h3 className="text-sm capitalize">{featureLabels[feature]}</h3><span className="whitespace-nowrap text-xs text-primary">{rule.used} / {rule.limit === null ? "Uncapped" : rule.limit}</span></div><Progress value={rule.limit ? Math.min(100, rule.used / rule.limit * 100) : rule.limit === 0 ? 0 : 10} className="h-1.5" /><p className="text-xs text-muted-foreground">{!rule.enabled ? "Included with Pro" : rule.period === "stock" ? "Saved slots · remove a saved scenario to free a slot" : rule.resets_at ? `Renews ${new Date(rule.resets_at).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" })} at 00:00 UTC` : "Included with your plan"}</p></Card>; })}</div></section>
    <p className="membership-footnote">Checkout runs in demo mode. No payment is collected.<br />Institution access also requires the existing administrator, curator or mentor permissions. One roadmap stays active at a time.</p>
  </div>;
}
