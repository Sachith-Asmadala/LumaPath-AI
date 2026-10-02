"use client";

import { ViewSwitch } from "@/features/workspace/components/workspace-controls";
import { useMemo, useState } from "react";
import { Background, Controls, MarkerType, ReactFlow, type Edge, type Node } from "@xyflow/react";
import { useDemo } from "@/state/demo-provider";
import { roadmapUnlocks } from "@/features/career/domain/personalized-roadmap";
import { CareerSkillCard, CareerSkillNode, type CareerFlowNode } from "@/features/career/components/career-skill-node";
import { Card, CardContent } from "@/components/ui/card";

const nodeTypes = { careerSkill: CareerSkillNode };
const standardPositions: Record<string, { x: number; y: number }> = {
  linux: { x: 0, y: 0 }, git: { x: 310, y: 0 }, docker: { x: 620, y: 0 },
  cicd: { x: 0, y: 320 }, cloud: { x: 310, y: 320 }, terraform: { x: 620, y: 320 },
  kubernetes: { x: 0, y: 640 }, monitoring: { x: 310, y: 640 },
};
const personalizedPositions: Record<string, { x: number; y: number }> = {
  linux: { x: 0, y: 0 }, git: { x: 310, y: 0 }, networking: { x: 620, y: 0 },
  docker: { x: 620, y: 340 }, cicd: { x: 310, y: 340 }, cloud: { x: 0, y: 340 },
  terraform: { x: 0, y: 680 }, kubernetes: { x: 310, y: 680 }, monitoring: { x: 620, y: 680 },
};
const defaultEdgeOptions = { type: "smoothstep" as const, markerEnd: { type: MarkerType.ArrowClosed, color: "var(--muted-foreground)" } };

export function CareerPathGraph() {
  const { state } = useDemo();
  const [view, setView] = useState<"map" | "list">("map");
  const personalized = Boolean(state.assessment && state.onboarding.completed && state.onboarding.careerGoal === "DevOps Engineer");
  const recommendedName = personalized ? state.skillGap?.recommendedSkill : null;
  const cards = useMemo(() => state.careerSkills.map((skill) => ({
    skill,
    prerequisites: skill.prerequisites.map((id) => state.careerSkills.find((item) => item.id === id)?.name ?? id),
    unlocks: roadmapUnlocks(state.careerSkills, skill.id),
    recommended: skill.name === recommendedName,
    personalized,
  })), [state.careerSkills, recommendedName, personalized]);
  const nodes = useMemo<CareerFlowNode[]>(() => cards.map((data) => ({
    id: data.skill.id,
    type: "careerSkill",
    position: (personalized ? personalizedPositions : standardPositions)[data.skill.id] ?? { x: 0, y: 0 },
    data,
    draggable: false,
    selectable: true,
  })), [cards, personalized]);
  const edges = useMemo<Edge[]>(() => state.careerSkills.flatMap((skill) => skill.prerequisites.map((source) => {
    const sourceStatus = state.careerSkills.find((item) => item.id === source)?.status;
    const activeEdge = personalized
      ? (sourceStatus === "verified" || sourceStatus === "completed") && (skill.status === "available" || skill.status === "in-progress")
      : state.careerSkills.find((item) => item.id === "docker")?.status === "verified" && (skill.id === "cicd" || skill.id === "terraform") && skill.status === "available";
    return {
      id: `${source}-${skill.id}`,
      source,
      target: skill.id,
      type: "smoothstep",
      className: activeEdge ? "pathway-unlock-edge" : undefined,
      markerEnd: { type: MarkerType.ArrowClosed, color: activeEdge ? "var(--primary)" : "var(--muted-foreground)" },
      style: { stroke: activeEdge ? "var(--primary)" : "var(--border)", strokeWidth: activeEdge ? 1.8 : 1.3, transition: "stroke 250ms ease, stroke-width 250ms ease" },
    };
  })), [state.careerSkills, personalized]);

  return <Card className="overflow-hidden rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
    <div className="flex items-center justify-between border-b border-border/75 px-4 py-3.5 sm:px-5">
      <div><p className="text-sm font-medium text-foreground">{state.student.targetRole} pathway</p><p className="mt-1 text-xs text-muted-foreground">{personalized ? "Assessment scores · prerequisites · learning time" : "Prerequisites · evidence · readiness"}</p></div>
      <span className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex"><span className="size-1.5 rounded-full bg-success" />Verified or completed <span className="ml-2 size-1.5 rounded-full bg-primary" />In progress <span className="ml-2 size-1.5 rounded-full bg-pathway" />Available</span>
    </div>
    <CardContent className="p-0">
      <div className="hidden px-5 pt-4 lg:block"><ViewSwitch label="Pathway view" value={view} onChange={setView} options={[{ value: "map", label: "Pathway map" }, { value: "list", label: "Skill cards" }]} /></div>
      <div className={`${view === "list" ? "!hidden" : ""} hidden ${personalized ? "h-[1020px] lg:block" : "h-[950px] lg:block"}`}>
        <ReactFlow nodes={nodes as Node[]} edges={edges} nodeTypes={nodeTypes} defaultEdgeOptions={defaultEdgeOptions} fitView fitViewOptions={{ padding: 0.08 }} minZoom={0.55} maxZoom={1.25} nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} proOptions={{ hideAttribution: true }} aria-label="DevOps career prerequisite path">
          <Background color="var(--border)" gap={22} size={1} />
          <Controls position="bottom-right" showInteractive={false} className="!overflow-hidden !rounded-xl !border !border-border !bg-background/80 !shadow-none [&>button]:!border-border [&>button]:!bg-background [&>button]:!text-muted-foreground [&>button:hover]:!text-foreground" />
        </ReactFlow>
      </div>
      <ol className={`grid gap-3 p-4 ${view === "list" ? "sm:grid-cols-2 xl:grid-cols-3" : "lg:hidden"}`} aria-label="DevOps career pathway">
        {cards.map((data, index) => <li key={data.skill.id} className="relative">
          {index > 0 && view === "map" && <div className="absolute -top-3 left-6 h-3 w-px bg-border" aria-hidden="true" />}
          <CareerSkillCard {...data} compact />
        </li>)}
      </ol>
    </CardContent>
  </Card>;
}
