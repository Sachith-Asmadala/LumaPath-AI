"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle, LockKeyhole, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnimatedCounter, AnimatedProgress } from "@/components/motion/animated";
import { EmptyCollection, ViewSwitch } from "@/features/workspace/components/workspace-controls";
import { useDemo } from "@/state/demo-provider";
import { selectActionableSkill } from "@/features/workspace/domain/workspace";
import { roadmapUnlocks } from "@/features/career/domain/personalized-roadmap";

export function SkillGapList() {
  const { state } = useDemo();
  const [view, setView] = useState<"all" | "growing" | "verified">("all");
  const next = selectActionableSkill(state);
  const visible = state.careerSkills.filter((skill) => view === "all" || (view === "verified" ? ["verified", "completed"].includes(skill.status) : ["in-progress", "available"].includes(skill.status)));
  return <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.75fr)]">
    <Card className="rounded-[20px] bg-surface-raised py-0">
      <CardHeader className="p-5 pb-0"><p className="type-eyebrow mb-2 text-muted-foreground">{state.student.targetRole}</p><CardTitle className="type-section-title">Your competency profile</CardTitle><p className="mt-1 text-xs leading-5 text-muted-foreground">Current scores alongside your pathway targets.</p><div className="mt-4"><ViewSwitch label="Skill view" value={view} onChange={setView} options={[{ label: "All skills", value: "all" }, { label: "Growing", value: "growing" }, { label: "Established", value: "verified" }]} /></div></CardHeader>
      <CardContent className="p-5 pt-0">
        {visible.map((skill) => <div key={skill.id} className="border-b border-border/60 py-5 last:border-b-0"><div className="mb-3 flex items-center justify-between gap-3"><span className="flex items-center gap-2 text-sm">{skill.status === "verified" || skill.status === "completed" ? <CheckCircle2 className="size-4 text-success" /> : skill.status === "locked" ? <LockKeyhole className="size-4 text-muted-foreground" /> : <Circle className="size-4 text-primary" />}{skill.name}</span><span className="text-xs tabular-nums text-muted-foreground"><strong className="font-medium text-foreground">{skill.proficiency}%</strong> / {skill.targetScore ?? 75}% target</span></div><AnimatedProgress value={skill.proficiency} className="h-1.5" indicatorClassName={skill.status === "verified" ? "bg-success/75" : "bg-pathway/65"} /><div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted-foreground"><span className="capitalize">{skill.status.replaceAll("-", " ")}</span><span>{Math.max(0, (skill.targetScore ?? 75) - skill.proficiency) > 0 ? `${Math.max(0, (skill.targetScore ?? 75) - skill.proficiency)} points to target` : "Target reached"}</span></div></div>)}
        {!visible.length && <EmptyCollection title="Your next chapter is ahead" description="Skills appear here as you learn and verify your work." />}
      </CardContent>
    </Card>
    <Card className="skill-next overflow-hidden rounded-[20px] py-0">
      <CardHeader className="p-6 pb-0"><Sprout className="mb-6 size-7 text-pathway" strokeWidth={1.5} /><p className="type-eyebrow text-pathway">A good place to grow</p><CardTitle className="mt-2 font-heading text-3xl font-medium">{next?.name ?? "Your foundation is growing"}</CardTitle><p className="mt-2 text-sm leading-6 text-muted-foreground">{next ? "Your prerequisites are in place. This is an open step in your pathway." : "Explore your roadmap to review completed skills and the prerequisites ahead."}</p></CardHeader>
      <CardContent className="p-6">
        {next && <><div className="my-4 grid grid-cols-2 gap-4 border-y border-pathway/20 py-5"><div><p className="text-xs text-muted-foreground">Current score</p><p className="mt-2 font-heading text-3xl"><AnimatedCounter value={next.proficiency} suffix="%" /></p></div><div><p className="text-xs text-muted-foreground">Target</p><p className="mt-2 font-heading text-3xl text-pathway">{next.targetScore ?? 75}%</p></div></div><p className="mb-5 text-sm leading-6 text-muted-foreground">Unlocks <span className="text-foreground">{roadmapUnlocks(state.careerSkills, next.id).join(", ") || "your final pathway milestone"}</span>. Build evidence as you go, then verify what you know.</p></>}
        <Button asChild className="h-11 w-full rounded-xl text-xs"><Link href={next && state.assessment ? `/career-path/${next.id}/resources` : "/career-path"}>{next && state.assessment ? "Explore learning resources" : "View career pathway"}<ArrowRight className="ml-auto size-4" /></Link></Button>
      </CardContent>
    </Card>
  </div>;
}
