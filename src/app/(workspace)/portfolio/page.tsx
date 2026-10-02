"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, BookOpenText, Check, CircleOff, Code2, ExternalLink, FolderGit2, Gauge, GitBranch, LoaderCircle, Plus, RefreshCcw, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/i18n";
import { emptyPortfolioFacts, type PortfolioAnalysis, type PortfolioFacts, type PortfolioProject, type PortfolioProjectInput, type PortfolioRecommendation } from "@/features/portfolio/domain/portfolio";
import { analyzePortfolioProject, createPortfolioProject, decidePortfolioRecommendation, deleteImportedRepositoryData, deletePortfolioProject, listPortfolioProjects, revokeRepositoryReference } from "@/features/portfolio/services/portfolio";
import { useDemo } from "@/state/demo-provider";

const splitList = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 40);
const joinList = (value: string[]) => value.join(", ");

const evidenceToggles = [
  ["has_readme", "portfolio.hasReadme"], ["has_tests", "portfolio.hasTests"], ["has_documentation", "portfolio.hasDocs"],
  ["has_ci", "portfolio.hasCi"], ["has_docker", "portfolio.hasDocker"], ["has_iac", "portfolio.hasIac"],
  ["has_kubernetes", "portfolio.hasKubernetes"], ["has_monitoring", "portfolio.hasMonitoring"],
] as const satisfies ReadonlyArray<readonly [keyof Pick<PortfolioFacts, "has_readme" | "has_tests" | "has_documentation" | "has_ci" | "has_docker" | "has_iac" | "has_kubernetes" | "has_monitoring">, string]>;

export default function PortfolioPage() {
  const { state } = useDemo();
  const { t, formatDate } = useLocale();
  const [projects, setProjects] = useState<PortfolioProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [analysis, setAnalysis] = useState<PortfolioAnalysis | null>(null);
  const [analysisSource, setAnalysisSource] = useState("manual");
  const [editableRecommendations, setEditableRecommendations] = useState<Record<string, string>>({});
  const [form, setForm] = useState<PortfolioProjectInput>({
    title: "", description: "", target_role: state.student.targetRole || "DevOps Engineer", project_url: null, live_demo_url: null,
    facts: emptyPortfolioFacts(),
  });

  const selected = useMemo(() => projects.find((item) => item.id === selectedId) ?? null, [projects, selectedId]);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const next = await listPortfolioProjects(state.student.id);
      setProjects(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("portfolio.error.load"));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [state.student.id]);
  useEffect(() => {
    setAnalysis(selected?.latest_analysis ?? null);
    setAnalysisSource(selected?.repositories[0]?.id ?? "manual");
    setEditableRecommendations(Object.fromEntries((selected?.latest_analysis?.recommendations ?? []).map((item) => [item.id, item.editable_text ?? ""])));
  }, [selected?.id, selected?.updated_at, selected?.latest_analysis?.id]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.description.trim()) { setError(t("portfolio.error.required")); return; }
    setSaving(true); setError("");
    try {
      const created = await createPortfolioProject(state.student.id, form);
      setProjects((current) => [created, ...current]);
      setSelectedId(created.id); setShowForm(false);
      setForm({ title: "", description: "", target_role: state.student.targetRole || "DevOps Engineer", project_url: null, live_demo_url: null, facts: emptyPortfolioFacts() });
      toast.success(t("portfolio.toast.created"));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("portfolio.error.save")); }
    finally { setSaving(false); }
  };

  const runAnalysis = async () => {
    if (!selected) return;
    setAnalyzing(true); setError("");
    try {
      const next = await analyzePortfolioProject(state.student.id, selected.id, analysisSource === "manual" ? undefined : analysisSource);
      setAnalysis(next);
      setEditableRecommendations(Object.fromEntries(next.recommendations.map((item) => [item.id, item.editable_text ?? ""])));
      setProjects((current) => current.map((item) => item.id === selected.id ? { ...item, latest_analysis: next } : item));
      toast.success(t("portfolio.toast.analyzed"));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("portfolio.error.analyze")); }
    finally { setAnalyzing(false); }
  };

  const decide = async (item: PortfolioRecommendation, decision: "accepted" | "dismissed") => {
    if (!selected) return;
    try {
      const next = await decidePortfolioRecommendation(state.student.id, selected.id, item.id, decision, editableRecommendations[item.id] || null);
      setAnalysis((current) => current ? { ...current, recommendations: current.recommendations.map((rec) => rec.id === item.id ? next : rec) } : current);
      toast.success(decision === "accepted" ? t("portfolio.toast.accepted") : t("portfolio.toast.dismissed"));
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("portfolio.error.recommendation")); }
  };

  const removeProject = async () => {
    if (!selected || !window.confirm(t("portfolio.deleteConfirm"))) return;
    try {
      await deletePortfolioProject(state.student.id, selected.id);
      setProjects((current) => current.filter((item) => item.id !== selected.id)); setSelectedId(""); setAnalysis(null);
      toast.success(t("portfolio.toast.deleted"));
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("portfolio.error.delete")); }
  };

  const revokeRepo = async (repositoryId: string) => {
    if (!selected) return;
    try { await revokeRepositoryReference(state.student.id, selected.id, repositoryId); await load(); toast.success(t("portfolio.toast.revoked")); }
    catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("portfolio.error.revoke")); }
  };

  const deleteRepo = async (repositoryId: string) => {
    if (!selected || !window.confirm(t("portfolio.repoDeleteConfirm"))) return;
    try { await deleteImportedRepositoryData(state.student.id, selected.id, repositoryId); await load(); toast.success(t("portfolio.toast.repoDeleted")); }
    catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("portfolio.error.repoDelete")); }
  };

  return <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <Reveal className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="type-eyebrow mb-2 flex items-center gap-2 text-pathway"><FolderGit2 className="size-3.5" />{t("portfolio.eyebrow")}</p>
        <TypographyH1>{t("portfolio.title")}</TypographyH1>
        <TypographyP className="mt-2">{t("portfolio.subtitle")}</TypographyP>
      </div>
      <div className="flex flex-wrap gap-2"><Button variant="outline" className="rounded-xl" onClick={() => void load()}><RefreshCcw className="size-3.5" />{t("common.refresh")}</Button><Button className="rounded-xl" onClick={() => setShowForm((value) => !value)}><Plus className="size-3.5" />{t("portfolio.addProject")}</Button></div>
    </Reveal>

    {error && <Card role="alert" className="mb-5 rounded-[18px] border-risk/20 bg-risk/5 p-4 text-sm text-risk">{error}</Card>}

    {showForm && <Card className="mb-6 rounded-[20px] p-5 sm:p-6"><form onSubmit={create} className="space-y-5">
      <div><h2 className="type-section-title">{t("portfolio.manualTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("portfolio.manualHint")}</p></div>
      <div className="grid gap-4 lg:grid-cols-2"><div><Label htmlFor="portfolio-title">{t("portfolio.projectTitle")}</Label><Input id="portfolio-title" className="mt-2" value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></div><div><Label htmlFor="portfolio-role">{t("portfolio.targetRole")}</Label><Input id="portfolio-role" className="mt-2" value={form.target_role} onChange={(event) => setForm((current) => ({ ...current, target_role: event.target.value }))} /></div></div>
      <div><Label htmlFor="portfolio-description">{t("portfolio.description")}</Label><Textarea id="portfolio-description" className="mt-2 min-h-28" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></div>
      <div className="grid gap-4 lg:grid-cols-2"><div><Label htmlFor="project-url">{t("portfolio.projectUrl")}</Label><Input id="project-url" className="mt-2" placeholder="https://…" value={form.project_url ?? ""} onChange={(event) => setForm((current) => ({ ...current, project_url: event.target.value || null }))} /></div><div><Label htmlFor="demo-url">{t("portfolio.demoUrl")}</Label><Input id="demo-url" className="mt-2" placeholder="https://…" value={form.live_demo_url ?? ""} onChange={(event) => setForm((current) => ({ ...current, live_demo_url: event.target.value || null }))} /></div></div>
      <div className="grid gap-4 lg:grid-cols-3"><div><Label htmlFor="technologies">{t("portfolio.technologies")}</Label><Input id="technologies" className="mt-2" value={joinList(form.facts.technologies)} onChange={(event) => setForm((current) => ({ ...current, facts: { ...current.facts, technologies: splitList(event.target.value) } }))} /></div><div><Label htmlFor="languages">{t("portfolio.languages")}</Label><Input id="languages" className="mt-2" value={joinList(form.facts.languages)} onChange={(event) => setForm((current) => ({ ...current, facts: { ...current.facts, languages: splitList(event.target.value) } }))} /></div><div><Label htmlFor="topics">{t("portfolio.topics")}</Label><Input id="topics" className="mt-2" value={joinList(form.facts.topics)} onChange={(event) => setForm((current) => ({ ...current, facts: { ...current.facts, topics: splitList(event.target.value) } }))} /></div></div>
      <div><p className="mb-2 text-xs font-medium">{t("portfolio.indicators")}</p><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{evidenceToggles.map(([key, labelKey]) => <label key={key} className="flex min-h-11 items-center gap-2 rounded-xl border border-border/75 bg-muted/20 px-3 text-xs"><Checkbox checked={Boolean(form.facts[key as keyof typeof form.facts])} onCheckedChange={(checked) => setForm((current) => ({ ...current, facts: { ...current.facts, [key]: checked === true } }))} /><span>{t(labelKey)}</span></label>)}</div></div>
      <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={() => setShowForm(false)}>{t("common.cancel")}</Button><Button type="submit" disabled={saving}>{saving && <LoaderCircle className="size-3.5 animate-spin" />}{t("portfolio.saveProject")}</Button></div>
    </form></Card>}

    <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card className="rounded-[20px] p-4"><div className="mb-3 flex items-center justify-between"><div><p className="text-sm font-medium">{t("portfolio.projects")}</p><p className="text-[0.64rem] text-muted-foreground">{t("portfolio.projectCount", { count: projects.length })}</p></div></div>
        {loading ? <div className="flex min-h-32 items-center justify-center"><LoaderCircle className="size-5 animate-spin text-primary" /><span className="sr-only">{t("common.loading")}</span></div> : projects.length === 0 ? <div className="rounded-xl border border-dashed border-border p-5 text-center"><FolderGit2 className="mx-auto size-6 text-muted-foreground" /><p className="mt-2 text-sm font-medium">{t("portfolio.emptyTitle")}</p><p className="mt-1 text-xs text-muted-foreground">{t("portfolio.emptyHint")}</p></div> : <div className="space-y-2">{projects.map((project) => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`w-full rounded-[14px] border p-3 text-left transition-colors ${selectedId === project.id ? "border-primary/30 bg-primary/[0.06]" : "border-border/70 bg-muted/15 hover:bg-muted/30"}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{project.title}</p><p className="mt-1 truncate text-[0.63rem] text-muted-foreground">{project.target_role}</p></div>{project.latest_analysis && <span className="font-mono text-xs text-primary">{project.latest_analysis.completeness_score}%</span>}</div></button>)}</div>}
      </Card>

      {!selected ? <Card className="grid min-h-[420px] place-items-center rounded-[20px] p-8 text-center"><div><FolderGit2 className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-3 text-base font-medium">{t("portfolio.selectTitle")}</h2><p className="mt-2 max-w-md text-xs leading-5 text-muted-foreground">{t("portfolio.selectHint")}</p></div></Card> : <div className="space-y-5">
        <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="type-section-title">{selected.title}</h2><Badge variant="outline" className="text-[0.6rem]">{selected.target_role}</Badge></div><p className="mt-2 max-w-3xl text-xs leading-5 text-muted-foreground">{selected.description}</p></div><Button size="sm" variant="ghost" className="text-risk" onClick={() => void removeProject()}><Trash2 className="size-3.5" />{t("common.delete")}</Button></div>
          <div className="mt-5 grid gap-3 md:grid-cols-3"><div className="rounded-xl border border-border/75 bg-muted/20 p-3"><p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t("portfolio.source")}</p><p className="mt-1 text-xs font-medium">{t("portfolio.manualSource")}</p></div><div className="rounded-xl border border-border/75 bg-muted/20 p-3"><p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t("portfolio.updated")}</p><p className="mt-1 text-xs font-medium">{formatDate(selected.updated_at, { dateStyle: "medium" })}</p></div><div className="rounded-xl border border-border/75 bg-muted/20 p-3"><p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{t("portfolio.externalRepositories")}</p><p className="mt-1 text-xs font-medium">{selected.repositories.length}</p></div></div>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end"><div className="flex-1"><Label htmlFor="analysis-source">{t("portfolio.analysisSource")}</Label><select id="analysis-source" value={analysisSource} onChange={(event) => setAnalysisSource(event.target.value)} className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs"><option value="manual">{t("portfolio.manualFacts")}</option>{selected.repositories.map((repo) => <option key={repo.id} value={repo.id}>{repo.full_name}{repo.stale ? ` · ${t("portfolio.stale")}` : ""}</option>)}</select></div><Button onClick={() => void runAnalysis()} disabled={analyzing} className="h-10 rounded-xl">{analyzing ? <LoaderCircle className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}{t("portfolio.runAnalysis")}</Button></div>
        </Card>

        <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 text-primary" /><div><h3 className="text-sm font-medium">{t("portfolio.repoBoundaryTitle")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("portfolio.repoBoundaryHint")}</p></div></div>{selected.repositories.length > 0 && <div className="mt-4 space-y-2">{selected.repositories.map((repo) => <div key={repo.id} className="flex flex-col gap-3 rounded-xl border border-border/75 p-3 md:flex-row md:items-center md:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-xs font-medium">{repo.full_name}</p><Badge variant="outline" className="text-[0.56rem]">{repo.visibility}</Badge><Badge variant="outline" className={repo.access_status === "revoked" ? "text-risk" : "text-success"}>{repo.access_status}</Badge>{repo.stale && <Badge variant="outline" className="text-warning">{t("portfolio.stale")}</Badge>}</div><p className="mt-1 text-[0.6rem] text-muted-foreground">{t("portfolio.collected", { date: formatDate(repo.collected_at, { dateStyle: "medium" }) })}</p><div className="mt-2 flex flex-wrap gap-1.5">{repo.facts.languages.slice(0, 5).map((language) => <span key={language} className="rounded-md border border-border/70 px-1.5 py-0.5 font-mono text-[0.54rem] text-muted-foreground">{language}</span>)}{repo.facts.topics.slice(0, 4).map((topic) => <span key={topic} className="rounded-md border border-border/70 px-1.5 py-0.5 text-[0.54rem] text-muted-foreground">{topic}</span>)}</div><p className="mt-2 text-[0.58rem] text-muted-foreground">{t("portfolio.lastActivity", { date: repo.facts.last_activity_at ? formatDate(repo.facts.last_activity_at, { dateStyle: "medium" }) : t("portfolio.unknown") })}</p>{repo.live_demo_url && <a className="mt-1 inline-flex items-center gap-1 text-[0.58rem] text-primary hover:underline" href={repo.live_demo_url} target="_blank" rel="noreferrer">{t("portfolio.liveDemo")}<ExternalLink className="size-3" aria-hidden="true" /></a>}</div><div className="flex gap-2">{repo.access_status === "active" && <Button size="sm" variant="outline" onClick={() => void revokeRepo(repo.id)}>{t("portfolio.revoke")}</Button>}<Button size="sm" variant="ghost" className="text-risk" onClick={() => void deleteRepo(repo.id)}>{t("portfolio.deleteImported")}</Button></div></div>)}</div>}
        </Card>

        {analysis ? <>
          <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]"><Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><Gauge className="size-4 text-primary" /><h3 className="text-sm font-medium">{t("portfolio.completeness")}</h3></div><div className="mt-5 flex items-end gap-2"><span className="font-mono text-4xl font-semibold text-foreground">{analysis.completeness_score}</span><span className="pb-1 text-xs text-muted-foreground">/ 100</span></div><Progress value={analysis.completeness_score} className="mt-3 h-1.5" /><p className="mt-4 text-[0.63rem] leading-5 text-muted-foreground">{t("portfolio.scoringHint")}</p><p className="mt-2 text-[0.6rem] text-muted-foreground">{t("portfolio.analysisAsOf", { date: formatDate(analysis.source_timestamp, { dateStyle: "medium" }) })}</p>{analysis.stale && <Badge variant="outline" className="mt-3 border-warning/20 text-warning">{t("portfolio.staleSnapshot")}</Badge>}</Card><Card className="rounded-[20px] p-5"><h3 className="text-sm font-medium">{t("portfolio.indicatorBreakdown")}</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{analysis.indicators.map((item) => <div key={item.key} className="rounded-xl border border-border/70 bg-muted/15 p-3"><div className="flex items-center justify-between gap-3"><p className="text-xs font-medium">{item.label}</p><span className={`font-mono text-[0.64rem] ${item.satisfied ? "text-success" : "text-muted-foreground"}`}>{item.points}/{item.max_points}</span></div><p className="mt-1.5 text-[0.61rem] leading-5 text-muted-foreground">{item.evidence}</p></div>)}</div></Card></div>

          <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex items-center gap-2"><Code2 className="size-4 text-pathway" /><h3 className="text-sm font-medium">{t("portfolio.skillEvidence")}</h3></div><p className="mt-1 text-xs text-muted-foreground">{analysis.disclaimer}</p><div className="mt-4 grid gap-4 lg:grid-cols-2"><div><p className="mb-2 text-[0.62rem] font-medium uppercase tracking-wide text-success">{t("portfolio.demonstrated")}</p><div className="space-y-2">{analysis.demonstrated_skills.length ? analysis.demonstrated_skills.map((skill) => <div key={skill.skill_id} className="rounded-xl border border-success/15 bg-success/[0.03] p-3"><div className="flex items-center gap-2"><Check className="size-3.5 text-success" /><p className="text-xs font-medium">{skill.skill_name}</p><Badge variant="outline" className="ml-auto text-[0.55rem]">{skill.status === "observed" ? t("portfolio.observed") : t("portfolio.selfReported")}</Badge></div><p className="mt-1.5 text-[0.61rem] text-muted-foreground">{skill.evidence.join(" · ")}</p></div>) : <p className="text-xs text-muted-foreground">{t("portfolio.noDemonstrated")}</p>}</div></div><div><p className="mb-2 text-[0.62rem] font-medium uppercase tracking-wide text-muted-foreground">{t("portfolio.notDemonstrated")}</p><div className="space-y-2">{analysis.not_demonstrated_skills.map((skill) => <div key={skill.skill_id} className="rounded-xl border border-border/75 bg-muted/15 p-3"><div className="flex items-center gap-2"><CircleOff className="size-3.5 text-muted-foreground" /><p className="text-xs font-medium">{skill.skill_name}</p></div><p className="mt-1.5 text-[0.61rem] text-muted-foreground">{t("portfolio.noEvidenceYet")}</p></div>)}</div></div></div></Card>

          <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex items-center gap-2"><BookOpenText className="size-4 text-primary" /><h3 className="text-sm font-medium">{t("portfolio.recommendations")}</h3></div><div className="mt-4 space-y-3">{analysis.recommendations.map((item) => <div key={item.id} className="rounded-[15px] border border-border/75 bg-muted/10 p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={item.priority === "high" ? "text-risk" : item.priority === "medium" ? "text-warning" : "text-muted-foreground"}>{t(`portfolio.priority.${item.priority}`)}</Badge><Badge variant="outline" className="text-[0.56rem]">{t(`portfolio.kind.${item.kind}`)}</Badge><h4 className="text-xs font-medium">{item.title}</h4>{item.status !== "proposed" && <Badge className="ml-auto" variant="secondary">{t(`portfolio.status.${item.status}`)}</Badge>}</div><p className="mt-2 text-[0.64rem] leading-5 text-muted-foreground">{item.rationale}</p>{item.editable_text !== null && <Textarea aria-label={t("portfolio.editRecommendation")} className="mt-3 min-h-20 text-xs" value={editableRecommendations[item.id] ?? ""} onChange={(event) => setEditableRecommendations((current) => ({ ...current, [item.id]: event.target.value }))} disabled={item.status !== "proposed"} />}<div className="mt-3 flex flex-wrap items-center gap-2"><div className="mr-auto flex flex-wrap gap-1">{item.evidence_refs.map((ref) => <span key={ref} className="rounded-md border border-border/70 px-1.5 py-0.5 font-mono text-[0.52rem] text-muted-foreground">{ref}</span>)}</div>{item.status === "proposed" && <><Button size="sm" variant="ghost" onClick={() => void decide(item, "dismissed")}><X className="size-3.5" />{t("portfolio.dismiss")}</Button><Button size="sm" variant="outline" onClick={() => void decide(item, "accepted")}><BadgeCheck className="size-3.5" />{t("portfolio.accept")}</Button></>}</div></div>)}</div></Card>
        </> : <Card className="rounded-[20px] p-8 text-center"><GitBranch className="mx-auto size-7 text-muted-foreground" /><h3 className="mt-3 text-sm font-medium">{t("portfolio.noAnalysisTitle")}</h3><p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-muted-foreground">{t("portfolio.noAnalysisHint")}</p></Card>}
      </div>}
    </div>
  </div>;
}
