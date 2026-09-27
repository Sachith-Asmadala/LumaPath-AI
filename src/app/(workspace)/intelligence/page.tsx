"use client";

import { useState } from "react";
import { Activity, BriefcaseBusiness, CalendarDays, Sparkles } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { IntelligenceFeed } from "@/features/intelligence/components/intelligence-feed";
import { OpportunityRadar } from "@/features/intelligence/components/opportunity-radar";
import { useDemo } from "@/lib/state/demo-provider";

export default function IntelligencePage() {
  const { state } = useDemo();
  const [tab, setTab] = useState("feed");
  return <div className="mx-auto w-full max-w-[1500px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Activity className="size-3.5" />Career intelligence engine</p><TypographyH1>What’s relevant to your path</TypographyH1><TypographyP className="mt-2">Selected for the DevOps skills, evidence, and deadlines in your student context.</TypographyP></div><div className="rounded-[13px] border border-border bg-white/[0.02] px-3 py-2 text-[0.64rem] text-muted-foreground">{state.intelligenceItems.filter((item) => item.status !== "dismissed" && item.status !== "not-relevant").length} relevant updates</div></div></Reveal>
    <div className="mb-5 grid gap-3 sm:grid-cols-3"><div className="flex items-center gap-2.5 rounded-[14px] border border-border/75 bg-white/[0.02] px-3.5 py-3"><Sparkles className="size-4 text-primary" /><p className="text-[0.65rem] text-foreground/80">Why it matters is visible on every item.</p></div><div className="flex items-center gap-2.5 rounded-[14px] border border-border/75 bg-white/[0.02] px-3.5 py-3"><CalendarDays className="size-4 text-pathway" /><p className="text-[0.65rem] text-foreground/80">Relevant resources can join your week.</p></div><div className="flex items-center gap-2.5 rounded-[14px] border border-border/75 bg-white/[0.02] px-3.5 py-3"><BriefcaseBusiness className="size-4 text-success" /><p className="text-[0.65rem] text-foreground/80">Explore opportunities with concrete gaps.</p></div></div>
    <Tabs value={tab} onValueChange={setTab} className="w-full">
      <TabsList variant="line" className="mb-5 h-10 w-full justify-start gap-5 rounded-none border-b border-border/70 bg-transparent p-0 sm:w-auto"><TabsTrigger value="feed" className="h-10 rounded-none px-1 text-[0.7rem] data-[state=active]:text-primary"><Activity className="size-3.5" />For your pathway</TabsTrigger><TabsTrigger value="opportunities" className="h-10 rounded-none px-1 text-[0.7rem] data-[state=active]:text-primary"><BriefcaseBusiness className="size-3.5" />Opportunity radar</TabsTrigger></TabsList>
      <TabsContent value="feed" className="mt-0 focus-visible:outline-none"><IntelligenceFeed /></TabsContent>
      <TabsContent value="opportunities" className="mt-0 focus-visible:outline-none"><OpportunityRadar /></TabsContent>
    </Tabs>
    <div className="mt-4 flex items-center gap-2 text-[0.6rem] text-muted-foreground"><Sparkles className="size-3.5 text-primary" />Demo intelligence feed · seeded updates are not live industry alerts.</div>
  </div>;
}
