"use client";

import { useState } from "react";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/components/workspace/workspace-controls";
import Link from "next/link";
import { CheckCheck, CircleHelp, FileBadge2, Link2, ShieldCheck, Sparkles } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AnimatedProgress } from "@/components/motion/animated";
import { EvidenceBadge, SkillBadge } from "@/components/shared/status-badge";
import { calculateEvidenceConfidence, describeEvidenceConfidence } from "@/lib/domain/evidence";
import { useDemo } from "@/lib/state/demo-provider";
import { selectLearningPathCompletion } from "@/lib/domain/skill-reassessment";
import { toast } from "sonner";

const sourceIcon = (source: string) => source.includes("Repository") ? Link2 : source.includes("Certificate") ? FileBadge2 : source.includes("Assessment") ? CheckCheck : CircleHelp;

export function EvidencePassport() {
  const { state, verifyEvidence } = useDemo();
  const reduceMotion = useReducedMotion();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"all" | "verified" | "pending">("all");
  const matching = state.evidence.filter((item) => (view === "all" || (view === "verified" ? item.status === "verified" : item.status !== "verified")) && `${item.label} ${item.source} ${state.careerSkills.find((skill) => skill.id === item.skillId)?.name ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const skills = state.careerSkills.filter((skill) => matching.some((item) => item.skillId === skill.id));
  const dockerPath = selectLearningPathCompletion(state, "docker");
  const verify = (id: string, label: string) => {
    verifyEvidence(id);
    toast.success("Evidence verified", { description: `${label} added to your confidence score.` });
  };

  return <div><div className="workspace-toolbar"><ViewSwitch label="Evidence view" value={view} onChange={setView} options={[{ value: "all", label: "All evidence" }, { value: "verified", label: "Verified" }, { value: "pending", label: "To review" }]} /><WorkspaceSearch value={query} onChange={setQuery} label="Search evidence" /></div><div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <div className="border-b border-border/70 px-4 py-4 sm:px-5"><p className="type-eyebrow mb-1.5 text-muted-foreground">Skill evidence registry</p><h2 className="type-section-title">Skills, supported by proof</h2><p className="mt-1.5 text-[0.66rem] text-muted-foreground">Expand a skill to review its sources and confidence.</p></div>
      <CardContent className="px-3 py-2 sm:px-4">
        <Accordion key={`${view}-${query}`} type="multiple" defaultValue={query || view !== "all" ? skills.map((skill) => skill.id) : ["docker"]} className="w-full">
          {skills.map((skill) => {
            const evidence = state.evidence.filter((item) => item.skillId === skill.id);
            const visibleEvidence = matching.filter((item) => item.skillId === skill.id);
            const weightedConfidence = calculateEvidenceConfidence(evidence);
            const confidence = weightedConfidence;
            return <AccordionItem key={skill.id} value={skill.id} className="border-border/55 px-2 last:border-b-0">
              <AccordionTrigger className="py-3.5 hover:no-underline [&>svg]:size-4 [&>svg]:text-muted-foreground">
                <span className="flex w-full min-w-0 items-center gap-3 pr-2 text-left">
                  <span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-border/75 bg-background/55"><ShieldCheck className={`size-4 ${skill.status === "verified" ? "text-success" : "text-primary"}`} /></span>
                  <span className="min-w-0 flex-1"><span className="block truncate text-[0.74rem] font-medium text-foreground">{skill.name}</span><span className="mt-1 flex items-center gap-2"><SkillBadge status={skill.status} /><span className="hidden text-[0.6rem] text-muted-foreground sm:inline">{evidence.length} evidence items</span></span></span>
                  <span className="hidden w-24 shrink-0 sm:block"><span className="mb-1 flex items-center justify-between text-[0.59rem] text-muted-foreground"><span>Confidence</span><span className="font-mono">{confidence}%</span></span><AnimatedProgress value={confidence} className="h-1" indicatorClassName="bg-primary/75" /></span>
                </span>
              </AccordionTrigger>
              <AccordionContent className="pb-4">
                <div className="sm:ml-12 rounded-[14px] border border-border/70 bg-background/40 p-3.5">
                  <div className="mb-3 flex items-center justify-between gap-3"><p className="text-[0.63rem] font-medium text-foreground">Evidence supporting {skill.name}</p><span className="font-mono text-[0.63rem] text-primary">{confidence}% confidence</span></div>
                  <p className="mb-3 text-[0.6rem] leading-4 text-muted-foreground">{describeEvidenceConfidence(evidence)}</p>
                  <div className="space-y-2">
                    {visibleEvidence.map((item) => {
                      const Icon = sourceIcon(item.source);
                      return <motion.div layout key={item.id} transition={{ duration: reduceMotion ? 0.12 : 0.2 }} className="flex flex-wrap items-center justify-between gap-3 rounded-[11px] border border-border/55 bg-background/45 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5"><span className="grid size-7 shrink-0 place-items-center rounded-[9px] border border-border/70 bg-surface-raised text-muted-foreground"><Icon className="size-3.5" /></span><span className="min-w-0"><span className="block truncate text-[0.66rem] font-medium text-foreground">{item.label}</span><span className="mt-0.5 block text-[0.59rem] text-muted-foreground">{item.source}{item.verifiedAt ? ` · verified ${item.verifiedAt}` : ` · confidence ${item.confidence}%`}</span></span></div>
                        <div className="flex items-center gap-2"><EvidenceBadge status={item.status} />{item.status !== "verified" && (item.id === "docker-assessment" && dockerPath ? dockerPath.pathComplete ? <Button asChild variant="outline" size="sm" className="h-7 rounded-[9px] border-success/15 px-2 text-[0.58rem] text-success"><Link href="/career-path/docker/verify">Verify My Skill</Link></Button> : <span className="text-[0.6rem] text-muted-foreground">Finish path first</span> : <Button variant="outline" size="sm" onClick={() => verify(item.id, item.label)} className="h-7 rounded-[9px] border-success/15 px-2 text-[0.58rem] text-success hover:bg-success/[0.04]"><CheckCheck className="size-3" />Verify</Button>)}</div>
                      </motion.div>;
                    })}
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>;
          })}
        </Accordion>{!skills.length && <EmptyCollection title="No evidence in this view" description="Try another skill or filter to find your work." onReset={() => { setQuery(""); setView("all"); }} />}
      </CardContent>
    </Card>
    <Card className="passport-trust rounded-[20px] border-border/85 py-0 shadow-none">
      <div className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Trust signal</p><h2 className="type-section-title">Evidence confidence</h2></div>
      <CardContent className="px-4 pb-5 sm:px-5">
        <div className="mt-5 flex items-center gap-4"><div className="grid size-[100px] shrink-0 place-items-center rounded-full border-[5px] border-primary/60 ring-1 ring-primary/10"><div className="text-center"><p className="font-mono text-[1.65rem] leading-none tracking-[-0.07em] text-foreground">{calculateEvidenceConfidence(state.evidence.filter((item) => item.skillId === "docker"))}<span className="text-sm text-primary">%</span></p><p className="type-eyebrow mt-1.5 text-[0.5rem] text-muted-foreground">Docker</p></div></div><div><p className="text-[0.72rem] font-medium text-foreground">Confidence in skill claims</p><p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">More independent, verified work gives the strongest support.</p></div></div>
        <div className="mt-5 space-y-2.5"><p className="type-eyebrow text-muted-foreground">How the demo confidence works</p>{["Verified evidence has the highest reliability.", "Submitted and self-reported work stays visible at lower confidence.", "Independent sources provide a small corroboration signal."].map((item, index) => <p key={item} className="flex items-start gap-2 text-[0.64rem] leading-5 text-foreground/75"><span className="mt-1 grid size-4 shrink-0 place-items-center rounded-full border border-border bg-background/50 font-mono text-[0.52rem] text-primary">{index + 1}</span>{item}</p>)}</div>
        <div className="mt-5 rounded-[13px] border border-primary/12 bg-primary/[0.035] p-3"><p className="flex items-center gap-2 text-[0.65rem] font-medium text-primary"><Sparkles className="size-3.5" />Shared readiness context</p><p className="mt-1.5 text-[0.62rem] leading-5 text-muted-foreground">Verified evidence updates confidence and your Career Readiness score across the dashboard.</p></div>
      </CardContent>
    </Card>
  </div></div>;
}
