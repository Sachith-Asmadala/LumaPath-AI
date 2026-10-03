"use client";

import Link from "next/link";
import { ArrowRight, Clock3, LockKeyhole, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { demoAdaptivePreview, demoCareerScenarios, demoPlanUpdates, demoPreparationSteps, demoRegionalMarkets } from "@/data/demo/pro-preview";
import { hasProFeatures } from "../entitlements";
import { useSubscription } from "./subscription-provider";

const advancedFeatures = [
  { title: "Career scenarios", detail: "Compare routes and revisit calculation history." },
  { title: "Regional insights", detail: "Explore local, regional, and remote role requirements." },
  { title: "Advanced preparation", detail: "Turn evidence gaps into a detailed application checklist." },
  { title: "Adaptive planning", detail: "Review how flexible work moves around urgent deadlines." },
];

export function PlanDemoWorkspace() {
  const { subscription } = useSubscription();
  if (!subscription?.demo_switch_enabled || process.env.NODE_ENV === "production") return null;
  const pro = hasProFeatures(subscription.plan);
  return <section id="plan-demo" aria-label="Plan demo workspace" className="my-6 min-w-0 scroll-mt-24 rounded-3xl border border-primary/20 bg-card p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><Badge variant="outline" className="gap-1.5 text-primary"><Sparkles size={12} />{pro ? "PRO FEATURES UNLOCKED" : "FREE ESSENTIALS"}</Badge><h2 className="mt-3 font-heading text-2xl font-semibold">{pro ? "Your Pro demo" : "Your Free demo"}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{pro ? "Explore a fuller career picture, with detailed examples and more room to plan." : "Start with your daily plan, learning pathway, and three concise career updates."}</p></div>
      <div className="flex flex-wrap gap-2">{pro && <Button asChild variant="outline" className="rounded-xl"><Link href="/settings#settings-appearance">Appearance</Link></Button>}<Button asChild variant="outline" className="rounded-xl"><Link href="/pricing">Compare plans<ArrowRight size={15} /></Link></Button></div>
    </div>
    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">{[
      ["Appearance", pro ? "Light, dark & system" : "Light theme"],
      ["Demo career updates", pro ? `${demoPlanUpdates.length} detailed examples` : "3 basic examples"],
      ["Career comparisons", pro ? "30 / month · 4 roles" : "2 / month · 2 roles"],
      ["Assistant requests", pro ? "100 / day" : "15 / day"],
    ].map(([label, value]) => <div key={label} className="min-w-0 rounded-xl bg-muted/50 p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>)}</div>
    <p className="mt-4 text-xs leading-5 text-muted-foreground">Synthetic DevOps student examples. These samples are separate from your saved work and the trusted live feed.</p>
    {pro ? <Tabs defaultValue="updates" className="mt-5">
      <TabsList className="h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1" aria-label="Pro demo details">{["updates", "scenarios", "markets", "preparation", "planning"].map((id, index) => <TabsTrigger key={id} value={id} className="min-h-10 px-3">{["Career updates", "Career scenarios", "Regional insights", "Preparation", "Adaptive planning"][index]}</TabsTrigger>)}</TabsList>
      <TabsContent value="updates"><div className="mt-4 grid gap-3 md:grid-cols-2">{demoPlanUpdates.map(item => <UpdateCard key={item.id} item={item} detailed />)}</div><ToolLink href="/intelligence">Open Career Intelligence</ToolLink></TabsContent>
      <TabsContent value="scenarios"><p className="my-4 text-sm text-muted-foreground">Three example routes with earlier calculations. Pro supports up to three saved scenarios; these previews do not use your saved slots.</p><div className="grid gap-3 lg:grid-cols-3">{demoCareerScenarios.map(item => <Card key={item.title} className="gap-0 rounded-2xl p-5"><Badge variant="outline">Sample scenario</Badge><h3 className="mt-3 text-base font-medium">{item.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{item.roles}</p><dl className="mt-4 space-y-2 text-xs">{[["Learning time", `${item.hours} hours / week`], ["Estimated duration", item.duration], ["Estimated effort", item.effort], ["Cost route", item.budget]].map(([label, value]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="text-right">{value}</dd></div>)}</dl><p className="mt-4 text-sm font-medium">{item.focus}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.note}</p><details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer text-xs font-medium">Calculation history</summary><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.history}</p></details></Card>)}</div><ToolLink href="/career-compare">Compare and save my own scenarios</ToolLink></TabsContent>
      <TabsContent value="markets"><p className="my-4 text-sm text-muted-foreground">Illustrative role counts and gaps from a synthetic dataset. They are not current job listings or labour-market statistics.</p><div className="grid gap-3 lg:grid-cols-3">{demoRegionalMarkets.map(item => <Card key={item.region} className="gap-0 rounded-2xl p-5"><h3 className="text-base font-medium">{item.region}</h3><p className="mt-1 text-xs text-muted-foreground">{item.mode}</p><p className="mt-4 font-heading text-3xl font-semibold">{item.matchedRoles}<span className="ml-1 text-sm font-normal text-muted-foreground">/ {item.sampleRoles} sample roles</span></p><p className="mt-1 text-xs text-muted-foreground">Partial skill match · eligibility not assessed</p><p className="mt-4 text-sm font-medium">Common skills</p><p className="mt-1 text-xs text-muted-foreground">{item.skills}</p><p className="mt-3 text-sm font-medium">Preparation gap</p><p className="mt-1 text-xs text-muted-foreground">{item.gap}</p><p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p></Card>)}</div><ToolLink href="/market-signals">Explore market comparison tools</ToolLink></TabsContent>
      <TabsContent value="preparation"><div className="my-4"><h3 className="text-base font-medium">Northstar Labs · Junior DevOps Internship</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Sample application · Colombo hybrid · 12-week placement. A 110-minute preparation route split into four manageable steps.</p></div><ol className="grid gap-3 md:grid-cols-2">{demoPreparationSteps.map((item, index) => <li key={item.title} className="rounded-2xl border border-border p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">{index + 1}. {item.title}</h4><Badge variant="outline">{item.status}</Badge></div><p className="mt-2 flex items-center gap-1.5 text-xs text-primary"><Clock3 size={13} />{item.minutes} minutes</p><p className="mt-3 text-sm leading-6">{item.output}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.reason}</p></li>)}</ol><ToolLink href="/opportunities">Review opportunities and prepare my application</ToolLink></TabsContent>
      <TabsContent value="planning"><div className="my-4"><h3 className="text-base font-medium">When tonight gets busy</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">Example: 90 minutes available against 165 minutes planned. Keep the academic essentials and move flexible career work.</p></div><div className="space-y-3">{demoAdaptivePreview.map(item => <div key={item.task} className="grid gap-2 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr]"><div><h4 className="text-sm font-medium">{item.task}</h4><p className="mt-2 flex flex-wrap items-center gap-2 text-xs"><span className="text-muted-foreground">{item.before}</span><ArrowRight size={13} /><span className="font-medium text-primary">{item.after}</span></p></div><p className="text-xs leading-5 text-muted-foreground">{item.reason}</p></div>)}</div><p className="mt-3 text-xs text-muted-foreground">Preview only. Review and approve changes in Planner to update your own schedule.</p><ToolLink href="/planner">Open my planner</ToolLink></TabsContent>
    </Tabs> : <>
      <div className="mt-5 grid gap-3 lg:grid-cols-3">{demoPlanUpdates.slice(0, 3).map(item => <UpdateCard key={item.id} item={item} />)}</div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{advancedFeatures.map(item => <div key={item.title} className="rounded-xl border border-dashed border-border p-4"><p className="flex items-center gap-2 text-sm font-medium"><LockKeyhole size={14} className="shrink-0 text-muted-foreground" />{item.title}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.detail}</p><p className="mt-3 text-xs font-medium text-primary">Included with Pro</p></div>)}</div>
      <Button asChild className="mt-5 rounded-xl"><Link href="/checkout">Unlock the Pro demo<Sparkles size={15} /></Link></Button>
    </>}
  </section>;
}

function ToolLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-medium text-primary">{children}<ArrowRight size={14} className="shrink-0" /></Link>;
}

function UpdateCard({ item, detailed = false }: { item: typeof demoPlanUpdates[number]; detailed?: boolean }) {
  return <article className="min-w-0 rounded-2xl border border-border p-4"><div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{item.category} · {item.skill}</span><span>{item.minutes} min</span></div><h3 className="mt-3 text-sm font-medium">{item.title}</h3><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>{detailed && <details className="mt-3 border-t border-border pt-3"><summary className="cursor-pointer text-xs font-medium text-primary">Why it matters & next step</summary><p className="mt-3 text-xs leading-5 text-muted-foreground">{item.relevance}</p><p className="mt-2 text-xs leading-5"><strong>Try this:</strong> {item.nextStep}</p></details>}</article>;
}
