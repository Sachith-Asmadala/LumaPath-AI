"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles } from "lucide-react";
import { useDemo } from "@/lib/state/demo-provider";
import { capacityStages } from "@/lib/domain/dashboard";

/** Shared, non-blocking feedback for decisions made anywhere in the demo workspace. */
export function DecisionPulse({ floating = false }: { floating?: boolean }) {
  const { state } = useDemo();
  const { simulation } = state;
  const reduced = useReducedMotion();
  const [visible, setVisible] = useState(false);
  const isCapacity = simulation.kind === "capacity" || (simulation.kind === null && simulation.message === "Plan adapted");
  const isLearningPath = simulation.kind === "learning-path" || (simulation.kind === null && simulation.message === "Learning path scheduled");
  const learningSteps = ["Learning path added", "Capacity checked", "Academic deadlines protected", "Career learning scheduled"];
  const activeStage = capacityStages.indexOf(simulation.step ?? "");
  const movedTaskCount = new Set(state.planBlocks.filter((block) => block.taskId && block.previousStartAt && block.previousStartAt !== block.startAt).map((block) => block.taskId)).size;
  const capacityResults = ["Capacity changed", "Risk recalculated", movedTaskCount ? `${movedTaskCount} task${movedTaskCount === 1 ? "" : "s"} rescheduled` : "Schedule optimized", "Next action updated"];

  useEffect(() => {
    if (!simulation.announcement && !simulation.kind) {
      setVisible(false);
      return;
    }
    setVisible(true);
    if (simulation.kind) return;
    const timer = window.setTimeout(() => setVisible(false), 3000);
    return () => window.clearTimeout(timer);
  }, [simulation.announcement, simulation.kind]);

  return <AnimatePresence initial={false}>{visible && <motion.aside
    initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: 8 }}
    animate={reduced ? { opacity: 1 } : { opacity: 1, height: "auto", y: 0 }}
    exit={reduced ? { opacity: 0 } : { opacity: 0, height: 0, y: -4 }}
    transition={{ duration: reduced ? 0.01 : 0.24, ease: [0.16, 1, 0.3, 1] }}
    className={floating ? "pointer-events-none fixed top-[calc(4.5rem+1rem)] right-4 z-20 w-[calc(100vw-2rem)] max-w-[30rem] overflow-hidden sm:right-6" : "overflow-hidden"}
    aria-label="Decision Engine updates"
  >
    <div className="rounded-2xl border border-primary/20 bg-primary/[0.045] px-4 py-3.5 sm:px-5">
      <p className="flex items-center gap-2 text-xs font-semibold text-primary"><Sparkles className="size-4" aria-hidden="true" />{isCapacity ? simulation.kind === "capacity" ? "LumaPath is adapting your day" : "Capacity changed" : isLearningPath ? "Learning path added" : "LumaPath Decision Engine"}</p>
      {simulation.kind === "capacity" ? <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[0.68rem]" aria-label="Capacity update steps">
        {capacityStages.map((label, index) => {
          const status = index <= activeStage ? "complete" : index === activeStage + 1 ? "current" : "pending";
          return <li key={label} className={`flex items-center gap-1.5 ${status === "pending" ? "text-muted-foreground" : "text-foreground"}`}>
            <AnimatePresence mode="wait" initial={false}><motion.span key={status} initial={{ opacity: 0, scale: reduced ? 1 : 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0.01 : 0.18 }} aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full text-[0.66rem] ${status === "pending" ? "text-muted-foreground" : "bg-primary/15 text-primary"}`}>{status === "complete" ? "✓" : status === "current" ? "●" : "○"}</motion.span></AnimatePresence>
            {label}
          </li>;
        })}
      </ol> : isCapacity ? <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[0.7rem] text-foreground/85" role="status">
        {capacityResults.map((result, index) => <motion.li key={result} initial={{ opacity: 0, x: reduced ? 0 : -4 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: reduced ? 0.01 : 0.2, delay: reduced ? 0 : index * 0.05 }} className="flex items-center gap-2">{index > 0 && <ArrowRight className="size-3 shrink-0 text-primary/70" aria-hidden="true" />}{result}</motion.li>)}
      </ol> : isLearningPath ? <ol className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-foreground/85" role="status" aria-label="Learning path decision steps">{learningSteps.map((step, index) => <li key={step} className={`flex items-center gap-1.5 ${simulation.kind && index > learningSteps.indexOf(simulation.step ?? "") ? "text-muted-foreground" : "text-foreground"}`}>{index > 0 && <ArrowRight className="size-3 text-primary/70" aria-hidden="true" />}{step}</li>)}</ol> : <p role="status" className="mt-2 text-xs text-foreground/85">{simulation.kind ? simulation.step : simulation.announcement}</p>}
    </div>
  </motion.aside>}</AnimatePresence>;
}
