"use client";

import { useMemo } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useDemo } from "@/lib/state/demo-provider";
import { CareerSkillNode, type CareerFlowNode } from "@/features/career/components/career-skill-node";
import { Card, CardContent } from "@/components/ui/card";

const nodeTypes = { careerSkill: CareerSkillNode };
const positions: Record<string, { x: number; y: number }> = {
  linux: { x: 24, y: 80 },
  git: { x: 282, y: 80 },
  docker: { x: 540, y: 80 },
  cicd: { x: 282, y: 312 },
  cloud: { x: 540, y: 312 },
  terraform: { x: 540, y: 544 },
  kubernetes: { x: 282, y: 544 },
  monitoring: { x: 24, y: 544 },
};

const defaultEdgeOptions = { type: "smoothstep" as const, markerEnd: { type: MarkerType.ArrowClosed, color: "#576168" } };

export function CareerPathGraph() {
  const { state, completeSkill } = useDemo();
  const nodes = useMemo<CareerFlowNode[]>(() => state.careerSkills.map((skill) => ({
    id: skill.id,
    type: "careerSkill",
    position: positions[skill.id] ?? { x: 0, y: 0 },
    data: { skill },
    draggable: false,
    selectable: true,
  })), [state.careerSkills]);
  const edges = useMemo<Edge[]>(() => state.careerSkills.flatMap((skill) => skill.prerequisites.map((source) => {
    const dockerVerified = state.careerSkills.find((item) => item.id === "docker")?.status === "verified";
    const justUnlocked = dockerVerified && (skill.id === "cicd" || skill.id === "terraform") && skill.status === "available";
    return {
      id: `${source}-${skill.id}`,
      source,
      target: skill.id,
      type: "smoothstep",
      className: justUnlocked ? "pathway-unlock-edge" : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: justUnlocked ? "#74f6fb" : "#576168" },
      style: { stroke: justUnlocked ? "#74f6fb" : "#465059", strokeWidth: justUnlocked ? 1.8 : 1.3 },
    };
  })), [state.careerSkills]);

  return (
    <Card className="overflow-hidden rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <div className="flex items-center justify-between border-b border-border/75 px-4 py-3.5 sm:px-5">
        <div><p className="text-[0.72rem] font-medium text-foreground">DevOps Engineer pathway</p><p className="mt-1 text-[0.62rem] text-muted-foreground">Prerequisites · evidence · readiness</p></div>
        <span className="hidden items-center gap-2 text-[0.61rem] text-muted-foreground sm:flex"><span className="size-1.5 rounded-full bg-success" />Verified <span className="ml-2 size-1.5 rounded-full bg-primary" />In progress <span className="ml-2 size-1.5 rounded-full bg-pathway" />Available</span>
      </div>
      <CardContent className="p-0">
        <div className="hidden h-[650px] md:block">
          <ReactFlow
            nodes={nodes as Node[]}
            edges={edges}
            nodeTypes={nodeTypes}
            defaultEdgeOptions={defaultEdgeOptions}
            fitView
            fitViewOptions={{ padding: 0.14 }}
            minZoom={0.55}
            maxZoom={1.25}
            nodesDraggable={false}
            nodesConnectable={false}
            elementsSelectable={false}
            proOptions={{ hideAttribution: true }}
            aria-label="DevOps career prerequisite path"
          >
            <Background color="#343c42" gap={22} size={1} />
            <Controls position="bottom-right" showInteractive={false} className="!overflow-hidden !rounded-xl !border !border-border !bg-background/80 !shadow-none [&>button]:!border-border [&>button]:!bg-background [&>button]:!text-muted-foreground [&>button:hover]:!text-foreground" />
          </ReactFlow>
        </div>
        <div className="space-y-2.5 p-4 md:hidden" aria-label="DevOps career pathway">
          {state.careerSkills.map((skill, index) => <div key={skill.id} className="relative">
            {index > 0 && <div className="absolute -top-3 left-[1.05rem] h-3 w-px bg-border" aria-hidden="true" />}
            <div className={`flex items-center gap-3 rounded-[14px] border p-3 ${skill.status === "in-progress" ? "border-primary/25 bg-primary/[0.035]" : "border-border/80 bg-background/45"}`}>
              <span className={`grid size-8 shrink-0 place-items-center rounded-[10px] border text-xs font-mono ${skill.status === "verified" ? "border-success/20 bg-success/[0.06] text-success" : skill.status === "in-progress" ? "border-primary/20 bg-primary/[0.06] text-primary" : skill.status === "available" ? "border-pathway/20 bg-pathway/[0.06] text-pathway" : "border-border text-muted-foreground"}`}>{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-[0.73rem] font-medium text-foreground">{skill.name}</p><p className="mt-0.5 text-[0.62rem] capitalize text-muted-foreground">{skill.status.replaceAll("-", " ")} · {skill.proficiency}%</p></div>
              {skill.status === "in-progress" && <button type="button" onClick={() => completeSkill(skill.id)} className="rounded-lg border border-primary/20 px-2.5 py-1.5 text-[0.6rem] text-primary transition-colors hover:bg-primary/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Verify</button>}
            </div>
          </div>)}
          <p className="pt-1 text-[0.62rem] leading-5 text-muted-foreground">Each step opens when its required skills are verified. Status labels stay visible without relying on color.</p>
        </div>
      </CardContent>
    </Card>
  );
}
