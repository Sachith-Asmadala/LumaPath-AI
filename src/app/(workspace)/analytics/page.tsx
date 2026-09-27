"use client";

import { useState } from "react";
import { useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { selectActionableSkill } from "@/lib/domain/workspace";
import { dashboardMetrics, weeklyPlannedHours } from "@/lib/domain/dashboard";
import { scenarioWeekLabel } from "@/lib/demo-data/scenario";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, CalendarCheck2, Clock3, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { AnimatedCard, AnimatedCounter } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";

const chartConfig = {
  academic: { label: "Academic", color: "var(--primary)" },
  career: { label: "Career", color: "var(--pathway)" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const { state } = useDemo();
  const [showData, setShowData] = useState(false);
  const reducedMotion = useReducedMotion();
  const currentSkill = selectActionableSkill(state);
  const progress = dashboardMetrics(state);
  const weeklyData = weeklyPlannedHours(state);
  const productiveHours = Number((state.productiveMinutes / 60).toFixed(1));
  const stats = [
    { label: "Productive hours", value: productiveHours, suffix: "h", icon: Clock3 },
    { label: "Tasks completed", value: progress.completedTasks, suffix: "", icon: CalendarCheck2 },
    { label: "Plan completion", value: progress.planCompletion, suffix: "%", icon: Target },
    { label: "Career readiness", value: state.readiness.score, suffix: "%", icon: TrendingUp },
  ];

  return <div className="mx-auto w-full max-w-[1300px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Activity className="size-3.5" />Analytics</p><TypographyH1>Progress you can act on</TypographyH1><TypographyP className="mt-2">A small set of signals connects weekly effort to career readiness.</TypographyP></div><span className="rounded-[12px] border border-border bg-white/[0.02] px-3 py-2 text-[0.62rem] text-muted-foreground">Scenario week · {scenarioWeekLabel()}</span></div>
    <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">{stats.map(({ label, value, suffix, icon: Icon }, index) => <AnimatedCard key={label} className="analytics-stat" delay={index * 0.045} hover={false}><div className="mb-5 flex items-center justify-between"><Icon className="size-4 text-muted-foreground" strokeWidth={1.5} /><span className="font-mono text-[0.6rem] text-muted-foreground">0{index + 1}</span></div><p className="stat-number"><AnimatedCounter value={value} suffix={suffix} animateOnMount /></p><div className="mt-2 flex flex-wrap items-center justify-between gap-1"><p className="text-xs text-muted-foreground">{label}</p>{label === "Career readiness" && <span className="flex items-center gap-1 text-[0.65rem] text-success"><ArrowUpRight className="size-3" />+{state.readiness.weeklyDelta}%</span>}</div></AnimatedCard>)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Weekly rhythm</p><CardTitle className="type-section-title">How your planned time is distributed</CardTitle><p className="mt-1 text-[0.66rem] text-muted-foreground">Scheduled hours · academic and career learning</p></CardHeader><CardContent className="px-3 pb-4 sm:px-5"><ChartContainer id="weekly-hours" config={chartConfig} className="h-[300px] w-full">
        <BarChart data={weeklyData} margin={{ top: 12, right: 8, left: -14, bottom: 0 }} barCategoryGap={22}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} tickMargin={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} tickFormatter={(value: number) => `${value}h`} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => [`${value} hours`, ""]} />} />
          <Bar isAnimationActive={!reducedMotion} animationDuration={450} dataKey="academic" stackId="effort" radius={[0, 0, 5, 5]} fill="var(--color-academic)" />
          <Bar isAnimationActive={!reducedMotion} animationDuration={450} dataKey="career" stackId="effort" radius={[6, 6, 0, 0]} fill="var(--color-career)" />
        </BarChart>
      </ChartContainer><div className="mt-3 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-4 text-xs text-muted-foreground"><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-primary" />Academic</span><span className="flex items-center gap-2"><span className="size-2 rounded-full bg-pathway" />Career</span></div><Button variant="ghost" onClick={() => setShowData(!showData)} aria-expanded={showData} aria-controls="weekly-hours-table" className="h-11 text-xs">{showData ? "Hide data" : "View data"}</Button></div><div id="weekly-hours-table" hidden={!showData}><table className="mt-3 w-full text-left text-xs"><caption className="sr-only">Scheduled hours for the scenario week</caption><thead><tr className="border-b border-border"><th scope="col" className="py-3 font-medium">Day</th><th scope="col" className="py-3 font-medium">Academic</th><th scope="col" className="py-3 font-medium">Career</th></tr></thead><tbody>{weeklyData.map((day) => <tr key={day.day} className="border-b border-border/50"><th scope="row" className="py-2.5 font-normal">{day.day}</th><td>{day.academic}h</td><td>{day.career}h</td></tr>)}</tbody></table></div></CardContent></Card>
      <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Connected signals</p><CardTitle className="type-section-title">Where momentum is building</CardTitle></CardHeader><CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
        {[{ title: "Academic progress", value: "Deadlines drive the current plan", icon: Target, color: "text-primary" }, { title: "Career pathway", value: `${state.careerSkills.filter((skill) => skill.status === "verified").length} skills verified · ${currentSkill ? `${currentSkill.name} in focus` : "review your roadmap"}`, icon: TrendingUp, color: "text-pathway" }, { title: "Career evidence", value: `${state.evidence.filter((item) => item.status === "verified").length} pieces verified`, icon: CalendarCheck2, color: "text-success" }].map(({ title, value, icon: Icon, color }) => <div key={title} className="flex items-start gap-3 rounded-[13px] border border-border/65 bg-background/35 p-3"><Icon className={`mt-0.5 size-4 shrink-0 ${color}`} /><div><p className="text-[0.68rem] font-medium text-foreground">{title}</p><p className="mt-1 text-[0.62rem] leading-5 text-muted-foreground">{value}</p></div></div>)}
        <p className="pt-1 text-[0.59rem] leading-4 text-muted-foreground">Scheduled hours, completed tasks, and readiness reflect your current plan.</p>
      </CardContent></Card>
    </div>
  </div>;
}
