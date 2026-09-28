"use client";

import { BadgeCheck, Database, ShieldCheck, Sparkles } from "lucide-react";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { LearningRecords } from "@/features/learning/components/learning-records";
import { EvidencePassport } from "@/features/evidence/components/evidence-passport";
import { useDemo } from "@/lib/state/demo-provider";

export default function EvidencePage() {
  const { state } = useDemo();
  const verified = state.evidence.filter((item) => item.status === "verified").length;
  return <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-success"><ShieldCheck className="size-3.5" />Evidence passport</p><TypographyH1>Show the work behind your skills</TypographyH1><TypographyP className="mt-2">Skills gain credibility when projects, assessments, and mentors can support the claim.</TypographyP></div><div className="flex gap-2"><span className="rounded-[12px] border border-success/15 bg-success/[0.03] px-3 py-2 text-[0.64rem] text-success"><BadgeCheck className="mr-1.5 inline size-3.5" />{verified} verified</span><span className="rounded-[12px] border border-border bg-white/[0.02] px-3 py-2 text-[0.64rem] text-muted-foreground"><Database className="mr-1.5 inline size-3.5" />{state.evidence.length} items</span></div></div></Reveal>
    <div className="mb-4 flex items-start gap-3 rounded-[15px] border border-border/75 bg-white/[0.02] p-3.5"><span className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-success/15 bg-success/[0.035] text-success"><Sparkles className="size-4" /></span><p className="text-[0.68rem] leading-5 text-foreground/80"><span className="font-medium text-foreground">Keep your progress explainable.</span> Knowledge checks establish local skill verification. Project links and external certificates remain learner-reported.</p></div>
    <EvidencePassport />
    <LearningRecords />
    <p className="mt-3 text-[0.6rem] text-muted-foreground">Verification in this deterministic demo is a local interaction, not an institutional credential check.</p>
  </div>;
}
