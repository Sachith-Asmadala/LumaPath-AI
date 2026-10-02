"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, Bell, BriefcaseBusiness, CalendarClock, ChevronRight, CircleAlert, History, LoaderCircle, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion/animated";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import { CLOSED_APPLICATION_STATUSES, STATUS_TRANSITIONS, idempotencyKey, type ApplicationInput, type ApplicationStatus, type InternshipApplication } from "@/features/internships/domain/internships";
import { archiveApplication, createApplication, createPlannerAction, createReminder, deleteApplication, listApplications, transitionApplication, updateApplication, updateReminder } from "@/features/internships/services/internships";

const emptyForm = { company: "", role: "", sourceUrl: "", deadline: "", deadlineConfirmed: false, contactName: "", contactEmail: "", interviewAt: "", interviewConfirmed: false, followUpAt: "", followUpConfirmed: false, notes: "", nextAction: "", requirements: "", timezone: "Asia/Colombo" };

type FormState = typeof emptyForm;

function localInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIso(value: string) { return value ? new Date(value).toISOString() : null; }

export default function InternshipsPage() {
  const { state, addTask } = useDemo();
  const { t, formatDate, formatTime } = useLocale();
  const studentId = state.student.id;
  const [items, setItems] = useState<InternshipApplication[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusNote, setStatusNote] = useState("");
  const [outcomeNotes, setOutcomeNotes] = useState("");
  const [reminder, setReminder] = useState({ kind: "follow_up", title: "", remindAt: "", notifications: true, quietStart: "22:00", quietEnd: "07:00" });
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [planner, setPlanner] = useState({ kind: "deadline_prep", title: "", startAt: "", duration: 45, confirmed: false });

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true); setError("");
    try {
      const next = await listApplications(studentId, showArchived);
      setItems(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : next[0]?.id ?? null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.load")); }
    finally { setLoading(false); }
  }, [showArchived, studentId, t]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!selected) return;
    setForm({
      company: selected.company, role: selected.role, sourceUrl: selected.source_url ?? "", deadline: selected.application_deadline ?? "", deadlineConfirmed: selected.application_deadline_confirmed,
      contactName: selected.contact_name, contactEmail: selected.contact_email, interviewAt: localInput(selected.interview_at), interviewConfirmed: selected.interview_at_confirmed,
      followUpAt: localInput(selected.follow_up_at), followUpConfirmed: selected.follow_up_at_confirmed, notes: selected.notes, nextAction: selected.next_action,
      requirements: selected.requirements.map((item) => item.skill_name).join(", "), timezone: selected.timezone,
    });
    setOutcomeNotes(selected.outcome_notes);
  }, [selected]);

  const requirements = (value: string) => value.split(",").map((skill) => skill.trim()).filter(Boolean).slice(0, 30).map((skill_name) => ({ skill_name, required: true }));
  const basePayload = (source_type: "manual" | "recommendation" = "manual", source_reference?: string | null): ApplicationInput => ({
    company: form.company, role: form.role, source_type, source_reference, source_url: form.sourceUrl || null, application_deadline: form.deadline || null,
    application_deadline_confirmed: form.deadlineConfirmed, contact_name: form.contactName, contact_email: form.contactEmail, interview_at: toIso(form.interviewAt), interview_at_confirmed: form.interviewConfirmed,
    follow_up_at: toIso(form.followUpAt), follow_up_at_confirmed: form.followUpConfirmed, notes: form.notes, next_action: form.nextAction, timezone: form.timezone,
    requirements: requirements(form.requirements), idempotency_key: idempotencyKey("application"),
  });

  async function createManual() {
    if (!form.company.trim() || !form.role.trim()) { setError(t("internships.error.companyRole")); return; }
    setBusy(true); setError("");
    try { const created = await createApplication(studentId, basePayload()); setCreating(false); await load(); setSelectedId(created.id); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.save")); }
    finally { setBusy(false); }
  }


  async function saveDetails() {
    if (!selected) return;
    setBusy(true); setError("");
    try {
      const payload = basePayload();
      const { source_type: _sourceType, source_reference: _sourceReference, ...updatePayload } = payload;
      await updateApplication(studentId, selected.id, { ...updatePayload, idempotency_key: idempotencyKey("update") }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.save")); }
    finally { setBusy(false); }
  }

  async function changeStatus(status: ApplicationStatus) {
    if (!selected) return;
    setBusy(true); setError("");
    try { const updated = await transitionApplication(studentId, selected.id, status, statusNote, idempotencyKey("status")); await load(); setSelectedId(updated.id); setStatusNote(""); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.status")); }
    finally { setBusy(false); }
  }

  async function saveReminder() {
    if (!selected || !reminder.title.trim() || !reminder.remindAt) { setError(t("internships.error.reminder")); return; }
    setBusy(true); setError("");
    try {
      const payload = { kind: reminder.kind, title: reminder.title, remind_at: toIso(reminder.remindAt), timezone: selected.timezone, enabled: true, notifications_enabled: reminder.notifications, quiet_hours_start: reminder.quietStart, quiet_hours_end: reminder.quietEnd, idempotency_key: idempotencyKey(editingReminderId ? "reminder-update" : "reminder") };
      if (editingReminderId) await updateReminder(studentId, selected.id, editingReminderId, payload); else await createReminder(studentId, selected.id, payload);
      setReminder((current) => ({ ...current, title: "", remindAt: "" })); setEditingReminderId(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.reminderSave")); }
    finally { setBusy(false); }
  }

  function editReminder(reminderId: string) {
    if (!selected) return;
    const item = selected.reminders.find((entry) => entry.id === reminderId);
    if (!item) return;
    setEditingReminderId(item.id);
    setReminder({ kind: item.kind, title: item.title, remindAt: localInput(item.remind_at), notifications: item.notifications_enabled, quietStart: item.quiet_hours_start ?? "22:00", quietEnd: item.quiet_hours_end ?? "07:00" });
  }

  async function disableReminder(reminderId: string) {
    if (!selected) return;
    const existing = selected.reminders.find((item) => item.id === reminderId); if (!existing) return;
    setBusy(true); setError("");
    try {
      await updateReminder(studentId, selected.id, reminderId, { kind: existing.kind, title: existing.title, remind_at: existing.remind_at, timezone: existing.timezone, enabled: false, notifications_enabled: existing.notifications_enabled, quiet_hours_start: existing.quiet_hours_start, quiet_hours_end: existing.quiet_hours_end, idempotency_key: idempotencyKey("reminder-disable") }); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.reminderSave")); }
    finally { setBusy(false); }
  }

  async function addPlannerTask() {
    if (!selected || !planner.title.trim() || !planner.startAt) { setError(t("internships.error.planner")); return; }
    setBusy(true); setError("");
    try {
      const action = await createPlannerAction(studentId, selected.id, { kind: planner.kind, title: planner.title, start_at: toIso(planner.startAt), duration_minutes: planner.duration, confirmed: planner.confirmed, idempotency_key: idempotencyKey("planner") });
      if (!action.idempotent_replay) addTask({ title: action.title, category: "Internship", estimatedMinutes: action.duration_minutes, startAt: action.start_at, description: action.description });
      setPlanner((current) => ({ ...current, title: "", startAt: "", confirmed: false }));
    } catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.plannerSave")); }
    finally { setBusy(false); }
  }

  async function toggleArchive() {
    if (!selected) return;
    setBusy(true); setError("");
    try { await archiveApplication(studentId, selected.id, !selected.archived, outcomeNotes, idempotencyKey("archive")); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.archive")); }
    finally { setBusy(false); }
  }

  async function removeSelected() {
    if (!selected || !window.confirm(t("internships.deleteConfirm"))) return;
    setBusy(true); setError("");
    try { await deleteApplication(studentId, selected.id); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : t("internships.error.delete")); }
    finally { setBusy(false); }
  }

  const deadlineTone = (stateValue: InternshipApplication["deadline_state"]) => stateValue === "past_due" ? "border-risk/20 text-risk" : stateValue === "unconfirmed" || stateValue === "missing" ? "border-warning/20 text-warning" : "border-success/20 text-success";

  return <div className="mx-auto w-full max-w-[1480px] space-y-6 px-4 pb-16 pt-5 sm:px-6 lg:px-8">
    <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><div className="flex items-center gap-2 text-primary"><BriefcaseBusiness className="size-4" /><span className="type-eyebrow">{t("internships.eyebrow")}</span></div><h1 className="mt-2 font-heading text-3xl font-semibold tracking-[-0.04em]">{t("internships.title")}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{t("internships.subtitle")}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setCreating(true); setSelectedId(null); setForm(emptyForm); }}><Plus className="size-4" />{t("internships.addManual")}</Button><Button asChild><Link href="/opportunities"><BriefcaseBusiness className="size-4" />{t("command.openOpportunities")}</Link></Button></div></div>

    {error && <Card role="alert" className="rounded-[18px] border-risk/20 bg-risk/5 p-4 text-sm text-risk"><div className="flex items-start gap-2"><CircleAlert className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div></Card>}

    <div className="grid gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
      <Reveal><Card className="rounded-[20px] p-4"><div className="flex items-center justify-between gap-3"><div><h2 className="type-section-title">{t("internships.pipeline")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("internships.pipelineHint")}</p></div><label className="flex items-center gap-2 text-[0.68rem] text-muted-foreground"><Checkbox checked={showArchived} onCheckedChange={(checked) => setShowArchived(Boolean(checked))} />{t("internships.showArchived")}</label></div><div className="mt-4 space-y-2">{loading ? <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{t("common.loading")}</div> : items.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-xs leading-5 text-muted-foreground">{t("internships.empty")}</div> : items.map((item) => <button key={item.id} onClick={() => { setSelectedId(item.id); setCreating(false); }} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === item.id ? "border-primary/35 bg-primary/[0.05]" : "border-border hover:bg-accent/40"}`}><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-medium">{item.role}</p><p className="mt-0.5 truncate text-[0.68rem] text-muted-foreground">{item.company}</p></div><Badge variant="outline" className="shrink-0 text-[0.57rem]">{t(`internships.status.${item.status}`)}</Badge></div><div className="mt-2 flex items-center justify-between gap-2"><Badge variant="outline" className={`text-[0.56rem] ${deadlineTone(item.deadline_state)}`}>{t(`internships.deadline.${item.deadline_state}`)}</Badge>{item.archived && <Archive className="size-3.5 text-muted-foreground" />}</div></button>)}</div></Card></Reveal>

      <div className="min-w-0 space-y-5">
        {(creating || (!selected && !loading)) && <Card className="rounded-[20px] p-5 sm:p-6"><h2 className="type-section-title">{t("internships.newTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("internships.manualHint")}</p><ApplicationForm form={form} setForm={setForm} t={t} /><div className="mt-5 flex justify-end"><Button onClick={() => void createManual()} disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" />}<Save className="size-4" />{t("internships.create")}</Button></div></Card>}

        {selected && <>
          <Card className="rounded-[20px] p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{t(`internships.status.${selected.status}`)}</Badge><Badge variant="outline" className={deadlineTone(selected.deadline_state)}>{t(`internships.deadline.${selected.deadline_state}`)}</Badge>{selected.source_type === "recommendation" && <Badge variant="outline">{t("internships.fromRecommendation")}</Badge>}</div><h2 className="mt-3 text-xl font-semibold">{selected.role}</h2><p className="mt-1 text-sm text-muted-foreground">{selected.company}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => void saveDetails()} disabled={busy}><Save className="size-3.5" />{t("common.save")}</Button><Button variant="outline" size="sm" onClick={() => void removeSelected()} disabled={busy}><Trash2 className="size-3.5" />{t("common.delete")}</Button></div></div><ApplicationForm form={form} setForm={setForm} t={t} /></Card>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="rounded-[20px] p-5"><h2 className="type-section-title">{t("internships.statusTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("internships.statusHint")}</p><Textarea aria-label={t("internships.statusNoteLabel")} value={statusNote} onChange={(e) => setStatusNote(e.target.value)} placeholder={t("internships.statusNotePlaceholder")} className="mt-4 min-h-20" />{STATUS_TRANSITIONS[selected.status].length ? <div className="mt-3 flex flex-wrap gap-2">{STATUS_TRANSITIONS[selected.status].map((status) => <Button key={status} size="sm" variant="outline" onClick={() => void changeStatus(status)} disabled={busy}>{t(`internships.status.${status}`)}<ChevronRight className="size-3.5" /></Button>)}</div> : <p className="mt-4 rounded-xl border border-border bg-background/50 p-3 text-xs text-muted-foreground">{t("internships.closedState")}</p>}</Card>
            <Card className="rounded-[20px] p-5"><h2 className="type-section-title">{t("internships.nextActionTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.next_action || t("internships.noNextAction")}</p><div className="mt-4 space-y-2">{selected.readiness_actions.length === 0 ? <p className="rounded-xl border border-dashed p-3 text-xs text-muted-foreground">{t("internships.noReadiness")}</p> : selected.readiness_actions.map((action) => <Link key={`${action.skill_name}-${action.status}`} href={action.href} className="block rounded-xl border border-border p-3 transition-colors hover:bg-accent/40"><div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{action.status === "evidence_available" ? t("internships.readinessEvidenceTitle", { skill: action.skill_name }) : t("internships.readinessGapTitle", { skill: action.skill_name })}</p><Badge variant="outline" className={action.status === "evidence_available" ? "text-success" : "text-warning"}>{action.skill_name}</Badge></div><p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{action.status === "evidence_available" ? t("internships.readinessEvidenceRationale") : t("internships.readinessGapRationale")}</p></Link>)}</div></Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><Bell className="size-4 text-primary" /><h2 className="type-section-title">{t("internships.remindersTitle")}</h2></div><p className="mt-1 text-xs text-muted-foreground">{t("internships.remindersHint")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="internship-reminder-kind">{t("internships.reminderKind")}</Label><select id="internship-reminder-kind" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={reminder.kind} onChange={(e) => setReminder((v) => ({ ...v, kind: e.target.value }))}><option value="deadline">{t("internships.reminder.deadline")}</option><option value="interview">{t("internships.reminder.interview")}</option><option value="follow_up">{t("internships.reminder.followUp")}</option><option value="custom">{t("internships.reminder.custom")}</option></select></div><div><Label htmlFor="internship-remind-at">{t("internships.remindAt")}</Label><Input id="internship-remind-at" type="datetime-local" className="mt-2" value={reminder.remindAt} onChange={(e) => setReminder((v) => ({ ...v, remindAt: e.target.value }))} /></div><div className="sm:col-span-2"><Label htmlFor="internship-reminder-title">{t("internships.reminderTitle")}</Label><Input id="internship-reminder-title" className="mt-2" value={reminder.title} onChange={(e) => setReminder((v) => ({ ...v, title: e.target.value }))} /></div><div><Label htmlFor="internship-quiet-start">{t("internships.quietStart")}</Label><Input id="internship-quiet-start" type="time" className="mt-2" value={reminder.quietStart} onChange={(e) => setReminder((v) => ({ ...v, quietStart: e.target.value }))} /></div><div><Label htmlFor="internship-quiet-end">{t("internships.quietEnd")}</Label><Input id="internship-quiet-end" type="time" className="mt-2" value={reminder.quietEnd} onChange={(e) => setReminder((v) => ({ ...v, quietEnd: e.target.value }))} /></div></div><label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={reminder.notifications} onCheckedChange={(checked) => setReminder((v) => ({ ...v, notifications: Boolean(checked) }))} />{t("internships.notificationsEnabled")}</label><div className="mt-4 flex flex-wrap gap-2"><Button size="sm" onClick={() => void saveReminder()} disabled={busy}><Plus className="size-3.5" />{editingReminderId ? t("internships.saveReminder") : t("internships.addReminder")}</Button>{editingReminderId && <Button size="sm" variant="ghost" onClick={() => { setEditingReminderId(null); setReminder((current) => ({ ...current, title: "", remindAt: "" })); }}>{t("common.cancel")}</Button>}</div><div className="mt-4 space-y-2">{selected.reminders.map((item) => <div key={item.id} className="rounded-xl border border-border p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-[0.66rem] text-muted-foreground">{formatDate(item.remind_at,{dateStyle:"medium"})} · {formatTime(item.remind_at,{timeStyle:"short"})}</p>{item.effective_notification_at && item.effective_notification_at !== item.remind_at && <p className="mt-1 text-[0.62rem] text-warning">{t("internships.quietShift", { time: formatTime(item.effective_notification_at,{timeStyle:"short"}) })}</p>}</div><Badge variant="outline">{item.enabled ? t("internships.enabled") : t("internships.disabled")}</Badge></div>{item.enabled && <div className="mt-2 flex gap-2"><Button size="sm" variant="ghost" onClick={() => editReminder(item.id)}>{t("internships.editReminder")}</Button><Button size="sm" variant="ghost" onClick={() => void disableReminder(item.id)}>{t("internships.disable")}</Button></div>}</div>)}</div></Card>

            <Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><CalendarClock className="size-4 text-pathway" /><h2 className="type-section-title">{t("internships.plannerTitle")}</h2></div><p className="mt-1 text-xs text-muted-foreground">{t("internships.plannerHint")}</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><div><Label htmlFor="internship-planner-kind">{t("internships.plannerKind")}</Label><select id="internship-planner-kind" className="mt-2 h-10 w-full rounded-xl border border-input bg-background px-3 text-sm" value={planner.kind} onChange={(e) => setPlanner((v) => ({ ...v, kind: e.target.value }))}><option value="deadline_prep">{t("internships.planner.deadlinePrep")}</option><option value="interview_prep">{t("internships.planner.interviewPrep")}</option><option value="follow_up">{t("internships.planner.followUp")}</option><option value="custom">{t("internships.planner.custom")}</option></select></div><div><Label htmlFor="internship-planner-duration">{t("internships.duration")}</Label><Input id="internship-planner-duration" type="number" min={5} max={480} className="mt-2" value={planner.duration} onChange={(e) => setPlanner((v) => ({ ...v, duration: Number(e.target.value) || 5 }))} /></div><div className="sm:col-span-2"><Label htmlFor="internship-planner-title">{t("internships.plannerTaskTitle")}</Label><Input id="internship-planner-title" className="mt-2" value={planner.title} onChange={(e) => setPlanner((v) => ({ ...v, title: e.target.value }))} /></div><div className="sm:col-span-2"><Label htmlFor="internship-planner-start">{t("internships.startAt")}</Label><Input id="internship-planner-start" type="datetime-local" className="mt-2" value={planner.startAt} onChange={(e) => setPlanner((v) => ({ ...v, startAt: e.target.value }))} /></div></div><label className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><Checkbox checked={planner.confirmed} onCheckedChange={(checked) => setPlanner((v) => ({ ...v, confirmed: Boolean(checked) }))} /><span>{t("internships.confirmPlanner")}</span></label><Button className="mt-4" size="sm" onClick={() => void addPlannerTask()} disabled={busy}><CalendarClock className="size-3.5" />{t("internships.addToPlanner")}</Button></Card>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><History className="size-4 text-muted-foreground" /><h2 className="type-section-title">{t("internships.historyTitle")}</h2></div><div className="mt-4 space-y-3">{selected.history.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/60" /><div><p className="text-xs font-medium">{event.event_type === "status_changed" && event.to_status ? t("internships.historyStatus", { status: t(`internships.status.${event.to_status}`) }) : t(`internships.event.${event.event_type}`, undefined, event.event_type)}</p><p className="mt-0.5 text-[0.64rem] text-muted-foreground">{formatDate(event.occurred_at,{dateStyle:"medium"})} · {formatTime(event.occurred_at,{timeStyle:"short"})}</p>{event.note && <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{event.note}</p>}</div></div>)}</div></Card>
            <Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-success" /><h2 className="type-section-title">{t("internships.privacyTitle")}</h2></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{t("internships.privacyText")}</p>{CLOSED_APPLICATION_STATUSES.includes(selected.status) && <div className="mt-5 border-t border-border pt-4"><Label htmlFor="internship-outcome-notes">{t("internships.outcomeNotes")}</Label><Textarea id="internship-outcome-notes" className="mt-2 min-h-24" value={outcomeNotes} onChange={(e) => setOutcomeNotes(e.target.value)} placeholder={t("internships.outcomePlaceholder")} /><Button className="mt-3" size="sm" variant="outline" onClick={() => void toggleArchive()}><Archive className="size-3.5" />{selected.archived ? t("internships.restore") : t("internships.archive")}</Button></div>}</Card>
          </div>
        </>}
      </div>
    </div>
  </div>;
}

function ApplicationForm({ form, setForm, t }: { form: FormState; setForm: React.Dispatch<React.SetStateAction<FormState>>; t: (key: string, values?: Record<string,string|number>, fallback?: string) => string }) {
  return <div className="mt-5 grid gap-4 md:grid-cols-2">
    <div><Label htmlFor="internship-company">{t("internships.company")}</Label><Input id="internship-company" className="mt-2" value={form.company} onChange={(e) => setForm((v) => ({ ...v, company: e.target.value }))} /></div>
    <div><Label htmlFor="internship-role">{t("internships.role")}</Label><Input id="internship-role" className="mt-2" value={form.role} onChange={(e) => setForm((v) => ({ ...v, role: e.target.value }))} /></div>
    <div><Label htmlFor="internship-deadline">{t("internships.deadlineLabel")}</Label><Input id="internship-deadline" type="date" className="mt-2" value={form.deadline} onChange={(e) => setForm((v) => ({ ...v, deadline: e.target.value }))} /><label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={form.deadlineConfirmed} onCheckedChange={(checked) => setForm((v) => ({ ...v, deadlineConfirmed: Boolean(checked) }))} />{t("internships.confirmDate")}</label></div>
    <div><Label htmlFor="internship-source-url">{t("internships.sourceUrl")}</Label><Input id="internship-source-url" type="url" className="mt-2" value={form.sourceUrl} onChange={(e) => setForm((v) => ({ ...v, sourceUrl: e.target.value }))} /></div>
    <div><Label htmlFor="internship-timezone">{t("internships.timezone")}</Label><Input id="internship-timezone" className="mt-2" value={form.timezone} onChange={(e) => setForm((v) => ({ ...v, timezone: e.target.value }))} placeholder="Asia/Colombo" /><p className="mt-1 text-[0.62rem] text-muted-foreground">{t("internships.timezoneHint")}</p></div>
    <div><Label htmlFor="internship-contact-name">{t("internships.contactName")}</Label><Input id="internship-contact-name" className="mt-2" value={form.contactName} onChange={(e) => setForm((v) => ({ ...v, contactName: e.target.value }))} /></div>
    <div><Label htmlFor="internship-contact-email">{t("internships.contactEmail")}</Label><Input id="internship-contact-email" type="email" className="mt-2" value={form.contactEmail} onChange={(e) => setForm((v) => ({ ...v, contactEmail: e.target.value }))} /></div>
    <div><Label htmlFor="internship-interview-at">{t("internships.interviewAt")}</Label><Input id="internship-interview-at" type="datetime-local" className="mt-2" value={form.interviewAt} onChange={(e) => setForm((v) => ({ ...v, interviewAt: e.target.value }))} /><label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={form.interviewConfirmed} onCheckedChange={(checked) => setForm((v) => ({ ...v, interviewConfirmed: Boolean(checked) }))} />{t("internships.confirmDate")}</label></div>
    <div><Label htmlFor="internship-followup-at">{t("internships.followUpAt")}</Label><Input id="internship-followup-at" type="datetime-local" className="mt-2" value={form.followUpAt} onChange={(e) => setForm((v) => ({ ...v, followUpAt: e.target.value }))} /><label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><Checkbox checked={form.followUpConfirmed} onCheckedChange={(checked) => setForm((v) => ({ ...v, followUpConfirmed: Boolean(checked) }))} />{t("internships.confirmDate")}</label></div>
    <div className="md:col-span-2"><Label htmlFor="internship-requirements">{t("internships.requirements")}</Label><Input id="internship-requirements" className="mt-2" value={form.requirements} onChange={(e) => setForm((v) => ({ ...v, requirements: e.target.value }))} placeholder={t("internships.requirementsPlaceholder")} /><p className="mt-1 text-[0.62rem] text-muted-foreground">{t("internships.requirementsHint")}</p></div>
    <div className="md:col-span-2"><Label htmlFor="internship-next-action">{t("internships.nextAction")}</Label><Input id="internship-next-action" className="mt-2" value={form.nextAction} onChange={(e) => setForm((v) => ({ ...v, nextAction: e.target.value }))} /></div>
    <div className="md:col-span-2"><Label htmlFor="internship-notes">{t("internships.notes")}</Label><Textarea id="internship-notes" className="mt-2 min-h-24" value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} /></div>
  </div>;
}
