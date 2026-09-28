"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpRight, BadgeCheck, BriefcaseBusiness, Code2, GraduationCap, MessageCircleMore } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing, AnimatedProgress, AnimatedCounter } from "@/components/motion/animated";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/state/demo-provider";

const iconById = {
  technical: Code2,
  evidence: BadgeCheck,
  certifications: GraduationCap,
  interview: MessageCircleMore,
  applications: BriefcaseBusiness,
  coverage: Code2, projects: BriefcaseBusiness, learning: GraduationCap,
} as const;

export function CareerReadinessCard() {
  const { state } = useDemo();
  const reduced = useReducedMotion();
  const previous = useRef(state.readiness.score);
  const [delta, setDelta] = useState(0);
  useEffect(() => {
    const stored = window.sessionStorage.getItem("lumapath-readiness-last-seen");
    const lastSeen = stored === null ? previous.current : Number(stored);
    const gained = Math.max(0, state.readiness.score - lastSeen);
    const announcedGain = state.simulation.announcement.includes("+2 Readiness") ? 2 : 0;
    setDelta((current) => Math.max(current, gained, announcedGain));
    previous.current = state.readiness.score;
    window.sessionStorage.setItem("lumapath-readiness-last-seen", String(state.readiness.score));
    const timer = window.setTimeout(() => setDelta(0), 3500);
    return () => window.clearTimeout(timer);
  }, [state.readiness.score, state.simulation.announcement]);
  return (
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-center justify-between gap-3"><div><p className="type-eyebrow mb-2 text-muted-foreground">Career pathway</p><CardTitle className="type-section-title">DevOps Readiness</CardTitle></div><Button asChild variant="ghost" size="icon-sm" className="size-8 text-muted-foreground hover:text-foreground"><Link href="/career-path" aria-label="Open career pathway"><ArrowUpRight className="size-4" /></Link></Button></div>
      </CardHeader>
      <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
        <div className="flex items-center gap-4">
          <ScoreRing value={state.readiness.score} size={116} stroke={7} animateOnMount />
          <div className="min-w-0 flex-1">
            <p className="font-heading text-sm font-semibold text-foreground">{state.assessment ? "Your measured progress" : "Sample student scenario"}</p>
            <p className="mt-1 text-[0.67rem] text-muted-foreground">Building toward DevOps Engineer</p>
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-success/15 bg-success/[0.05] px-2 py-1 text-[0.64rem] text-success"><ArrowUpRight className="size-3" />{state.readiness.weeklyDelta >= 0 ? "+" : ""}{state.readiness.weeklyDelta}% {state.assessment ? "since baseline" : "this week"}</div>
            <AnimatePresence>{delta > 0 && <motion.p key="readiness-gain" initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: reduced ? 0.01 : 0.26 }} role="status" className="mt-2 inline-flex rounded-full border border-primary/20 bg-primary/[0.07] px-2 py-1 font-mono text-[0.61rem] text-primary">+{delta} Readiness</motion.p>}</AnimatePresence>
          </div>
        </div>
        <div className="mt-5 space-y-3">
          {state.readiness.breakdown.map((metric, index) => {
            const Icon = iconById[metric.id];
            return <div key={metric.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2"><span className="flex min-w-0 items-center gap-2 text-[0.66rem] text-muted-foreground"><Icon className="size-3.5 shrink-0" aria-hidden="true" />{metric.label}</span><span className="font-mono text-[0.65rem] text-foreground/85"><AnimatedCounter value={metric.value} suffix="%" animateOnMount /></span></div>
              <AnimatedProgress value={metric.value} className="h-1" delay={index * 70} indicatorClassName={metric.id === "evidence" ? "bg-pathway" : "bg-primary/75"} />
            </div>;
          })}
        </div>
      </CardContent>
    </Card>
  );
}
