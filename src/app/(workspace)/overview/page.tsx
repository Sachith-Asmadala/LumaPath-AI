"use client";

import { useState } from "react";
import { AnimatedCard, Reveal } from "@/components/motion/animated";
import styles from "./overview.module.css";
import { DailyIntelligenceHeader } from "@/features/dashboard/components/daily-intelligence-header";
import { NextBestActionCard } from "@/features/dashboard/components/next-best-action-card";
import { CapacityCheckIn } from "@/features/dashboard/components/capacity-checkin";
import { CareerReadinessCard } from "@/features/dashboard/components/career-readiness-card";
import { DeadlineRiskPanel } from "@/features/dashboard/components/deadline-risk-panel";
import { AdaptiveDayPlan } from "@/features/dashboard/components/adaptive-day-plan";
import { WeeklyProgressStrip } from "@/features/dashboard/components/weekly-progress-strip";
import { PriorityExplanationSheet } from "@/features/dashboard/components/priority-explanation-sheet";
import { DecisionPulse } from "@/features/dashboard/components/decision-pulse";
import { useDemo } from "@/lib/state/demo-provider";
import { useIsMobile } from "@/hooks/use-mobile";

import { MiniCareerPath } from "@/features/dashboard/components/mini-career-path";
import { CareerIntelligencePreview } from "@/features/dashboard/components/career-intelligence-preview";

export default function OverviewRoute() {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const { state } = useDemo();
  const mobile = useIsMobile();
  const delay = (seconds: number) => mobile ? 0 : seconds;

  return (
    <div className={styles.dashboard}>
      <div className={styles.content}>
        <Reveal className={styles.greeting}><DailyIntelligenceHeader name={state.student.name} /></Reveal>
        <DecisionPulse floating />
        <div className={`${styles.row} ${styles.mainRow}`}>
          <AnimatedCard delay={delay(0.04)} className={`${styles.panel} ${styles.hero}`}><NextBestActionCard onExplain={() => setExplanationOpen(true)} /></AnimatedCard>
          <AnimatedCard delay={delay(0.08)} className={`${styles.panel} ${styles.readiness}`}><CareerReadinessCard /></AnimatedCard>
        </div>
        <div className={styles.row}>
          <AnimatedCard delay={delay(0.12)} className={`${styles.panel} ${styles.capacity}`}><CapacityCheckIn /></AnimatedCard>
          <AnimatedCard delay={delay(0.16)} className={`${styles.panel} ${styles.dayPlan}`}><AdaptiveDayPlan /></AnimatedCard>
        </div>
        <div className={styles.row}>
          <AnimatedCard delay={delay(0.2)} className={`${styles.panel} ${styles.risk}`}><DeadlineRiskPanel /></AnimatedCard>
          <AnimatedCard delay={delay(0.24)} className={`${styles.panel} ${styles.career}`}><MiniCareerPath /></AnimatedCard>
        </div>
        <Reveal delay={delay(0.28)} className={styles.intelligence}><CareerIntelligencePreview /></Reveal>
        <Reveal delay={delay(0.32)} as="section" className={styles.weekly}>
          <h2 className="type-eyebrow mb-3 text-muted-foreground">Weekly progress</h2>
          <WeeklyProgressStrip />
        </Reveal>
      </div>
      <PriorityExplanationSheet open={explanationOpen} onOpenChange={setExplanationOpen} />
    </div>
  );
}
