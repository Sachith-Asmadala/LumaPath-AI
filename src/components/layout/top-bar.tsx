"use client";

import { demoScenario } from "@/lib/demo-data/scenario";

import Link from "next/link";
import { Bell, Command, Search, Sparkles } from "lucide-react";
import { useState } from "react";
import { useDemo } from "@/lib/state/demo-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { useRouter } from "next/navigation";
import { BrandIcon } from "@/components/brand/brand-icon";
import { brand } from "@/lib/brand";
import { ThemeToggle } from "@/components/public/public-header";

export function TopBar({ title, onOpenCommand, onOpenCopilot }: { title: string; onOpenCommand: () => void; onOpenCopilot: () => void }) {
  const [notificationOpen, setNotificationOpen] = useState(false);
  const { state, markNotificationRead } = useDemo();
  const router = useRouter();
  const unreadCount = state.notifications.filter((item) => !item.read).length;

  return (
    <header className="sticky top-0 z-30 flex h-[4.5rem] items-center justify-between gap-3 border-b border-border/75 bg-background/90 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <div className="md:hidden"><SidebarTrigger aria-label="Open navigation" className="size-11" /></div>
        <Link href="/overview" aria-label={`${brand.name} home`} className="flex size-11 items-center justify-center md:hidden"><BrandIcon size={40} decorative priority /></Link>
        <div className="hidden md:block"><SidebarTrigger aria-label="Collapse navigation" className="size-8 text-muted-foreground" /></div>
        <Separator orientation="vertical" className="hidden h-5 bg-border sm:block" />
        <div className="min-w-0">
          <p className="truncate text-[0.78rem] font-medium text-foreground"><span className="mr-2 hidden font-normal text-muted-foreground xl:inline">Your space <span className="ml-2 text-border">/</span></span>{title}</p>
          <p className="hidden truncate text-[0.65rem] text-muted-foreground lg:block">{new Date(`${demoScenario.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} <span className="mx-1.5 text-border">/</span> DevOps pathway</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <div className="hidden sm:block"><ThemeToggle /></div>
        <Button variant="outline" onClick={onOpenCommand} className="hidden h-9 w-[min(31vw,15rem)] justify-start gap-2 rounded-[14px] border-border/80 bg-white/[0.025] px-3 text-[0.72rem] text-muted-foreground hover:bg-white/[0.05] md:flex" aria-label="Search or open command palette">
          <Search className="size-3.5" aria-hidden="true" /><span className="flex-1 text-left">Search or jump to...</span><kbd className="flex items-center gap-0.5 rounded border border-border px-1.5 py-0.5 font-mono text-[0.58rem] text-muted-foreground"><Command className="size-2.5" />K</kbd>
        </Button>
        <Button variant="ghost" size="icon" onClick={onOpenCommand} className="size-11 text-muted-foreground hover:text-foreground md:hidden" aria-label="Open search and commands"><Search className="size-[17px]" /></Button>
        <Popover open={notificationOpen} onOpenChange={setNotificationOpen}>
          <PopoverTrigger asChild><Button variant="ghost" size="icon" className="relative size-11 text-muted-foreground hover:text-foreground md:size-9" aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}>
            <Bell className="size-[17px]" strokeWidth={1.8} />{unreadCount > 0 && <span className="absolute right-[7px] top-[7px] size-1.5 rounded-full bg-primary ring-2 ring-background" />}
          </Button></PopoverTrigger>
          <PopoverContent align="end" sideOffset={12} className="w-[min(22rem,calc(100vw-2rem))] rounded-[18px] border-border bg-popover p-0 shadow-[0_18px_50px_-20px_rgba(0,0,0,0.7)]">
            <div className="flex items-center justify-between px-4 py-3.5"><div><p className="text-sm font-medium text-foreground">Notifications</p><p className="mt-0.5 text-[0.68rem] text-muted-foreground">Your connected student context</p></div><Badge variant="outline" className="rounded-full border-primary/20 bg-primary/8 text-[0.62rem] text-primary">{unreadCount} new</Badge></div>
            <Separator className="bg-border/70" />
            <div className="max-h-[min(24rem,60dvh)] overflow-y-auto p-2">
              {state.notifications.map((item) => <button key={item.id} type="button" onClick={() => { markNotificationRead(item.id); setNotificationOpen(false); router.push(item.href); }} className="flex w-full gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-white/[0.045] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read ? "bg-border" : item.kind === "risk" ? "bg-risk" : "bg-primary"}`} />
                <span className="min-w-0"><span className="block text-[0.74rem] font-medium text-foreground">{item.title}</span><span className="mt-1 block text-[0.66rem] leading-5 text-muted-foreground">{item.description}</span></span>
              </button>)}
            </div>
          </PopoverContent>
        </Popover>
        <Button onClick={onOpenCopilot} variant="outline" className="hidden md:inline-flex h-9 gap-2 rounded-[14px] border-primary/20 bg-primary/[0.045] px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10" aria-label="Ask Luma AI Copilot">
          <Sparkles className="size-3.5" aria-hidden="true" /><span className="hidden sm:inline">Ask Luma</span>
        </Button>
        <Link href="/settings" className="ml-0.5 hidden size-8 items-center justify-center rounded-full border border-border bg-secondary text-xs font-semibold text-primary transition-colors hover:border-primary/25 sm:flex" aria-label={`Open ${state.student.name}'s profile settings`}>{state.student.initials}</Link>
      </div>
    </header>
  );
}
