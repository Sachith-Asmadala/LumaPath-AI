"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, Bookmark, BriefcaseBusiness, CalendarPlus, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCard, MotionButton, StaggerContainer } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";

export function CareerIntelligencePreview() {
  const { state, addIntelligenceItemToPlan, setFeedStatus, addOpportunityPreparation } = useDemo();
  const reduced = useReducedMotion();
  const dockerVerified = state.careerSkills.some((skill) => skill.id === "docker" && skill.status === "verified");
  const preferred = dockerVerified ? "container-release" : "kubernetes-fundamentals";
  const item = state.intelligenceItems.find((candidate) => candidate.id === preferred && !["dismissed", "not-relevant"].includes(candidate.status))
    ?? state.intelligenceItems.find((candidate) => !["dismissed", "not-relevant"].includes(candidate.status));
  const opportunity = state.opportunities[0];
  const prepared = state.tasks.some((task) => task.id === "prep-aws-internship");

  const save = () => {
    if (!item) return;
    const next = item.status === "saved" ? "new" : "saved";
    setFeedStatus(item.id, next);
    toast(next === "saved" ? "Saved for later" : "Removed from saved");
  };
  const addToPlan = () => {
    if (!item || item.status === "planned") return;
    addIntelligenceItemToPlan(item.id);
    toast.success("Added to Wednesday, 7:00 PM", { description: item.title });
  };
  const prepare = () => {
    if (prepared) return;
    addOpportunityPreparation();
    toast.success("Preparation added to your plan");
  };

  return <section aria-label="Career Intelligence" className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><p className="type-eyebrow mb-1 text-pathway">Pathway signals</p><h2 className="type-section-title">Career Intelligence</h2></div><Link href="/intelligence" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">Explore all <ArrowRight className="size-3" aria-hidden="true" /></Link></div>
    <StaggerContainer className="grid gap-3 md:grid-cols-2">
      {item && <AnimatedCard as="article" staggered className="min-w-0">
        <Card className={`flex h-full gap-0 rounded-2xl bg-surface-raised py-0 shadow-none transition-colors ${item.status === "planned" ? "border-primary/35" : "border-border/85"}`}>
          <div className="flex items-center justify-between gap-2"><p className="type-eyebrow text-pathway">{item.kind === "Learning article" ? "Learning Update" : item.kind}</p><span className="text-[0.62rem] text-muted-foreground">{item.durationMinutes} min</span></div>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.title}</h3>
          <p className="mt-2 line-clamp-2 text-[0.68rem] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Why this matters: </span>{item.whyRelevant}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <MotionButton size="sm" variant="outline" className="h-8 rounded-[10px] px-2.5 text-[0.67rem]" disabled={item.status === "planned"} onClick={save}><Bookmark className="size-3.5" aria-hidden="true" />{item.status === "saved" ? "Saved" : "Save"}</MotionButton>
            <MotionButton size="sm" className="h-8 rounded-[10px] px-2.5 text-[0.67rem]" disabled={item.status === "planned"} onClick={addToPlan}><AnimatePresence mode="wait" initial={false}><motion.span key={item.status === "planned" ? "planned" : "add"} initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0.01 : 0.2 }} className="inline-flex items-center gap-1.5">{item.status === "planned" ? <Check className="size-3.5" aria-hidden="true" /> : <CalendarPlus className="size-3.5" aria-hidden="true" />}{item.status === "planned" ? "Added to Plan" : "Add to Plan"}</motion.span></AnimatePresence></MotionButton>
          </div>
        </Card>
      </AnimatedCard>}
      {opportunity && <AnimatedCard as="article" staggered className="min-w-0">
        <Card className="flex h-full gap-0 rounded-2xl border-border/85 bg-surface-raised py-0 shadow-none">
          <div className="flex items-center justify-between gap-2"><p className="type-eyebrow flex items-center gap-1.5 text-pathway"><BriefcaseBusiness className="size-3" aria-hidden="true" />Opportunity</p><span className="rounded-full border border-success/20 bg-success/[0.06] px-2 py-1 text-[0.65rem] font-semibold text-success">{opportunity.match}% Match</span></div>
          <h3 className="mt-2 text-sm font-semibold text-foreground">{opportunity.role}</h3>
          <p className="mt-1 text-[0.67rem] text-muted-foreground">{opportunity.organization} · Closes {new Date(`${opportunity.closesAt}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</p>
          <div className="mt-2 space-y-1 text-[0.65rem]"><p><span className="font-medium text-success">Strengths:</span> <span className="text-foreground/80">{opportunity.strengths.join(" · ")}</span></p><p><span className="font-medium text-warning">Missing:</span> <span className="text-foreground/80">{opportunity.missingSkills.join(" · ")}</span></p></div>
          <div className="mt-auto pt-3"><MotionButton size="sm" variant="outline" className="h-8 w-fit rounded-[10px] px-2.5 text-[0.67rem]" disabled={prepared} onClick={prepare}>{prepared ? <Check className="size-3.5" aria-hidden="true" /> : null}{prepared ? "Preparation planned" : "Prepare"}</MotionButton></div>
        </Card>
      </AnimatedCard>}
    </StaggerContainer>
  </section>;
}
