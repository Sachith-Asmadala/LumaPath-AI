"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { ArrowRight, CheckCircle2, Compass, Target } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { BaselineSkill, SkillGapLevel } from "@/data/demo/types";
import { baselineSkills } from "@/features/assessment/domain/baseline-assessment";
import { improveThreshold, strongThreshold } from "@/features/career/domain/skill-gap";
import { useDemo } from "@/state/demo-provider";

function AnimatedPercent({ value, large = false }: { value: number; large?: boolean }) {
  const reduceMotion = useReducedMotion();
  const progress = useMotionValue(0);
  const rounded = useTransform(progress, (current) => Math.round(current));

  useEffect(() => {
    const controls = animate(progress, value, { duration: reduceMotion ? 0 : 0.8, ease: "easeOut" });
    return () => controls.stop();
  }, [progress, reduceMotion, value]);

  return <span className={large ? "font-heading text-5xl font-semibold tracking-tight text-foreground" : "text-sm font-semibold tabular-nums text-foreground"}>
    <span className="sr-only">{value} percent</span><motion.span aria-hidden="true">{rounded}</motion.span><span aria-hidden="true">%</span>
  </span>;
}

const levelColor: Record<SkillGapLevel, string> = {
  strong: "bg-success",
  improve: "bg-primary",
  gap: "bg-pathway",
};

function SkillRow({ skill, score, level }: { skill: BaselineSkill; score: number; level: SkillGapLevel }) {
  const reduceMotion = useReducedMotion();
  return <div className="rounded-xl border border-border/80 bg-background/55 p-4">
    <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium text-foreground">{skill}</span><AnimatedPercent value={score} /></div>
    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border/70" role="meter" aria-label={`${skill} baseline`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
      <motion.div className={`h-full rounded-full ${levelColor[level]}`} initial={{ width: 0 }} animate={{ width: `${score}%` }} transition={{ duration: reduceMotion ? 0 : 0.75, ease: "easeOut" }} />
    </div>
  </div>;
}

function SkillGroup({ title, skills, emptyText }: { title: string; skills: BaselineSkill[]; emptyText: string }) {
  return <section className="rounded-2xl border border-border/80 bg-background/40 p-5" aria-label={title}>
    <div className="flex items-center justify-between gap-3"><h2 className="font-heading text-lg font-semibold text-foreground">{title}</h2><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{skills.length}</span></div>
    {skills.length ? <ul className="mt-4 flex flex-wrap gap-2">{skills.map((skill) => <li key={skill} className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground">{skill}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>}
  </section>;
}

export default function AssessmentResultsPage() {
  const router = useRouter();
  const { state, onboardingReady } = useDemo();
  const result = state.assessment;
  const gap = state.skillGap;

  useEffect(() => {
    if (!onboardingReady) return;
    if (!state.onboarding.completed) router.replace("/onboarding");
    else if (!result) router.replace("/assessment");
  }, [onboardingReady, state.onboarding.completed, result, router]);

  if (!onboardingReady || !result || !gap || !state.onboarding.completed) return <Loading />;

  const recommended = gap.recommendedSkill;
  return <main className="relative min-h-dvh overflow-x-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.07] to-transparent" aria-hidden="true" />
    <div className="relative mx-auto w-full max-w-[800px]">
      <div className="relative mb-8 h-16 w-[155px] overflow-hidden"><BrandLogo size="md" decorative priority className="absolute top-1/2 left-0 -translate-y-1/2" /></div>
      <Card className="gap-0 rounded-[22px] border border-border/85 bg-surface-raised px-5 py-7 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.45)] sm:px-9 sm:py-9">
        <span className="mb-5 grid size-12 place-items-center rounded-2xl border border-success/25 bg-success/10 text-success"><CheckCircle2 className="size-6" aria-hidden="true" /></span>
        <p className="type-eyebrow text-primary">Assessment complete</p>
        <h1 className="mt-2 font-heading text-[clamp(1.8rem,4vw,2.5rem)] font-semibold leading-tight tracking-[-0.035em] text-foreground">Your DevOps baseline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Your results show what you already know and where to focus next.</p>

        <div className="mt-7 rounded-2xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-6">
          <p className="text-sm font-medium text-muted-foreground">Overall DevOps Baseline</p>
          <p className="mt-1"><AnimatedPercent value={result.overallScore} large /></p>
          <p className="mt-2 text-sm text-muted-foreground">{result.correctCount} of {result.totalQuestions} questions correct · weighted by question difficulty</p>
        </div>

        <section className="mt-8" aria-labelledby="skill-breakdown-title">
          <h2 id="skill-breakdown-title" className="font-heading text-lg font-semibold text-foreground">Skill breakdown</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {baselineSkills.map((skill) => <SkillRow key={skill} skill={skill} score={result.skillScores[skill]} level={gap.levels[skill]} />)}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">Strong: {strongThreshold}% or more · Needs improvement: {improveThreshold}–{strongThreshold - 1}% · Learn next: below {improveThreshold}%</p>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <SkillGroup title="Already Strong" skills={gap.strong} emptyText="No skills have reached the strong range yet." />
          <SkillGroup title="Needs Improvement" skills={gap.improve} emptyText="No skills are in the improvement range." />
        </div>

        <section className="mt-3 rounded-2xl border border-pathway/30 bg-pathway/[0.055] p-5 sm:p-6" aria-labelledby="learn-next-title">
          <div className="flex items-center gap-2.5"><Compass className="size-5 text-pathway" aria-hidden="true" /><h2 id="learn-next-title" className="font-heading text-lg font-semibold text-foreground">Learn Next</h2></div>
          {gap.gap.length ? <ul className="mt-4 flex flex-wrap gap-2">{gap.gap.map((skill) => <li key={skill} className="rounded-lg border border-pathway/25 bg-background/65 px-3 py-2 text-sm font-medium text-foreground">{skill}</li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">No assessed skills are below {improveThreshold}%.</p>}

          <div className="mt-5 rounded-xl border border-border/75 bg-surface-raised p-5">
            <p className="type-eyebrow text-primary">Recommended Next Skill</p>
            <div className="mt-2 flex items-start gap-3"><Target className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" /><h3 className="font-heading text-2xl font-semibold text-foreground">{recommended ?? "Core skills on target"}</h3></div>
            {recommended ? <div className="mt-4">
              <p className="text-sm font-semibold text-foreground">Why this skill</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Current baseline is {result.skillScores[recommended]}%, below the {strongThreshold}% target.</li>
                {gap.unlocks.length > 0 && <li>Required before {gap.unlocks.join(" and ")}.</li>}
                <li>Fits the DevOps pathway{gap.prerequisiteSkills.length > 0 ? ` after ${gap.prerequisiteSkills.join(" and ")}` : ""}.</li>
              </ul>
            </div> : <p className="mt-3 text-sm text-muted-foreground">Every assessed skill meets the current target.</p>}
          </div>
        </section>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild className="h-11 gap-2 rounded-xl px-5 text-sm font-semibold"><Link href="/career-path">Build My Learning Path<ArrowRight className="size-4" aria-hidden="true" /></Link></Button>
          <Button asChild variant="ghost" className="h-11 px-3 text-sm"><Link href="/assessment">Retake assessment</Link></Button>
        </div>
      </Card>
    </div>
  </main>;
}
