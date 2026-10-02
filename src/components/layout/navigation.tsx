"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, ChevronDown, Grid2X2, Search, Settings2, Sparkles, X } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarInset, useSidebar } from "@/components/ui/sidebar";
import { useDemo } from "@/state/demo-provider";
import { CommandPalette } from "@/components/layout/command-palette";
import { TopBar } from "@/components/layout/top-bar";
import { CopilotDrawer } from "@/features/assistant/components/copilot-drawer";
import { PageTransition } from "@/components/motion/page-transition";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrandIcon } from "@/components/brand/brand-icon";
import { useLocale } from "@/i18n/locale-provider";
import { NotificationProvider } from "@/features/notifications/components/notification-provider";
import { AchievementProvider } from "@/features/achievements/components/achievement-provider";
import { SubscriptionProvider, useSubscription } from "@/features/subscriptions/components/subscription-provider";
import { homeLink, inboxLink, routeMatches, workspaceGroups, workspaceLinks } from "./workspace-map";
import { DecisionPulse } from "@/features/dashboard/components/decision-pulse";
import { PremiumWelcome } from "./premium-welcome";

export function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return <SubscriptionProvider><TooltipProvider delayDuration={250}><NotificationProvider><AchievementProvider>
    <SidebarProvider defaultOpen className="workspace-shell"><WorkspaceContent>{children}</WorkspaceContent></SidebarProvider>
  </AchievementProvider></NotificationProvider></TooltipProvider></SubscriptionProvider>;
}

function WorkspaceContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();
  const { isMobile, setOpenMobile, state: sidebarState } = useSidebar();
  const { state } = useDemo();
  const { subscription } = useSubscription();
  const { t } = useLocale();
  const [commandOpen, setCommandOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "l") {
        event.preventDefault();
        setCopilotOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);
  const activeGroup = workspaceGroups.find((group) => group.links.some((link) => routeMatches(pathname, link.href)));
  const activeLink = workspaceLinks.find((link) => routeMatches(pathname, link.href));
  const title = activeLink ? t(activeLink.labelKey) : pathname === "/explore" ? "All tools" : ["/plans", "/pricing", "/settings/subscription"].includes(pathname) ? "Plans & membership" : t("nav.settings");
  const focus = pathname === "/focus";
  const closeMobile = () => { if (isMobile) setOpenMobile(false); };
  const renderLink = ({ labelKey, href, icon: Icon }: typeof homeLink) => <SidebarMenuItem key={href}>
    <SidebarMenuButton asChild isActive={routeMatches(pathname, href)} tooltip={t(labelKey)} className="workspace-nav-link">
      <Link href={href} aria-current={routeMatches(pathname, href) ? "page" : undefined} onClick={closeMobile}><Icon size={18} strokeWidth={1.7} /><span>{t(labelKey)}</span></Link>
    </SidebarMenuButton>
  </SidebarMenuItem>;

  return <>
    <a className="workspace-skip" href="#workspace-main">Skip to content</a>
    {!focus && <Sidebar collapsible="icon" className="workspace-sidebar">
      <SidebarHeader className="gap-5 px-5 pb-5 pt-7 group-data-[collapsible=icon]:px-1">
        <div className="flex items-center justify-between"><Link href="/overview" className="workspace-brand" aria-label="LumaPath home"><BrandIcon size={34} decorative /><span className="group-data-[collapsible=icon]:hidden">luma<span>path</span><small>YOUR PERSONAL WORKSPACE</small></span></Link>{isMobile && <button onClick={() => setOpenMobile(false)} aria-label="Close navigation" className="grid size-10 place-items-center rounded-xl hover:bg-muted"><X size={18} /></button>}</div>
        <button className="sidebar-search group-data-[collapsible=icon]:hidden" onClick={() => { closeMobile(); setCommandOpen(true); }}><Search size={16} /><span>Find anything...</span><kbd>⌘ K</kbd></button>
      </SidebarHeader>
      <SidebarContent className="gap-5 px-3 pb-4">
        <SidebarMenu>{[homeLink, inboxLink].map(renderLink)}<SidebarMenuItem><SidebarMenuButton asChild tooltip="All tools" isActive={pathname === "/explore"} className="workspace-nav-link"><Link href="/explore" onClick={closeMobile} aria-current={pathname === "/explore" ? "page" : undefined}><Grid2X2 size={18} /><span>All tools</span><span className="nav-count">{workspaceGroups.flatMap((group) => group.links).length}</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <div><p className="sidebar-caption group-data-[collapsible=icon]:hidden">YOUR WORKSPACE</p>
          {workspaceGroups.map((group) => {
            const open = expanded === null ? activeGroup?.id === group.id || (!activeGroup && group.id === "planning") : expanded === group.id;
            const Icon = group.icon;
            return <div key={group.id} className="nav-section">
              {sidebarState === "collapsed" && !isMobile ? <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip={group.title} isActive={activeGroup?.id === group.id} className="workspace-nav-link"><Link href={group.links[0].href}><Icon size={18} /><span>{group.title}</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu> : <>
                <button className="nav-section-trigger" aria-expanded={open} aria-controls={`nav-${group.id}`} onClick={() => setExpanded(open ? "" : group.id)}><Icon size={17} /><span>{group.title}</span><ChevronDown size={14} className={open ? "rotate-180" : ""} /></button>
                <div id={`nav-${group.id}`} className="nav-section-content" hidden={!open}><SidebarMenu>{group.links.map(renderLink)}</SidebarMenu></div>
              </>}
            </div>;
          })}
        </div>
        <Link href="/plans" onClick={closeMobile} className="sidebar-premium group-data-[collapsible=icon]:hidden"><span className="flex items-center justify-between"><Sparkles size={18} /><span className="premium-tag">EXPLORE PRO</span></span><strong>A little more possibility.</strong><span>Meet LumaPath Pro</span><ArrowUpRight size={17} className="absolute bottom-5 right-4" /></Link>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border px-3 py-4">
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild tooltip={t("nav.settings")} className="workspace-nav-link" isActive={pathname === "/settings"}><Link href="/settings" onClick={closeMobile}><Settings2 size={18} /><span>{t("nav.settings")}</span></Link></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <Link href="/settings" onClick={closeMobile} className="sidebar-profile"><span className="profile-initials">{state.student.initials}</span><span className="min-w-0 group-data-[collapsible=icon]:hidden"><strong>{state.student.name}</strong><small>{subscription?.name ?? "My workspace"}</small></span></Link>
      </SidebarFooter>
    </Sidebar>}
    <SidebarInset className="workspace-surface min-w-0 bg-transparent" data-page={pathname.split("/")[1]}>
      {!focus && <TopBar title={title} onOpenCommand={() => setCommandOpen(true)} onOpenCopilot={() => setCopilotOpen(true)} />}
      {!focus && activeGroup && <nav className="workspace-context-nav" aria-label={`${activeGroup.title} tools`}>{activeGroup.links.map((link) => <Link key={link.href} href={link.href} aria-current={routeMatches(pathname, link.href) ? "page" : undefined}>{t(link.labelKey)}</Link>)}</nav>}
      <main id="workspace-main" tabIndex={-1} className={focus ? "min-h-dvh outline-none" : "min-h-[calc(100dvh-5rem)] pb-24 outline-none md:pb-10"}>
        {!focus && <div className="mx-auto max-w-[1400px] px-4 sm:px-8"><DecisionPulse /></div>}
        <PageTransition pathname={pathname} reduceMotion={Boolean(reduced)}>{children}</PageTransition>
      </main>
      {!focus && <nav aria-label={t("nav.mobilePrimary")} className="workspace-mobile-nav">{[homeLink, workspaceGroups[0].links[1], workspaceGroups[0].links[2]].map(({ labelKey, href, icon: Icon }) => <Link key={href} href={href} aria-current={routeMatches(pathname, href) ? "page" : undefined}><Icon size={20} /><span>{t(labelKey)}</span></Link>)}<button onClick={() => setOpenMobile(true)}><Grid2X2 size={20} /><span>More</span></button></nav>}
    </SidebarInset>
    {!focus && <PremiumWelcome studentId={state.student.id} />}
    <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} onOpenCopilot={() => setCopilotOpen(true)} />
    <CopilotDrawer open={copilotOpen} onOpenChange={setCopilotOpen} route={pathname} />
    <Toaster position="bottom-right" richColors={false} closeButton />
  </>;
}
