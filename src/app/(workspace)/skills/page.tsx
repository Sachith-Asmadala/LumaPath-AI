"use client";

import { BookOpenCheck, ChartNoAxesCombined, Compass } from "lucide-react";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { SkillGapList } from "@/features/skills/components/skill-gap-list";
import { useDemo } from "@/lib/state/demo-provider";

export default function SkillsPage() {
  const { state } = useDemo();
  return <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-pathway"><Compass className="size-3.5" />Career pathway engine</p><TypographyH1>See the skill gaps that matter</TypographyH1><TypographyP className="mt-2">Your current DevOps profile, prioritized against a specific next role.</TypographyP></div><div className="flex gap-2"><span className="rounded-[12px] border border-border bg-white/[0.02] px-3 py-2 text-[0.65rem] text-muted-foreground">{state.careerSkills.length} tracked skills</span><span className="rounded-[12px] border border-primary/15 bg-primary/[0.035] px-3 py-2 text-[0.65rem] text-primary">{state.readiness.score}% career readiness</span></div></div></Reveal>
    <div className="mb-4 flex items-start gap-3 rounded-[15px] border border-border/75 bg-white/[0.02] p-3.5"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-primary/15 bg-primary/[0.04] text-primary"><ChartNoAxesCombined className="size-4" /></span><p className="text-[0.69rem] leading-5 text-foreground/80"><span className="font-medium text-foreground">Skill gap analysis is a demo estimate.</span> It uses your current scores and pathway prerequisites. Verified evidence can change your shared career-readiness breakdown.</p></div>
    <div className="skill-summary" aria-label="Skill progress summary"><div><strong>{state.careerSkills.filter((skill) => skill.status === "verified" || skill.status === "completed").length}</strong><span>A strong foundation</span></div><div><strong>{state.careerSkills.filter((skill) => skill.status === "in-progress").length}</strong><span>Growing right now</span></div><div><strong>{state.careerSkills.filter((skill) => skill.status === "available").length}</strong><span>Ready to explore</span></div></div>
    <SkillGapList />
    <div className="mt-4 flex items-center gap-2 text-[0.64rem] text-muted-foreground"><BookOpenCheck className="size-3.5 text-primary" />Explore a learning path, then schedule it around your academic work.</div>
  </div>;
}
