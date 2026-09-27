"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Activity, Bookmark, Clock3, EyeOff, Plus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDemo } from "@/lib/state/demo-provider";
import { toast } from "sonner";

const kindTone: Record<string, string> = {
  "Learning article": "border-primary/15 bg-primary/[0.045] text-primary",
  "Security advisory": "border-warning/15 bg-warning/[0.045] text-warning",
  Internship: "border-success/15 bg-success/[0.045] text-success",
  "Tool release": "border-pathway/15 bg-pathway/[0.045] text-pathway",
};

export function IntelligenceFeed() {
  const { state, addIntelligenceItemToPlan, setFeedStatus } = useDemo();
  const reduceMotion = useReducedMotion();
  const visible = state.intelligenceItems.filter((item) => item.status !== "dismissed" && item.status !== "not-relevant" && item.status !== "planned");
  const addToPlan = (id: string, title: string) => {
    addIntelligenceItemToPlan(id);
    toast.success("Added to Wednesday, 7:00 PM", { description: title });
  };

  return <div>
    {visible.length === 0 ? <Card className="rounded-[20px] border-border/80 bg-surface-raised"><CardContent className="px-6 py-12 text-center"><p className="text-sm font-medium text-foreground">Your feed is clear</p><p className="mt-1 text-xs text-muted-foreground">New items that connect to your pathway will appear here.</p></CardContent></Card> : <div className="grid gap-3 lg:grid-cols-2">
      <AnimatePresence initial={false} mode="popLayout">
        {visible.map((item, index) => <motion.article key={item.id} layout initial={{ opacity: 0, y: reduceMotion ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduceMotion ? 1 : 0.97 }} transition={{ duration: reduceMotion ? 0.12 : 0.23, delay: reduceMotion ? 0 : index * 0.045 }} className="min-w-0">
          <Card className="h-full rounded-[18px] border-border/80 bg-surface-raised py-0 shadow-none transition-colors hover:border-border">
            <CardContent className="flex h-full flex-col p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.6rem] font-medium ${kindTone[item.kind] ?? "border-border text-muted-foreground"}`}><Activity className="mr-1 size-3" />{item.kind}</Badge><span className="text-[0.61rem] text-muted-foreground">{item.source} · {new Date(`${item.publishedAt}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
              <h2 className="mt-4 font-heading text-[1.05rem] font-semibold leading-snug tracking-[-0.02em] text-foreground">{item.title}</h2>
              <div className="mt-3 rounded-[13px] border border-primary/10 bg-primary/[0.025] p-3"><p className="type-eyebrow mb-1.5 text-[0.55rem] text-primary">Why this matters to you</p><p className="text-[0.68rem] leading-5 text-foreground/80">{item.whyRelevant}</p></div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4"><span className="inline-flex items-center gap-1.5 text-[0.62rem] text-muted-foreground"><Clock3 className="size-3.5" />{item.durationMinutes} min read</span><div className="flex flex-wrap items-center gap-1.5">
                <Button onClick={() => { const status = item.status === "saved" ? "new" : "saved"; setFeedStatus(item.id, status); toast(status === "saved" ? "Saved for later" : "Removed from saved"); }} variant="ghost" size="sm" className={`h-8 rounded-[10px] px-2 text-[0.63rem] ${item.status === "saved" ? "text-primary" : "text-muted-foreground"}`} aria-label={item.status === "saved" ? `Unsave ${item.title}` : `Save ${item.title}`}><Bookmark className="size-3.5" />{item.status === "saved" ? "Saved" : "Save"}</Button>
                <Button onClick={() => setFeedStatus(item.id, "not-relevant")} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Mark ${item.title} as not relevant`}><EyeOff className="size-3.5" /></Button>
                <Button onClick={() => setFeedStatus(item.id, "dismissed")} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Dismiss ${item.title}`}><X className="size-3.5" /></Button>
                <Button onClick={() => addToPlan(item.id, item.title)} disabled={item.status === "planned"} size="sm" className="h-8 rounded-[10px] px-2.5 text-[0.62rem]"><Plus className="size-3.5" />Add to Plan</Button>
              </div></div>
              <p className="mt-2.5 border-t border-border/60 pt-2.5 text-[0.59rem] text-muted-foreground">Relevance demo · based on your DevOps pathway and active plan</p>
            </CardContent>
          </Card>
        </motion.article>)}
      </AnimatePresence>
    </div>}
  </div>;
}
