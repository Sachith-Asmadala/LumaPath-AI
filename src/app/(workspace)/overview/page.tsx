"use client";

import { StartCompetitionDemo } from "@/features/competition/components/demo-controls";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowUpRight, BookOpen, CalendarDays, CheckCheck, ChevronDown, Clock3, Compass, Plus, Sparkles, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { NextBestActionCard } from "@/features/dashboard/components/next-best-action-card";
import { CapacityCheckIn } from "@/features/dashboard/components/capacity-checkin";
import { CareerReadinessCard } from "@/features/dashboard/components/career-readiness-card";
import { DeadlineRiskPanel } from "@/features/dashboard/components/deadline-risk-panel";
import { AdaptiveDayPlan } from "@/features/dashboard/components/adaptive-day-plan";
import { WeeklyProgressStrip } from "@/features/dashboard/components/weekly-progress-strip";
import { PriorityExplanationSheet } from "@/features/dashboard/components/priority-explanation-sheet";
import { MiniCareerPath } from "@/features/dashboard/components/mini-career-path";
import { CareerIntelligencePreview } from "@/features/dashboard/components/career-intelligence-preview";
import { availableCapacity, selectDeadlineRiskTasks } from "@/features/dashboard/domain/dashboard";
import { useDemo } from "@/state/demo-provider";
import { PlanDemoWorkspace } from "@/features/subscriptions/components/plan-demo-workspace";
import { useSubscription } from "@/features/subscriptions/components/subscription-provider";
import { hasProFeatures } from "@/features/subscriptions/entitlements";
import { ProBadge } from "@/features/subscriptions/components/pro-badge";
import { ProIntelligenceHome } from "@/features/subscriptions/components/pro-intelligence-home";
import styles from "./overview.module.css";

export default function OverviewRoute() {
  const [explanationOpen, setExplanationOpen] = useState(false);
  const { state } = useDemo();
  const { subscription } = useSubscription();
  const pro = hasProFeatures(subscription?.plan);
  const capacity = availableCapacity(state.capacity);
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const remaining = state.tasks.length - completed;
  const risks = selectDeadlineRiskTasks(state).filter((task) => task.riskScore >= 70).length;

  return <div className={`${styles.dashboard} ${state.competition ? styles.competition : ""}`}>
    <header className={`${styles.heading} ${pro ? "pro-header" : ""}`}><div><p className="workspace-eyebrow"><span className={styles.statusDot} />{pro ? <>LUMAPATH <ProBadge /> · YOUR INTELLIGENCE</> : "YOUR DAY, WITH A LITTLE MORE CLARITY"}</p><h1>Welcome back, {state.student.name.split(" ")[0]}<span>.</span></h1><p>{pro ? `${state.student.targetRole}. Your priorities, evidence and next steps, connected.` : "One thing at a time. You’ve got a place to start."}</p></div><div className="flex flex-wrap gap-2">{!state.competition && <StartCompetitionDemo />}<Button asChild className="h-11 rounded-xl px-5"><Link href="/planner?add=assignment"><Plus size={17} />Create task</Link></Button></div></header>
    <div className={styles.stats}>
      {(state.competition ? [{ icon: Compass, value: state.student.targetRole, label: "Career goal & readiness", href: "/career-path", detail: `${state.careerSkills.filter(skill=>skill.status==="verified").length} evidence-backed pathway skills` }, { icon: Clock3, value: `${capacity} min`, label: "Capacity Today", href: "/overview#capacity", detail: "Limited capacity · protect essential work" }, { icon: CalendarDays, value: risks ? "High" : "Low", label: "Deadline Risk", href: "/tasks", detail: "Software Engineering assignment due soon" }] : [{ icon: CheckCheck, value: remaining, label: "Tasks to work on", href: "/tasks", detail: `${completed} completed` }, { icon: Clock3, value: `${Math.floor(capacity / 60)}h ${capacity % 60}m`, label: "Available capacity", href: "/overview#capacity", detail: "Make space for what matters" }, { icon: CalendarDays, value: risks, label: "Deadlines needing care", href: "/tasks", detail: risks ? "A little attention goes a long way" : "No high-risk deadlines" }]).map(({ icon: Icon, ...item }) => <Link href={item.href} onClick={() => { if (item.href.endsWith("#capacity")) { const panel = document.getElementById("capacity"); if (panel instanceof HTMLDetailsElement) panel.open = true; } }} className={styles.stat} key={item.label}><span className={styles.statIcon}><Icon size={19} strokeWidth={1.7} /></span><div><span className={styles.statLabel}>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small></div><ArrowUpRight size={15} className={styles.statArrow} /></Link>)}
    </div>
    <Tabs defaultValue="today" className="overview-tabs">
      <div className={styles.viewBar}><TabsList><TabsTrigger value="today">{pro ? "Your Pro Intelligence" : "Today’s overview"}</TabsTrigger><TabsTrigger value="growth">My growth</TabsTrigger></TabsList><Link href="/explore" className={styles.textLink}>Explore all tools<ArrowRight size={15} /></Link></div>
      <TabsContent value="today" className={styles.tabContent}>
        <div className={styles.mainGrid}><section className={styles.hero}><NextBestActionCard onExplain={() => setExplanationOpen(true)} /></section><aside className={styles.schedule}><div className={styles.sectionLabel}><span>YOUR SCHEDULE</span><Link href="/planner">Full planner<ArrowUpRight size={14} /></Link></div><AdaptiveDayPlan /></aside></div>
        {pro && <ProIntelligenceHome />}
        <div className={styles.secondaryGrid}><section><div className={styles.sectionLabel}><span>KEEP ON YOUR RADAR</span><Link href="/tasks">All tasks<ArrowUpRight size={14} /></Link></div><DeadlineRiskPanel /></section><section className={styles.shortcuts}><p className="workspace-eyebrow">YOUR NEXT CHAPTER</p><h2>A little progress,<br />every day.</h2><p>Make space for the things you’re becoming.</p>{[{ href: "/learning", icon: BookOpen, title: "Continue learning", detail: "Pick up where you left off" }, { href: "/career-path", icon: Compass, title: "Explore your career path", detail: state.student.targetRole }, { href: "/focus", icon: Timer, title: "Find your focus", detail: "A calm space for your next task" }].map(({ href, icon: Icon, title, detail }) => <Link href={href} key={href}><span><Icon size={19} /></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowUpRight size={16} /></Link>)}</section></div>
        <details id="capacity" className={styles.capacity}><summary><span className={styles.capacityIcon}><Sparkles size={19} /></span><span><strong>How much room do you have today?</strong><small>Adjust your energy and availability. Your plan can adapt.</small></span><ChevronDown size={18} /></summary><div className={styles.capacityBody}><CapacityCheckIn /></div></details>
      </TabsContent>
      <TabsContent value="growth" className={styles.tabContent}><div className={styles.growthHeading}><p className="workspace-eyebrow">THE BIGGER PICTURE</p><h2>Small steps. Meaningful progress.</h2><p>See how today’s work connects to where you want to go.</p></div><div className={styles.growthGrid}><CareerReadinessCard /><MiniCareerPath /></div><section className={styles.weekly}><h2>Your week in perspective</h2><WeeklyProgressStrip /></section><CareerIntelligencePreview /></TabsContent>
    </Tabs>
    <PlanDemoWorkspace />
    <footer className={styles.footer}><span>Built around your pace.</span><Link href={pro ? "/settings#pro-controls" : "/plans"}><Sparkles size={14} />{pro ? "Your Pro preferences" : "Discover what’s next with Pro"}<ArrowRight size={14} /></Link></footer>
    <PriorityExplanationSheet open={explanationOpen} onOpenChange={setExplanationOpen} />
  </div>;
}
