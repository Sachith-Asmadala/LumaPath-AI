"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Activity, CalendarPlus, ChartNoAxesCombined, CheckCircle2, Compass, Network, Search, ShieldAlert, Sparkles, Timer, WandSparkles } from "lucide-react";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { useDemo } from "@/lib/state/demo-provider";

const commandItems = [
  { label: "Generate weekly plan", href: "/planner", icon: WandSparkles, group: "Planning" },
  { label: "Show next best action", href: "/overview", icon: CheckCircle2, group: "Planning" },
  { label: "Check deadline risks", href: "/overview", icon: ShieldAlert, group: "Planning" },
  { label: "Analyze skill gaps", href: "/skills", icon: ChartNoAxesCombined, group: "Career" },
  { label: "Add assignment", href: "/planner?add=assignment", icon: CalendarPlus, group: "Create" },
  { label: "Add career milestone", href: "/career-path", icon: Network, group: "Create" },
  { label: "Open career pathway", href: "/career-path", icon: Compass, group: "Navigate" },
  { label: "Start focus session", href: "/focus", icon: Timer, group: "Navigate" },
  { label: "Continue learning", href: "/learning", icon: Compass, group: "Navigate" },
  { label: "View Free and Premium plans", href: "/plans", icon: Sparkles, group: "Navigate" },
  { label: "Open intelligence feed", href: "/intelligence", icon: Activity, group: "Navigate" },
];

export function CommandPalette({ open, onOpenChange, onOpenCopilot }: { open: boolean; onOpenChange: (open: boolean) => void; onOpenCopilot: () => void }) {
  const router = useRouter();
  const { generatePlan } = useDemo();
  const navigate = useCallback((label: string, href: string) => {
    onOpenChange(false);
    if (label === "Generate weekly plan") void generatePlan();
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
    <CommandDialog open={open} onOpenChange={onOpenChange} title="LumaPath Command" description="Search your workspace or run an action.">
      <CommandInput placeholder="What would you like to do?" aria-label="Search commands" />
      <CommandList className="max-h-[min(24rem,58dvh)]">
        <CommandEmpty>No matching actions.</CommandEmpty>
        {["Planning", "Career", "Create", "Navigate"].map((group) => <CommandGroup key={group} heading={group}>
          {commandItems.filter((item) => item.group === group).map(({ label, href, icon: Icon }) => <CommandItem key={label} value={label} onSelect={() => navigate(label, href)} className="min-h-10 rounded-lg px-3 text-sm">
            <Icon className="mr-2 size-4 text-muted-foreground" aria-hidden="true" />{label}
            {label === "Show next best action" && <CommandShortcut>↵</CommandShortcut>}
          </CommandItem>)}
        </CommandGroup>)}
        <CommandGroup heading="Luma AI">
          <CommandItem value="Ask Luma" onSelect={() => { onOpenChange(false); onOpenCopilot(); }} className="min-h-10 rounded-lg px-3 text-sm"><Sparkles className="mr-2 size-4 text-primary" aria-hidden="true" />Ask Luma<CommandShortcut>⌘ L</CommandShortcut></CommandItem>
        </CommandGroup>
      </CommandList>
      <div className="flex items-center gap-2 border-t border-border/70 px-4 py-2.5 text-[0.63rem] text-muted-foreground"><Search className="size-3" />Type to filter <span className="ml-auto flex items-center gap-3"><span><kbd className="rounded border border-border px-1 py-0.5">↑↓</kbd> navigate</span><span><kbd className="rounded border border-border px-1 py-0.5">esc</kbd> close</span></span></div>
    </CommandDialog>
  );
}
