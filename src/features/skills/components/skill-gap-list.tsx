"use client";

import { ArrowRight, BookOpen, CheckCircle2, Circle, LockKeyhole, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedProgress } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";
import { toast } from "sonner";

function tone(proficiency: number) {
  if (proficiency >= 75) return "bg-success/75";
  if (proficiency >= 50) return "bg-primary/75";
  if (proficiency >= 30) return "bg-pathway/75";
  return "bg-warning/75";
}

export function SkillGapList() {
  const { state, addIntelligenceItemToPlan } = useDemo();
  const reduceMotion = useReducedMotion();
  const nextStep = state.intelligenceItems.find((item) => item.id === "kubernetes-fundamentals");
  const addToPlan = () => {
    if (!nextStep) return;
    addIntelligenceItemToPlan(nextStep.id);
    toast.success("Added to Wednesday, 7:00 PM", { description: nextStep.title });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]">
      <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
        <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Role: DevOps Engineer</p><CardTitle className="type-section-title">Your competency profile</CardTitle><p className="mt-1 text-[0.67rem] text-muted-foreground">Bars reflect seeded demo proficiency, not a live assessment.</p></CardHeader>
        <CardContent className="space-y-4 px-4 pb-5 sm:px-5">
          {state.careerSkills.filter((skill) => skill.id !== "sql").map((skill, index) => <motion.div key={skill.id} initial={{ opacity: 0, y: reduceMotion ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0.12 : 0.22, delay: reduceMotion ? 0 : index * 0.04 }}>
            <div className="mb-2 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-[0.73rem] text-foreground/85">{skill.status === "verified" ? <CheckCircle2 className="size-3.5 text-success" /> : skill.status === "locked" ? <LockKeyhole className="size-3.5 text-muted-foreground" /> : <Circle className="size-3.5 text-primary" />}{skill.name}</span><span className="font-mono text-[0.67rem] text-foreground/80">{skill.proficiency}%</span></div>
            <AnimatedProgress value={skill.proficiency} className="h-1.5" delay={index * 75} indicatorClassName={tone(skill.proficiency)} />
          </motion.div>)}
          <div className="flex flex-wrap gap-3 pt-2 text-[0.61rem] text-muted-foreground"><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-success" />Established</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-primary" />Developing</span><span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-warning" />Opportunity</span></div>
        </CardContent>
      </Card>
      <Card className="relative overflow-hidden rounded-[20px] border border-pathway/15 bg-surface-raised py-0 shadow-none dark:bg-[linear-gradient(145deg,#1b1921_0%,#1a1c22_66%)]">
        <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-pathway">Highest potential gain</p><CardTitle className="type-section-title">Kubernetes</CardTitle><p className="mt-1 text-[0.68rem] text-muted-foreground">A clear next step for your DevOps pathway.</p></CardHeader>
        <CardContent className="px-4 pb-5 sm:px-5">
          <div className="mt-2 flex items-end justify-between gap-3"><div><p className="text-[0.65rem] text-muted-foreground">Current proficiency</p><p className="mt-1 font-mono text-[1.65rem] tracking-[-0.07em] text-foreground">{state.careerSkills.find((skill) => skill.id === "kubernetes")?.proficiency ?? 18}<span className="text-base text-muted-foreground">%</span></p></div><span className="mb-1 rounded-full border border-success/15 bg-success/[0.045] px-2.5 py-1 text-[0.62rem] text-success">Potential +7 readiness</span></div>
          <div className="mt-5 rounded-[14px] border border-border/75 bg-background/45 p-3.5"><p className="flex items-center gap-2 text-[0.66rem] font-medium text-foreground"><BookOpen className="size-3.5 text-primary" />Recommended next step</p><p className="mt-1.5 text-sm font-medium text-foreground">Complete Kubernetes Fundamentals</p><p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">Build the concepts you need before Kubernetes becomes available in your pathway.</p><Button onClick={addToPlan} disabled={nextStep?.status === "planned"} className="mt-3 h-9 w-full rounded-[11px] text-[0.67rem]">{nextStep?.status === "planned" ? <CheckCircle2 className="size-3.5" /> : <Sparkles className="size-3.5" />}{nextStep?.status === "planned" ? "Added to Planner" : "Add Learning Path to Planner"}<ArrowRight className="ml-auto size-3.5" /></Button></div>
          <p className="mt-3 text-[0.59rem] leading-4 text-muted-foreground">Readiness gain is a seeded demo estimate, not a prediction or verified assessment.</p>
        </CardContent>
      </Card>
    </div>
  );
}
