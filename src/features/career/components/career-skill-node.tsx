"use client";

import { CheckCircle2, Circle, GitBranch, LockKeyhole, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/state/demo-provider";
import type { CareerSkill } from "@/lib/demo-data/types";

type CareerNodeData = { skill: CareerSkill };
export type CareerFlowNode = Node<CareerNodeData, "careerSkill">;

export function CareerSkillNode({ data }: NodeProps<CareerFlowNode>) {
  const reduced = useReducedMotion();
  const { completeSkill } = useDemo();
  const { skill } = data;
  const isVerified = skill.status === "verified";
  const isActive = skill.status === "in-progress";
  const isAvailable = skill.status === "available";
  const Icon = isVerified ? CheckCircle2 : skill.status === "locked" ? LockKeyhole : isActive ? Sparkles : Circle;
  const border = isVerified ? "border-success/30" : isActive ? "border-primary/40" : isAvailable ? "border-pathway/30" : "border-border";
  const status = skill.status.replaceAll("-", " ");

  return (
    <motion.div layout={!reduced} className={`relative w-[188px] rounded-[17px] border ${border} bg-surface-raised p-3.5 shadow-[0_14px_35px_-30px_rgba(0,0,0,0.9)] transition-colors hover:border-primary/25`}>
      <Handle type="target" position={Position.Left} className="!size-2 !border-[#1a1d23] !bg-border" />
      <div className="flex items-start justify-between gap-2">
        <span className={`grid size-8 place-items-center rounded-[11px] border ${isVerified ? "border-success/20 bg-success/[0.06] text-success" : isActive ? "border-primary/20 bg-primary/[0.06] text-primary" : isAvailable ? "border-pathway/20 bg-pathway/[0.06] text-pathway" : "border-border bg-background/65 text-muted-foreground"}`}><Icon className="size-4" aria-hidden="true" /></span>
        <Badge variant="outline" className={`rounded-full px-2 py-1 text-[0.56rem] capitalize ${isVerified ? "border-success/20 text-success" : isActive ? "border-primary/20 text-primary" : isAvailable ? "border-pathway/20 text-pathway" : "border-border text-muted-foreground"}`}>{status}</Badge>
      </div>
      <p className="mt-3 text-[0.72rem] font-semibold leading-tight text-foreground">{skill.name}</p>
      <p className="mt-1 min-h-8 text-[0.61rem] leading-4 text-muted-foreground">{skill.description}</p>
      <div className="mt-3 flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1 text-[0.59rem] text-muted-foreground"><GitBranch className="size-3" />{skill.proficiency}% proficiency</span>{isActive && <Button size="sm" onClick={() => completeSkill(skill.id)} className="h-7 rounded-[9px] px-2 text-[0.59rem]"><CheckCircle2 className="size-3" />Verify</Button>}</div>
      {(skill.status === "locked" || skill.status === "gap") && skill.prerequisites.length > 0 && <p className="mt-2 text-[0.56rem] text-muted-foreground">Needs {skill.prerequisites.join(" + ")}</p>}
      <Handle type="source" position={Position.Right} className="!size-2 !border-[#1a1d23] !bg-border" />
    </motion.div>
  );
}
