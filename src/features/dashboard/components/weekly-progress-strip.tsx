"use client";

import { CheckCircle2, Clock3, Flame, Target, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCounter } from "@/components/motion/animated";
import { useDemo } from "@/state/demo-provider";

import { dashboardMetrics } from "@/features/dashboard/domain/dashboard";

export function WeeklyProgressStrip() {
  const { state } = useDemo();
  const progress = dashboardMetrics(state);
  const metrics = [
    { label: "Task completion", value: progress.taskCompletion, suffix: "%", icon: CheckCircle2 },
    { label: "Productive hours", value: progress.productiveHours, suffix: "h", icon: Clock3 },
    { label: "Plan completion", value: progress.planCompletion, suffix: "%", icon: Target },
    { label: "Career progress", value: progress.careerProgress, suffix: "%", icon: TrendingUp },
    { label: "Consistency streak", value: state.currentStreak, suffix: " days", icon: Flame },
  ];
  return <Card className="rounded-[18px] border-border/75 bg-white/[0.018] py-0 shadow-none">
    <div className="grid grid-cols-2 divide-x divide-y divide-border/70 sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-5">
      {metrics.map(({ label, value, suffix, icon: Icon }) => <div key={label} className="flex items-center gap-2.5 px-3 py-3 sm:px-4">
        <span className="grid size-8 shrink-0 place-items-center rounded-[11px] border border-border/75 bg-background/60"><Icon className="size-3.5 text-muted-foreground" aria-hidden="true" /></span>
        <div className="min-w-0"><p className="font-mono text-base font-medium tracking-[-0.04em] text-foreground"><AnimatedCounter value={value} suffix={suffix} animateOnMount /></p><p className="mt-0.5 text-[0.6rem] text-muted-foreground">{label}</p></div>
      </div>)}
    </div>
  </Card>;
}
