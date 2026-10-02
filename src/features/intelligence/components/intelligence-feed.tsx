"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { Activity, AlertTriangle, Bookmark, Clock3, ExternalLink, EyeOff, Flag, Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { EmptyCollection, ViewSwitch, WorkspaceSearch } from "@/features/workspace/components/workspace-controls";
import type { DailyFeedItem, DailyFeedResponse, FeedView } from "@/features/intelligence/domain/daily-feed";
import { addFeedItemToPlan, feedInteraction, loadDailyFeed } from "@/features/intelligence/services/intelligence";
import { useDemo } from "@/state/demo-provider";

const kindTone: Record<string, string> = {
  learning_article: "border-primary/15 bg-primary/[0.045] text-primary",
  security_update: "border-warning/15 bg-warning/[0.045] text-warning",
  industry_news: "border-success/15 bg-success/[0.045] text-success",
  official_release: "border-pathway/15 bg-pathway/[0.045] text-pathway",
  certification_change: "border-primary/15 bg-primary/[0.045] text-primary",
};

function FeedArticle({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  const reduced = useReducedMotion();
  return <motion.article inert={!present} aria-hidden={!present} initial={{ opacity: 0, y: reduced ? 0 : 7 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: reduced ? 1 : 0.98 }} transition={{ duration: reduced ? 0 : 0.2 }} className="min-w-0">{children}</motion.article>;
}

function FeedStateCard({ response, retry }: { response: DailyFeedResponse; retry: () => void }) {
  const noPathway = response.state === "no_pathway";
  const failed = response.state === "ingestion_failure";
  return <Card className={`rounded-[18px] border-border/80 bg-surface-raised shadow-none ${failed ? "border-warning/25" : ""}`}>
    <CardContent className="flex flex-col items-start gap-3 p-5 sm:p-6">
      <div className={`grid size-10 place-items-center rounded-[13px] ${failed ? "bg-warning/[0.08] text-warning" : "bg-primary/[0.07] text-primary"}`}>
        {failed ? <AlertTriangle className="size-5" /> : <Activity className="size-5" />}
      </div>
      <div><h2 className="font-heading text-lg font-semibold">{noPathway ? "Your pathway comes first" : failed ? "Trusted-source refresh is unavailable" : "No fresh trusted updates today"}</h2><p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{response.message}</p></div>
      <div className="flex flex-wrap gap-2">{noPathway ? <Button asChild className="h-9 rounded-xl text-xs"><Link href="/career-path">Open Career Path</Link></Button> : <Button variant="outline" className="h-9 rounded-xl text-xs" onClick={retry}><RefreshCw className="size-3.5" />Try again</Button>}</div>
      <p className="text-[0.61rem] leading-5 text-muted-foreground">{response.freshness_policy}</p>
    </CardContent>
  </Card>;
}

export function IntelligenceFeed() {
  const { state, addTask } = useDemo();
  const [view, setView] = useState<FeedView>("today");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<DailyFeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reportItem, setReportItem] = useState<DailyFeedItem | null>(null);
  const [reportReason, setReportReason] = useState("");

  const load = useCallback(async () => {
    if (!state.student.id) return;
    setLoading(true); setError("");
    try { setResponse(await loadDailyFeed(state.student.id, view)); }
    catch (problem) { setError(problem instanceof Error ? problem.message : "Daily intelligence could not be loaded."); }
    finally { setLoading(false); }
  }, [state.student.id, view]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const items = response?.items ?? [];
    if (!needle) return items;
    return items.filter((item) => `${item.title} ${item.source.name} ${item.why_this_matters} ${item.topics.join(" ")} ${item.skills.join(" ")}`.toLowerCase().includes(needle));
  }, [query, response?.items]);

  async function interact(item: DailyFeedItem, action: "save" | "unsave" | "dismiss" | "report", reason = "") {
    if (!state.student.id) return;
    setBusyId(item.article_id);
    try {
      const result = await feedInteraction(state.student.id, item.article_id, action, reason);
      toast.success(result.message);
      if (action === "report") { setReportItem(null); setReportReason(""); }
      await load();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : "The feed action failed."); }
    finally { setBusyId(null); }
  }

  async function addToPlan(item: DailyFeedItem) {
    if (!state.student.id) return;
    setBusyId(item.article_id);
    try {
      const handoff = await addFeedItemToPlan(state.student.id, item.article_id, {
        idempotency_key: `daily-feed-${item.article_id}`,
        existing_blocks: state.planBlocks.map((block) => ({ id: block.id, start_at: block.startAt, end_at: block.endAt })),
      });
      const alreadyLocal = state.tasks.some((task) => task.url === handoff.source_url && task.title === handoff.title);
      if (!alreadyLocal) addTask({ title: handoff.title, category: handoff.category, estimatedMinutes: handoff.duration_minutes, startAt: handoff.start_at, description: handoff.description, source: handoff.source, url: handoff.source_url });
      toast.success(handoff.idempotent ? "This update is already approved for your plan." : "Added to your plan.", { description: new Date(handoff.start_at).toLocaleString() });
      await load();
    } catch (problem) { toast.error(problem instanceof Error ? problem.message : "The planner handoff failed."); }
    finally { setBusyId(null); }
  }

  return <div>
    <div className="workspace-toolbar"><ViewSwitch label="Daily intelligence collection" value={view} onChange={(value) => setView(value as FeedView)} options={[{ value: "today", label: "Today" }, { value: "saved", label: "Saved" }, { value: "planned", label: "In your plan" }]} /><WorkspaceSearch value={query} onChange={setQuery} label="Search daily intelligence" /></div>

    {response?.ingestion.state === "degraded" && response.items.length > 0 && <div className="mb-3 flex items-start gap-2 rounded-[13px] border border-warning/20 bg-warning/[0.035] px-3.5 py-3 text-[0.65rem] leading-5 text-muted-foreground" role="status"><AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" /><span>{response.ingestion.message} Fresh approved items remain visible; failed sources are not substituted with stale content.</span></div>}

    {error && <Card className="mb-3 rounded-[18px] border-destructive/25 bg-destructive/[0.035] shadow-none"><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-destructive" role="alert">{error}</p><Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw className="size-3.5" />Retry</Button></CardContent></Card>}

    {loading ? <div className="grid gap-3 lg:grid-cols-2" aria-label="Loading daily intelligence" role="status">{[0, 1, 2, 3].map((item) => <div key={item} className="h-64 animate-pulse rounded-[18px] border border-border/70 bg-surface-raised motion-reduce:animate-none" />)}</div>
      : response && view === "today" && response.state !== "ready" ? <FeedStateCard response={response} retry={() => void load()} />
      : visible.length === 0 ? <EmptyCollection title={query ? "No matching updates" : view === "saved" ? "Nothing saved yet" : view === "planned" ? "No feed items in your plan" : "You’re all caught up"} description={query ? "Try a different search phrase." : view === "saved" ? "Save a trusted update from Today and it will stay easy to revisit here while the source remains approved." : view === "planned" ? "Approve an update for your Planner and it will appear here." : response?.message ?? "No fresh trusted updates are available."} onReset={query ? () => setQuery("") : undefined} />
      : <div className="grid gap-3 lg:grid-cols-2"><AnimatePresence initial={false}>{visible.map((item, index) => <FeedArticle key={item.article_id}>
        <Card className={`${index === 0 && view === "today" ? "intelligence-featured" : ""} h-full rounded-[18px] border-border/80 bg-surface-raised py-0 shadow-none transition-colors hover:border-border`}>
          <CardContent className="flex h-full flex-col p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-2"><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.6rem] font-medium ${kindTone[item.category] ?? "border-border text-muted-foreground"}`}><Activity className="mr-1 size-3" />{item.category_label}</Badge><span className="text-right text-[0.61rem] leading-5 text-muted-foreground"><span className="inline-flex items-center gap-1"><ShieldCheck className="size-3 text-success" />{item.source.name} · {item.source.trust_score}/100</span><br />Published {new Date(item.published_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span></div>
            <h2 className="mt-4 font-heading text-[1.05rem] font-semibold leading-snug tracking-[-0.02em] text-foreground">{item.title}</h2>
            {item.excerpt && <p className="mt-2 line-clamp-3 text-[0.67rem] leading-5 text-muted-foreground">{item.excerpt}</p>}
            <div className="mt-3 rounded-[13px] border border-primary/10 bg-primary/[0.025] p-3"><p className="type-eyebrow mb-1.5 text-[0.55rem] text-primary">Why this matters to you</p><p className="text-[0.68rem] leading-5 text-foreground/80">{item.why_this_matters}</p></div>
            <div className="mt-3 flex flex-wrap gap-1.5">{item.skills.slice(0, 3).map((skill) => <Badge key={skill} variant="secondary" className="rounded-full text-[0.56rem] font-normal">{skill}</Badge>)}<Badge variant="secondary" className="rounded-full text-[0.56rem] font-normal">{item.difficulty}</Badge><Badge variant="secondary" className="rounded-full text-[0.56rem] font-normal">{Math.round(item.relevance_score)}% relevance</Badge></div>
            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4"><span className="inline-flex items-center gap-1.5 text-[0.62rem] text-muted-foreground"><Clock3 className="size-3.5" />{item.reading_minutes} min · fresh until {new Date(item.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span><div className="flex flex-wrap items-center gap-1.5">
              <Button asChild variant="ghost" size="sm" className="h-8 rounded-[10px] px-2 text-[0.63rem] text-muted-foreground"><a href={item.canonical_url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" />Source</a></Button>
              {item.interaction_state !== "planned" && <><Button disabled={busyId === item.article_id} onClick={() => void interact(item, item.interaction_state === "saved" ? "unsave" : "save")} variant="ghost" size="sm" className={`h-8 rounded-[10px] px-2 text-[0.63rem] ${item.interaction_state === "saved" ? "text-primary" : "text-muted-foreground"}`} aria-label={item.interaction_state === "saved" ? `Unsave ${item.title}` : `Save ${item.title}`}><Bookmark className="size-3.5" />{item.interaction_state === "saved" ? "Saved" : "Save"}</Button><Button disabled={busyId === item.article_id} onClick={() => void interact(item, "dismiss")} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Dismiss ${item.title}`}><EyeOff className="size-3.5" /></Button></>}
              <Button disabled={busyId === item.article_id} onClick={() => { setReportItem(item); setReportReason(""); }} variant="ghost" size="icon-sm" className="size-8 text-muted-foreground" aria-label={`Report ${item.title}`}><Flag className="size-3.5" /></Button>
              {item.interaction_state === "planned" ? <Button asChild variant="outline" className="h-8 rounded-[10px] px-2.5 text-[0.62rem]"><Link href="/planner">Open Planner</Link></Button> : <Button disabled={busyId === item.article_id} onClick={() => void addToPlan(item)} size="sm" className="h-8 rounded-[10px] px-2.5 text-[0.62rem]"><Plus className="size-3.5" />Add to Plan</Button>}
            </div></div>
            <p className="mt-2.5 border-t border-border/60 pt-2.5 text-[0.59rem] leading-5 text-muted-foreground">Ranked with {item.ranking_version} · explanation {item.explanation_version}. LumaPath stores permitted metadata/excerpts only and opens the publisher source for the full item.</p>
          </CardContent>
        </Card>
      </FeedArticle>)}</AnimatePresence></div>}

    <Dialog open={Boolean(reportItem)} onOpenChange={(open) => { if (!open) { setReportItem(null); setReportReason(""); } }}><DialogContent><DialogHeader><DialogTitle>Report this update</DialogTitle><DialogDescription>Reported content is removed from student feeds and quarantined for review. Tell reviewers what appears incorrect, unsafe, stale, or misleading.</DialogDescription></DialogHeader><Textarea value={reportReason} onChange={(event) => setReportReason(event.target.value)} placeholder="Short reason" aria-label="Report reason" maxLength={600} /><DialogFooter><Button variant="outline" onClick={() => { setReportItem(null); setReportReason(""); }}>Cancel</Button><Button variant="destructive" disabled={!reportItem || reportReason.trim().length < 3 || busyId === reportItem?.article_id} onClick={() => reportItem && void interact(reportItem, "report", reportReason)}><Flag className="size-3.5" />Report and quarantine</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
