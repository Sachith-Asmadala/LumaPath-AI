"use client";

import Link from "next/link";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";
import { reassessmentQuestions } from "@/features/career/domain/path-assessments";
import { useDemo } from "@/state/demo-provider";

export function SkillVerification({ skillId }: { skillId: string }) {
  const questions = reassessmentQuestions(skillId);
  const { state, submitSkillReassessment } = useDemo();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [retrying, setRetrying] = useState(false);
  const completion = selectLearningPathCompletion(state, skillId);
  const result = state.skillReassessments[skillId];
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const question = questions[index];
  const name = skill?.name ?? skillId;
  const last = index === questions.length - 1;

  const submit = () => {
    if (!answers[question.id]) return;
    if (!last) { setIndex(index + 1); return; }
    if (submitSkillReassessment(skillId, answers, retrying)) setRetrying(false);
  };
  const retry = () => { setAnswers({}); setIndex(0); setRetrying(true); };

  return <main className="mx-auto w-full max-w-[760px] px-4 py-6 sm:px-6 sm:py-9">
    <Button asChild variant="ghost" className="mb-5 h-10 gap-2 px-2 text-sm"><Link href="/career-path"><ArrowLeft className="size-4" aria-hidden="true" />Career Path</Link></Button>
    {!completion?.pathComplete || !questions.length ? <Card className="rounded-2xl border-border/80 bg-surface-raised p-6"><h1 className="font-heading text-2xl font-semibold text-foreground">{name} verification is not ready yet</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Finish the course and practice tasks in your selected learning path first. Project evidence can remain pending.</p><Button asChild className="mt-5 h-11 rounded-xl"><Link href="/tasks">View Learning Tasks</Link></Button></Card>
      : result && !retrying ? <div className="space-y-5">
        <div><p className="type-eyebrow mb-2 text-primary">Skill reassessment</p><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">{result.passed ? `${name} Verified` : `${name} reassessment complete`}</h1><p className="mt-2 text-sm text-muted-foreground">{result.correctCount} of {result.totalQuestions} correct · Verification target {result.threshold}%</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><Card className="rounded-2xl border-border/80 bg-surface-raised p-5"><p className="text-sm text-muted-foreground">Previous score</p><p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-foreground">{result.previousScore}%</p></Card><Card className="rounded-2xl border-primary/30 bg-primary/[0.06] p-5"><p className="text-sm text-muted-foreground">New score</p><p className="mt-2 font-mono text-3xl font-semibold tabular-nums text-primary">{result.newScore}%</p></Card></div>
        {result.passed ? <Card className="rounded-2xl border-success/25 bg-success/[0.055] p-5 sm:p-6"><div className="flex items-center gap-2 text-success"><CheckCircle2 className="size-5" aria-hidden="true" /><h2 className="font-heading text-xl font-semibold">{name} Verified</h2></div><p className="mt-3 text-sm text-foreground">{name}: In Progress → Verified</p><p className="mt-1 text-sm text-foreground">{state.careerSkills.filter((item) => item.prerequisites.includes(skillId) && item.status === "available").map((item) => `${item.name} Unlocked`).join(" · ") || "Downstream prerequisites updated"}</p><div className="mt-5 rounded-xl border border-border/70 bg-background/50 p-4"><p className="text-sm text-muted-foreground">DevOps Readiness</p><p className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{result.readinessBefore}% <ArrowRight className="mx-1 inline size-4 text-primary" aria-hidden="true" /> {result.readinessAfter}%</p><motion.p initial={{ opacity: 0, scale: reduced ? 1 : 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : 0.24 }} className="mt-2 text-sm font-semibold text-success" role="status">{result.readinessAfter >= result.readinessBefore ? "+" : ""}{result.readinessAfter - result.readinessBefore} Readiness</motion.p></div></Card>
          : <Card className="rounded-2xl border-warning/25 bg-warning/[0.05] p-5"><h2 className="font-heading text-lg font-semibold text-foreground">Keep practicing</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Your new score is below the {result.threshold}% verification target. {name} stays {skill?.status.replaceAll("-", " ")}; your learning progress is saved.</p><Button type="button" onClick={retry} className="mt-4 h-11 rounded-xl">Try Again</Button></Card>}
        <div className="flex flex-wrap gap-3"><Button variant="outline" onClick={retry} className="h-11 rounded-xl">Practice Again</Button><Button asChild className="h-11 rounded-xl"><Link href={`/learning?skill=${skillId}`}>Continue Learning</Link></Button><Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/career-path">View Career Path</Link></Button><Button asChild variant="outline" className="h-11 rounded-xl"><Link href="/evidence">View Evidence Passport</Link></Button></div>
      </div> : <div>
        <p className="type-eyebrow mb-2 text-primary">{name} · skill verification</p><h1 className="font-heading text-3xl font-semibold tracking-tight text-foreground">Verify My Skill</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{questions.length} short questions on the work you practiced. Reach {skill?.targetScore ?? 75}% to verify this skill. If you’re unsure, use a reflection option instead of guessing.</p>
        <Card className="mt-6 rounded-2xl border-border/85 bg-surface-raised py-0">
          <div className="border-b border-border/70 px-5 py-5"><div className="flex items-center justify-between gap-3"><span className="text-sm font-semibold">Question {index + 1} of {questions.length}</span><span className="text-xs text-muted-foreground">{name} reassessment</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background"><motion.div className="h-full rounded-full bg-primary" animate={{ width: `${(index + 1) / questions.length * 100}%` }} transition={{ duration: reduced ? 0 : 0.2 }} /></div></div>
          <div className="min-h-[320px] px-5 py-6"><AnimatePresence mode="wait" initial={false}><motion.div key={question.id} initial={{ opacity: 0, x: reduced ? 0 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0 : 0.18 }}><fieldset><legend className="mb-5 font-heading text-xl font-semibold text-foreground">{question.question}</legend><div className="grid gap-2.5">{question.options.map((option) => <label key={option} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm focus-within:ring-2 focus-within:ring-ring ${answers[question.id] === option ? "border-primary/60 bg-primary/[0.08]" : "border-border/80 bg-background/50 hover:border-primary/35"}`}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} className="size-4 accent-primary" />{option}</label>)}</div></fieldset></motion.div></AnimatePresence></div>
          <div className="flex items-center justify-between border-t border-border/70 px-5 py-4"><Button type="button" variant="ghost" onClick={() => setIndex((current) => current - 1)} disabled={index === 0} className="h-11">Back</Button><Button type="button" onClick={submit} disabled={!answers[question.id]} className="h-11 gap-2 rounded-xl">{last ? "Submit Reassessment" : "Next"}{last ? <Check className="size-4" aria-hidden="true" /> : <ArrowRight className="size-4" aria-hidden="true" />}</Button></div>
        </Card>
      </div>}
  </main>;
}
