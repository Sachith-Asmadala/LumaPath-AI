"use client";

import Link from "next/link";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";
import { hasProFeatures } from "@/features/subscriptions/entitlements";
import { advancedPriorityFactors } from "@/features/subscriptions/pro-intelligence";
import { ProBadge } from "@/features/subscriptions/components/pro-badge";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useDemo } from "@/state/demo-provider";
import { selectNextBestAction } from "@/features/dashboard/domain/dashboard";

export function PriorityExplanationSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state } = useDemo();
  const { subscription } = useSubscription();
  const pro = hasProFeatures(subscription?.plan);
  const reduceMotion = useReducedMotion();
  const [animateBars, setAnimateBars] = useState(false);
  const action = selectNextBestAction(state);
  const reasons = action.reasons;
  const positiveTotal = reasons.filter((reason) => reason.points > 0).reduce((sum, reason) => sum + reason.points, 0);
  const maxBar = Math.max(1, ...reasons.map((reason) => Math.abs(reason.points)));

  useEffect(() => {
    if (!open) {
      setAnimateBars(false);
      return;
    }
    const frame = requestAnimationFrame(() => setAnimateBars(true));
    return () => cancelAnimationFrame(frame);
  }, [open, action.taskId, reduceMotion]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent showCloseButton={false} side="right" className="flex w-full flex-col gap-0 border-l border-border bg-surface-inset p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b border-border/80 px-5 py-5 text-left sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div><p className="type-eyebrow mb-2 text-primary">Decision context</p><SheetTitle className="font-heading text-[1.25rem] font-semibold tracking-[-0.03em]">Why this action?</SheetTitle><SheetDescription className="mt-2 max-w-[21rem] text-[0.74rem] leading-5">How the decision engine prioritized <span className="font-medium text-foreground">{action.title}</span> for you.</SheetDescription></div>
            <SheetClose asChild><Button variant="ghost" size="icon-sm" aria-label="Close priority explanation"><X className="size-4" /></Button></SheetClose>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
          {!pro ? <div className="space-y-4"><p className="text-sm leading-6">{action.rationale}</p><p className="text-xs leading-5 text-muted-foreground">A {action.durationMinutes}-minute step with {action.deadlineRisk} deadline risk, within your available capacity.</p><div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">Go deeper with <ProBadge /></p><p className="mt-2 text-xs leading-5 text-muted-foreground">See dependency impact, evidence confidence and how each factor connects to your career.</p><Link href="/checkout" className="mt-3 inline-block text-xs font-medium text-primary">Unlock advanced explanations →</Link></div></div> : <><div className="mb-5 space-y-3" aria-label="Advanced priority explanation"><ProBadge />{advancedPriorityFactors(state).map(factor=><div key={factor.label} className="rounded-xl border border-border bg-background/50 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">{factor.label}</h3><span className="text-xs text-primary">{factor.value}</span></div><p className="mt-1 text-xs leading-5 text-muted-foreground">{factor.detail}</p></div>)}</div>{!state.competition && <><div className="mb-6 flex items-end justify-between">
            <div><p className="type-eyebrow text-muted-foreground">Priority score</p><p className="mt-2 font-mono text-[2.6rem] leading-none tracking-[-0.08em] text-foreground">{action.score}<span className="ml-1 text-xl text-muted-foreground">/100</span></p></div>
            <div className="mb-1 rounded-[12px] border border-primary/15 bg-primary/[0.055] px-3 py-2 text-right"><p className="text-[0.62rem] text-muted-foreground">Positive signals</p><p className="font-mono text-sm text-primary">+{positiveTotal}</p></div>
          </div>
          <Separator className="mb-5 bg-border/70" />
          <div className="space-y-5" aria-label="Priority score breakdown">
            {reasons.map((reason, index) => {
              const positive = reason.points > 0;
              const width = `${Math.max(7, (Math.abs(reason.points) / maxBar) * 100)}%`;
              const label = reason.label === "Available capacity" ? "Capacity fit" : reason.label;
              return <div key={reason.label}>
                <div className="mb-2 flex items-center justify-between gap-3"><span className="text-[0.74rem] text-foreground/85">{label}</span><motion.span initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: animateBars ? 1 : 0, y: animateBars ? 0 : reduceMotion ? 0 : 4 }} transition={{ duration: reduceMotion ? 0.01 : 0.18, delay: reduceMotion ? 0 : index * 0.035 }} className={`font-mono text-xs ${positive ? "text-primary" : "text-muted-foreground"}`}>{positive ? "+" : "−"}{Math.abs(reason.points)}</motion.span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><motion.div className={`h-full rounded-full ${positive ? "bg-primary/80" : "bg-white/25"}`} initial={{ width: "0%" }} animate={{ width: animateBars ? width : "0%" }} transition={{ duration: reduceMotion ? 0.01 : 0.18, delay: reduceMotion ? 0 : index * 0.035, ease: [0.16, 1, 0.3, 1] }} /></div>
              </div>;
            })}
          </div>
          </>}</>}<div className="mt-7 rounded-[15px] border border-border/80 bg-background/60 p-4">
            <p className="type-eyebrow mb-2 text-muted-foreground">What the factors mean</p>
            <p className="text-[0.72rem] leading-5 text-foreground/80">Deadline, career and prerequisite signals raise priority. Effort is a small penalty; available capacity reflects the time you said you have.</p>
          </div>
          <p className="mt-5 flex items-start gap-2.5 text-[0.7rem] leading-5 text-muted-foreground"><Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />Rules decide. Optimisation schedules. AI explains.</p>
          <p className="mt-2 text-[0.63rem] text-muted-foreground/75">This is a deterministic demo calculation, not a live AI assessment.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
