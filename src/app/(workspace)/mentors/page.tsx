"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpenCheck, CalendarPlus, CheckCircle2, Clipboard, Clock3, Eye, History, MessageSquarePlus, ShieldCheck, UserRoundPlus, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import {
  buildMentorShareSnapshot, mentorStudentRequest, type ConsentPreview, type GuidanceRequest, type MentorAccessAudit,
  type MentorConsentCategory, type MentorPlanAction, type MentorRecommendation, type MentorRelationship,
} from "@/features/mentors/domain/mentors";

const excludedKeys = ["mentors.excludedCapacity", "mentors.excludedCv", "mentors.excludedInterview", "mentors.excludedNotes", "mentors.excludedDocuments"];

const categoryKeys: Array<{ value: MentorConsentCategory; key: string }> = [
  { value: "academic_summary", key: "mentors.categoryAcademic" },
  { value: "career_goal", key: "mentors.categoryCareer" },
  { value: "career_readiness", key: "mentors.categoryReadiness" },
  { value: "roadmap", key: "mentors.categoryRoadmap" },
];

function localInput(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function MentorsPage() {
  const { state, addTask } = useDemo();
  const { t, formatDate, formatTime } = useLocale();
  const studentId = state.student.id;
  const snapshot = useMemo(() => buildMentorShareSnapshot(state), [state]);
  const [relationships, setRelationships] = useState<MentorRelationship[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mentorLabel, setMentorLabel] = useState("");
  const [purpose, setPurpose] = useState("");
  const [inviteCategories, setInviteCategories] = useState<MentorConsentCategory[]>(["career_goal", "roadmap"]);
  const [scopeCategories, setScopeCategories] = useState<MentorConsentCategory[]>([]);
  const [expiresAt, setExpiresAt] = useState(localInput(new Date(Date.now() + 30 * 86_400_000)));
  const [preview, setPreview] = useState<ConsentPreview | null>(null);
  const [scopePreview, setScopePreview] = useState<ConsentPreview | null>(null);
  const [inviteLink, setInviteLink] = useState("");
  const [guidance, setGuidance] = useState<GuidanceRequest[]>([]);
  const [recommendations, setRecommendations] = useState<MentorRecommendation[]>([]);
  const [history, setHistory] = useState<MentorAccessAudit[]>([]);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestQuestion, setRequestQuestion] = useState("");
  const [planTimes, setPlanTimes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = relationships.find((item) => item.id === selectedId) ?? null;

  const refresh = useCallback(async () => {
    if (!studentId) return;
    try {
      const items = await mentorStudentRequest<MentorRelationship[]>("/api/mentors/relationships", studentId);
      setRelationships(items);
      if (!selectedId && items[0]) setSelectedId(items[0].id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.loadFailed")); }
  }, [selectedId, studentId, t]);

  const refreshDetail = useCallback(async (relationshipId: string) => {
    if (!studentId || !relationshipId) return;
    try {
      const [requests, recs, audits] = await Promise.all([
        mentorStudentRequest<GuidanceRequest[]>(`/api/mentors/relationships/${relationshipId}/guidance-requests`, studentId),
        mentorStudentRequest<MentorRecommendation[]>(`/api/mentors/relationships/${relationshipId}/recommendations`, studentId),
        mentorStudentRequest<MentorAccessAudit[]>(`/api/mentors/relationships/${relationshipId}/access-history`, studentId),
      ]);
      setGuidance(requests); setRecommendations(recs); setHistory(audits);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.loadFailed")); }
  }, [studentId, t]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { if (selectedId) void refreshDetail(selectedId); }, [refreshDetail, selectedId]);

  function toggleInviteCategory(category: MentorConsentCategory) {
    setInviteCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
    setPreview(null);
  }

  function toggleScopeCategory(category: MentorConsentCategory) {
    setScopeCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
    setScopePreview(null);
  }

  async function previewSharing() {
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await mentorStudentRequest<ConsentPreview>("/api/mentors/consent-preview", studentId, { method: "POST", body: JSON.stringify({ purpose, categories: inviteCategories, snapshot }) });
      setPreview(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.previewFailed")); }
    finally { setBusy(false); }
  }

  async function createInvite() {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await mentorStudentRequest<{ relationship: MentorRelationship; invitation_token: string }>("/api/mentors/relationships", studentId, {
        method: "POST", body: JSON.stringify({ mentor_label: mentorLabel, purpose, categories: inviteCategories, expires_at: new Date(expiresAt).toISOString(), snapshot }),
      });
      const link = `${window.location.origin}/mentor-view?invite=${encodeURIComponent(result.invitation_token)}`;
      setInviteLink(link); setSelectedId(result.relationship.id); setMessage(t("mentors.inviteCreated")); setPreview(null);
      await refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.createFailed")); }
    finally { setBusy(false); }
  }

  async function copyInvite() {
    if (!inviteLink) return;
    await navigator.clipboard.writeText(inviteLink);
    setMessage(t("mentors.inviteCopied"));
  }

  async function previewScopeUpdate() {
    if (!selected) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const result = await mentorStudentRequest<ConsentPreview>("/api/mentors/consent-preview", studentId, { method: "POST", body: JSON.stringify({ purpose: selected.purpose, categories: scopeCategories, snapshot }) });
      setScopePreview(result);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.previewFailed")); }
    finally { setBusy(false); }
  }

  async function saveScope() {
    if (!selected || !scopePreview) return;
    setBusy(true); setError("");
    try {
      await mentorStudentRequest(`/api/mentors/relationships/${selected.id}/consent`, studentId, { method: "PUT", body: JSON.stringify({ categories: scopeCategories, expires_at: new Date(expiresAt).toISOString(), snapshot }) });
      setMessage(t("mentors.scopeSaved")); setScopePreview(null); await refresh(); await refreshDetail(selected.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.requestFailed")); }
    finally { setBusy(false); }
  }

  async function revoke() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await mentorStudentRequest(`/api/mentors/relationships/${selected.id}/revoke`, studentId, { method: "POST", body: JSON.stringify({ reason: t("mentors.revokeReason") }) });
      setMessage(t("mentors.revoked")); await refresh(); await refreshDetail(selected.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.requestFailed")); }
    finally { setBusy(false); }
  }

  async function createGuidanceRequest() {
    if (!selected || !requestTitle.trim() || !requestQuestion.trim()) return;
    setBusy(true); setError("");
    try {
      await mentorStudentRequest(`/api/mentors/relationships/${selected.id}/guidance-requests`, studentId, { method: "POST", body: JSON.stringify({ title: requestTitle, question: requestQuestion, context_note: "" }) });
      setRequestTitle(""); setRequestQuestion(""); setMessage(t("mentors.requestSent")); await refreshDetail(selected.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.requestFailed")); }
    finally { setBusy(false); }
  }

  async function decideRecommendation(rec: MentorRecommendation, decision: "accept" | "dismiss") {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      await mentorStudentRequest(`/api/mentors/relationships/${selected.id}/recommendations/${rec.id}/decision`, studentId, { method: "POST", body: JSON.stringify({ decision, note: "" }) });
      setMessage(decision === "accept" ? t("mentors.recommendationAccepted") : t("mentors.recommendationDismissed")); await refreshDetail(selected.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.requestFailed")); }
    finally { setBusy(false); }
  }

  async function addRecommendationToPlanner(rec: MentorRecommendation) {
    if (!selected) return;
    const local = planTimes[rec.id];
    if (!local) { setError(t("mentors.choosePlanTime")); return; }
    setBusy(true); setError("");
    try {
      const action = await mentorStudentRequest<MentorPlanAction>(`/api/mentors/relationships/${selected.id}/recommendations/${rec.id}/plan-action`, studentId, {
        method: "POST", body: JSON.stringify({
          start_at: new Date(local).toISOString(), duration_minutes: rec.suggested_minutes ?? 45, confirmed: true,
          idempotency_key: `mentor-plan-${rec.id}`,
          planner_blocks: state.planBlocks.map((block) => ({ id: block.id, start_at: block.startAt, end_at: block.endAt })),
        }),
      });
      addTask({ title: action.title, category: "Career", estimatedMinutes: action.planned_minutes, startAt: action.start_at, description: `${action.source_label}. ${action.description}` });
      setMessage(t("mentors.addedToPlanner")); await refreshDetail(selected.id);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentors.requestFailed")); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!selected) return;
    setScopeCategories(selected.categories);
    setScopePreview(null);
    setExpiresAt(localInput(new Date(selected.expires_at)));
  }, [selected?.id]);

  return <div className="mx-auto w-full max-w-[1180px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6"><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><ShieldCheck className="size-3.5" />{t("mentors.eyebrow")}</p><TypographyH1>{t("mentors.title")}</TypographyH1><TypographyP className="mt-2 max-w-3xl">{t("mentors.subtitle")}</TypographyP></div></Reveal>
    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl border border-primary/15 bg-primary/[0.035] p-3 text-sm text-primary">{message}</div>}

    <div className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
      <div className="space-y-5">
        <Card className="rounded-[20px] p-5 shadow-none">
          <div className="flex items-center gap-2"><UserRoundPlus className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentors.inviteTitle")}</h2></div>
          <div className="mt-4 grid gap-4"><div><Label htmlFor="mentor-label">{t("mentors.mentorLabel")}</Label><Input id="mentor-label" className="mt-2 h-11" value={mentorLabel} onChange={(e) => setMentorLabel(e.target.value)} maxLength={160}/></div><div><Label htmlFor="mentor-purpose">{t("mentors.purpose")}</Label><textarea id="mentor-purpose" className="workspace-input mt-2 min-h-24 w-full resize-y" value={purpose} onChange={(e) => { setPurpose(e.target.value); setPreview(null); }} maxLength={300}/></div><div><Label htmlFor="mentor-expiry">{t("mentors.expiry")}</Label><Input id="mentor-expiry" type="datetime-local" className="mt-2 h-11" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/></div></div>
          <fieldset className="mt-5"><legend className="text-sm font-medium">{t("mentors.shareOnly")}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{categoryKeys.map((item) => <label key={item.value} className="flex min-h-11 items-center gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm"><input type="checkbox" checked={inviteCategories.includes(item.value)} onChange={() => toggleInviteCategory(item.value)} />{t(item.key)}</label>)}</div></fieldset>
          <div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" disabled={busy || !purpose.trim() || !inviteCategories.length || !expiresAt} onClick={() => void previewSharing()}><Eye className="size-4"/>{t("mentors.previewSharing")}</Button>{preview && <Button disabled={busy || !mentorLabel.trim()} onClick={() => void createInvite()}><UserRoundPlus className="size-4"/>{t("mentors.createInvite")}</Button>}</div>
          {preview && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.03] p-4 text-sm"><p className="font-medium">{t("mentors.previewTitle")}</p><p className="mt-1 text-muted-foreground">{preview.categories.map((item) => t(categoryKeys.find((key) => key.value === item)?.key ?? item, undefined, item)).join(" · ")}</p><p className="mt-3 text-xs font-medium text-muted-foreground">{t("mentors.neverShared")}</p><ul className="mt-1 list-disc space-y-1 pl-5 text-xs text-muted-foreground">{excludedKeys.map((key) => <li key={key}>{t(key)}</li>)}</ul></div>}
          {inviteLink && <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3"><p className="text-xs font-medium">{t("mentors.inviteOneTime")}</p><div className="mt-2 flex gap-2"><Input readOnly value={inviteLink} className="h-10 min-w-0"/><Button size="icon" variant="outline" onClick={() => void copyInvite()} aria-label={t("mentors.copyInvite")}><Clipboard className="size-4"/></Button></div></div>}
        </Card>

        <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("mentors.relationships")}</h2><div className="mt-4 space-y-2">{relationships.length === 0 ? <p className="text-sm text-muted-foreground">{t("mentors.empty")}</p> : relationships.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === item.id ? "border-primary/30 bg-primary/[0.04]" : "border-border/70 hover:bg-muted/30"}`}><div className="flex items-center justify-between gap-3"><span className="font-medium">{item.mentor_name ?? item.mentor_label}</span><span className="rounded-full border border-border px-2 py-0.5 text-[0.65rem] uppercase text-muted-foreground">{item.status}</span></div><p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.purpose}</p><p className="mt-2 text-[0.68rem] text-muted-foreground">{t("mentors.expires", { date: formatDate(item.expires_at) })}</p></button>)}</div></Card>
      </div>

      <div className="space-y-5">
        {!selected ? <Card className="rounded-[20px] p-8 text-center shadow-none"><p className="text-sm text-muted-foreground">{t("mentors.selectRelationship")}</p></Card> : <>
          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{selected.status}</p><h2 className="mt-1 font-heading text-xl font-semibold">{selected.mentor_name ?? selected.mentor_label}</h2><p className="mt-2 text-sm text-muted-foreground">{selected.purpose}</p></div>{selected.status !== "revoked" && selected.status !== "expired" && <Button variant="destructive" onClick={() => void revoke()} disabled={busy}><UserRoundX className="size-4"/>{t("mentors.revoke")}</Button>}</div><div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">{t("mentors.sharedCategories")}</p><p className="mt-1 text-sm">{selected.categories.map((item) => t(categoryKeys.find((key) => key.value === item)?.key ?? item, undefined, item)).join(" · ")}</p></div><div className="rounded-xl border border-border/70 p-3"><p className="text-xs text-muted-foreground">{t("mentors.expiry")}</p><p className="mt-1 text-sm">{formatDate(selected.expires_at)} · {formatTime(selected.expires_at)}</p></div></div>{selected.status !== "revoked" && selected.status !== "expired" && <div className="mt-5"><fieldset><legend className="text-sm font-medium">{t("mentors.shareOnly")}</legend><div className="mt-3 grid gap-2 sm:grid-cols-2">{categoryKeys.map((item) => <label key={item.value} className="flex min-h-11 items-center gap-3 rounded-xl border border-border/70 px-3 py-2 text-sm"><input type="checkbox" checked={scopeCategories.includes(item.value)} onChange={() => toggleScopeCategory(item.value)} />{t(item.key)}</label>)}</div></fieldset><div className="mt-4"><Label htmlFor="mentor-scope-expiry">{t("mentors.expiry")}</Label><Input id="mentor-scope-expiry" type="datetime-local" className="mt-2 h-11" value={expiresAt} onChange={(e) => { setExpiresAt(e.target.value); setScopePreview(null); }}/></div><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void previewScopeUpdate()} disabled={busy || !scopeCategories.length || !expiresAt}><Eye className="size-4"/>{t("mentors.previewSharing")}</Button>{scopePreview && <Button onClick={() => void saveScope()} disabled={busy}><ShieldCheck className="size-4"/>{t("mentors.saveSharing")}</Button>}</div>{scopePreview && <div className="mt-4 rounded-xl border border-primary/15 bg-primary/[0.03] p-3 text-xs text-muted-foreground">{t("mentors.previewTitle")}: {scopePreview.categories.map((item) => t(categoryKeys.find((key) => key.value === item)?.key ?? item, undefined, item)).join(" · ")}</div>}</div>}</Card>

          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><MessageSquarePlus className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentors.guidanceRequests")}</h2></div><div className="mt-4 grid gap-3"><Input aria-label={t("mentors.requestTitle")} placeholder={t("mentors.requestTitle")} value={requestTitle} onChange={(e) => setRequestTitle(e.target.value)}/><textarea className="workspace-input min-h-24 w-full resize-y" aria-label={t("mentors.requestQuestion")} placeholder={t("mentors.requestQuestion")} value={requestQuestion} onChange={(e) => setRequestQuestion(e.target.value)}/><Button className="w-fit" disabled={busy || !requestTitle.trim() || !requestQuestion.trim()} onClick={() => void createGuidanceRequest()}>{t("mentors.sendRequest")}</Button></div><div className="mt-5 space-y-2">{guidance.map((item) => <div key={item.id} className="rounded-xl border border-border/70 p-3"><div className="flex justify-between gap-2"><p className="text-sm font-medium">{item.title}</p><span className="text-[0.65rem] uppercase text-muted-foreground">{item.status}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.question}</p></div>)}</div></Card>

          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><BookOpenCheck className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentors.recommendations")}</h2></div><div className="mt-4 space-y-3">{recommendations.length === 0 ? <p className="text-sm text-muted-foreground">{t("mentors.noRecommendations")}</p> : recommendations.map((rec) => <div key={rec.id} className="rounded-xl border border-border/70 p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold">{rec.title}</p><p className="mt-1 text-xs text-muted-foreground">{rec.kind} · {rec.status}</p></div>{rec.status === "planned" && <CheckCircle2 className="size-4 text-success"/>}</div><p className="mt-3 text-sm text-muted-foreground">{rec.rationale}</p>{rec.suggested_action && <p className="mt-2 text-sm"><span className="font-medium">{t("mentors.suggestedAction")}: </span>{rec.suggested_action}</p>}{rec.status === "proposed" && <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void decideRecommendation(rec, "accept")}>{t("mentors.accept")}</Button><Button size="sm" variant="outline" onClick={() => void decideRecommendation(rec, "dismiss")}>{t("mentors.dismiss")}</Button></div>}{rec.status === "accepted" && rec.kind === "recommendation" && <div className="mt-4 flex flex-col gap-2 sm:flex-row"><Input type="datetime-local" aria-label={t("mentors.planTime")} value={planTimes[rec.id] ?? ""} onChange={(e) => setPlanTimes((current) => ({ ...current, [rec.id]: e.target.value }))}/><Button onClick={() => void addRecommendationToPlanner(rec)}><CalendarPlus className="size-4"/>{t("mentors.addToPlanner")}</Button></div>}</div>)}</div></Card>

          <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><History className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentors.accessHistory")}</h2></div><div className="mt-4 space-y-2">{history.length === 0 ? <p className="text-sm text-muted-foreground">{t("mentors.noAccessHistory")}</p> : history.slice(0, 20).map((item) => <div key={item.id} className="flex gap-3 rounded-xl border border-border/60 p-3"><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground"/><div><p className="text-sm font-medium">{item.event_type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted-foreground">{item.detail}</p><p className="mt-1 text-[0.65rem] text-muted-foreground">{formatDate(item.occurred_at)} · {formatTime(item.occurred_at)}</p></div></div>)}</div></Card>
        </>}
      </div>
    </div>
    <div className="mt-6 pb-10 text-xs text-muted-foreground">{t("mentors.privacyNote")} <Link href="/roadmap" className="text-primary underline-offset-4 hover:underline">{t("mentors.openRoadmap")}</Link></div>
  </div>;
}
