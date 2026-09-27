"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDemo } from "@/lib/state/demo-provider";

const steps = ["linux", "git", "docker", "cicd", "cloud"];
export function MiniCareerPath() {
  const { state } = useDemo();
  const reduced = useReducedMotion();
  const related = state.tasks.find((task) => task.id === state.activeAction.taskId)?.careerSkillIds ?? [];
  const docker = state.careerSkills.find((skill) => skill.id === "docker");
  const verified = docker?.status === "verified";
  return <Card className="h-full rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
    <CardHeader className="px-5 pt-5"><p className="type-eyebrow text-pathway">Career Path</p><CardTitle className="type-section-title">{state.student.targetRole}</CardTitle><p className="text-xs text-muted-foreground">Today’s work builds your next career milestone.</p></CardHeader>
    <CardContent className="flex flex-1 flex-col px-5 pb-5">
      <ol className="mb-6 flex flex-col gap-2 xl:flex-row xl:items-start xl:gap-1" aria-label="Career pathway milestones">
        {steps.map((id, index) => {
          const skill = state.careerSkills.find((item) => item.id === id)!;
          const active = related.includes(id) && skill.status !== "verified";
          return <li key={id} className="relative flex min-w-0 flex-1 flex-col items-center gap-1">
            <motion.div animate={{ opacity: 1 }} initial={{ opacity: reduced ? 1 : 0 }} transition={{ delay: reduced ? 0 : index * 0.09 }} className={`flex w-full items-center gap-2 rounded-xl border p-2.5 xl:flex-col ${active ? "border-primary/40 bg-primary/[0.06]" : "border-border bg-background/30"}`}>
              <span className={`grid size-6 shrink-0 place-items-center rounded-full border ${skill.status === "verified" ? "border-success/30 text-success" : "border-border text-primary"}`}>
                {skill.status === "verified" ? <Check className="size-3" /> : skill.status === "locked" ? <LockKeyhole className="size-3 text-muted-foreground" /> : <span className="size-2 rounded-full bg-primary" />}
              </span>
              <span className="text-xs font-medium">{id === "linux" ? "Linux" : id === "git" ? "Git" : skill.name}</span>
              <span className="text-[0.56rem] capitalize text-muted-foreground">{skill.status.replaceAll("-", " ")}{skill.status === "in-progress" ? ` ${skill.proficiency}%` : ""}</span>
            </motion.div>
            {index < steps.length - 1 && <motion.span key={`${id}-${skill.status}`} initial={{ opacity: reduced ? 1 : 0.3, scaleX: reduced ? 1 : 0 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ delay: reduced ? 0 : 0.2, duration: 0.4 }} className={`xl:absolute xl:-right-2 xl:top-5 ${skill.status === "verified" ? "text-success" : "text-muted-foreground"}`} aria-hidden="true"><ArrowRight className="size-3 rotate-90 xl:rotate-0" /></motion.span>}
          </li>;
        })}
      </ol>
      <div className="mt-auto rounded-xl border border-border bg-background/30 p-3 text-xs"><p className="text-muted-foreground">Next milestone</p><p className="mt-1 font-medium">{verified ? "Build your first CI/CD pipeline" : "Complete Docker Networking Lab"}</p><p className="mt-2 text-pathway">{verified ? "Docker verified → CI/CD available" : "Verify Docker → Unlock CI/CD"}</p>{related.includes("docker") && !verified && <p className="mt-2 text-primary">Your recommended action contributes to Docker.</p>}</div>
      <Link href="/career-path" className="mt-4 inline-flex items-center gap-2 text-xs text-primary hover:underline">View Full Path <ArrowRight className="size-3" /></Link>
    </CardContent>
  </Card>;
}
