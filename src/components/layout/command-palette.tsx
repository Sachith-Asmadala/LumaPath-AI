"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, Bell, BrainCircuit, BriefcaseBusiness, ClipboardList, DatabaseZap, FileText, Files, GitCompareArrows, CalendarPlus, CalendarSync, ChartNoAxesCombined, CheckCircle2, Compass, HandHelping, MessageSquareText, Network, Route, Search, ShieldAlert, Sparkles, Timer, WandSparkles, Trophy, UsersRound } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";

const commandItems = [
  { labelKey: "command.generatePlan", href: "/planner", icon: WandSparkles, groupKey: "command.planning" },
  { labelKey: "command.nextAction", href: "/overview", icon: CheckCircle2, groupKey: "command.planning" },
  { labelKey: "command.deadlineRisks", href: "/overview", icon: ShieldAlert, groupKey: "command.planning" },
  { labelKey: "command.skillGaps", href: "/skills", icon: ChartNoAxesCombined, groupKey: "command.career" },
  { labelKey: "command.addAssignment", href: "/planner?add=assignment", icon: CalendarPlus, groupKey: "command.create" },
  { labelKey: "command.openCalendarSync", href: "/calendar-sync", icon: CalendarSync, groupKey: "command.navigate" },
  { labelKey: "command.openTeams", href: "/teams", icon: UsersRound, groupKey: "command.navigate" },
  { labelKey: "command.addMilestone", href: "/career-path", icon: Network, groupKey: "command.create" },
  { labelKey: "command.openCareer", href: "/career-path", icon: Compass, groupKey: "command.navigate" },
  { labelKey: "command.openCareerCompare", href: "/career-compare", icon: GitCompareArrows, groupKey: "command.career" },
  { labelKey: "command.openMarketSignals", href: "/market-signals", icon: DatabaseZap, groupKey: "command.career" },
  { labelKey: "command.openRoadmap", href: "/roadmap", icon: Route, groupKey: "command.career" },
  { labelKey: "command.openEvidence", href: "/evidence", icon: ShieldAlert, groupKey: "command.career" },
  { labelKey: "command.openPortfolio", href: "/portfolio", icon: BriefcaseBusiness, groupKey: "command.career" },
  { labelKey: "command.openCv", href: "/cv", icon: FileText, groupKey: "command.career" },
  { labelKey: "command.openOpportunities", href: "/opportunities", icon: BriefcaseBusiness, groupKey: "command.career" },
  { labelKey: "command.openApplications", href: "/internships", icon: ClipboardList, groupKey: "command.career" },
  { labelKey: "command.openInterviews", href: "/interviews", icon: MessageSquareText, groupKey: "command.career" },
  { labelKey: "command.openMentors", href: "/mentors", icon: HandHelping, groupKey: "command.career" },
  { labelKey: "command.startFocus", href: "/focus", icon: Timer, groupKey: "command.navigate" },
  { labelKey: "command.continueLearning", href: "/learning", icon: Compass, groupKey: "command.navigate" },
  { labelKey: "command.openAssistant", href: "/study-assistant", icon: BrainCircuit, groupKey: "command.navigate" },
  { labelKey: "command.openDocuments", href: "/documents", icon: Files, groupKey: "command.navigate" },
  { labelKey: "command.viewPlans", href: "/plans", icon: Sparkles, groupKey: "command.navigate" },
  { labelKey: "command.openIntelligence", href: "/intelligence", icon: Activity, groupKey: "command.navigate" },
  { labelKey: "command.openNotifications", href: "/notifications", icon: Bell, groupKey: "command.navigate" },
  { labelKey: "command.openAchievements", href: "/achievements", icon: Trophy, groupKey: "command.navigate" },
];

export function CommandPalette({ open, onOpenChange, onOpenCopilot }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenCopilot: () => void }) {
  const router = useRouter();
  const { generatePlan } = useDemo();
  const { t } = useLocale();
  const navigate = useCallback((labelKey: string, href: string) => {
    onOpenChange(false);
    if (labelKey === "command.generatePlan") void generatePlan();
    router.push(href);
  }, [generatePlan, onOpenChange, router]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [open, onOpenChange]);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={t("command.title")} description={t("command.description")}>
      <CommandInput placeholder={t("command.placeholder")} aria-label={t("command.placeholder")} />
      <CommandList className="max-h-[min(24rem,58dvh)]">
        <CommandEmpty>{t("command.empty")}</CommandEmpty>
        {["command.planning", "command.career", "command.create", "command.navigate"].map((groupKey) => <CommandGroup key={groupKey} heading={t(groupKey)}>
          {commandItems.filter((item) => item.groupKey === groupKey).map(({ labelKey, href, icon: Icon }) => <CommandItem key={labelKey} value={t(labelKey)} onSelect={() => navigate(labelKey, href)} className="min-h-10 rounded-lg px-3 text-sm">
            <Icon className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />{t(labelKey)}
            {labelKey === "command.nextAction" && <CommandShortcut>↵</CommandShortcut>}
          </CommandItem>)}
        </CommandGroup>)}
        <CommandGroup heading="Luma AI">
          <CommandItem value={t("top.askLuma")} onSelect={() => { onOpenChange(false); onOpenCopilot(); }} className="min-h-10 rounded-lg px-3 text-sm"><Sparkles className="mr-2 size-4 text-primary" aria-hidden="true" />{t("top.askLuma")}<CommandShortcut>⌘ L</CommandShortcut></CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2.5 text-[0.63rem] text-muted-foreground"><Search className="size-3" />Type to filter <span className="ml-auto flex items-center gap-3"><span><kbd className="rounded border border-border px-1 py-0.5">↑↓</kbd> navigate</span><span><kbd className="rounded border border-border px-1 py-0.5">esc</kbd> close</span></span></div>
    </CommandDialog>
  );
}
