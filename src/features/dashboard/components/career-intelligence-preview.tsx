"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { toast } from "sonner";
import { ArrowRight, Bookmark, BriefcaseBusiness, CalendarPlus, Check, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { AnimatedCard, MotionButton, StaggerContainer } from "@/components/motion/animated";
import type { DailyFeedItem } from "@/features/intelligence/domain/daily-feed";
import { addFeedItemToPlan, feedInteraction, loadDailyFeed } from "@/features/intelligence/services/intelligence";
import { useDemo } from "@/state/demo-provider";

export function CareerIntelligencePreview() {
  const { state, addTask, addOpportunityPreparation } = useDemo();
  const reduced = useReducedMotion();
  const [item, setItem] = useState<DailyFeedItem | null>(null);
  const [feedMessage, setFeedMessage] = useState("Loading today’s trusted updates…");
  const [busy, setBusy] = useState(false);
  const opportunity = state.opportunities[0];
  const prepared = state.tasks.some((task) => task.id === "prep-aws-internship");

  const load = useCallback(async () => {
    if (!state.student.id) return;
    try {
      const response = await loadDailyFeed(state.student.id, "today");
      setItem(response.items[0] ?? null);
      setFeedMessage(response.message);
    } catch {
      setItem(null);
      setFeedMessage("Daily intelligence is unavailable. Open the feed to retry; no update is substituted.");
    }
  }, [state.student.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!item || !state.student.id) return;
    setBusy(true);
    try {
      const action = item.interaction_state === "saved" ? "unsave" : "save";
      await feedInteraction(state.student.id, item.article_id, action);
      toast.success(action === "save" ? "Saved for later" : "Removed from saved");
      await load();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : "Could not update this feed item."); }
    finally { setBusy(false); }
  };

  const addToPlan = async () => {
    if (!item || !state.student.id || item.interaction_state === "planned") return;
    setBusy(true);
    try {
      const handoff = await addFeedItemToPlan(state.student.id, item.article_id, {
        idempotency_key: `daily-feed-${item.article_id}`,
        existing_blocks: state.planBlocks.map((block) => ({ id: block.id, start_at: block.startAt, end_at: block.endAt })),
      });
      const alreadyLocal = state.tasks.some((task) => task.url === handoff.source_url && task.title === handoff.title);
      if (!alreadyLocal) addTask({ title: handoff.title, category: handoff.category, estimatedMinutes: handoff.duration_minutes, startAt: handoff.start_at, description: handoff.description, source: handoff.source, url: handoff.source_url });
      toast.success(handoff.idempotent ? "Already approved for your plan" : "Added to your plan");
      await load();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : "Could not add this update to Planner."); }
    finally { setBusy(false); }
  };

  const prepare = () => {
    if (prepared) return;
    addOpportunityPreparation();
    toast.success("Preparation added to your plan");
  };

  return <section aria-label="Career Intelligence" className="space-y-3">
    <div className="flex items-center justify-between gap-3"><div><p className="type-eyebrow mb-1 text-pathway">Pathway signals</p><h2 className="type-section-title">Career Intelligence</h2></div><Link href="/intelligence" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">Explore all <ArrowRight className="size-3" aria-hidden="true" /></Link></div>
    <StaggerContainer className="grid gap-3 md:grid-cols-2">
      <AnimatedCard as="article" staggered className="min-w-0">
        {item ? <Card className={`flex h-full gap-0 rounded-2xl bg-surface-raised py-0 shadow-none transition-colors ${item.interaction_state === "planned" ? "border-primary/35" : "border-border/85"}`}>
          <div className="flex items-center justify-between gap-2"><p className="type-eyebrow text-pathway">{item.category_label}</p><span className="inline-flex items-center gap-1 text-[0.62rem] text-muted-foreground"><ShieldCheck className="size-3 text-success" />{item.source.name}</span></div>
          <h3 className="mt-2 text-sm font-semibold leading-snug text-foreground">{item.title}</h3>
          <p className="mt-2 line-clamp-2 text-[0.68rem] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Why this matters: </span>{item.why_this_matters}</p>
          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <MotionButton size="sm" variant="outline" className="h-8 rounded-[10px] px-2.5 text-[0.67rem]" disabled={busy || item.interaction_state === "planned"} onClick={() => void save()}><Bookmark className="size-3.5" aria-hidden="true" />{item.interaction_state === "saved" ? "Saved" : "Save"}</MotionButton>
            <MotionButton size="sm" className="h-8 rounded-[10px] px-2.5 text-[0.67rem]" disabled={busy || item.interaction_state === "planned"} onClick={() => void addToPlan()}><AnimatePresence mode="wait" initial={false}><motion.span key={item.interaction_state === "planned" ? "planned" : "add"} initial={{ opacity: 0, y: reduced ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -5 }} transition={{ duration: reduced ? 0.01 : 0.2 }} className="inline-flex items-center gap-1.5">{item.interaction_state === "planned" ? <Check className="size-3.5" aria-hidden="true" /> : <CalendarPlus className="size-3.5" aria-hidden="true" />}{item.interaction_state === "planned" ? "Added to Plan" : "Add to Plan"}</motion.span></AnimatePresence></MotionButton>
          </div>
        </Card> : <Card className="flex h-full min-h-40 flex-col justify-center rounded-2xl border-border/85 bg-surface-raised py-0 shadow-none"><p className="type-eyebrow text-pathway">Daily intelligence</p><p className="mt-2 text-sm leading-6 text-muted-foreground">{feedMessage}</p><Link href="/intelligence" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">Open feed <ArrowRight className="size-3" /></Link></Card>}
      </AnimatedCard>
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
