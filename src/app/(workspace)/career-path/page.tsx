"use client";

import dynamic from "next/dynamic";
import { ArrowRight, CheckCircle2, Network, ShieldCheck, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/lib/state/demo-provider";
import "@xyflow/react/dist/style.css";

const CareerPathGraph = dynamic(() => import("@/features/career/components/career-path-graph").then((module) => module.CareerPathGraph), {
  ssr: false,
  loading: () => <div className="h-[520px] animate-pulse rounded-[20px] border border-border/70 bg-surface-raised motion-reduce:animate-none" role="status" aria-label="Mapping career pathway" />,
});

export default function CareerPathPage() {
  const { state } = useDemo();
  const verified = state.careerSkills.filter((skill) => skill.status === "verified").length;
  const available = state.careerSkills.filter((skill) => skill.status === "available").length;
  const active = state.careerSkills.find((skill) => skill.status === "in-progress") ?? state.careerSkills.find((skill) => skill.status === "available");
  const unlocked = state.careerSkills.filter((skill) => skill.status === "available" && skill.id !== "cloud");

  return (
    <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
      <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div><p className="type-eyebrow mb-2 flex items-center gap-2 text-pathway"><Network className="size-3.5" />Career pathway engine</p><TypographyH1>Build toward the role you want</TypographyH1><TypographyP className="mt-2">A prerequisite map shaped by your current skills, evidence, and coursework.</TypographyP></div>
        <div className="rounded-[13px] border border-pathway/15 bg-pathway/[0.035] px-3.5 py-2.5"><p className="text-[0.61rem] text-muted-foreground">Target role</p><p className="mt-0.5 text-[0.75rem] font-medium text-foreground">DevOps Engineer</p></div>
      </div></Reveal>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[{ label: "Verified skills", value: `${verified} / ${state.careerSkills.length}`, icon: ShieldCheck, tone: "text-success" }, { label: "Available next", value: String(available), icon: ArrowRight, tone: "text-pathway" }, { label: "Current focus", value: active?.name ?? "Choose a milestone", icon: Sparkles, tone: "text-primary" }, { label: "Career readiness", value: `${state.readiness.score}%`, icon: CheckCircle2, tone: "text-primary" }].map(({ label, value, icon: Icon, tone }) => <Card key={label} className="flex items-center gap-3 rounded-[15px] border-border/75 bg-white/[0.02] px-3.5 py-3 shadow-none"><span className={`grid size-8 shrink-0 place-items-center rounded-[10px] border border-border/70 bg-background/55 ${tone}`}><Icon className="size-4" aria-hidden="true" /></span><div className="min-w-0"><p className="truncate text-[0.62rem] text-muted-foreground">{label}</p><p className="mt-0.5 truncate text-[0.73rem] font-medium text-foreground">{value}</p></div></Card>)}
      </div>
      {unlocked.length > 1 && <Reveal><div className="mb-4 flex items-center gap-2 rounded-[13px] border border-primary/15 bg-primary/[0.035] px-3.5 py-3 text-[0.72rem] text-foreground"><Sparkles className="size-4 text-primary" />{unlocked.length} new pathway milestones unlocked<span className="ml-auto hidden text-[0.62rem] text-muted-foreground sm:inline">Docker verification updated your next steps</span></div></Reveal>}
      <CareerPathGraph />
      <p className="mt-3 text-[0.62rem] text-muted-foreground">Verify your current milestone to update pathway evidence and readiness.</p>
    </div>
  );
}
