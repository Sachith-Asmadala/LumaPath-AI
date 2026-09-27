"use client";

import { dashboardMetrics, weeklyPlannedHours } from "@/lib/domain/dashboard";
import { scenarioWeekLabel } from "@/lib/demo-data/scenario";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Activity, ArrowUpRight, CalendarCheck2, Clock3, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { AnimatedCounter } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";

const chartConfig = {
  academic: { label: "Academic", color: "#74f6fb" },
  career: { label: "Career", color: "#d39cca" },
} satisfies ChartConfig;

export default function AnalyticsPage() {
  const { state } = useDemo();
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
    <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, suffix, icon: Icon }) => <Card key={label} className="rounded-[16px] border-border/80 bg-surface-raised py-0 shadow-none"><CardContent className="flex items-center gap-3 p-4"><span className="grid size-9 place-items-center rounded-[11px] border border-border bg-background/50 text-primary"><Icon className="size-4" /></span><div><p className="font-mono text-lg text-foreground"><AnimatedCounter value={value} suffix={suffix} /></p><p className="mt-0.5 text-[0.62rem] text-muted-foreground">{label}</p></div>{label === "Career readiness" && <span className="ml-auto flex items-center gap-1 text-[0.58rem] text-success"><ArrowUpRight className="size-3" />+{state.readiness.weeklyDelta}%</span>}</CardContent></Card>)}</div>
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]">
      <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Weekly rhythm</p><CardTitle className="type-section-title">How your planned time is distributed</CardTitle><p className="mt-1 text-[0.66rem] text-muted-foreground">Scheduled hours · academic and career learning</p></CardHeader><CardContent className="px-3 pb-4 sm:px-5"><ChartContainer id="weekly-hours" config={chartConfig} className="h-[300px] w-full">
        <BarChart data={weeklyData} margin={{ top: 12, right: 8, left: -14, bottom: 0 }} barCategoryGap={12}>
          <CartesianGrid vertical={false} stroke="rgb(255 255 255 / 6%)" strokeDasharray="3 4" />
          <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#9fadb5", fontSize: 11 }} tickMargin={10} />
          <YAxis axisLine={false} tickLine={false} tick={{ fill: "#78868e", fontSize: 10 }} tickFormatter={(value: number) => `${value}h`} />
          <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => [`${value} hours`, ""]} />} />
          <Bar dataKey="academic" stackId="effort" radius={[0, 0, 3, 3]} fill="var(--color-academic)" />
          <Bar dataKey="career" stackId="effort" radius={[4, 4, 0, 0]} fill="var(--color-career)" />
        </BarChart>
      </ChartContainer></CardContent></Card>
      <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none"><CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5"><p className="type-eyebrow mb-2 text-muted-foreground">Connected signals</p><CardTitle className="type-section-title">Where momentum is building</CardTitle></CardHeader><CardContent className="space-y-2.5 px-4 pb-5 sm:px-5">
        {[{ title: "Academic progress", value: "Deadlines drive the current plan", icon: Target, color: "text-primary" }, { title: "Career pathway", value: `${state.careerSkills.filter((skill) => skill.status === "verified").length} skills verified · Docker in focus`, icon: TrendingUp, color: "text-pathway" }, { title: "Career evidence", value: `${state.evidence.filter((item) => item.status === "verified").length} pieces verified`, icon: CalendarCheck2, color: "text-success" }].map(({ title, value, icon: Icon, color }) => <div key={title} className="flex items-start gap-3 rounded-[13px] border border-border/65 bg-background/35 p-3"><Icon className={`mt-0.5 size-4 shrink-0 ${color}`} /><div><p className="text-[0.68rem] font-medium text-foreground">{title}</p><p className="mt-1 text-[0.62rem] leading-5 text-muted-foreground">{value}</p></div></div>)}
        <p className="pt-1 text-[0.59rem] leading-4 text-muted-foreground">Scheduled hours, completed tasks, and readiness reflect your current plan.</p>
      </CardContent></Card>
    </div>
  </div>;
}
