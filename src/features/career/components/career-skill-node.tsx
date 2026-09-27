"use client";

import Link from "next/link";
import { CheckCircle2, Circle, LockKeyhole, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/state/demo-provider";
import type { CareerSkill } from "@/lib/demo-data/types";

type CareerNodeData = { skill: CareerSkill; prerequisites: string[]; unlocks: string[]; recommended: boolean; personalized: boolean };
export type CareerFlowNode = Node<CareerNodeData, "careerSkill">;

export function CareerSkillCard({ skill, prerequisites, unlocks, recommended, personalized, compact = false }: CareerNodeData & { compact?: boolean }) {
  const reduced = useReducedMotion();
  const { state, completeSkill } = useDemo();
  const done = skill.status === "verified" || skill.status === "completed";
  const active = skill.status === "in-progress";
  const available = skill.status === "available";
  const Icon = done ? CheckCircle2 : skill.status === "locked" ? LockKeyhole : active ? Sparkles : Circle;
  const border = recommended ? "border-primary/60 bg-primary/[0.055]" : done ? "border-success/25 bg-surface-raised" : active ? "border-primary/35 bg-surface-raised" : available ? "border-pathway/30 bg-surface-raised" : "border-border bg-surface-raised";

  return <motion.div
    initial={{ opacity: 0, y: reduced ? 0 : 5 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: reduced ? 0 : 0.22 }}
    className={`relative rounded-[17px] border ${border} p-4 shadow-[0_14px_35px_-30px_rgba(0,0,0,0.9)] transition-colors ${compact ? "w-full" : "w-[250px]"}`}
  >
    <div className="flex items-start justify-between gap-2">
      <span className={`grid size-9 shrink-0 place-items-center rounded-[11px] border ${done ? "border-success/20 bg-success/[0.06] text-success" : active || recommended ? "border-primary/20 bg-primary/[0.06] text-primary" : available ? "border-pathway/20 bg-pathway/[0.06] text-pathway" : "border-border bg-background/65 text-muted-foreground"}`}><Icon className="size-4" aria-hidden="true" /></span>
      <div className="flex flex-wrap justify-end gap-1.5">
        {recommended && <Badge variant="outline" className="border-primary/30 bg-primary/[0.08] px-2 py-1 text-[0.66rem] text-primary">Recommended next</Badge>}
        {state.selectedFreePathBySkill[skill.id] && <Badge variant="outline" className="border-success/30 bg-success/[0.08] px-2 py-1 text-[0.66rem] text-success">Free path added</Badge>}
        <Badge variant="outline" className={`rounded-full px-2 py-1 text-[0.66rem] capitalize ${done ? "border-success/20 text-success" : active ? "border-primary/20 text-primary" : available ? "border-pathway/20 text-pathway" : "border-border text-muted-foreground"}`}>{skill.status.replaceAll("-", " ")}</Badge>
      </div>
    </div>
    <h3 className="mt-3 font-heading text-base font-semibold leading-tight text-foreground">{skill.name}</h3>
    <p className="mt-1 min-h-10 text-xs leading-5 text-muted-foreground">{skill.description}</p>
    {personalized ? <>
      <dl className="mt-3 grid grid-cols-3 gap-1.5 rounded-xl border border-border/65 bg-background/45 p-2.5 text-center">
        <div><dt className="text-[0.68rem] text-muted-foreground">Current</dt><dd className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">{skill.proficiency}%</dd></div>
        <div><dt className="text-[0.68rem] text-muted-foreground">Target</dt><dd className="mt-0.5 text-xs font-semibold tabular-nums text-foreground">{skill.targetScore}%</dd></div>
        <div><dt className="text-[0.68rem] text-muted-foreground">Estimated</dt><dd className="mt-0.5 whitespace-nowrap text-xs font-semibold text-foreground">{skill.estimatedWeeks} {skill.estimatedWeeks === 1 ? "week" : "weeks"}</dd></div>
      </dl>
      <div className="mt-3 space-y-1 text-xs leading-5"><p><span className="text-muted-foreground">Prerequisite:</span> <span className="text-foreground">{prerequisites.join(", ") || "None"}</span></p><p><span className="text-muted-foreground">Unlocks:</span> <span className="text-foreground">{unlocks.join(", ") || "Final milestone"}</span></p></div>
      {(available || active) && <Button asChild variant="outline" className="nodrag nopan mt-3 h-9 w-full rounded-lg px-2 text-xs"><Link href={`/career-path/${skill.id}/resources`}>Find Learning Resources</Link></Button>}
    </> : <>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{skill.proficiency}% proficiency</span>{active && <Button size="sm" onClick={() => completeSkill(skill.id)} className="nodrag nopan h-8 rounded-[9px] px-2 text-xs"><CheckCircle2 className="size-3" />Verify</Button>}</div>
      {skill.status === "locked" && prerequisites.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Needs {prerequisites.join(" + ")}</p>}
    </>}
  </motion.div>;
}

export function CareerSkillNode({ data }: NodeProps<CareerFlowNode>) {
  return <>
    <Handle type="target" position={Position.Left} className="!size-2 !border-[#1a1d23] !bg-border" />
    <CareerSkillCard {...data} />
    <Handle type="source" position={Position.Right} className="!size-2 !border-[#1a1d23] !bg-border" />
  </>;
}
