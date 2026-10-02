import { Activity, Bell, BookOpen, BrainCircuit, BriefcaseBusiness, Building2, CalendarDays, CalendarSync, ChartNoAxesCombined, CheckSquare2, ClipboardList, Compass, DatabaseZap, FileText, Files, GitCompareArrows, HandHelping, LayoutDashboard, MessageSquareText, Network, Route, ShieldCheck, Timer, Trophy, UsersRound } from "lucide-react";

// One directory powers navigation, discovery, and contextual links.
export const workspaceGroups = [
  { id: "planning", title: "Plan your day", description: "Your time, tasks, and a little space to focus.", icon: CalendarDays, links: [
    { labelKey: "nav.tasks", href: "/tasks", icon: CheckSquare2, description: "Capture work and keep deadlines in sight." },
    { labelKey: "nav.planner", href: "/planner", icon: CalendarDays, description: "Build a realistic schedule around your day." },
    { labelKey: "nav.focus", href: "/focus", icon: Timer, description: "One task. A calm space. Time to make progress." },
    { labelKey: "nav.calendarSync", href: "/calendar-sync", icon: CalendarSync, description: "Bring your calendars and deadlines together." },
    { labelKey: "nav.teams", href: "/teams", icon: UsersRound, description: "Coordinate shared projects and milestones." },
  ] },
  { id: "learning", title: "Learn & grow", description: "Build understanding, one useful step at a time.", icon: BookOpen, links: [
    { labelKey: "nav.learning", href: "/learning", icon: BookOpen, description: "Pick up a course or discover a learning resource." },
    { labelKey: "nav.studyAssistant", href: "/study-assistant", icon: BrainCircuit, description: "Get guidance grounded in your study context." },
    { labelKey: "nav.documents", href: "/documents", icon: Files, description: "Organize and work with your study materials." },
    { labelKey: "nav.skills", href: "/skills", icon: Compass, description: "See your strengths and what to practice next." },
  ] },
  { id: "career", title: "Build your career", description: "Turn your ambitions into a path you can follow.", icon: BriefcaseBusiness, links: [
    { labelKey: "nav.careerPath", href: "/career-path", icon: Network, description: "Choose your direction and assess your starting point." },
    { labelKey: "nav.roadmap", href: "/roadmap", icon: Route, description: "Follow the milestones toward your career goal." },
    { labelKey: "nav.careerCompare", href: "/career-compare", icon: GitCompareArrows, description: "Compare possible paths before choosing one." },
    { labelKey: "nav.portfolio", href: "/portfolio", icon: BriefcaseBusiness, description: "Showcase your projects and practical experience." },
    { labelKey: "nav.evidence", href: "/evidence", icon: ShieldCheck, description: "Connect your skills with evidence of your work." },
    { labelKey: "nav.cv", href: "/cv", icon: FileText, description: "Review your CV and identify improvements." },
    { labelKey: "nav.opportunities", href: "/opportunities", icon: Compass, description: "Find opportunities relevant to your next step." },
    { labelKey: "nav.applications", href: "/internships", icon: ClipboardList, description: "Track applications from interest to outcome." },
    { labelKey: "nav.interviews", href: "/interviews", icon: MessageSquareText, description: "Prepare for your next career conversation." },
    { labelKey: "nav.mentors", href: "/mentors", icon: HandHelping, description: "Invite trusted guidance on your progress." },
  ] },
  { id: "insights", title: "See your progress", description: "Understand what is changing and how far you have come.", icon: ChartNoAxesCombined, links: [
    { labelKey: "nav.analytics", href: "/analytics", icon: ChartNoAxesCombined, description: "Understand your study and planning patterns." },
    { labelKey: "nav.achievements", href: "/achievements", icon: Trophy, description: "Celebrate the milestones you have earned." },
    { labelKey: "nav.intelligence", href: "/intelligence", icon: Activity, description: "Catch up on learning and career updates." },
    { labelKey: "nav.marketSignals", href: "/market-signals", icon: DatabaseZap, description: "Explore emerging skills and market signals." },
    { labelKey: "nav.programmeAnalytics", href: "/programme-analytics", icon: Building2, description: "View aggregate programme insights for institutions." },
  ] },
];
export const homeLink = { labelKey: "nav.overview", href: "/overview", icon: LayoutDashboard, description: "Your next step, today's schedule, and priorities." };
export const inboxLink = { labelKey: "nav.notifications", href: "/notifications", icon: Bell, description: "Keep up with reminders and important updates." };
export const workspaceLinks = [homeLink, inboxLink, ...workspaceGroups.flatMap((group) => group.links)];
export function routeMatches(pathname: string, href: string) { return pathname === href || pathname.startsWith(`${href}/`); }
