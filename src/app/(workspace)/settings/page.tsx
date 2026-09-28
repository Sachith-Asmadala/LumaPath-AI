"use client";

import { Accessibility, Bell, RotateCcw, ShieldCheck, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { BrandLogo } from "@/components/brand/brand-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { brand } from "@/lib/brand";
import { useDemo } from "@/lib/state/demo-provider";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { state, resetDemo, learningAction } = useDemo();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  const settings = [
    { title: "Student context", detail: `${state.student.name} · ${state.student.targetRole}`, icon: UserRound },
    { title: "Demo calculations", detail: "Deterministic rules use the seeded capacity, deadline, evidence, and prerequisite state. No external API is connected.", icon: ShieldCheck },
    { title: "Notifications", detail: "Risk, pathway, evidence, and plan changes appear in the notification center.", icon: Bell },
    { title: "Motion preference", detail: "The interface respects your operating system’s reduced-motion setting.", icon: Accessibility },
  ];
  return <div className="mx-auto w-full max-w-[900px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8"><div className="mb-6"><p className="type-eyebrow mb-2 text-muted-foreground">Workspace</p><TypographyH1>Settings</TypographyH1><TypographyP className="mt-2">Your demo context and interface preferences.</TypographyP></div><div className="space-y-3">
    <Card className="rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><h2 className="text-[0.76rem] font-medium text-foreground">Appearance</h2><p className="mt-1 text-[0.66rem] leading-5 text-muted-foreground">Choose a theme or follow your device setting.</p><div role="group" aria-label="Theme" className="mt-4 grid grid-cols-3 gap-3">{(["system", "light", "dark"] as const).map((option) => <button key={option} type="button" onClick={() => setTheme(option)} aria-pressed={mounted && theme === option} className={cn("min-w-0 rounded-xl border p-2 text-xs capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", mounted && theme === option ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-foreground hover:bg-accent")}><span className="theme-preview" data-theme={option} aria-hidden="true"><span /><span /></span><span className="block py-3">{option}{mounted && theme === option ? " · Selected" : ""}</span></button>)}</div></Card>
    {settings.map(({ title, detail, icon: Icon }) => <Card key={title} className="flex items-start gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><span className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-border/75 bg-background/55 text-primary"><Icon className="size-4" /></span><div><h2 className="text-[0.76rem] font-medium text-foreground">{title}</h2><p className="mt-1 text-[0.66rem] leading-5 text-muted-foreground">{detail}</p></div></Card>)}
    <Card className="rounded-2xl border-border bg-surface-raised p-5 shadow-none"><h2 className="text-sm font-medium">Your local data</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">This prototype stores one student profile in this browser. Check-in notes are optional and stay here. Use Demo Reset before sharing this browser with another student.</p><Button variant="outline" className="mt-3 min-h-11" disabled={!state.capacity.lifeLoadNote && !Object.keys(state.capacity.lifeLoadFactors ?? {}).length} onClick={() => learningAction({ type: "clear-life-load" })}>Clear private check-in details</Button><p className="mt-2 text-xs text-muted-foreground">Removes pressure factors and your note. Scheduled tasks stay unchanged.</p></Card>
    <Card className="rounded-2xl border-border bg-surface-raised p-5 shadow-none"><h2 className="text-sm font-medium">Free prototype</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Explore the available learning tools and the planned Premium offering.</p><Button asChild variant="outline" className="mt-3 min-h-11"><Link href="/plans">View plans</Link></Button></Card>
    <Card className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><div><h2 className="text-sm font-medium text-foreground">Demo Reset</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Restart onboarding and clear your assessment, career path, resources, planner changes, and readiness progress in this browser.</p></div><Button type="button" variant="outline" className="h-11 gap-2 rounded-xl" onClick={() => { resetDemo(); router.replace("/onboarding"); }}><RotateCcw className="size-4" aria-hidden="true" />Demo Reset</Button></Card>
    <Card className="flex items-center gap-3 rounded-[16px] border-border/80 bg-surface-raised px-4 py-4 shadow-none sm:px-5"><div className="relative h-14 w-[155px] shrink-0 overflow-hidden"><BrandLogo size="md" className="absolute top-1/2 left-0 -translate-y-1/2" /></div><p className="text-[0.66rem] leading-5 text-muted-foreground">{brand.tagline}</p></Card>
  </div></div>;
}
