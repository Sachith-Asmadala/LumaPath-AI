"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, BriefcaseBusiness, CalendarDays, Check, FileCheck2, MapPin, Sparkles, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDemo } from "@/lib/state/demo-provider";
import { toast } from "sonner";

export function OpportunityRadar() {
  const { state, addOpportunityPreparation } = useDemo();
  const [prepareOpen, setPrepareOpen] = useState(false);
  const opportunity = state.opportunities[0];
  if (!opportunity) return null;
  const addTasks = () => {
    addOpportunityPreparation();
    toast.success("Preparation tasks added", { description: "AWS review and Docker README are on your plan." });
  };

  return <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(17rem,0.65fr)]">
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <CardContent className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-[13px] border border-pathway/15 bg-pathway/[0.05] text-pathway"><BriefcaseBusiness className="size-[18px]" /></span><div><Badge variant="outline" className="rounded-full border-success/15 bg-success/[0.035] px-2 py-0.5 text-[0.58rem] text-success">High relevance</Badge><h2 className="mt-2 font-heading text-lg font-semibold tracking-[-0.03em] text-foreground">{opportunity.role}</h2><p className="mt-0.5 flex items-center gap-1.5 text-[0.67rem] text-muted-foreground">{opportunity.organization}<span className="text-border">·</span><MapPin className="size-3" />Remote / Portland, OR</p></div></div><div className="rounded-[13px] border border-primary/15 bg-primary/[0.035] px-3.5 py-2.5 text-right"><p className="type-eyebrow text-[0.53rem] text-muted-foreground">Match</p><p className="mt-1 font-mono text-xl text-primary">{opportunity.match}%</p></div></div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-[13px] border border-success/12 bg-success/[0.025] p-3.5"><p className="mb-2.5 text-[0.63rem] font-medium text-foreground">Strengths to show</p><div className="flex flex-wrap gap-1.5">{opportunity.strengths.map((skill) => <span key={skill} className="inline-flex items-center gap-1.5 rounded-full border border-success/15 bg-success/[0.035] px-2.5 py-1 text-[0.61rem] text-success"><Check className="size-3" />{skill}</span>)}</div></div><div className="rounded-[13px] border border-warning/12 bg-warning/[0.025] p-3.5"><p className="mb-2.5 text-[0.63rem] font-medium text-foreground">Gaps to address</p><div className="flex flex-wrap gap-1.5">{opportunity.missingSkills.map((skill) => <span key={skill} className="inline-flex items-center gap-1.5 rounded-full border border-warning/15 bg-warning/[0.035] px-2.5 py-1 text-[0.61rem] text-warning"><TriangleAlert className="size-3" />{skill}</span>)}</div></div></div>
        <div className="mt-4 rounded-[13px] border border-border/70 bg-background/40 p-3.5"><p className="flex items-center gap-2 text-[0.65rem] font-medium text-foreground"><Sparkles className="size-3.5 text-primary" />Recommendation</p><p className="mt-1.5 text-[0.69rem] leading-5 text-muted-foreground">{opportunity.recommendation}</p></div>
        <div className="mt-4 flex flex-wrap items-center gap-2"><Button onClick={() => setPrepareOpen(true)} variant="outline" className="h-9 rounded-[11px] border-border text-[0.65rem]"><FileCheck2 className="size-3.5" />Prepare Application</Button><Button onClick={addTasks} className="h-9 rounded-[11px] text-[0.65rem]"><CalendarDays className="size-3.5" />Add Preparation Tasks</Button><Button asChild variant="ghost" className="h-9 rounded-[11px] px-2.5 text-[0.65rem] text-muted-foreground"><Link href="/skills">View Skill Gaps<ArrowRight className="size-3.5" /></Link></Button></div>
        {prepareOpen && <div className="mt-4 rounded-[13px] border border-primary/15 bg-primary/[0.035] p-3.5" role="status"><div className="flex items-center justify-between gap-3"><p className="text-[0.67rem] font-medium text-foreground">Application brief</p><button type="button" onClick={() => setPrepareOpen(false)} className="text-[0.6rem] text-muted-foreground underline underline-offset-2">Close</button></div><p className="mt-1.5 text-[0.63rem] leading-5 text-muted-foreground">Lead with your containerized API, link your Git history, and include one concrete cloud-IAM example. Add the two preparation tasks to schedule time for them.</p></div>}
      </CardContent>
    </Card>
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardContent className="flex h-full flex-col p-4 sm:p-5"><p className="type-eyebrow mb-2 text-muted-foreground">Application timeline</p><div className="flex items-center justify-between gap-3"><h2 className="type-section-title">Room to prepare</h2><span className="font-mono text-[0.64rem] text-warning">4 Oct</span></div><p className="mt-1 text-[0.65rem] text-muted-foreground">Closes {new Date(`${opportunity.closesAt}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric" })}</p><div className="mt-5 rounded-[14px] border border-warning/12 bg-warning/[0.025] p-3.5"><div className="flex items-center gap-2 text-[0.68rem] font-medium text-foreground"><CalendarDays className="size-3.5 text-warning" />Next application window</div><p className="mt-1.5 text-[0.64rem] leading-5 text-muted-foreground">Use the week to verify your AWS foundations and make your Docker project easy to run.</p></div><div className="mt-auto pt-5"><Button onClick={addTasks} variant="outline" className="h-9 w-full rounded-[11px] border-border text-[0.65rem]">Add preparation to weekly plan<ArrowUpRight className="size-3.5" /></Button><p className="mt-2 flex items-center gap-1.5 text-[0.59rem] text-muted-foreground"><Check className="size-3 text-success" />Demo opportunity · seeded role and match, not a live listing</p></div></CardContent></Card>
  </div>;
}
