"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Activity, ArrowUpRight, BriefcaseBusiness, CalendarDays, ChartNoAxesCombined, CheckSquare2, Compass, LayoutDashboard, Mic2, Network, Settings2, Sparkles, ShieldCheck } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { useDemo } from "@/lib/state/demo-provider";
import { CommandPalette } from "@/components/layout/command-palette";
import { TopBar } from "@/components/layout/top-bar";
import { StudentContextGraph } from "@/components/layout/student-context-graph";
import { CopilotDrawer } from "@/components/ai-copilot/copilot-drawer";
import { PageTransition } from "@/components/motion/page-transition";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { BrandIcon } from "@/components/brand/brand-icon";
import { BrandLogo } from "@/components/brand/brand-logo";
import { brand } from "@/lib/brand";
import { selectDeadlineRiskTasks } from "@/lib/domain/dashboard";

const primaryLinks = [
  { label: "Overview", href: "/overview", icon: LayoutDashboard },
  { label: "Tasks", href: "/tasks", icon: CheckSquare2 },
  { label: "Planner", href: "/planner", icon: CalendarDays },
  { label: "Focus", href: "/focus", icon: Mic2 },
  { label: "Career Path", href: "/career-path", icon: Network },
  { label: "Skills", href: "/skills", icon: Compass },
  { label: "Evidence", href: "/evidence", icon: ShieldCheck },
  { label: "Intelligence", href: "/intelligence", icon: Activity },
  { label: "Analytics", href: "/analytics", icon: ChartNoAxesCombined },
];

const mobileLinks = [primaryLinks[0], primaryLinks[2], primaryLinks[4], primaryLinks[7]];

import { DecisionPulse } from "@/features/dashboard/components/decision-pulse";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={250}>
      <SidebarProvider defaultOpen>
        <WorkspaceContent>{children}</WorkspaceContent>
      </SidebarProvider>
    </TooltipProvider>
  );
}

function WorkspaceContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const { isMobile, setOpenMobile } = useSidebar();
  const { state, resetDemo } = useDemo();
  const resetJourney = () => { resetDemo(); router.replace("/onboarding"); };
  const [commandOpen, setCommandOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const activeRoute = primaryLinks.find((link) => link.href === pathname || pathname.startsWith(`${link.href}/`))?.label ?? (pathname === "/settings" ? "Settings" : "Overview");
  const priorityCount = selectDeadlineRiskTasks(state).filter((task) => task.riskScore >= 70).length;

  return (
    <>
      {pathname !== "/focus" && <Sidebar collapsible="icon" variant="sidebar" className="border-sidebar-border">
        <SidebarHeader className="px-4 pb-4 pt-5 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-1">
          <Link href="/overview" aria-label={`${brand.name} home`} className="relative flex h-16 w-full items-center overflow-hidden rounded-lg transition-transform duration-200 hover:scale-[1.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none group-data-[collapsible=icon]:w-10 group-data-[collapsible=icon]:justify-center">
            <span className="relative flex h-16 w-full items-center group-data-[collapsible=icon]:hidden">
              <BrandLogo size="lg" priority decorative className="absolute left-0 top-1/2 max-w-none -translate-y-1/2" />
            </span>
            <span className="hidden group-data-[collapsible=icon]:flex"><BrandIcon size={38} decorative priority /></span>
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-3 pt-3">
          <SidebarGroup className="p-0">
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {primaryLinks.map(({ label, href, icon: Icon }, index) => {
                  const isActive = pathname === href || (href !== "/overview" && pathname.startsWith(`${href}/`));
                  return (
                    <SidebarMenuItem key={href}>
                      {(index === 0 || index === 4) && <p className={cn("px-3 pb-3 text-[0.58rem] font-medium uppercase tracking-[0.16em] text-muted-foreground/80 group-data-[collapsible=icon]:hidden", index === 4 && "pt-6")}>{index === 0 ? "Your everyday" : "Your next chapter"}</p>}
                      <SidebarMenuButton asChild isActive={isActive} tooltip={label} className={cn("relative h-11 rounded-xl px-3 text-[0.78rem] text-muted-foreground transition-colors hover:text-foreground data-active:bg-sidebar-accent data-active:text-foreground md:h-10", isActive && "text-foreground")}>
                        <Link href={href} aria-current={isActive ? "page" : undefined} onClick={() => { if (isMobile) setOpenMobile(false); }}>
                          {isActive && <motion.span layoutId={reduceMotion ? undefined : "sidebar-active-indicator"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute right-3 size-1.5 rounded-full bg-primary/70 group-data-[collapsible=icon]:hidden" transition={{ type: "spring", stiffness: 400, damping: 36 }} />}
                          <Icon className="size-[17px] shrink-0 transition-transform duration-200 group-hover/menu-button:-translate-y-px motion-reduce:transition-none" strokeWidth={1.7} aria-hidden="true" />
                          <span>{label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
          <div className="mt-auto p-1 pb-3 group-data-[collapsible=icon]:px-0">
            <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-border/70 bg-white/[0.025] p-2.5 group-data-[collapsible=icon]:hidden">
              <span className="relative flex size-2.5 shrink-0">
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-foreground">Your week is in view</p>
                <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{priorityCount} priorities · {state.planBlocks.filter((block) => block.isFocusBlock).length} focus blocks</p>
              </div>
            </div>
            <Button onClick={() => { if (isMobile) setOpenMobile(false); setCopilotOpen(true); }} variant="ghost" className="h-11 w-full justify-start gap-2.5 rounded-lg px-3 text-muted-foreground hover:text-foreground md:h-10 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0" aria-label="Open AI Copilot">
              <Sparkles className="size-[17px] shrink-0 text-primary" aria-hidden="true" />
              <span className="group-data-[collapsible=icon]:hidden">AI Copilot</span>
              <span className="ml-auto rounded-md border border-border px-1 py-0.5 font-mono text-[0.55rem] text-muted-foreground group-data-[collapsible=icon]:hidden">⌘ L</span>
            </Button>
          </div>
        </SidebarContent>
        <SidebarFooter className="gap-2 border-t border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
          <Button asChild variant="ghost" className="h-11 justify-start gap-2.5 px-2.5 text-muted-foreground hover:text-foreground md:h-9 group-data-[collapsible=icon]:hidden"><Link href="/settings"><Settings2 className="size-4" aria-hidden="true" />Settings</Link></Button>
          <Link href="/" className="flex min-h-9 items-center gap-2.5 px-2.5 text-xs text-muted-foreground transition-colors hover:text-primary group-data-[collapsible=icon]:hidden">About LumaPath<ArrowUpRight className="ml-auto size-3.5" /></Link>
          <Button onClick={resetJourney} variant="ghost" className="h-11 justify-start px-2.5 text-[0.7rem] text-muted-foreground hover:bg-white/[0.04] hover:text-foreground md:h-8 group-data-[collapsible=icon]:hidden" title="Restart the student journey">Demo Reset</Button>
          <Separator className="bg-sidebar-border" />
          <div className="flex items-center gap-2.5 overflow-hidden px-1.5 py-1 group-data-[collapsible=icon]:px-0">
            <Avatar className="size-8 rounded-xl border border-border bg-secondary"><AvatarFallback className="rounded-xl bg-transparent text-xs font-semibold text-primary">{state.student.initials}</AvatarFallback></Avatar>
            <div className="min-w-0 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-xs font-medium text-foreground">{state.student.name}</p>
              <p className="mt-0.5 truncate text-[0.65rem] text-muted-foreground">{state.onboarding.degree}</p>
            </div>
            <BriefcaseBusiness className="ml-auto size-3.5 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden" aria-hidden="true" />
          </div>
        </SidebarFooter>
      </Sidebar>}
      <SidebarInset className="workspace-surface min-w-0 overflow-x-hidden bg-transparent" data-page={pathname.split("/")[1]}>
        {pathname !== "/focus" && <TopBar title={activeRoute} onOpenCommand={() => setCommandOpen(true)} onOpenCopilot={() => setCopilotOpen(true)} />}
        <main className={cn("relative z-10 min-h-[calc(100dvh-4.5rem)]", pathname === "/focus" ? "pb-0" : "pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-10")}>
          {pathname !== "/overview" && <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-8"><DecisionPulse /></div>}
          <PageTransition pathname={pathname} reduceMotion={Boolean(reduceMotion)}>{children}</PageTransition>
        </main>
        {pathname !== "/focus" && <MobileBottomNav pathname={pathname} />}
      </SidebarInset>
      {pathname !== "/focus" && <StudentContextGraph />}
      {pathname !== "/focus" && pathname !== "/overview" && <Button onClick={() => setCopilotOpen(true)} size="icon" className="fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 size-11 rounded-full border border-primary/20 bg-card text-primary shadow-sm hover:bg-accent md:hidden" aria-label="Open Luma AI Copilot"><Sparkles className="size-4" /></Button>}
      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onOpenCopilot={() => setCopilotOpen(true)} />
      <CopilotDrawer open={copilotOpen} onOpenChange={setCopilotOpen} route={pathname} />
      <Toaster position="bottom-right" richColors={false} closeButton />
    </>
  );
}

function MobileBottomNav({ pathname }: { pathname: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-background/95 px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-lg md:hidden">
      <ul className="mx-auto flex max-w-xl items-center justify-around">
        {mobileLinks.map(({ label, href, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return <li key={href}><Link href={href} aria-current={active ? "page" : undefined} className={cn("relative flex min-w-16 flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-xs text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", active && "text-primary")}>
            {active && <motion.span layoutId={reduceMotion ? undefined : "mobile-nav-active"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduceMotion ? 0.08 : 0.22 }} className="absolute -top-2 left-1/2 h-0.5 w-7 -translate-x-1/2 rounded-full bg-primary" />}
            <Icon className="size-[18px]" strokeWidth={active ? 2 : 1.7} aria-hidden="true" />{label}
          </Link></li>;
        })}
      </ul>
    </nav>
  );
}
