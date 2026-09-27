"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, CheckCircle2, Clock3, Pause, Play, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDemo } from "@/lib/state/demo-provider";

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function FocusSession() {
  const { state, completeFocusSession } = useDemo();
  const action = state.activeAction;
  const task = state.tasks.find((item) => item.id === action.taskId);
  const [remaining, setRemaining] = useState(action.durationMinutes * 60);
  const [sessionMinutes, setSessionMinutes] = useState(action.durationMinutes);
  const [taskProgressBefore, setTaskProgressBefore] = useState(task?.progress ?? 0);
  const [running, setRunning] = useState(false);
  const [complete, setComplete] = useState(false);
  const [readinessBefore, setReadinessBefore] = useState(state.readiness.score);
  const reduceMotion = useReducedMotion();
  const totalSeconds = action.durationMinutes * 60;
  const progress = Math.max(0, ((totalSeconds - remaining) / totalSeconds) * 100);

  useEffect(() => {
    if (complete) return;
    setRemaining(action.durationMinutes * 60);
    setSessionMinutes(action.durationMinutes);
    setTaskProgressBefore(task?.progress ?? 0);
  }, [action.durationMinutes, action.taskId, complete, task?.progress]);

  useEffect(() => {
    if (!running || complete) return;
    const timer = window.setInterval(() => setRemaining((previous) => Math.max(0, previous - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [running, complete]);

  const finish = () => {
    setRunning(false);
    setReadinessBefore(state.readiness.score);
    setTaskProgressBefore(task?.progress ?? 0);
    setComplete(true);
    completeFocusSession(action.taskId, sessionMinutes);
  };
  const progressEarned = Math.max(0, (task?.progress ?? 0) - taskProgressBefore);

  return <div className="focus-retreat mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[1050px] flex-col px-4 py-5 sm:px-6 sm:py-8">
    <div className="flex items-center justify-between"><Button asChild variant="ghost" className="h-9 gap-2 rounded-[11px] px-2 text-[0.68rem] text-muted-foreground hover:text-foreground"><Link href="/overview"><ArrowLeft className="size-3.5" />Back to your day</Link></Button><span className="flex items-center gap-2 text-[0.63rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />Focus mode</span></div>
    <div className="flex flex-1 flex-col items-center justify-center py-10">
      <AnimatePresence mode="wait" initial={false}>
        {!complete ? <motion.div key="active" layoutId="focus-session-card" initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.985 }} transition={{ duration: reduceMotion ? 0.14 : 0.27, ease: [0.16, 1, 0.3, 1] }} className="w-full max-w-[560px]">
          <div className="mb-5 text-center"><p className="type-eyebrow mb-3 text-primary">One block · one clear goal</p><motion.h1 className="font-heading text-[1.8rem] font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">{action.title}</motion.h1><p className="mx-auto mt-2 max-w-[30rem] text-sm leading-6 text-muted-foreground">{task?.description ?? action.rationale}</p></div>
          <Card className="overflow-hidden rounded-[24px] border-border/85 bg-surface-raised py-0 shadow-[var(--paper-shadow)]">
            <div className="p-5 sm:p-8">
              <div className="flex items-center justify-between"><span className="flex items-center gap-2 text-[0.65rem] text-muted-foreground"><Sparkles className="size-3.5 text-primary" />Current milestone</span><span className="rounded-full border border-primary/15 bg-primary/[0.035] px-2.5 py-1 text-[0.59rem] capitalize text-primary">{task?.careerSkillIds[0] ?? "Academic focus"}</span></div>
              <div className="my-8 text-center"><p className="font-mono text-[4.5rem] leading-none font-medium tracking-[-0.09em] text-foreground tabular-nums sm:text-[5rem]" aria-live="off">{formatTime(remaining)}</p><p className="mt-3 text-[0.68rem] text-muted-foreground">{running ? "Session in progress" : "Your time, protected"}</p></div>
              <Progress value={progress} className="h-1.5 bg-muted" aria-label={`${Math.round(progress)} percent of focus session elapsed`} />
              <div className="mt-2 flex justify-between text-[0.6rem] text-muted-foreground"><span>0 min</span><span>{action.durationMinutes} min session</span></div>
              <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center"><Button onClick={() => setRunning((current) => !current)} variant="outline" className="h-10 min-w-32 rounded-[12px] border-border"><span className="sr-only">{running ? "Pause" : "Resume"} focus session</span>{running ? <Pause className="size-4" /> : <Play className="size-4" />}{running ? "Pause" : "Resume"}</Button><Button onClick={finish} className="h-10 min-w-44 rounded-[12px] text-xs font-semibold"><Check className="size-4" />Complete Session</Button></div>
              <div className="mt-7 flex items-center justify-center gap-5 border-t border-border/65 pt-5 text-[0.62rem] text-muted-foreground"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{action.durationMinutes} minutes</span><span className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-success" />Progress saved locally</span></div>
            </div>
          </Card>
          <div className="mt-5 flex justify-center"><Button asChild variant="ghost" className="h-9 rounded-[11px] text-[0.67rem] text-muted-foreground"><Link href="/overview"><X className="size-3.5" />Exit session</Link></Button></div>
        </motion.div> : <motion.div key="complete" initial={{ opacity: 0, scale: reduceMotion ? 1 : 0.985, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: reduceMotion ? 0.16 : 0.3 }} className="w-full max-w-[540px] text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-[18px] border border-success/20 bg-success/[0.055] text-success"><CheckCircle2 className="size-7" /></span>
          <h2 className="type-eyebrow mt-5 text-success">Session complete</h2>
          <h1 className="mt-2 font-heading text-[1.8rem] font-semibold tracking-[-0.035em] text-foreground">Good work. Your progress is real.</h1>
          <p className="mt-2 text-sm text-muted-foreground">{task?.status === "completed" ? `${action.title} is complete in your demo plan.` : `${action.title} moved to ${task?.progress ?? 0}% progress in your demo plan.`}</p>
          <Card className="mt-7 rounded-[18px] border-border/80 bg-surface-raised py-0 shadow-none"><div className="grid grid-cols-1 divide-y divide-border/70 sm:grid-cols-3 sm:divide-x sm:divide-y-0"><div className="px-4 py-4"><p className="font-mono text-lg text-foreground">+{sessionMinutes}</p><p className="mt-1 text-[0.62rem] text-muted-foreground">productive minutes</p></div><div className="px-4 py-4"><p className="font-mono text-lg text-pathway">+{progressEarned}%</p><p className="mt-1 text-[0.62rem] text-muted-foreground">task progress</p></div><div className="px-4 py-4"><p className="font-mono text-lg text-success">+{Math.max(0, state.readiness.score - readinessBefore)}</p><p className="mt-1 text-[0.62rem] text-muted-foreground">Career Readiness</p></div></div></Card>
          <p className="mt-4 flex items-center justify-center gap-2 text-[0.62rem] text-muted-foreground"><Sparkles className="size-3.5 text-primary" />Your pathway, evidence, and next priority have updated.</p>
          <Button asChild className="mt-6 h-10 rounded-[12px] px-4 text-xs"><Link href="/overview">Back to Overview<ArrowLeft className="size-3.5 rotate-180" /></Link></Button>
        </motion.div>}
      </AnimatePresence>
    </div>
    <p className="pb-1 text-center text-[0.6rem] text-muted-foreground">A quiet space to do the next useful thing.</p>
  </div>;
}
