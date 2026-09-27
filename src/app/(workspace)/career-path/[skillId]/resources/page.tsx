"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, ExternalLink, GraduationCap } from "lucide-react";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { levelFromScore, recommendLearningResources } from "@/lib/domain/resource-recommender";
import type { LearningResource } from "@/lib/demo-data/resources";
import { useDemo } from "@/lib/state/demo-provider";

function demoCost(resource: LearningResource) {
  if (resource.costType === "free") return "Free";
  return resource.costType === "subscription" ? `~$${resource.price}/month demo estimate` : `~$${resource.price} one-time demo estimate`;
}

export default function LearningResourcesPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const { state, onboardingReady, chooseResource } = useDemo();
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const ready = state.onboarding.completed && Boolean(state.assessment);
  const eligible = skill?.status === "available" || skill?.status === "in-progress";
  const recommendations = skill && ready && eligible ? recommendLearningResources(skill, state.onboarding) : [];

  if (!onboardingReady) return <Loading />;

  return <main className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-6 sm:py-8">
    <Button asChild variant="ghost" className="mb-5 h-10 gap-2 px-2 text-sm"><Link href="/career-path"><ArrowLeft className="size-4" aria-hidden="true" />Career Path</Link></Button>
    {!ready || !skill || !eligible ? <Card className="rounded-[20px] border-border/80 bg-surface-raised p-6 sm:p-8">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Learning resources unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{!ready ? "Complete onboarding and your baseline assessment to see personalized resource matches." : !skill ? "This skill is not in the current roadmap." : "Complete the earlier roadmap steps before exploring resources for this skill."}</p>
      <Button asChild className="mt-4 h-11 rounded-xl px-4"><Link href={!state.onboarding.completed ? "/onboarding" : !state.assessment ? "/assessment" : "/career-path"}>{!ready ? "Continue setup" : "Back to roadmap"}</Link></Button>
    </Card> : <>
      <div className="mb-6">
        <p className="type-eyebrow mb-2 text-pathway">Local learning matches</p>
        <h1 className="font-heading text-[clamp(1.75rem,4vw,2.45rem)] font-semibold leading-tight tracking-[-0.035em] text-foreground">Find learning resources for {skill.name}</h1>
        <p className="mt-3 max-w-[65ch] text-sm leading-6 text-muted-foreground">Matched to your {levelFromScore(skill.proficiency)} starting level, {state.onboarding.weeklyLearningHours} learning hours per week, {state.onboarding.budget} budget, {state.onboarding.language} language, and preferred formats.</p>
      </div>
      <div className="mb-6 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-sm leading-6 text-foreground/85">
        Prototype catalog: resource titles, durations, certificate flags, and prices are illustrative demo data. Prices are not live quotes. Provider links open discovery pages or official documentation.
      </div>

      {recommendations.length ? <div className="grid gap-4 lg:grid-cols-3">
        {recommendations.map(({ label, resource, matchScore, reasons }) => {
          const chosen = state.selectedResourceBySkill[skill.id] === resource.id;
          return <Card key={resource.id} className="flex h-full flex-col gap-0 rounded-[20px] border-border/80 bg-surface-raised p-5 shadow-none sm:p-6" aria-label={label}>
            <div className="flex items-start justify-between gap-3"><span className="rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-xs font-semibold text-primary">{label}</span><span className="text-xs font-semibold tabular-nums text-foreground">{matchScore}% match</span></div>
            <p className="mt-5 text-xs font-medium text-pathway">{resource.provider}</p>
            <h2 className="mt-1 font-heading text-lg font-semibold leading-snug text-foreground">{resource.title}</h2>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5 capitalize">{resource.level}</span>
              <span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5 capitalize">{resource.format}</span>
              <span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5">{resource.durationHours} hours</span>
            </div>
            <p className="mt-4 text-sm font-medium text-foreground">{demoCost(resource)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><GraduationCap className="size-4" aria-hidden="true" />{resource.certificate ? "Demo certificate option" : "No certificate in demo catalog"}</p>
            <h3 className="mt-5 text-sm font-semibold text-foreground">Why this fits you</h3>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-5 text-muted-foreground">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <div className="mt-auto pt-6">
              <Button type="button" onClick={() => chooseResource(skill.id, resource.id)} disabled={chosen} className="h-11 w-full rounded-xl px-4 text-sm font-semibold">{chosen ? <><CheckCircle2 className="size-4" aria-hidden="true" />Path Chosen</> : "Choose This Path"}</Button>
              <a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Explore provider<ExternalLink className="size-4" aria-hidden="true" /></a>
            </div>
          </Card>;
        })}
      </div> : <Card className="rounded-[20px] border-border/80 bg-surface-raised p-6"><h2 className="font-heading text-lg font-semibold text-foreground">No local matches yet</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">The demo catalog has no resource for this skill that fits your current level, budget, language, and four-week learning window.</p></Card>}
      {recommendations.length > 0 && !recommendations.some((item) => item.label === "Best Credential Option") && <p className="mt-4 text-sm text-muted-foreground">No certificate option in the local catalog fits your current filters.</p>}
      {state.selectedResourceBySkill[skill.id] && <p role="status" className="mt-5 text-sm text-success">Your chosen {skill.name} path is saved in this demo session.</p>}
    </>}
  </main>;
}
