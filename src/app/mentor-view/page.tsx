"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BookOpenCheck, CheckCircle2, LockKeyhole, MessageSquarePlus, Route, ShieldCheck, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandLogo } from "@/components/brand/brand-logo";
import { mentorAccessRequest, type MentorView } from "@/features/mentors/domain/mentors";
import { useLocale } from "@/i18n/locale-provider";
import type { MentorValidationRequest } from "@/features/evidence-passport/domain/evidence-passport";

const excludedKeys = ["mentors.excludedCapacity", "mentors.excludedCv", "mentors.excludedInterview", "mentors.excludedNotes", "mentors.excludedDocuments"];

function PageContent() {
  const search = useSearchParams();
  const { t } = useLocale();
  const invite = search.get("invite") ?? "";
  const relationshipParam = search.get("relationship") ?? "";
  const [mentorName, setMentorName] = useState("");
  const [relationshipId, setRelationshipId] = useState(relationshipParam);
  const [accessToken, setAccessToken] = useState("");
  const [view, setView] = useState<MentorView | null>(null);
  const [validationRequests, setValidationRequests] = useState<MentorValidationRequest[]>([]);
  const [kind, setKind] = useState<"comment" | "recommendation">("recommendation");
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [suggestedAction, setSuggestedAction] = useState("");
  const [requestId, setRequestId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const storageKey = useMemo(() => relationshipId ? `lumapath-mentor-access:${relationshipId}` : "", [relationshipId]);

  useEffect(() => {
    if (!relationshipId) return;
    const stored = window.localStorage.getItem(`lumapath-mentor-access:${relationshipId}`);
    if (stored) setAccessToken(stored);
  }, [relationshipId]);

  useEffect(() => {
    if (!relationshipId || !accessToken) return;
    void loadView(relationshipId, accessToken);
  }, [relationshipId, accessToken]);

  async function loadView(id: string, token: string) {
    try {
      const [nextView, evidenceRequests] = await Promise.all([
        mentorAccessRequest<MentorView>(`/api/mentor-access/relationships/${id}`, token),
        mentorAccessRequest<MentorValidationRequest[]>(`/api/evidence-mentor/relationships/${id}/validation-requests`, token).catch(() => []),
      ]);
      setView(nextView); setValidationRequests(evidenceRequests);
      setError("");
    } catch (caught) {
      setView(null); setValidationRequests([]);
      setError(caught instanceof Error ? caught.message : "Mentor access failed.");
    }
  }

  async function respondToValidation(item: MentorValidationRequest, decision: "validated" | "uncertain" | "disputed") {
    if (!relationshipId || !accessToken) return;
    const note = window.prompt(t("mentorView.validationNotePrompt"), "")?.trim();
    if (!note) return;
    setBusy(true); setError("");
    try {
      await mentorAccessRequest(`/api/evidence-mentor/validation-requests/${item.id}/respond`, accessToken, {
        method: "POST", body: JSON.stringify({ relationship_id: relationshipId, decision, note, proficiency: null }),
      });
      setMessage(t("mentorView.validationSaved")); await loadView(relationshipId, accessToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : t("mentorView.validationFailed")); }
    finally { setBusy(false); }
  }

  async function acceptInvite() {
    if (!invite || !mentorName.trim()) return;
    setBusy(true); setError("");
    try {
      const result = await mentorAccessRequest<{ relationship: MentorView["relationship"]; mentor_access_token: string }>(
        "/api/mentor-access/invitations/accept", undefined,
        { method: "POST", body: JSON.stringify({ invitation_token: invite, mentor_name: mentorName }) },
      );
      setRelationshipId(result.relationship.id);
      setAccessToken(result.mentor_access_token);
      window.localStorage.setItem(`lumapath-mentor-access:${result.relationship.id}`, result.mentor_access_token);
      history.replaceState(null, "", `/mentor-view?relationship=${encodeURIComponent(result.relationship.id)}`);
      setMessage(t("mentorView.inviteAccepted"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Invitation acceptance failed.");
    } finally { setBusy(false); }
  }

  async function sendGuidance() {
    if (!relationshipId || !accessToken || !title.trim() || !rationale.trim()) return;
    setBusy(true); setError("");
    try {
      await mentorAccessRequest(`/api/mentor-access/relationships/${relationshipId}/recommendations`, accessToken, {
        method: "POST",
        body: JSON.stringify({
          guidance_request_id: requestId || null,
          kind,
          title,
          rationale,
          suggested_action: kind === "recommendation" ? suggestedAction : "",
          suggested_minutes: kind === "recommendation" ? 45 : null,
        }),
      });
      setTitle(""); setRationale(""); setSuggestedAction("");
      setMessage(kind === "recommendation" ? t("mentorView.recommendationSent") : t("mentorView.commentSent"));
      await loadView(relationshipId, accessToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Mentor guidance failed.");
    } finally { setBusy(false); }
  }

  function forgetAccess() {
    if (storageKey) window.localStorage.removeItem(storageKey);
    setAccessToken(""); setView(null); setMessage(t("mentorView.forgotten"));
  }

  return <main className="min-h-dvh bg-background px-4 py-8 text-foreground sm:px-6"><div className="mx-auto max-w-5xl">
    <div className="mb-8 flex items-center justify-between gap-4"><BrandLogo size="md"/><span className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">{t("mentorView.badge")}</span></div>
    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/20 bg-destructive/[0.04] p-3 text-sm text-destructive">{error}</div>}
    {message && <div role="status" className="mb-4 rounded-xl border border-primary/15 bg-primary/[0.04] p-3 text-sm text-primary">{message}</div>}

    {!accessToken && invite && <Card className="mx-auto max-w-xl rounded-[20px] p-6 shadow-none">
      <div className="flex items-center gap-2"><LockKeyhole className="size-5 text-primary"/><h1 className="font-heading text-xl font-semibold">{t("mentorView.acceptTitle")}</h1></div>
      <p className="mt-3 text-sm text-muted-foreground">{t("mentorView.acceptDescription")}</p>
      <div className="mt-5"><Label htmlFor="mentor-name">{t("mentorView.name")}</Label><Input id="mentor-name" className="mt-2 h-11" value={mentorName} onChange={(e) => setMentorName(e.target.value)} maxLength={120}/></div>
      <Button className="mt-4" disabled={busy || !mentorName.trim()} onClick={() => void acceptInvite()}><ShieldCheck className="size-4"/>{t("mentorView.accept")}</Button>
    </Card>}

    {!accessToken && !invite && <Card className="mx-auto max-w-xl rounded-[20px] p-6 text-center shadow-none">
      <LockKeyhole className="mx-auto size-6 text-muted-foreground"/><h1 className="mt-3 font-heading text-xl font-semibold">{t("mentorView.accessRequired")}</h1><p className="mt-2 text-sm text-muted-foreground">{t("mentorView.accessRequiredDescription")}</p>
    </Card>}

    {view && <div className="space-y-5">
      <Card className="rounded-[20px] p-5 shadow-none"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs uppercase tracking-wide text-muted-foreground">{view.relationship.status}</p><h1 className="mt-1 font-heading text-2xl font-semibold">{t("mentorView.targetedGuidance")}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{view.relationship.purpose}</p></div><Button variant="outline" onClick={forgetAccess}>{t("mentorView.forget")}</Button></div><div className="mt-4 flex flex-wrap gap-2">{view.relationship.categories.map((item) => <span key={item} className="rounded-full border border-primary/20 bg-primary/[0.04] px-2.5 py-1 text-xs text-primary">{item.replaceAll("_", " ")}</span>)}</div></Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {view.shared.academic_summary && <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("mentorView.academicSummary")}</h2><p className="mt-3 text-sm">{view.shared.academic_summary.degree} · {view.shared.academic_summary.academic_year}</p><p className="mt-1 text-sm text-muted-foreground">{view.shared.academic_summary.university}</p><p className="mt-3 text-sm text-muted-foreground">{t("mentorView.openTasks", { open: view.shared.academic_summary.open_academic_tasks, completed: view.shared.academic_summary.completed_academic_tasks })}</p><div className="mt-3 flex flex-wrap gap-2">{view.shared.academic_summary.current_modules.map((module) => <span key={module} className="rounded-full border border-border px-2 py-1 text-xs">{module}</span>)}</div></Card>}
        {view.shared.career_goal && <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("mentorView.careerGoal")}</h2><p className="mt-3 text-lg font-semibold">{view.shared.career_goal.target_role}</p><p className="mt-1 text-sm text-muted-foreground">{view.shared.career_goal.career_goal}</p>{view.shared.career_goal.learning_goal && <p className="mt-3 text-sm">{t("mentorView.learningGoal", { goal: view.shared.career_goal.learning_goal })}</p>}</Card>}
        {view.shared.career_readiness && <Card className="rounded-[20px] p-5 shadow-none"><h2 className="font-heading text-lg font-semibold">{t("mentorView.readiness")}</h2><p className="mt-3 font-mono text-3xl font-semibold">{view.shared.career_readiness.score}%</p><div className="mt-4 space-y-2">{view.shared.career_readiness.breakdown.map((item) => <div key={item.label} className="flex justify-between text-sm"><span className="text-muted-foreground">{item.label}</span><span>{item.value}%</span></div>)}</div></Card>}
        {view.shared.roadmap && <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><Route className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentorView.roadmap")}</h2></div><p className="mt-2 text-sm text-muted-foreground">{view.shared.roadmap.target_role} · v{view.shared.roadmap.version}</p><div className="mt-4 space-y-2">{view.shared.roadmap.milestones.map((item) => <div key={item.skill_id} className="flex items-center justify-between rounded-xl border border-border/70 p-3"><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.state.replaceAll("_", " ")}</p></div><span className="font-mono text-sm">{item.proficiency}%</span></div>)}</div></Card>}
      </div>

      <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><MessageSquarePlus className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentorView.guidanceRequests")}</h2></div><div className="mt-4 space-y-3">{view.guidance_requests.length === 0 ? <p className="text-sm text-muted-foreground">{t("mentorView.noRequests")}</p> : view.guidance_requests.map((item) => <button key={item.id} onClick={() => setRequestId(item.id)} className={`w-full rounded-xl border p-3 text-left ${requestId === item.id ? "border-primary/30 bg-primary/[0.04]" : "border-border/70"}`}><div className="flex justify-between gap-3"><span className="text-sm font-medium">{item.title}</span><span className="text-[0.65rem] uppercase text-muted-foreground">{item.status}</span></div><p className="mt-2 text-sm text-muted-foreground">{item.question}</p></button>)}</div></Card>

      <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><UserRoundCheck className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentorView.evidenceValidation")}</h2></div><p className="mt-2 text-sm text-muted-foreground">{t("mentorView.evidenceValidationBody")}</p><div className="mt-4 space-y-3">{validationRequests.length===0?<p className="text-sm text-muted-foreground">{t("mentorView.noValidationRequests")}</p>:validationRequests.map(item=><div key={item.id} className="rounded-xl border border-border/70 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-medium">{item.skill_name}</p><p className="mt-1 text-xs text-muted-foreground">{item.request_note||t("mentorView.validationNoNote")}</p></div><span className="text-[0.65rem] uppercase text-muted-foreground">{item.status}</span></div>{item.status==="pending"&&<div className="mt-3 flex flex-wrap gap-2"><Button size="sm" disabled={busy} onClick={()=>void respondToValidation(item,"validated")}>{t("mentorView.validationSupported")}</Button><Button size="sm" variant="outline" disabled={busy} onClick={()=>void respondToValidation(item,"uncertain")}>{t("mentorView.validationUncertain")}</Button><Button size="sm" variant="ghost" disabled={busy} onClick={()=>void respondToValidation(item,"disputed")}>{t("mentorView.validationDisputed")}</Button></div>}{item.mentor_note&&<p className="mt-2 text-xs text-muted-foreground">{item.mentor_note}</p>}</div>)}</div></Card>

      <Card className="rounded-[20px] p-5 shadow-none"><div className="flex items-center gap-2"><BookOpenCheck className="size-5 text-primary"/><h2 className="font-heading text-lg font-semibold">{t("mentorView.addGuidance")}</h2></div><p className="mt-2 text-sm text-muted-foreground">{t("mentorView.guidancePrivacy")}</p><div className="mt-4 grid gap-3"><select className="workspace-select w-full" aria-label={t("mentorView.type")} value={kind} onChange={(e) => setKind(e.target.value as "comment" | "recommendation")}><option value="recommendation">{t("mentorView.recommendation")}</option><option value="comment">{t("mentorView.comment")}</option></select><Input placeholder={t("mentorView.titlePlaceholder")} value={title} onChange={(e) => setTitle(e.target.value)}/><textarea className="workspace-input min-h-24 w-full resize-y" placeholder={t("mentorView.rationalePlaceholder")} value={rationale} onChange={(e) => setRationale(e.target.value)}/>{kind === "recommendation" && <Input placeholder={t("mentorView.actionPlaceholder")} value={suggestedAction} onChange={(e) => setSuggestedAction(e.target.value)}/>}<Button className="w-fit" disabled={busy || !title.trim() || !rationale.trim()} onClick={() => void sendGuidance()}>{t("mentorView.send")}</Button></div></Card>

      <Card className="rounded-[20px] border-warning/20 bg-warning/[0.03] p-5 shadow-none"><div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-warning"/><h2 className="font-heading text-lg font-semibold">{t("mentorView.excluded")}</h2></div><ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{excludedKeys.map((key) => <li key={key}>{t(key)}</li>)}</ul></Card>
    </div>}
  </div></main>;
}

export default function MentorViewPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-background p-8 text-sm text-muted-foreground">Loading mentor access…</main>}><PageContent /></Suspense>;
}
