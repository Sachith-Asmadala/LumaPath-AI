"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, Search, Settings2, Sparkles, WandSparkles } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { workspaceLinks } from "./workspace-map";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";

const commandItems = [
  { labelKey: "command.generatePlan", href: "/planner", icon: WandSparkles },
  { labelKey: "command.addAssignment", href: "/planner?add=assignment", icon: CalendarPlus },
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
        <CommandGroup heading="Quick actions">
          {commandItems.map(({ labelKey, href, icon: Icon }) => <CommandItem key={labelKey} value={t(labelKey)} onSelect={() => navigate(labelKey, href)} className="min-h-11 rounded-lg px-3 text-sm"><Icon className="mr-2 size-4 text-muted-foreground" />{t(labelKey)}</CommandItem>)}
        </CommandGroup>
        <CommandGroup heading="All workspace tools">
          {workspaceLinks.map(({ labelKey, href, icon: Icon, description }) => <CommandItem key={href} value={`${t(labelKey)} ${description}`} onSelect={() => navigate(labelKey, href)} className="min-h-11 rounded-lg px-3 text-sm"><Icon className="mr-2 size-4 text-muted-foreground" />{t(labelKey)}</CommandItem>)}
          <CommandItem value="All tools directory explore" onSelect={() => navigate("", "/explore")} className="min-h-11 rounded-lg px-3 text-sm"><Search className="mr-2 size-4" />Explore all tools</CommandItem>
          <CommandItem value="Plans membership Plus premium" onSelect={() => navigate("", "/plans")} className="min-h-11 rounded-lg px-3 text-sm"><Sparkles className="mr-2 size-4" />Plans & membership</CommandItem>
          <CommandItem value="Settings profile language theme" onSelect={() => navigate("", "/settings")} className="min-h-11 rounded-lg px-3 text-sm"><Settings2 className="mr-2 size-4" />{t("nav.settings")}</CommandItem>
        </CommandGroup>
        <CommandGroup heading="Luma AI">
          <CommandItem value={t("top.askLuma")} onSelect={() => { onOpenChange(false); onOpenCopilot(); }} className="min-h-10 rounded-lg px-3 text-sm"><Sparkles className="mr-2 size-4 text-primary" aria-hidden="true" />{t("top.askLuma")}<CommandShortcut>⌘ L</CommandShortcut></CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2.5 text-[0.63rem] text-muted-foreground"><Search className="size-3" />Type to filter <span className="ml-auto flex items-center gap-3"><span><kbd className="rounded border border-border px-1 py-0.5">↑↓</kbd> navigate</span><span><kbd className="rounded border border-border px-1 py-0.5">esc</kbd> close</span></span></div>
    </CommandDialog>
  );
}
