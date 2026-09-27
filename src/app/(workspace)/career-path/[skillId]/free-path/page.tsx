"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, ListChecks } from "lucide-react";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { freePathForSkill, freePathWeeks } from "@/lib/demo-data/free-learning-paths";
import { useDemo } from "@/lib/state/demo-provider";

export default function FreeLearningPathPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { state, onboardingReady, addFreePath } = useDemo();
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const path = freePathForSkill(skillId);
  const ready = state.onboarding.completed && Boolean(state.assessment);
  const eligible = skill?.status === "available" || skill?.status === "in-progress";
  const added = path && state.selectedFreePathBySkill[skillId] === path.id;

  if (!onboardingReady) return <Loading />;

  return <main className="mx-auto w-full max-w-[1000px] px-4 py-6 sm:px-6 sm:py-8">
    <Button asChild variant="ghost" className="mb-5 h-10 gap-2 px-2 text-sm"><Link href={`/career-path/${skillId}/resources`}><ArrowLeft className="size-4" aria-hidden="true" />Learning Resources</Link></Button>
    {!ready || !eligible || !path ? <Card className="rounded-[20px] border-border/80 bg-surface-raised p-6 sm:p-8">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Free learning path unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{!ready ? "Complete onboarding and your baseline assessment first." : !eligible ? "This skill is not available in your roadmap yet." : "The prototype does not yet have a structured free path for this skill."}</p>
      <Button asChild className="mt-4 h-11 rounded-xl px-4"><Link href={!ready ? "/assessment" : "/career-path"}>{!ready ? "Continue assessment" : "Back to roadmap"}</Link></Button>
    </Card> : <>
      <div className="mb-7"><p className="type-eyebrow mb-2 text-success">Open learning · {skill.name}</p><h1 className="font-heading text-[clamp(1.8rem,4vw,2.6rem)] font-semibold leading-tight tracking-[-0.04em] text-foreground">{path.title}</h1><p className="mt-3 max-w-[70ch] text-sm leading-6 text-muted-foreground">A complete path built from official documentation, selected YouTube learning, free practice, and work you can show. Every source in this path is free to access.</p></div>

      <div className="mb-7 grid gap-3 sm:grid-cols-3">
        <Card className="rounded-2xl border-success/25 bg-success/[0.055] p-5"><p className="text-sm text-muted-foreground">Cost</p><p className="mt-1 font-heading text-3xl font-semibold text-foreground">$0</p></Card>
        <Card className="rounded-2xl border-border/80 bg-surface-raised p-5"><p className="text-sm text-muted-foreground">Estimated duration</p><p className="mt-1 font-heading text-2xl font-semibold text-foreground">{path.durationHours} hours</p><p className="mt-1 text-sm text-muted-foreground">About {freePathWeeks(path, state.onboarding.weeklyLearningHours)} weeks at {state.onboarding.weeklyLearningHours} hours/week</p></Card>
        <Card className="rounded-2xl border-border/80 bg-surface-raised p-5"><p className="text-sm text-muted-foreground">Path structure</p><p className="mt-1 font-heading text-2xl font-semibold text-foreground">{path.steps.length} steps</p><p className="mt-1 text-sm text-muted-foreground">Study · practice · verify</p></Card>
      </div>

      <div className="mb-7 grid gap-4 md:grid-cols-2">
        <Card className="rounded-2xl border-border/80 bg-surface-raised p-5"><h2 className="font-heading text-lg font-semibold text-foreground">Skills covered</h2><ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{path.skillsCovered.map((item) => <li key={item}>{item}</li>)}</ul></Card>
        <Card className="rounded-2xl border-border/80 bg-surface-raised p-5"><h2 className="font-heading text-lg font-semibold text-foreground">Evidence earned</h2><p className="mt-1 text-xs text-muted-foreground">Produced when you complete the path</p><ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">{path.evidenceEarned.map((item) => <li key={item}>{item}</li>)}</ul></Card>
      </div>

      <section aria-labelledby="free-path-steps-title"><div className="mb-4 flex items-center gap-2.5"><ListChecks className="size-5 text-primary" aria-hidden="true" /><h2 id="free-path-steps-title" className="font-heading text-xl font-semibold text-foreground">Your learning steps</h2></div>
        <ol className="space-y-3" aria-label={`${skill.name} free learning steps`}>{path.steps.map((step, index) => <li key={step.id}><Card className="flex flex-row gap-4 rounded-2xl border-border/80 bg-surface-raised p-4 sm:p-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/25 bg-primary/[0.07] text-sm font-semibold text-primary">{index + 1}</span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="font-heading text-base font-semibold text-foreground">{step.title}</h3><span className="text-xs font-medium text-muted-foreground">{step.durationHours} {step.durationHours === 1 ? "hour" : "hours"}</span></div><p className="mt-1 text-xs font-medium capitalize text-pathway">{step.kind}</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{step.outcome}</p>
            {step.sources.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{step.sources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-background/55 px-3 py-1.5 text-xs text-primary hover:border-primary/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{source.label}<ExternalLink className="size-3.5" aria-hidden="true" /></a>)}</div>}
          </div>
        </Card></li>)}</ol>
      </section>

      <Card className="mt-7 rounded-2xl border-primary/25 bg-primary/[0.055] p-5 sm:p-6">
        <h2 className="font-heading text-lg font-semibold text-foreground">Ready to start this $0 path?</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Add the steps to your learning plan. You can schedule study time later.</p>
        <Button type="button" onClick={() => addFreePath(skill.id, path.id)} disabled={Boolean(added)} className="mt-4 h-11 gap-2 rounded-xl px-5 text-sm font-semibold">{added ? <><CheckCircle2 className="size-4" aria-hidden="true" />Free Path Added</> : "Add Free Path to My Plan"}</Button>
        {added && <p role="status" className="mt-3 text-sm text-success">The free path is saved in your learning plan. No calendar blocks were added.</p>}
      </Card>
    </>}
  </main>;
}
