"use client";
import { DemoFiles } from "@/features/competition/components/demo-files";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, BadgeCheck, Check, Clipboard, Copy, Download, FileCheck2, LoaderCircle, LockKeyhole, RefreshCcw, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLocale } from "@/i18n";
import type { CvDocument, CvSection, CvSuggestion } from "@/features/cv/domain/cv";
import { analyzeCv, createPastedCv, decideCvSuggestion, deleteCvAnalysis, deleteCvDocument, deleteCvSource, exportCv, listCvDocuments, saveCvSections, uploadCv } from "@/features/cv/services/cv";
import { useDemo } from "@/state/demo-provider";

const roles = ["DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"];
const retentionOptions = [7, 30, 90] as const;

const severityClass = (severity: "high" | "medium" | "low") => severity === "high" ? "border-risk/20 bg-risk/5" : severity === "medium" ? "border-warning/20 bg-warning/5" : "border-border/80 bg-card";

export default function CvPage() {
  const { state } = useDemo();
  const { t, formatDate, locale } = useLocale();
  const [documents, setDocuments] = useState<CvDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"upload" | "paste">("upload");
  const [targetRole, setTargetRole] = useState(roles.includes(state.student.targetRole) ? state.student.targetRole : "DevOps Engineer");
  const [retentionDays, setRetentionDays] = useState<7 | 30 | 90>(30);
  const [pasteTitle, setPasteTitle] = useState(t("cv.pasteDefaultTitle"));
  const [pasteText, setPasteText] = useState("");
  const [sections, setSections] = useState<CvSection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editingSections, setEditingSections] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(() => documents.find((item) => item.id === selectedId) ?? null, [documents, selectedId]);
  const analysis = selected?.latest_analysis ?? null;

  const load = async (preferredId?: string) => {
    setLoading(true); setError("");
    try {
      const next = await listCvDocuments(state.student.id);
      setDocuments(next);
      setSelectedId((current) => preferredId && next.some((item) => item.id === preferredId) ? preferredId : current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t("cv.error.load"));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [state.student.id]);
  useEffect(() => {
    setSections(selected?.sections ?? []);
    setDrafts(Object.fromEntries((analysis?.suggestions ?? []).map((item) => [item.id, item.draft_text])));
    setEditingSections(false);
  }, [selected?.id, selected?.updated_at, analysis?.id]);

  const addUpload = async (event: FormEvent) => {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setError(t("cv.error.chooseFile")); return; }
    if (file.size > 8 * 1024 * 1024) { setError(t("cv.error.fileSize")); return; }
    setBusy(true); setError("");
    try {
      const created = await uploadCv(state.student.id, file, targetRole, retentionDays);
      await load(created.id);
      if (created.parse_status === "parse_failed") toast.error(created.parse_error ?? t("cv.error.parse"));
      else toast.success(t("cv.toast.uploaded"));
      if (fileRef.current) fileRef.current.value = "";
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("cv.error.upload")); }
    finally { setBusy(false); }
  };

  const addPaste = async (event: FormEvent) => {
    event.preventDefault();
    if (pasteText.trim().length < 20) { setError(t("cv.error.pasteShort")); return; }
    setBusy(true); setError("");
    try {
      const created = await createPastedCv(state.student.id, { title: pasteTitle.trim() || t("cv.pasteDefaultTitle"), target_role: targetRole, retention_days: retentionDays, source_text: pasteText });
      setPasteText(""); await load(created.id); toast.success(t("cv.toast.pasted"));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("cv.error.paste")); }
    finally { setBusy(false); }
  };

  const confirmSections = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const updated = await saveCvSections(state.student.id, selected.id, sections);
      setDocuments((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingSections(false);
      toast.success(t("cv.toast.sectionsConfirmed"));
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("cv.error.sections")); }
    finally { setBusy(false); }
  };

  const runAnalysis = async () => {
    if (!selected) return;
    setBusy(true); setError("");
    try { await analyzeCv(state.student.id, selected.id); await load(selected.id); toast.success(t("cv.toast.analyzed")); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : t("cv.error.analysis")); }
    finally { setBusy(false); }
  };

  const decide = async (suggestion: CvSuggestion, decision: "accepted" | "dismissed") => {
    if (!selected) return;
    try {
      const updated = await decideCvSuggestion(state.student.id, selected.id, suggestion.id, decision, drafts[suggestion.id] ?? suggestion.draft_text);
      setDocuments((current) => current.map((document) => document.id !== selected.id || !document.latest_analysis ? document : {
        ...document, latest_analysis: { ...document.latest_analysis, suggestions: document.latest_analysis.suggestions.map((item) => item.id === updated.id ? updated : item) },
      }));
      toast.success(decision === "accepted" ? t("cv.toast.accepted") : t("cv.toast.dismissed"));
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.suggestion")); }
  };

  const copyAccepted = async () => {
    if (!selected) return;
    try {
      const exported = await exportCv(state.student.id, selected.id);
      await navigator.clipboard.writeText(exported.content);
      toast.success(t("cv.toast.copied", { count: exported.accepted_suggestion_count }));
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.export")); }
  };

  const downloadAccepted = async () => {
    if (!selected) return;
    try {
      const exported = await exportCv(state.student.id, selected.id);
      const url = URL.createObjectURL(new Blob([exported.content], { type: "text/plain;charset=utf-8" }));
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = exported.filename; anchor.click(); URL.revokeObjectURL(url);
      toast.success(t("cv.toast.exported"));
    } catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.export")); }
  };

  const removeSource = async () => {
    if (!selected || !window.confirm(t("cv.confirm.deleteSource"))) return;
    try { await deleteCvSource(state.student.id, selected.id); await load(selected.id); toast.success(t("cv.toast.sourceDeleted")); }
    catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.deleteSource")); }
  };
  const removeAnalysis = async () => {
    if (!selected || !window.confirm(t("cv.confirm.deleteAnalysis"))) return;
    try { await deleteCvAnalysis(state.student.id, selected.id); await load(selected.id); toast.success(t("cv.toast.analysisDeleted")); }
    catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.deleteAnalysis")); }
  };
  const removeDocument = async () => {
    if (!selected || !window.confirm(t("cv.confirm.deleteAll"))) return;
    try { await deleteCvDocument(state.student.id, selected.id); await load(); toast.success(t("cv.toast.deleted")); }
    catch (requestError) { toast.error(requestError instanceof Error ? requestError.message : t("cv.error.delete")); }
  };

  return <div className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <Reveal className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <p className="type-eyebrow mb-2 flex items-center gap-2 text-pathway"><FileCheck2 className="size-3.5" aria-hidden="true" />{t("cv.eyebrow")}</p>
        <TypographyH1>{t("cv.title")}</TypographyH1>
        <TypographyP className="mt-2">{t("cv.subtitle")}</TypographyP>
      </div>
      <Button variant="outline" className="rounded-xl" onClick={() => void load(selectedId)} disabled={loading}><RefreshCcw className="size-3.5" />{t("common.refresh")}</Button>
    </Reveal>

    <DemoFiles kind="cv" />
    <Card className="mb-6 rounded-[20px] border-primary/10 bg-primary/[0.035] p-4 sm:p-5">
      <div className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" /><div><p className="text-sm font-semibold">{t("cv.privacyTitle")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("cv.privacyText")}</p></div></div>
    </Card>

    {error && <Card role="alert" className="mb-5 rounded-[18px] border-risk/20 bg-risk/5 p-4 text-sm text-risk">{error}</Card>}

    <Reveal className="mb-7 grid gap-5 xl:grid-cols-2">
      <Card className="rounded-[20px] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="type-section-title">{t("cv.addTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("cv.addHint")}</p></div><div className="flex rounded-xl border border-border p-1"><Button type="button" size="sm" variant={mode === "upload" ? "secondary" : "ghost"} onClick={() => setMode("upload")} className="rounded-lg"><Upload className="size-3.5" />{t("cv.upload")}</Button><Button type="button" size="sm" variant={mode === "paste" ? "secondary" : "ghost"} onClick={() => setMode("paste")} className="rounded-lg"><Clipboard className="size-3.5" />{t("cv.paste")}</Button></div></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><Label htmlFor="cv-role">{t("cv.targetRole")}</Label><select id="cv-role" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{roles.map((role) => <option key={role}>{role}</option>)}</select></div>
          <div><Label htmlFor="cv-retention">{t("cv.retention")}</Label><select id="cv-retention" value={retentionDays} onChange={(event) => setRetentionDays(Number(event.target.value) as 7 | 30 | 90)} className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{retentionOptions.map((days) => <option key={days} value={days}>{t("cv.retentionDays", { days })}</option>)}</select><p className="mt-1.5 text-[0.68rem] text-muted-foreground">{t("cv.retentionHint")}</p></div>
        </div>
        {mode === "upload" ? <form onSubmit={addUpload} className="mt-5 space-y-4"><div><Label htmlFor="cv-file">{t("cv.fileLabel")}</Label><Input ref={fileRef} id="cv-file" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="mt-2" /><p className="mt-1.5 text-[0.68rem] text-muted-foreground">{t("cv.fileHint")}</p></div><Button disabled={busy} className="rounded-xl">{busy && <LoaderCircle className="size-3.5 animate-spin" />}{t("cv.uploadAction")}</Button></form> : <form onSubmit={addPaste} className="mt-5 space-y-4"><div><Label htmlFor="cv-paste-title">{t("cv.documentTitle")}</Label><Input id="cv-paste-title" className="mt-2" value={pasteTitle} onChange={(event) => setPasteTitle(event.target.value)} /></div><div><Label htmlFor="cv-paste-text">{t("cv.pasteLabel")}</Label><Textarea id="cv-paste-text" className="mt-2 min-h-52" value={pasteText} onChange={(event) => setPasteText(event.target.value)} placeholder={t("cv.pastePlaceholder")} /></div><Button disabled={busy} className="rounded-xl">{busy && <LoaderCircle className="size-3.5 animate-spin" />}{t("cv.pasteAction")}</Button></form>}
      </Card>

      <Card className="rounded-[20px] p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="type-section-title">{t("cv.libraryTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("cv.libraryHint")}</p></div><Badge variant="outline">{documents.length}</Badge></div>
        <div className="mt-4 max-h-[28rem] space-y-2 overflow-y-auto pr-1">
          {loading ? <div className="flex min-h-32 items-center justify-center text-sm text-muted-foreground"><LoaderCircle className="mr-2 size-4 animate-spin" />{t("common.loading")}</div> : documents.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{t("cv.empty")}</div> : documents.map((document) => <button key={document.id} type="button" onClick={() => setSelectedId(document.id)} className={`w-full rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === document.id ? "border-primary/30 bg-primary/5" : "border-border hover:bg-accent/50"}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-medium">{document.title}</p><p className="mt-1 truncate text-[0.68rem] text-muted-foreground">{document.target_role}</p></div><Badge variant="outline" className="shrink-0 text-[0.6rem]">{document.parse_status === "parse_failed" ? t("cv.status.failed") : document.sections_confirmed ? t("cv.status.confirmed") : t("cv.status.review")}</Badge></div>
            <p className="mt-2 text-[0.65rem] text-muted-foreground">{t("cv.expires", { date: formatDate(document.expires_at, { dateStyle: "medium" }) })}</p>
          </button>)}
        </div>
      </Card>
    </Reveal>

    {!selected ? <Card className="rounded-[20px] border-dashed p-8 text-center text-sm text-muted-foreground">{t("cv.selectEmpty")}</Card> : <Reveal className="space-y-6">
      <Card className="rounded-[20px] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">{selected.title}</h2><Badge variant="outline">{selected.source_type === "upload" ? t("cv.source.upload") : t("cv.source.paste")}</Badge>{selected.source_deleted_at && <Badge variant="outline">{t("cv.source.deleted")}</Badge>}</div><p className="mt-2 text-xs text-muted-foreground">{selected.original_filename ?? t("cv.pastedSource")} · {selected.target_role} · {t("cv.expires", { date: formatDate(selected.expires_at, { dateStyle: "medium" }) })}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={removeSource} disabled={Boolean(selected.source_deleted_at)}><LockKeyhole className="size-3.5" />{t("cv.deleteSource")}</Button><Button size="sm" variant="outline" onClick={removeAnalysis} disabled={!analysis}><X className="size-3.5" />{t("cv.deleteAnalysis")}</Button><Button size="sm" variant="outline" onClick={removeDocument}><Trash2 className="size-3.5" />{t("common.delete")}</Button></div></div>
      </Card>

      {selected.parse_status === "parse_failed" ? <Card role="alert" className="rounded-[20px] border-risk/20 bg-risk/5 p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-5 shrink-0 text-risk" /><div><h2 className="font-semibold">{t("cv.parseFailedTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.parse_error ?? t("cv.error.parse")}</p><p className="mt-2 text-xs text-muted-foreground">{t("cv.parseFailedPreserved")}</p></div></div></Card> : <Card className="rounded-[20px] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="type-section-title">{t("cv.reviewTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.sections_confirmed && !editingSections ? t("cv.reviewConfirmedHint") : t("cv.reviewHint")}</p></div><div className="flex flex-wrap items-center gap-2">{selected.sections_confirmed && !editingSections ? <><Badge className="w-fit"><BadgeCheck className="size-3" />{t("cv.status.confirmed")}</Badge><Button type="button" variant="outline" size="sm" onClick={() => setEditingSections(true)}>{t("cv.editSections")}</Button></> : <Button onClick={confirmSections} disabled={busy} className="rounded-xl">{busy && <LoaderCircle className="size-3.5 animate-spin" />}{selected.sections_confirmed ? t("cv.saveSections") : t("cv.confirmSections")}</Button>}</div></div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">{sections.map((section, index) => <div key={section.key} className={section.key === "experience" || section.key === "projects" ? "xl:col-span-2" : ""}><Label htmlFor={`section-${section.key}`}>{section.title}</Label><Textarea id={`section-${section.key}`} className="mt-2 min-h-36" value={section.content} onChange={(event) => setSections((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, content: event.target.value } : item))} disabled={selected.sections_confirmed && !editingSections} /></div>)}</div>
        {selected.sections_confirmed && !editingSections && <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="max-w-2xl text-xs text-muted-foreground">{t("cv.analysisGateHint")}</p><Button onClick={runAnalysis} disabled={busy} className="rounded-xl"><Sparkles className="size-3.5" />{analysis ? t("cv.reanalyze") : t("cv.analyze")}</Button></div>}
      </Card>}

      {analysis && <>
        <div className="grid gap-4 md:grid-cols-3"><Card className="rounded-[18px] p-4"><p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{t("cv.metric.words")}</p><p className="mt-2 text-2xl font-semibold">{analysis.word_count}</p></Card><Card className="rounded-[18px] p-4"><p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{t("cv.metric.findings")}</p><p className="mt-2 text-2xl font-semibold">{analysis.findings.length}</p></Card><Card className="rounded-[18px] p-4"><p className="text-[0.68rem] uppercase tracking-wide text-muted-foreground">{t("cv.metric.roleEvidence")}</p><p className="mt-2 text-2xl font-semibold">{analysis.role_skills.filter((item) => item.status !== "not_demonstrated_in_cv").length}/{analysis.role_skills.length}</p></Card></div>

        <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex items-start gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" /><div><h2 className="type-section-title">{t("cv.atsTitle")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("cv.atsDisclaimer")}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("cv.evidenceDisclaimer")}</p>{locale !== "en" && <p className="mt-2 text-xs leading-5 text-warning">{t("cv.analysisEnglishFallback")}</p>}</div></div></Card>

        <div className="grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
          <Card className="rounded-[20px] p-5 sm:p-6"><h2 className="type-section-title">{t("cv.findingsTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("cv.findingsHint")}</p><div className="mt-4 space-y-3">{analysis.findings.map((finding) => <div key={finding.id} className={`rounded-xl border p-4 ${severityClass(finding.severity)}`}><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className="text-[0.6rem]">{t(`cv.severity.${finding.severity}`)}</Badge><Badge variant="outline" className="text-[0.6rem]">{finding.category}</Badge></div><h3 className="mt-2 text-sm font-semibold">{finding.title}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{finding.rationale}</p><div className="mt-3 rounded-lg bg-background/70 p-3"><p className="text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground">{t("cv.proposedAction")}</p><p className="mt-1 text-xs leading-5">{finding.proposed_action}</p></div></div>)}</div></Card>
          <Card className="rounded-[20px] p-5 sm:p-6"><h2 className="type-section-title">{t("cv.skillsTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("cv.skillsHint")}</p><div className="mt-4 space-y-3">{analysis.role_skills.map((skill) => <div key={skill.skill_id} className="rounded-xl border border-border p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{skill.skill_name}</p><Badge variant="outline" className="text-[0.58rem]">{skill.status === "cv_evidenced" ? t("cv.skill.cv") : skill.status === "portfolio_evidenced" ? t("cv.skill.portfolio") : t("cv.skill.notDemonstrated")}</Badge></div><p className="mt-2 text-[0.68rem] leading-5 text-muted-foreground">{skill.evidence[0]}</p></div>)}</div><p className="mt-4 text-[0.68rem] leading-5 text-muted-foreground">{t("cv.skillsDisclaimer")}</p></Card>
        </div>

        <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><h2 className="type-section-title">{t("cv.suggestionsTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("cv.suggestionsHint")}</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={copyAccepted}><Copy className="size-3.5" />{t("cv.copyAccepted")}</Button><Button size="sm" variant="outline" onClick={downloadAccepted}><Download className="size-3.5" />{t("cv.exportAccepted")}</Button></div></div>
          <div className="mt-5 space-y-4">{analysis.suggestions.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">{t("cv.noSuggestions")}</div> : analysis.suggestions.map((suggestion) => <div key={suggestion.id} className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{suggestion.kind === "wording" ? t("cv.suggestion.wording") : t("cv.suggestion.evidenceRequest")}</Badge><Badge variant="outline">{t(`cv.suggestion.status.${suggestion.status}`)}</Badge><span className="text-xs font-semibold">{suggestion.title}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{suggestion.rationale}</p><Label htmlFor={`suggestion-${suggestion.id}`} className="mt-3 block text-xs">{t("cv.draftLabel")}</Label><Textarea id={`suggestion-${suggestion.id}`} className="mt-2 min-h-28" value={drafts[suggestion.id] ?? suggestion.draft_text} onChange={(event) => setDrafts((current) => ({ ...current, [suggestion.id]: event.target.value }))} disabled={suggestion.status !== "proposed"} /><div className="mt-3 flex flex-wrap gap-2"><Button size="sm" onClick={() => void decide(suggestion, "accepted")} disabled={suggestion.status === "accepted"}><Check className="size-3.5" />{t("cv.approve")}</Button><Button size="sm" variant="outline" onClick={() => void decide(suggestion, "dismissed")} disabled={suggestion.status === "dismissed"}><X className="size-3.5" />{t("cv.dismiss")}</Button></div></div>)}</div>
        </Card>
      </>}
    </Reveal>}
  </div>;
}
