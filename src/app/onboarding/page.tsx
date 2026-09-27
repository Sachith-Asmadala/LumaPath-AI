"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Clock3, GraduationCap, Sparkles, Target } from "lucide-react";
import { BrandLogo } from "@/components/brand/brand-logo";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { canCompleteOnboarding, moduleNames } from "@/lib/demo-data/onboarding";
import type { CareerGoal, LearningBudget, LearningStyle, StudentGoal } from "@/lib/demo-data/types";
import { useDemo } from "@/lib/state/demo-provider";

const steps = [
  { label: "Basic Profile", shortLabel: "Profile", icon: GraduationCap },
  { label: "Career Goal", shortLabel: "Career", icon: Target },
  { label: "Learning Preferences", shortLabel: "Preferences", icon: Clock3 },
] as const;
const careerGoals: CareerGoal[] = ["DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"];
const budgets: LearningBudget[] = ["free only", "under $20/month", "flexible"];
const learningStyles: LearningStyle[] = ["video", "hands-on", "reading", "projects"];
const studentGoals: StudentGoal[] = ["internship", "entry-level job", "certification"];

const fieldClass = "h-11 w-full rounded-xl border-border/80 bg-background/65 px-3 text-sm";
const choiceClass = "min-h-12 rounded-xl border px-4 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export default function OnboardingPage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { state, onboardingReady, updateOnboarding, completeOnboarding } = useDemo();
  const [step, setStep] = useState(0);
  const draft = state.onboarding;
  const profileReady = Boolean(draft.name.trim() && draft.university.trim() && draft.degree.trim() && draft.academicYear && draft.semester && moduleNames(draft.currentModules).length);
  const stepReady = step === 0 ? profileReady : step === 1 ? draft.careerGoal === "DevOps Engineer" : canCompleteOnboarding(draft);

  const continueFlow = () => {
    if (!stepReady) return;
    if (step < 2) { setStep(step + 1); return; }
    if (completeOnboarding()) router.push("/assessment");
  };

  if (!onboardingReady) return <Loading />;

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-background px-4 py-6 sm:px-6 sm:py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-primary/[0.07] to-transparent" aria-hidden="true" />
      <div className="relative mx-auto w-full max-w-[860px]">
        <div className="mb-7 flex items-center justify-between gap-4 sm:mb-9">
          <div className="relative h-16 w-[155px] shrink-0 overflow-hidden"><BrandLogo size="md" decorative priority className="absolute top-1/2 left-0 -translate-y-1/2" /></div>
          <span className="rounded-full border border-border/80 bg-card/70 px-3 py-1.5 text-xs font-medium text-muted-foreground">Student setup · {step + 1} of 3</span>
        </div>

        <div className="mb-6 max-w-[660px]">
          <p className="type-eyebrow mb-2 text-primary">Your path starts here</p>
          <h1 className="font-heading text-[clamp(1.8rem,4vw,2.65rem)] font-semibold leading-tight tracking-[-0.04em] text-foreground">Build a plan that fits your starting point.</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Tell us about your studies, career direction, and how you like to learn.</p>
        </div>

        <Card className="gap-0 rounded-[22px] border border-border/85 bg-surface-raised py-0 shadow-[0_18px_50px_-38px_rgba(0,0,0,0.45)]">
          <div className="border-b border-border/75 px-5 pt-5 pb-6 sm:px-8 sm:pt-7">
            <ol className="grid grid-cols-3 gap-2" aria-label="Onboarding steps">
              {steps.map(({ label, shortLabel, icon: Icon }, index) => <li key={label} aria-current={index === step ? "step" : undefined} className="min-w-0">
                <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-3">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-xl border sm:size-10 ${index < step ? "border-success/30 bg-success/10 text-success" : index === step ? "border-primary/40 bg-primary/10 text-primary" : "border-border bg-background/60 text-muted-foreground"}`}>
                    {index < step ? <Check className="size-4" aria-hidden="true" /> : <Icon className="size-4" aria-hidden="true" />}
                  </span>
                  <span className={`hidden text-xs font-medium leading-tight sm:block ${index === step ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                  <span className={`text-[0.7rem] font-medium sm:hidden ${index === step ? "text-foreground" : "text-muted-foreground"}`}>{shortLabel}</span>
                </div>
              </li>)}
            </ol>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-background/80" role="progressbar" aria-label="Onboarding progress" aria-valuemin={0} aria-valuemax={3} aria-valuenow={step + 1}>
              <motion.div initial={false} className="h-full rounded-full bg-primary" animate={{ width: `${((step + 1) / 3) * 100}%` }} transition={{ duration: reduceMotion ? 0 : 0.28 }} />
            </div>
          </div>

          <div className="min-h-[410px] px-5 py-6 sm:px-8 sm:py-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.section key={step} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -8 }} transition={{ duration: reduceMotion ? 0.01 : 0.22 }} aria-labelledby="onboarding-step-title">
                {step === 0 && <>
                  <div className="mb-6"><p className="type-eyebrow text-primary">01 / Student context</p><h2 id="onboarding-step-title" className="mt-1 font-heading text-xl font-semibold text-foreground">Basic Profile</h2><p className="mt-1 text-sm text-muted-foreground">Start with the academic context that shapes your plan.</p></div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field id="student-name" label="Full name"><Input id="student-name" autoComplete="name" value={draft.name} onChange={(event) => updateOnboarding({ name: event.target.value })} placeholder="Your name" className={fieldClass} /></Field>
                    <Field id="university" label="University"><Input id="university" autoComplete="organization" value={draft.university} onChange={(event) => updateOnboarding({ university: event.target.value })} placeholder="Your university" className={fieldClass} /></Field>
                    <Field id="degree" label="Degree"><Input id="degree" value={draft.degree} onChange={(event) => updateOnboarding({ degree: event.target.value })} placeholder="e.g. Computer Science" className={fieldClass} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field id="academic-year" label="Academic year"><select id="academic-year" value={draft.academicYear} onChange={(event) => updateOnboarding({ academicYear: event.target.value })} className={fieldClass}><option value="">Select year</option>{[1, 2, 3, 4, 5].map((year) => <option key={year} value={`Year ${year}`}>Year {year}</option>)}</select></Field>
                      <Field id="semester" label="Semester"><select id="semester" value={draft.semester} onChange={(event) => updateOnboarding({ semester: event.target.value })} className={fieldClass}><option value="">Select</option>{[1, 2, 3].map((semester) => <option key={semester} value={`Semester ${semester}`}>Semester {semester}</option>)}</select></Field>
                    </div>
                    <div className="sm:col-span-2"><Field id="modules" label="Current modules"><Textarea id="modules" value={draft.currentModules} onChange={(event) => updateOnboarding({ currentModules: event.target.value })} placeholder="e.g. Databases, Software Engineering, Cloud Computing" className="min-h-24 rounded-xl border-border/80 bg-background/65 px-3 py-3 text-sm" /><p className="mt-1.5 text-xs text-muted-foreground">Separate modules with commas or new lines.</p></Field></div>
                  </div>
                </>}
                {step === 1 && <>
                  <div className="mb-6"><p className="type-eyebrow text-primary">02 / Direction</p><h2 id="onboarding-step-title" className="mt-1 font-heading text-xl font-semibold text-foreground">Career Goal</h2><p className="mt-1 text-sm text-muted-foreground">Choose the role you want to work toward.</p></div>
                  <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Career goal">
                    {careerGoals.map((goal) => {
                      const supported = goal === "DevOps Engineer";
                      const selected = draft.careerGoal === goal;
                      return <button key={goal} type="button" role="radio" aria-checked={selected} disabled={!supported} onClick={() => updateOnboarding({ careerGoal: goal })} className={`${choiceClass} flex items-center justify-between gap-3 ${selected ? "border-primary/55 bg-primary/[0.07] text-foreground" : "border-border bg-background/55 text-muted-foreground"} disabled:cursor-not-allowed disabled:opacity-55`}>
                        <span className="font-medium">{goal}</span><span className={`text-xs ${supported ? "text-primary" : "text-muted-foreground"}`}>{supported ? selected ? "Selected" : "Available" : "Coming soon"}</span>
                      </button>;
                    })}
                  </div>
                  <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-pathway/20 bg-pathway/[0.055] p-3 text-sm leading-5 text-foreground/85"><Sparkles className="mt-0.5 size-4 shrink-0 text-pathway" aria-hidden="true" />The DevOps path is fully supported in this prototype. More paths are on the way.</div>
                </>}
                {step === 2 && <>
                  <div className="mb-6"><p className="type-eyebrow text-primary">03 / Your learning rhythm</p><h2 id="onboarding-step-title" className="mt-1 font-heading text-xl font-semibold text-foreground">Learning Preferences</h2><p className="mt-1 text-sm text-muted-foreground">Choose a pace and format you can keep up with.</p></div>
                  <div className="space-y-6">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field id="weekly-hours" label="Weekly learning hours"><Input id="weekly-hours" type="number" inputMode="numeric" min={1} max={40} value={draft.weeklyLearningHours} onChange={(event) => updateOnboarding({ weeklyLearningHours: Number(event.target.value) })} className={fieldClass} /></Field>
                      <Field id="language" label="Learning language"><Input id="language" value={draft.language} onChange={(event) => updateOnboarding({ language: event.target.value })} placeholder="e.g. English" className={fieldClass} /></Field>
                    </div>
                    <ChoiceGroup label="Monthly learning budget">{budgets.map((budget) => <Choice key={budget} selected={draft.budget === budget} onClick={() => updateOnboarding({ budget })}>{budget}</Choice>)}</ChoiceGroup>
                    <ChoiceGroup label="Preferred learning formats" hint="Select one or more">{learningStyles.map((style) => <Choice key={style} selected={draft.preferredLearning.includes(style)} onClick={() => updateOnboarding({ preferredLearning: draft.preferredLearning.includes(style) ? draft.preferredLearning.filter((item) => item !== style) : [...draft.preferredLearning, style] })}>{style}</Choice>)}</ChoiceGroup>
                    <ChoiceGroup label="Main goal">{studentGoals.map((goal) => <Choice key={goal} selected={draft.goal === goal} onClick={() => updateOnboarding({ goal })}>{goal}</Choice>)}</ChoiceGroup>
                  </div>
                </>}
              </motion.section>
            </AnimatePresence>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/75 px-5 py-5 sm:px-8">
            <Button type="button" variant="ghost" onClick={() => setStep(step - 1)} disabled={step === 0} className="h-11 gap-2 px-3 text-sm"><ArrowLeft className="size-4" />Back</Button>
            <div className="flex items-center gap-3"><span className="hidden text-xs text-muted-foreground sm:inline">{stepReady ? "Ready to continue" : "Complete this step to continue"}</span><Button type="button" onClick={continueFlow} disabled={!stepReady} className="h-11 gap-2 rounded-xl px-5 text-sm font-semibold">{step === 2 ? "Assess My Starting Point" : "Continue"}<ArrowRight className="size-4" /></Button></div>
          </div>
        </Card>
        <p className="mt-5 text-center text-xs text-muted-foreground">After completion, your choices stay in this browser for the demo.</p>
      </div>
    </main>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>;
}

function ChoiceGroup({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <fieldset><legend className="mb-2 text-sm font-medium text-foreground">{label}{hint && <span className="ml-2 text-xs font-normal text-muted-foreground">{hint}</span>}</legend><div className="flex flex-wrap gap-2">{children}</div></fieldset>;
}

function Choice({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`${choiceClass} capitalize ${selected ? "border-primary/55 bg-primary/[0.08] text-foreground" : "border-border bg-background/55 text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}>{children}</button>;
}
