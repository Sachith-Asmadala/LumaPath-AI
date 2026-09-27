"use client";

import { demoScenario } from "@/lib/demo-data/scenario";
import { Sparkles } from "lucide-react";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/lib/state/demo-provider";
import { availableCapacity, isLowCapacity, selectCurrentCareerSkill, selectDeadlineRiskTasks } from "@/lib/domain/dashboard";

function formatDuration(minutes: number) {
  if (minutes <= 0) return "0m";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h` : ""}${remainder ? ` ${remainder}m` : ""}`.trim();
}

export function DailyIntelligenceHeader({ name }: { name: string }) {
  const { state } = useDemo();
  const availableMinutes = availableCapacity(state.capacity);
  const lowCapacity = isLowCapacity(state.capacity);
  const riskCount = selectDeadlineRiskTasks(state).filter((task) => task.riskScore >= 70).length;
  const currentSkill = selectCurrentCareerSkill(state);
  const topRisk = selectDeadlineRiskTasks(state)[0];
  const summary = lowCapacity
    ? `You have ${formatDuration(availableMinutes)} available today. Your plan prioritizes ${topRisk?.title ?? "your remaining work"} and keeps the next focus step manageable.`
    : `${riskCount ? `${riskCount} task${riskCount === 1 ? " is" : "s are"}` : "No tasks are"} at high risk. ${currentSkill ? `${currentSkill.name} is your next career milestone.` : "Your career pathway is complete."}`;

  return (
    <div className="flex flex-col justify-between gap-6 xl:flex-row xl:items-end xl:gap-10">
      <div className="shrink-0">
          <p className="type-eyebrow mb-3 text-primary">A little clarity for your day</p>
          <TypographyH1 className="text-[1.9rem] font-medium sm:text-[2.5rem]">Good morning, {name}</TypographyH1>
          <TypographyP className="mt-2 text-sm">A thoughtful plan, with room for real life.</TypographyP>
          <p className="mt-3 text-[0.68rem] text-muted-foreground">{new Date(`${demoScenario.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
      <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/[0.035] p-4 sm:p-5 xl:max-w-[34rem]">
        <span className="grid size-8 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/10"><Sparkles className="size-4 text-primary" aria-hidden="true" /></span>
        <div><p className="type-eyebrow mb-2 text-primary">Today’s Insight</p><p className="text-[0.78rem] leading-6 text-foreground/85">{!lowCapacity && <>You have <span className="font-medium text-foreground">{formatDuration(availableMinutes)} available</span> today. </>}{summary}</p></div>
      </div>
    </div>
  );
}
