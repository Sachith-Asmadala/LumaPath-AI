"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { baselineQuestions } from "@/lib/domain/baseline-assessment";
import { useDemo } from "@/lib/state/demo-provider";

export default function AssessmentPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { state, onboardingReady, submitAssessment } = useDemo();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const question = baselineQuestions[index];
  const selected = answers[question.id];
  const lastQuestion = index === baselineQuestions.length - 1;

  useEffect(() => {
    if (onboardingReady && (!state.onboarding.completed || state.onboarding.careerGoal !== "DevOps Engineer")) router.replace("/onboarding");
  }, [onboardingReady, state.onboarding.completed, state.onboarding.careerGoal, router]);

  if (!onboardingReady || !state.onboarding.completed || state.onboarding.careerGoal !== "DevOps Engineer") return <Loading />;

  const continueFlow = () => {
    if (!selected) return;
    if (!lastQuestion) { setIndex(index + 1); return; }
    if (submitAssessment(answers)) router.push("/assessment/results");
  };

  return <main className="relative min-h-dvh overflow-x-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
    <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.07] to-transparent" aria-hidden="true" />
    <div className="relative mx-auto w-full max-w-[760px]">
      <div className="mb-7 flex items-center justify-between gap-3 sm:mb-9">
        <div className="relative h-16 w-[155px] shrink-0 overflow-hidden"><BrandLogo size="md" decorative priority className="absolute top-1/2 left-0 -translate-y-1/2" /></div>
        <span className="rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">DevOps baseline</span>
      </div>
      <div className="mb-6 max-w-[640px]">
        <p className="type-eyebrow mb-2 text-primary">Your starting point</p>
        <h1 className="font-heading text-[clamp(1.8rem,4vw,2.55rem)] font-semibold leading-tight tracking-[-0.04em] text-foreground">DevOps Baseline Assessment</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Answer 12 short questions across six core skills. Your results will show where you stand today.</p>
      </div>
      <Card className="gap-0 rounded-[22px] border border-border/85 bg-surface-raised py-0 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.45)]">
        <div className="border-b border-border/75 px-5 py-5 sm:px-8 sm:py-6">
          <div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold text-foreground">Question {index + 1} of {baselineQuestions.length}</span><span className="text-xs font-medium text-muted-foreground">{question.skill}</span></div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-background/80" role="progressbar" aria-label="Assessment progress" aria-valuemin={0} aria-valuemax={baselineQuestions.length} aria-valuenow={index + 1}>
            <motion.div initial={false} className="h-full rounded-full bg-primary" animate={{ width: `${((index + 1) / baselineQuestions.length) * 100}%` }} transition={{ duration: reduceMotion ? 0 : 0.25 }} />
          </div>
        </div>
        <div className="min-h-[365px] px-5 py-6 sm:px-8 sm:py-8">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={question.id} initial={{ opacity: 0, x: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0.01 : 0.2 }}>
              <fieldset>
                <legend className="mb-6 max-w-[52ch] font-heading text-xl font-semibold leading-snug text-foreground sm:text-2xl">{question.question}</legend>
                <div className="grid gap-3">
                  {question.options.map((option, optionIndex) => <label key={option} className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm leading-5 transition-colors focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${selected === option ? "border-primary/60 bg-primary/[0.08] text-foreground" : "border-border/80 bg-background/55 text-foreground hover:border-primary/35 hover:bg-primary/[0.035]"}`}>
                    <input type="radio" name={question.id} value={option} checked={selected === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} className="sr-only" />
                    <span className={`grid size-7 shrink-0 place-items-center rounded-lg border text-xs font-semibold ${selected === option ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground"}`}>{selected === option ? <Check className="size-4" aria-hidden="true" /> : String.fromCharCode(65 + optionIndex)}</span>
                    <span>{option}</span>
                  </label>)}
                </div>
              </fieldset>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border/75 px-5 py-5 sm:px-8">
          <Button type="button" variant="ghost" onClick={() => setIndex((current) => current - 1)} disabled={index === 0} className="h-11 gap-2 px-3 text-sm"><ArrowLeft className="size-4" aria-hidden="true" />Back</Button>
          <Button type="button" onClick={continueFlow} disabled={!selected} className="h-11 gap-2 rounded-xl px-5 text-sm font-semibold">{lastQuestion ? "Submit Assessment" : "Next"}<ArrowRight className="size-4" aria-hidden="true" /></Button>
        </div>
      </Card>
      <p className="mt-4 text-center text-xs text-muted-foreground">You can go back and change any answer before submitting.</p>
    </div>
  </main>;
}
