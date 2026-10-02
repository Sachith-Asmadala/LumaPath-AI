"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Clock3, Sparkles, TriangleAlert } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDemo } from "@/state/demo-provider";
import { stateScenarioDate } from "@/data/demo/scenario";
import { riskLevel } from "@/features/planner/domain/priority";
import { availableCapacity, selectTodayTimeline } from "@/features/dashboard/domain/dashboard";

function destination(startAt: string, today: string) {
  const time = startAt.slice(11, 16);
  if (startAt.startsWith(today)) return `Today ${time}`;
  const day = new Date(`${startAt.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
  return `${day} ${time}`;
}

export function AdaptiveDayPlan() {
  const { state, moveCompetitionDeadline } = useDemo();
  const reduced = useReducedMotion();
  const today = stateScenarioDate(state);
  const events = selectTodayTimeline(state, today);
  const available = availableCapacity(state.capacity);
  const hasConflict = events.some((event) => event.isConflict);
  const optimizing = hasConflict && state.simulation.kind === "replan" && state.simulation.step !== "Evaluating open tasks…";
  const previousStarts = useRef<Record<string, string> | null>(null);
  const clearMoveTimer = useRef<number | undefined>(undefined);
  const [recentMoves, setRecentMoves] = useState<string[]>([]);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const starts = Object.fromEntries(state.planBlocks.map((block) => [block.id, block.startAt]));
    const moved = previousStarts.current
      ? state.planBlocks.filter((block) => previousStarts.current?.[block.id] && previousStarts.current[block.id] !== block.startAt).map((block) => block.id)
      : [];
    previousStarts.current = starts;
    if (!moved.length) return;
    window.clearTimeout(clearMoveTimer.current);
    setRecentMoves(moved);
    clearMoveTimer.current = window.setTimeout(() => setRecentMoves([]), reduced ? 250 : 1700);
  }, [state.planBlocks, reduced]);

  useEffect(() => () => window.clearTimeout(clearMoveTimer.current), []);

  const scenarioIsToday = now && `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}` === today;

  return <Card className="h-full rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
    <CardHeader className="flex flex-wrap flex-row items-start justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
      <div><p className="type-eyebrow mb-2 text-muted-foreground">Your time → your priorities</p><CardTitle className="type-section-title">Adaptive Day Plan</CardTitle></div>
      <span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="size-3" aria-hidden="true" />{Math.floor(available / 60)}h {available % 60 || ""}{available % 60 ? "m" : ""} open</span>
    </CardHeader>
    <CardContent className="px-4 pb-4 sm:px-5 sm:pb-5">
      {state.competition && <div className="mb-3">{state.competition.deadlineChanged ? <section aria-label="Plan adaptation summary" className="rounded-xl border border-success/20 bg-success/[0.04] p-3"><p className="mb-2 text-[0.65rem] font-semibold tracking-wide text-success">PLAN ADAPTED</p>{state.planBlocks.filter(block=>block.adaptationReason&&block.previousStartAt).sort((a,b)=>a.startAt.localeCompare(b.startAt)).map(block=><div key={block.id} className="mt-2"><p className="text-xs font-medium">{block.title}</p><p className="mt-1 text-xs text-primary">{new Date(block.previousStartAt!).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"Asia/Colombo"})} → {new Date(block.startAt).toLocaleDateString("en-US",{month:"short",day:"numeric",timeZone:"Asia/Colombo"})}</p><p className="mt-1 text-[0.62rem] leading-4 text-muted-foreground">{block.adaptationReason}</p></div>)}</section> : <div className="rounded-xl border border-border bg-background/50 p-3"><p className="mb-2 text-xs leading-5 text-muted-foreground">What if the assignment deadline moves earlier?</p><Button size="sm" variant="outline" className="h-auto whitespace-normal rounded-lg py-2 text-xs" disabled={state.simulation.kind!==null} onClick={()=>void moveCompetitionDeadline()}>Move assignment deadline: Oct 7 → Oct 5</Button></div>}</div>}

      <AnimatePresence mode="wait" initial={false}>{hasConflict && <motion.div key={optimizing ? "optimizing" : "conflict"} role="status" initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.01 : 0.18 }} className={`mb-3 flex items-center gap-2 rounded-xl border px-3 py-2 text-[0.68rem] ${optimizing ? "border-primary/25 bg-primary/[0.06] text-primary" : "border-warning/30 bg-warning/[0.07] text-warning"}`}>
        {optimizing ? <Sparkles className="size-3.5 shrink-0" aria-hidden="true" /> : <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />}
        {optimizing ? "Optimizing schedule to protect the urgent deadline…" : "Schedule conflict · urgent deadline needs this slot"}
      </motion.div>}</AnimatePresence>
      <ol className="relative ml-1 space-y-1 border-l border-border pl-3" aria-label="Today's schedule">
        <AnimatePresence initial={false} mode="popLayout">
          {(state.competition?.deadlineChanged ? events.filter(event=>!event.adaptationReason) : events).map((event) => {
            const task = state.tasks.find((item) => item.id === event.taskId);
            const moved = Boolean(event.previousStartAt && event.previousStartAt !== event.startAt);
            const rescheduled = !event.startAt.startsWith(today);
            const current = Boolean(scenarioIsToday && now && !rescheduled && new Date(event.startAt) <= now && now < new Date(event.endAt));
            const past = task?.status === "completed" || Boolean(scenarioIsToday && now && new Date(event.endAt) <= now);
            const duration = Math.round((new Date(event.endAt).getTime() - new Date(event.startAt).getTime()) / 60_000);
            const risk = task?.status !== "completed" && task && task.riskScore >= 70 ? `${riskLevel(task.riskScore)} risk` : null;
            const urgentResolved = event.id === "urgent-database-block" && !event.isConflict;

            return <motion.li key={event.id} initial={{ opacity: 0, y: reduced ? 0 : 8 }} animate={{ opacity: past ? 0.55 : 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.01 : 0.28 }} className={`relative rounded-xl transition-colors duration-700 motion-reduce:transition-none ${recentMoves.includes(event.id) ? "bg-primary/[0.12]" : current ? "bg-primary/[0.04]" : ""}`}>
              <span className={`absolute -left-[1.05rem] top-4 size-2 rounded-full border border-surface-raised ${event.isConflict ? "bg-warning" : current ? "bg-primary" : past ? "bg-muted-foreground/30" : "bg-muted-foreground/50"}`} aria-hidden="true" />
              <AnimatePresence initial={false} mode="wait"><motion.div key={`${event.startAt}-${event.title}-${event.isConflict}`} initial={{ opacity: 0, y: reduced ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.01 : 0.2, delay: reduced ? 0 : urgentResolved ? 0.22 : 0 }} className="flex min-w-0 gap-2.5 p-2.5 sm:gap-3">
                <time dateTime={event.startAt} className="w-11 shrink-0 pt-0.5 font-mono text-[0.65rem] tabular-nums text-muted-foreground sm:w-12">{event.startAt.slice(11, 16)}</time>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-foreground">{event.title}{task?.status === "completed" && <Check className="ml-2 inline size-3 text-success" aria-label="Completed" />}</p>
                  <p className="mt-1 text-[0.62rem] text-muted-foreground">{duration} min · {risk ? <span className="font-semibold uppercase text-warning">{risk}</span> : event.isFocusBlock ? "Protected focus" : event.category}</p>
                  {event.isConflict && <p className="mt-1 text-[0.62rem] font-medium text-warning">Conflicts with the current plan</p>}
                  {moved && <p className="mt-1 text-[0.62rem] font-medium text-pathway">Moved to {destination(event.startAt, today)}</p>}
                </div>
              </motion.div></AnimatePresence>
            </motion.li>;
          })}
        </AnimatePresence>
      </ol>
    </CardContent>
  </Card>;
}
