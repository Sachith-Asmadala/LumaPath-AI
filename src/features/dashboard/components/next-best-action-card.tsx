"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Clock3, Compass, ListFilter, Sparkles, Timer } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { MotionButton } from "@/components/motion/animated";
import { Card } from "@/components/ui/card";
import { RiskBadge } from "@/components/shared/status-badge";
import { useDemo } from "@/state/demo-provider";
import { selectNextBestAction } from "@/features/dashboard/domain/dashboard";
import { useLocale } from "@/i18n/locale-provider";

export function NextBestActionCard({ onExplain }: { onExplain: () => void }) {
  const { state, selectAlternative } = useDemo();
  const { t, formatNumber } = useLocale();
  const reduceMotion = useReducedMotion();
  const [recalculating, setRecalculating] = useState(false);
  const calculationTimer = useRef<number | null>(null);
  const action = selectNextBestAction(state);
  const task = state.tasks.find((item) => item.id === action.taskId);
  const durationHours = Math.floor(action.durationMinutes / 60);
  const durationMinutes = action.durationMinutes % 60;
  const time = [
    durationHours > 0 ? t("common.hours", { count: formatNumber(durationHours) }) : "",
    durationMinutes > 0 ? t("common.minutes", { count: formatNumber(durationMinutes) }) : "",
  ].filter(Boolean).join(" ") || t("common.minutes", { count: formatNumber(0) });
  const key = `${action.taskId}-${action.title}`;
  const explanation = action.rationale;

  useEffect(() => () => {
    if (calculationTimer.current) clearTimeout(calculationTimer.current);
  }, []);

  const chooseAlternative = () => {
    if (recalculating) return;
    const alternatives = state.tasks.filter((candidate) => candidate.status !== "completed" && candidate.id !== action.taskId);
    if (!alternatives[0]) return;
    setRecalculating(true);
    calculationTimer.current = window.setTimeout(() => {
      selectAlternative(alternatives[0].id);
      setRecalculating(false);
      calculationTimer.current = null;
    }, reduceMotion ? 80 : 190);
  };

  return (
    <Card className="h-full relative isolate overflow-hidden rounded-[20px] border border-primary/15 bg-surface-raised py-0 shadow-none">
      <div className="absolute inset-y-0 left-0 w-[2px] bg-primary/70" aria-hidden="true" />
      <div className={`flex h-full flex-col ${state.competition ? "p-5" : "p-5 sm:p-6 lg:p-8"}`}>
        <div className={`flex flex-wrap items-center justify-between gap-2 ${state.competition ? "mb-4" : "mb-4 sm:mb-8 sm:gap-3"}`}>
          <div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-[10px] border border-primary/15 bg-primary/[0.06] text-primary"><Sparkles className="size-3.5" /></span><span className="type-eyebrow text-primary">{t("nba.label")}</span></div>
          <span className="flex items-center gap-1.5 rounded-full border border-primary/15 bg-primary/[0.06] px-2.5 py-1 text-[0.62rem] text-primary"><span className="size-1.5 rounded-full bg-primary" />{t("nba.recommended")}</span>
        </div>
        <div className="relative min-h-28 flex-1 sm:min-h-[8rem]" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            {recalculating ? <motion.div key="calculating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0.01 : 0.12 }} className="absolute inset-0 flex flex-col justify-center gap-2" role="status"><p className="font-heading text-base text-foreground">{t("nba.checking")}</p><div className="h-1 w-28 overflow-hidden rounded-full bg-primary/15"><motion.div className="h-full rounded-full bg-primary/70" initial={{ width: "0%" }} animate={{ width: "100%" }} transition={{ duration: reduceMotion ? 0.01 : 0.19 }} /></div></motion.div> : <motion.div key={key} initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -6 }} transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <motion.h2 className="max-w-[40rem] font-heading text-[1.55rem] font-semibold leading-tight tracking-[-0.035em] text-foreground sm:text-[1.85rem]">{action.title}</motion.h2>
              <p className="mt-3 max-w-[52ch] text-[0.82rem] leading-6 text-muted-foreground sm:mt-4">{explanation}</p>
            </motion.div>}
          </AnimatePresence>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/70 pt-3 text-[0.7rem] text-muted-foreground sm:mt-6 sm:gap-x-5 sm:gap-y-3 sm:pt-4">
          <span className="inline-flex items-center gap-1.5"><Clock3 className="size-3.5" aria-hidden="true" />{t("nba.estimatedTime")} <b className="font-medium text-foreground">{time}</b></span>
          <span className="inline-flex items-center gap-1.5">{t("nba.deadlineRisk")} <RiskBadge level={action.deadlineRisk} label={action.deadlineRisk} /></span>
          <span className="inline-flex items-center gap-1.5"><Compass className="size-3.5 text-pathway" aria-hidden="true" />{t("nba.careerImpact")} <b className="font-medium text-foreground">{action.careerImpact}</b></span>
        </div>
        {!state.competition && <div className="mt-3 flex items-baseline gap-2 sm:mt-5" role="group" aria-label={t("nba.priorityScoreAria", { score: formatNumber(action.score) })}>
          <span className="type-eyebrow text-muted-foreground">{t("nba.priorityScore")}</span>
          <AnimatePresence mode="wait" initial={false}><motion.span key={`${key}-${action.score}`} initial={{ opacity: 0, y: reduceMotion ? 0 : 5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: reduceMotion ? 0 : -4 }} transition={{ duration: reduceMotion ? 0.01 : 0.2 }} aria-hidden="true" className="font-mono text-lg font-semibold tracking-[-0.04em] text-primary">{formatNumber(action.score)}<span className="ml-1 text-xs font-normal text-muted-foreground">/ 100</span></motion.span></AnimatePresence>
        </div>}
        <div className="mt-4 flex flex-wrap items-center gap-2.5 sm:mt-6">
          {action.durationMinutes > 0 ? <Button asChild className="h-10 rounded-[13px] px-4 text-[0.74rem] font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.3)] transition-transform hover:-translate-y-0.5 active:translate-y-0">
            <Link href={`/focus?task=${encodeURIComponent(action.taskId)}`} aria-label={t("nba.startFocusFor", { task: task?.title ?? action.title })}><Timer className="size-4" /><span className="sm:hidden">{t("nba.startFocusShort")}</span><span className="hidden sm:inline">{t("nba.startFocus")}</span><ArrowRight className="ml-1 size-3.5" /></Link>
          </Button> : <Button disabled className="h-10 text-xs">{t("nba.capacityRequired")}</Button>}
          <MotionButton variant="outline" onClick={onExplain} className="h-10 rounded-[13px] border-border bg-background/20 px-4 text-[0.72rem] text-foreground/85 hover:border-primary/25 hover:bg-primary/[0.035]">{t("nba.whyThis")}</MotionButton>
        </div>
        <MotionButton variant="ghost" size="sm" onClick={chooseAlternative} disabled={recalculating || state.tasks.filter((candidate) => candidate.status !== "completed" && candidate.id !== action.taskId).length === 0} className="mt-2 h-8 w-fit gap-1.5 px-1 text-[0.65rem] text-muted-foreground hover:text-foreground"><ListFilter className="size-3.5" />{t("nba.alternative")}</MotionButton>
      </div>
    </Card>
  );
}
