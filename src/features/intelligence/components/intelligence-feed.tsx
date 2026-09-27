"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/components/workspace/workspace-controls";
import type { IntelligenceItem } from "@/lib/demo-data/types";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
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

function FeedArticle({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.article inert={!present} aria-hidden={!present} initial={{ opacity: 0, y: reduced ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={{ duration: reduced ? 0 : 0.2 }} className="min-w-0">{children}</motion.article>;
}

export function IntelligenceFeed() {
  const { state, addIntelligenceItemToPlan, setFeedStatus } = useDemo();
  const [view, setView] = useState<"discover" | "saved" | "planned">("discover");
  const [query, setQuery] = useState("");
  const visible = state.intelligenceItems.filter((item) => (view === "discover" ? ["new", "saved"].includes(item.status) : item.status === view) && `${item.title} ${item.source} ${item.whyRelevant}`.toLowerCase().includes(query.trim().toLowerCase()));
  const hide = (item: IntelligenceItem, status: "dismissed" | "not-relevant") => {
    setFeedStatus(item.id, status);
    toast("Item hidden", { action: { label: "Undo", onClick: () => setFeedStatus(item.id, item.status) } });
  };
  const addToPlan = (id: string, title: string) => {
    addIntelligenceItemToPlan(id);
    toast.success("Added to Wednesday, 7:00 PM", { description: title });
  };

  return <div>
    <div className="workspace-toolbar"><ViewSwitch label="Intelligence collection" value={view} onChange={setView} options={[{ value: "discover", label: "Discover" }, { value: "saved", label: "Saved", count: state.intelligenceItems.filter((item) => item.status === "saved").length }, { value: "planned", label: "In your plan", count: state.intelligenceItems.filter((item) => item.status === "planned").length }]} /><WorkspaceSearch value={query} onChange={setQuery} label="Search intelligence" /></div>
    {visible.length === 0 ? <EmptyCollection title={view === "saved" ? "Keep a little inspiration here" : view === "planned" ? "Make insight part of your week" : "You’re all caught up"} description={query ? "Nothing matches your search. Try a different phrase." : view === "saved" ? "Save interesting items from Discover to revisit them here." : view === "planned" ? "Add an item to your plan and it will stay easy to find here." : "Explore your saved items or the opportunity radar."} onReset={query ? () => setQuery("") : undefined} /> : <div className="grid gap-3 lg:grid-cols-2">
      <AnimatePresence initial={false}>
        {visible.map((item, index) => <FeedArticle key={item.id}>
          <Card className={`${index === 0 && view === "discover" ? "intelligence-featured" : ""} h-full rounded-[18px] border-border/80 bg-surface-raised py-0 shadow-none transition-colors hover:border-border`}>
            <CardContent className="flex h-full flex-col p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2"><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.6rem] font-medium ${kindTone[item.kind] ?? "border-border text-muted-foreground"}`}><Activity className="mr-1 size-3" />{item.kind}</Badge><span className="text-[0.61rem] text-muted-foreground">{item.source} · {new Date(`${item.publishedAt}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span></div>
              <h2 className="mt-4 font-heading text-[1.05rem] font-semibold leading-snug tracking-[-0.02em] text-foreground">{item.title}</h2>
              <div className="mt-3 rounded-[13px] border border-primary/10 bg-primary/[0.025] p-3"><p className="type-eyebrow mb-1.5 text-[0.55rem] text-primary">Why this matters to you</p><p className="text-[0.68rem] leading-5 text-foreground/80">{item.whyRelevant}</p></div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4"><span className="inline-flex items-center gap-1.5 text-[0.62rem] text-muted-foreground"><Clock3 className="size-3.5" />{item.durationMinutes} min read</span><div className="flex flex-wrap items-center gap-1.5">
                {item.status !== "planned" && <><Button onClick={() => { const status = item.status === "saved" ? "new" : "saved"; setFeedStatus(item.id, status); toast(status === "saved" ? "Saved for later" : "Removed from saved"); }} variant="ghost" size="sm" className={`h-8 rounded-[10px] px-2 text-[0.63rem] ${item.status === "saved" ? "text-primary" : "text-muted-foreground"}`} aria-label={item.status === "saved" ? `Unsave ${item.title}` : `Save ${item.title}`}><Bookmark className="size-3.5" />{item.status === "saved" ? "Saved" : "Save"}</Button>
                <Button onClick={() => hide(item, "not-relevant")} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Mark ${item.title} as not relevant`}><EyeOff className="size-3.5" /></Button>
                <Button onClick={() => hide(item, "dismissed")} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Dismiss ${item.title}`}><X className="size-3.5" /></Button>
                </>}
                {item.status === "planned" ? <Button asChild variant="outline" className="h-11 rounded-xl text-xs"><Link href="/planner">Open in Planner</Link></Button> : <Button onClick={() => addToPlan(item.id, item.title)} size="sm" className="h-8 rounded-[10px] px-2.5 text-[0.62rem]"><Plus className="size-3.5" />Add to Plan</Button>}
              </div></div>
              <p className="mt-2.5 border-t border-border/60 pt-2.5 text-[0.59rem] text-muted-foreground">Relevance demo · based on your DevOps pathway and active plan</p>
            </CardContent>
          </Card>
        </FeedArticle>)}
      </AnimatePresence>
    </div>}
  </div>;
}
