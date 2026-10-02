"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Filter, GraduationCap, NotebookText, PlayCircle, RotateCcw } from "lucide-react";
import Loading from "@/app/loading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { rankLearningResources, type CostFilter, type ResourceFilters, type ResourceRecommendation } from "@/features/learning/domain/resource-recommender";
import type { LearningResource, ResourceContentType, ResourceLevel } from "@/data/demo/resources";
import { freePathForSkill, freePathWeeks } from "@/data/demo/free-learning-paths";
import { useDemo } from "@/state/demo-provider";

function demoCost(resource: LearningResource) {
  if (resource.costType === "free") return "Free";
  return resource.costType === "subscription" ? `~$${resource.price}/month demo estimate` : `~$${resource.price} one-time demo estimate`;
}

const contentTypes: { value: ResourceContentType; label: string }[] = [
  { value: "course", label: "Courses" },
  { value: "video", label: "Videos" },
  { value: "notes", label: "Notes" },
  { value: "documentation", label: "Docs" },
  { value: "lab", label: "Labs" },
  { value: "project", label: "Projects" },
];
const levels: ResourceLevel[] = ["beginner", "intermediate", "advanced"];

type RecommendationApiResponse = { recommendations: ResourceRecommendation[]; count: number };

export default function LearningResourcesPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const router = useRouter();
  const [scheduling, setScheduling] = useState(false);
  const [scheduleError, setScheduleError] = useState(false);
  const [query, setQuery] = useState("");
  const [contentType, setContentType] = useState<ResourceContentType | "all">("all");
  const [level, setLevel] = useState<ResourceLevel | "all">("all");
  const [cost, setCost] = useState<CostFilter>("any");
  const [certificateOnly, setCertificateOnly] = useState(false);
  const [maxDurationHours, setMaxDurationHours] = useState<number | undefined>();
  const [serverResults, setServerResults] = useState<ResourceRecommendation[] | null>(null);
  const [backendStatus, setBackendStatus] = useState<"idle" | "loading" | "ready" | "fallback">("idle");
  const { state, onboardingReady, chooseResource, scheduleSelectedResource, learningAction } = useDemo();
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const ready = state.onboarding.completed && Boolean(state.assessment);
  const eligible = skill?.status === "available" || skill?.status === "in-progress";
  const filters = useMemo<ResourceFilters>(() => ({
    query: query || undefined,
    contentTypes: contentType === "all" ? undefined : [contentType],
    levels: level === "all" ? undefined : [level],
    cost,
    certificateOnly,
    maxDurationHours,
  }), [query, contentType, level, cost, certificateOnly, maxDurationHours]);
  const localFallback = useMemo(() => skill && ready && eligible ? rankLearningResources(skill, state.onboarding, undefined, filters) : [], [skill, ready, eligible, state.onboarding, filters]);
  const recommendations = serverResults ?? localFallback;
  const freePath = skill && ready && eligible ? freePathForSkill(skill.id) : undefined;

  useEffect(() => {
    if (!skill || !ready || !eligible) { setServerResults(null); setBackendStatus("idle"); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setBackendStatus("loading");
      try {
        const response = await fetch("/api/learning/recommendations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ skill: { id: skill.id, name: skill.name, proficiency: skill.proficiency }, preferences: state.onboarding, filters }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Recommendation API unavailable");
        const payload = await response.json() as RecommendationApiResponse;
        setServerResults(payload.recommendations);
        setBackendStatus("ready");
      } catch (error) {
        if ((error as Error).name === "AbortError") return;
        setServerResults(null);
        setBackendStatus("fallback");
      }
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [skill, ready, eligible, state.onboarding, filters]);

  const scheduleChosen = async (resourceId: string) => {
    setScheduling(true);
    setScheduleError(false);
    const success = await scheduleSelectedResource(skillId, resourceId);
    setScheduling(false);
    if (success) router.push("/planner");
    else setScheduleError(true);
  };
  const resetFilters = () => { setQuery(""); setContentType("all"); setLevel("all"); setCost("any"); setCertificateOnly(false); setMaxDurationHours(undefined); };

  if (!onboardingReady) return <Loading />;

  return <main className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8">
    <Button asChild variant="ghost" className="mb-5 h-10 gap-2 px-2 text-sm"><Link href="/career-path"><ArrowLeft className="size-4" aria-hidden="true" />Career Path</Link></Button>
    {!ready || !skill || !eligible ? <Card className="rounded-[20px] border-border/80 bg-surface-raised p-6 sm:p-8">
      <h1 className="font-heading text-2xl font-semibold text-foreground">Learning resources unavailable</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{!ready ? "Complete onboarding and your baseline assessment to see personalized resource matches." : !skill ? "This skill is not in the current roadmap." : "Complete the earlier roadmap steps before exploring resources for this skill."}</p>
      <Button asChild className="mt-4 h-11 rounded-xl px-4"><Link href={!state.onboarding.completed ? "/onboarding" : !state.assessment ? "/assessment" : "/career-path"}>{!ready ? "Continue setup" : "Back to roadmap"}</Link></Button>
    </Card> : <>
      <div className="mb-6">
        <p className="type-eyebrow mb-2 text-pathway">Personalized learning discovery</p>
        <h1 className="font-heading text-[clamp(1.75rem,4vw,2.45rem)] font-semibold leading-tight tracking-[-0.035em] text-foreground">Find learning resources for {skill.name}</h1>
        <p className="mt-3 max-w-[72ch] text-sm leading-6 text-muted-foreground">Results respect your assessed skill level, {state.onboarding.weeklyLearningHours} learning hours/week, {state.onboarding.budget} budget, {state.onboarding.language} language, certificate preference, and learning format. Use the filters to narrow the ranked set to videos, notes, courses, labs or documentation.</p>
      </div>

      <Card className="mb-6 rounded-[20px] border-border/80 bg-surface-raised p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Filter className="size-4 text-primary" /><h2 className="font-heading text-lg font-semibold">Filter recommendations</h2></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><span>{backendStatus === "loading" ? "Ranking…" : backendStatus === "ready" ? "Server-ranked" : backendStatus === "fallback" ? "Local fallback active" : "Ready"}</span><Button type="button" variant="ghost" className="h-9 gap-1.5 px-2 text-xs" onClick={resetFilters}><RotateCcw className="size-3.5" />Reset</Button></div></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <Input aria-label="Search resources" placeholder="Search title, tag…" value={query} onChange={(event) => setQuery(event.target.value)} className="h-11 xl:col-span-2" />
          <select aria-label="Resource type" className="workspace-select h-11" value={contentType} onChange={(event) => setContentType(event.target.value as ResourceContentType | "all")}><option value="all">All types</option>{contentTypes.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}</select>
          <select aria-label="Difficulty level" className="workspace-select h-11" value={level} onChange={(event) => setLevel(event.target.value as ResourceLevel | "all")}><option value="all">All levels</option>{levels.map((item) => <option key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</option>)}</select>
          <select aria-label="Cost" className="workspace-select h-11" value={cost} onChange={(event) => setCost(event.target.value as CostFilter)}><option value="any">Any cost</option><option value="free">Free only</option><option value="paid">Paid</option></select>
          <select aria-label="Maximum duration" className="workspace-select h-11" value={maxDurationHours ?? ""} onChange={(event) => setMaxDurationHours(event.target.value ? Number(event.target.value) : undefined)}><option value="">Any duration</option><option value="1">≤ 1 hour</option><option value="4">≤ 4 hours</option><option value="8">≤ 8 hours</option><option value="16">≤ 16 hours</option></select>
        </div>
        <label className="mt-3 inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={certificateOnly} onChange={(event) => setCertificateOnly(event.target.checked)} className="size-4" />Certificate option only</label>
      </Card>

      <div className="mb-6 rounded-xl border border-warning/25 bg-warning/[0.06] px-4 py-3 text-sm leading-6 text-foreground/85">Prototype catalog: resource metadata and prices are illustrative. The ranking logic is deterministic and explainable; the API validates profile constraints before returning matches.</div>

      {freePath && <Card className="mb-6 flex flex-col gap-3 rounded-[20px] border-success/25 bg-success/[0.055] p-5 shadow-none sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><p className="type-eyebrow text-success">{state.onboarding.budget === "free only" ? "Built for your free-only budget" : "Open learning option"}</p><h2 className="mt-1 font-heading text-xl font-semibold text-foreground">{freePath.title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">A complete $0 path through official docs, selected video learning, a free lab, a portfolio project, and verification. {freePath.durationHours} hours · about {freePathWeeks(freePath, state.onboarding.weeklyLearningHours)} weeks at your pace.</p></div>
        <Button asChild className="h-11 shrink-0 rounded-xl px-4 text-sm font-semibold"><Link href={`/career-path/${skill.id}/free-path`}>View Free Learning Path</Link></Button>
      </Card>}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-xl font-semibold">Ranked matches</h2><p className="text-xs text-muted-foreground">{recommendations.length} matching resource{recommendations.length === 1 ? "" : "s"}</p></div>
      {recommendations.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {recommendations.map(({ resource, matchScore, reasons }, index) => {
          const chosen = state.selectedResourceBySkill[skill.id] === resource.id;
          const Icon = resource.contentType === "video" ? PlayCircle : resource.contentType === "notes" ? NotebookText : GraduationCap;
          return <Card key={resource.id} className="flex h-full flex-col gap-0 rounded-[20px] border-border/80 bg-surface-raised p-5 shadow-none sm:p-6">
            <div className="flex items-start justify-between gap-3"><span className="rounded-full border border-primary/25 bg-primary/[0.07] px-2.5 py-1 text-xs font-semibold text-primary">#{index + 1} match</span><span className="text-xs font-semibold tabular-nums text-foreground">{matchScore}%</span></div>
            <div className="mt-3 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-xs font-medium text-pathway"><Icon className="size-3.5" />{resource.provider} · <span className="capitalize">{resource.contentType}</span></p><Button variant="ghost" className="h-10 px-2 text-xs" aria-pressed={state.resourceBookmarks.includes(resource.id)} onClick={() => learningAction({ type: "bookmark-resource", resourceId: resource.id })}>{state.resourceBookmarks.includes(resource.id) ? "Saved" : "Save"}</Button></div>
            <h3 className="mt-1 font-heading text-lg font-semibold leading-snug text-foreground">{resource.title}</h3>
            <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted-foreground"><span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5 capitalize">{resource.level}</span><span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5 capitalize">{resource.format}</span><span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5">{resource.durationHours}h</span><span className="rounded-lg border border-border bg-background/55 px-2.5 py-1.5">Quality {resource.qualityScore}</span></div>
            <p className="mt-4 text-sm font-medium text-foreground">{demoCost(resource)}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><GraduationCap className="size-4" />{resource.certificate ? "Certificate option" : "No external certificate"}</p>
            <h4 className="mt-5 text-sm font-semibold text-foreground">Why this fits you</h4>
            <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-5 text-muted-foreground">{reasons.slice(0, 5).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            <div className="mt-auto pt-6"><Button type="button" onClick={() => chooseResource(skill.id, resource.id)} disabled={chosen || Boolean(state.scheduledPathBySkill[skill.id])} className="h-11 w-full rounded-xl px-4 text-sm font-semibold">{chosen ? <><CheckCircle2 className="size-4" />Path Chosen</> : "Choose This Resource"}</Button>{chosen && state.scheduledPathBySkill[skill.id] === resource.id && <Button asChild variant="outline" className="mt-3 h-11 w-full rounded-xl text-sm"><Link href="/planner">Open Planner</Link></Button>}{chosen && !state.scheduledPathBySkill[skill.id] && <Button type="button" onClick={() => scheduleChosen(resource.id)} disabled={scheduling} variant="outline" className="mt-3 h-11 w-full rounded-xl text-sm">{scheduling ? "Scheduling…" : "Add to My Plan"}</Button>}<a href={resource.url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg text-sm text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Open resource<ExternalLink className="size-4" /></a></div>
          </Card>;
        })}
      </div> : <Card className="rounded-[20px] border-border/80 bg-surface-raised p-6"><h2 className="font-heading text-lg font-semibold text-foreground">No matches for these filters</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Try another content type, increase the duration limit, or reset the filters. Your profile constraints such as language, assessed level, budget and weekly capacity stay protected.</p><Button type="button" variant="outline" className="mt-4 h-11" onClick={resetFilters}>Reset filters</Button></Card>}
      {state.selectedResourceBySkill[skill.id] && <p role="status" className="mt-5 text-sm text-success">Your chosen {skill.name} resource is saved in this demo session.</p>}
      {scheduleError && <p role="alert" className="mt-3 text-sm text-warning">There is not enough capacity to schedule this path yet. Increase your availability or capacity and try again.</p>}
      {state.selectedFreePathBySkill[skill.id] && <p role="status" className="mt-5 text-sm text-success">Your structured $0 {skill.name} path is in your learning plan.</p>}
    </>}
  </main>;
}
