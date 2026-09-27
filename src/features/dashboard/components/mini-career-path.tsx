"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, Circle, LockKeyhole } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedProgress, StatusPulse } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";
import { selectCurrentCareerSkill, selectNextBestAction } from "@/lib/domain/dashboard";

const steps = [
  { id: "linux", label: "Linux" },
  { id: "git", label: "Git" },
  { id: "docker", label: "Docker" },
  { id: "cicd", label: "CI/CD" },
  { id: "cloud", label: "Cloud" },
] as const;

export function MiniCareerPath() {
  const { state } = useDemo();
  const reduced = useReducedMotion();
  const related = state.tasks.find((task) => task.id === selectNextBestAction(state).taskId)?.careerSkillIds ?? [];
  const currentSkill = selectCurrentCareerSkill(state);
  const unlocked = currentSkill ? state.careerSkills.filter((skill) => skill.prerequisites.includes(currentSkill.id)).map((skill) => skill.name) : [];
  const recommendationMatches = currentSkill ? related.includes(currentSkill.id) : false;

  return <Card className="h-full rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
    <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
      <p className="type-eyebrow text-pathway">Career Path</p>
      <CardTitle className="type-section-title">{state.student.targetRole}</CardTitle>
      <p className="text-xs text-muted-foreground">Today’s work builds your next career milestone.</p>
    </CardHeader>
    <CardContent className="flex flex-1 flex-col px-4 pb-4 sm:px-5 sm:pb-5">
      <ol className="flex snap-x gap-1.5 overflow-x-auto pb-2 md:grid md:grid-cols-5 md:overflow-visible md:pb-0" aria-label="Career pathway milestones" tabIndex={0}>
        {steps.map(({ id, label }, index) => {
          const skill = state.careerSkills.find((item) => item.id === id)!;
          const current = id === currentSkill?.id;
          const highlighted = current && recommendationMatches;
          const completed = skill.status === "verified" || skill.status === "completed";
          return <motion.li key={id} layout={!reduced} className="relative min-w-16 flex-1 snap-start md:min-w-0" aria-label={`${label}, ${skill.status.replaceAll("-", " ")}`}>
            <motion.div animate={{ borderColor: highlighted ? "var(--primary)" : current ? "var(--pathway)" : "var(--border)", backgroundColor: highlighted ? "color-mix(in srgb, var(--primary) 8%, transparent)" : "transparent" }} transition={{ duration: reduced ? 0.01 : 0.3 }} className="flex h-full min-h-20 flex-col items-center rounded-xl border px-1 py-2 text-center">
              <StatusPulse trigger={skill.status} className="mb-1.5 size-6">
                <AnimatePresence mode="wait" initial={false}><motion.span key={skill.status} initial={{ opacity: 0, scale: reduced ? 1 : 0.75 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.75 }} transition={{ duration: reduced ? 0.01 : 0.2 }} className={`grid size-6 place-items-center rounded-full border ${completed ? "border-success/40 bg-success/[0.1] text-success" : current ? "border-primary/60 bg-primary/[0.1] text-primary" : "border-border bg-background/40 text-muted-foreground"}`}>
                  {completed ? <Check className="size-3.5" aria-hidden="true" /> : skill.status === "locked" ? <LockKeyhole className="size-3" aria-hidden="true" /> : skill.status === "available" ? <Circle className="size-3" aria-hidden="true" /> : <span className="size-2 rounded-full bg-current" />}
                </motion.span></AnimatePresence>
              </StatusPulse>
              <span className="text-[0.67rem] font-semibold leading-tight text-foreground">{label}</span>
              <AnimatePresence mode="wait" initial={false}><motion.span key={skill.status} initial={{ opacity: 0, y: reduced ? 0 : 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -4 }} transition={{ duration: reduced ? 0.01 : 0.18 }} className={`mt-1 text-[0.55rem] leading-tight ${completed ? "text-success" : current ? "text-primary" : "text-muted-foreground"}`}>{skill.status === "in-progress" ? "In Progress" : skill.status === "verified" ? "Verified" : skill.status === "completed" ? "Completed" : skill.status === "available" ? "Available" : "Locked"}</motion.span></AnimatePresence>
            </motion.div>
            {index < steps.length - 1 && <motion.span animate={{ color: completed ? "var(--success)" : "var(--muted-foreground)" }} transition={{ duration: reduced ? 0.01 : 0.3 }} className="pointer-events-none absolute -right-2 top-5 z-10" aria-hidden="true"><ArrowRight className="size-3" /></motion.span>}
          </motion.li>;
        })}
      </ol>

      <div className="mt-4 rounded-xl border border-border bg-background/30 p-3 text-xs">
        <div className="flex items-center justify-between gap-2"><p className="text-[0.61rem] text-muted-foreground">Current skill</p><p className="font-mono text-xs font-semibold text-primary">{currentSkill ? `${currentSkill.proficiency}%` : "Complete"}</p></div>
        <p className="mt-1 font-semibold text-foreground">{currentSkill?.name ?? "Pathway complete"}</p>
        <AnimatedProgress value={currentSkill?.proficiency ?? 100} className="mt-2 h-1" indicatorClassName="bg-primary" />
        {recommendationMatches && <p className="mt-2 inline-flex rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-1 text-[0.6rem] text-primary">Related to today&apos;s recommendation</p>}
        <div className="mt-3 grid gap-2 text-[0.64rem] sm:grid-cols-2"><p><span className="text-muted-foreground">Next milestone:</span> <span className="font-medium text-foreground">{currentSkill?.name ?? "All milestones verified"}</span></p><p><span className="text-muted-foreground">Unlocks:</span> <span className="font-medium text-foreground">{unlocked.join(", ") || "—"}</span></p></div>
        <AnimatePresence initial={false} mode="wait"><motion.p key={currentSkill?.id ?? "complete"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-2 text-[0.65rem] text-pathway">{currentSkill ? `${currentSkill.name} · ${currentSkill.status.replaceAll("-", " ")}` : "All career milestones verified"}</motion.p></AnimatePresence>
      </div>
      <Link href="/career-path" className="mt-4 inline-flex items-center gap-2 text-xs text-primary hover:underline">View Full Path <ArrowRight className="size-3" aria-hidden="true" /></Link>
    </CardContent>
  </Card>;
}
