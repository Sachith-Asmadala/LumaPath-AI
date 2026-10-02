"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarClock, CalendarSync, CheckCircle2, FileUp, Link2, RefreshCw, ShieldAlert, Trash2, Unplug, Workflow } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { Reveal } from "@/components/motion/animated";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";
import { buildCalendarExistingRecords, defaultCalendarDecision, type CalendarConnection, type CalendarDecision, type CalendarImportedItem, type CalendarPreview } from "@/features/calendar/domain/calendar";
import { cleanupCalendarConnection, commitCalendar, listCalendarConnections, listCalendarItems, previewCalendar, revokeCalendarConnection } from "@/features/calendar/services/calendar";

const statusTone: Record<string,string> = { new: "border-success/25 text-success", changed: "border-warning/25 text-warning", duplicate: "border-primary/25 text-primary", conflict: "border-destructive/25 text-destructive", deleted: "border-destructive/25 text-destructive", unchanged: "border-border text-muted-foreground" };

export default function CalendarSyncPage() {
  const { state, applyCalendarActions } = useDemo();
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [items, setItems] = useState<CalendarImportedItem[]>([]);
  const [preview, setPreview] = useState<CalendarPreview | null>(null);
  const [decisions, setDecisions] = useState<Record<string, CalendarDecision>>({});
  const [file, setFile] = useState<File | null>(null);
  const [connectionId, setConnectionId] = useState("");
  const [timezone, setTimezone] = useState("Asia/Colombo");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [highlightId, setHighlightId] = useState("");
  const studentId = state.student.id;

  const refresh = useCallback(async () => {
    try {
      const [nextConnections, nextItems] = await Promise.all([listCalendarConnections(studentId), listCalendarItems(studentId)]);
      setConnections(nextConnections); setItems(nextItems);
    } catch (e) { setError(e instanceof Error ? e.message : t("calendar.unavailable")); }
  }, [studentId, t]);

  useEffect(() => {
    try { setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Colombo"); } catch { /* use Colombo fallback */ }
    try { setHighlightId(new URLSearchParams(window.location.search).get("item") ?? ""); } catch { /* no query available */ }
    void refresh();
  }, [refresh]);

  const activeConnections = connections.filter((item) => item.status === "active");
  const selectedConnection = connections.find((item) => item.id === connectionId);
  const summary = useMemo(() => preview ? [
    [t("calendar.previewNew"), preview.new_count], [t("calendar.previewChanged"), preview.changed_count], [t("calendar.previewDuplicates"), preview.duplicate_count],
    [t("calendar.previewConflicts"), preview.conflict_count], [t("calendar.previewDeleted"), preview.deleted_count],
  ] : [], [preview, t]);

  const runPreview = async () => {
    if (!file) { setError(t("calendar.fileRequired")); return; }
    setBusy(true); setError("");
    try {
      const result = await previewCalendar(studentId, file, timezone, buildCalendarExistingRecords(state), connectionId || null);
      setPreview(result); setConnectionId(result.connection_id);
      setDecisions(Object.fromEntries(result.items.map((item) => [item.preview_key, defaultCalendarDecision(item)])));
      await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("calendar.previewFailed")); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview) return;
    setBusy(true); setError("");
    try {
      const result = await commitCalendar(studentId, preview.sync_run_id, preview.items.map((item) => ({ preview_key: item.preview_key, action: decisions[item.preview_key] ?? "skip" })), `calendar-ui-${preview.sync_run_id}`);
      applyCalendarActions(result.actions);
      toast.success(t("calendar.applied")); setPreview(null); setFile(null); setDecisions({}); await refresh();
    } catch (e) { setError(e instanceof Error ? e.message : t("calendar.commitFailed")); }
    finally { setBusy(false); }
  };

  const revoke = async (id: string) => {
    if (!window.confirm(t("calendar.confirmRevoke"))) return;
    setBusy(true); setError("");
    try { await revokeCalendarConnection(studentId, id); if (connectionId === id) setConnectionId(""); await refresh(); toast.success(t("calendar.revoked")); }
    catch (e) { setError(e instanceof Error ? e.message : t("calendar.revokeFailed")); }
    finally { setBusy(false); }
  };

  const cleanup = async (id: string, removeInternalRecords: boolean) => {
    if (!window.confirm(removeInternalRecords ? t("calendar.confirmCleanupRemove") : t("calendar.confirmCleanupKeep"))) return;
    setBusy(true); setError("");
    try {
      const result = await cleanupCalendarConnection(studentId, id, removeInternalRecords); applyCalendarActions(result.actions); await refresh(); toast.success(removeInternalRecords ? t("calendar.cleanedRemoved") : t("calendar.cleanedDetached"));
    } catch (e) { setError(e instanceof Error ? e.message : t("calendar.cleanupFailed")); }
    finally { setBusy(false); }
  };

  return <div className="mx-auto w-full max-w-[1200px] px-4 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Reveal><div className="mb-6"><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><CalendarSync className="size-3.5" />{t("calendar.eyebrow")}</p><TypographyH1>{t("calendar.title")}</TypographyH1><TypographyP className="mt-2 max-w-3xl">{t("calendar.subtitle")}</TypographyP></div></Reveal>

    {error && <div role="alert" className="mb-4 rounded-xl border border-destructive/25 bg-destructive/[0.04] px-4 py-3 text-sm text-destructive">{error}</div>}

    <div className="mb-5 grid gap-4 lg:grid-cols-[1.15fr_.85fr]">
      <Card className="rounded-[20px] border-border/85 bg-surface-raised shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><FileUp className="size-4 text-primary" />{t("calendar.uploadTitle")}</CardTitle></CardHeader><CardContent className="space-y-4">
        <p className="text-xs leading-5 text-muted-foreground">{t("calendar.uploadDescription")}</p>
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-xs"><span className="font-medium">{t("calendar.source")}</span><select className="workspace-select w-full" value={connectionId} onChange={(e)=>setConnectionId(e.target.value)} aria-label={t("calendar.source")}><option value="">{t("calendar.newSource")}</option>{activeConnections.map((item)=><option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label><label className="space-y-1.5 text-xs"><span className="font-medium">{t("calendar.timezone")}</span><Input value={timezone} onChange={(e)=>setTimezone(e.target.value)} placeholder="Asia/Colombo" /></label></div>
        <label className="block space-y-1.5 text-xs"><span className="font-medium">{t("calendar.file")}</span><Input type="file" accept=".ics,.csv,text/calendar,text/csv" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} aria-label={t("calendar.file")} /></label>
        {selectedConnection && <p className="text-[0.68rem] leading-5 text-muted-foreground">{t("calendar.syncExisting", { source: selectedConnection.display_name })}</p>}
        <Button onClick={runPreview} disabled={busy || !file} className="h-11 rounded-xl"><RefreshCw className={`size-4 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} />{busy ? t("common.loading") : t("calendar.preview")}</Button>
        <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3 text-[0.68rem] leading-5 text-muted-foreground"><ShieldAlert className="mr-1 inline size-3.5 text-primary" />{t("calendar.noProviderConnection")}</div>
        <div className="rounded-xl border border-warning/20 bg-warning/[0.035] p-3 text-[0.68rem] leading-5 text-muted-foreground"><ShieldAlert className="mr-1 inline size-3.5 text-warning" />{t("calendar.sourceAuthorityNotice")}</div>
      </CardContent></Card>
      <Card className="rounded-[20px] border-border/85 bg-surface-raised shadow-none"><CardHeader><CardTitle className="flex items-center gap-2 text-base"><Workflow className="size-4 text-primary" />{t("calendar.howItWorks")}</CardTitle></CardHeader><CardContent><ol className="space-y-3 text-xs leading-5 text-muted-foreground"><li><strong className="text-foreground">1.</strong> {t("calendar.stepPreview")}</li><li><strong className="text-foreground">2.</strong> {t("calendar.stepResolve")}</li><li><strong className="text-foreground">3.</strong> {t("calendar.stepApprove")}</li><li><strong className="text-foreground">4.</strong> {t("calendar.stepSync")}</li></ol></CardContent></Card>
    </div>

    {preview && <Card className="mb-5 rounded-[20px] border-primary/20 bg-surface-raised shadow-none"><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="text-base">{t("calendar.previewTitle")}</CardTitle><p className="mt-1 text-xs text-muted-foreground">{preview.connection_name} · {preview.source_format.toUpperCase()} · {preview.timezone}</p></div><div className="flex flex-wrap gap-2">{summary.map(([label,count])=><Badge key={String(label)} variant="outline" className="rounded-full">{label}: {formatNumber(Number(count))}</Badge>)}</div></div></CardHeader><CardContent className="space-y-3">
      {preview.items.map((item)=><div key={item.preview_key} className="rounded-2xl border border-border/80 bg-background/30 p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium text-foreground">{item.title}</h3><Badge variant="outline" className={`rounded-full ${statusTone[item.change_type]}`}>{t(`calendar.change.${item.change_type}`)}</Badge><Badge variant="outline" className="rounded-full">{t(`calendar.kind.${item.kind}`)}</Badge><span className="text-[0.65rem] text-muted-foreground">{Math.round(item.confidence*100)}% {t("calendar.confidence")}</span></div><p className="mt-2 text-xs text-muted-foreground">{formatDate(item.start_at, { month:"short", day:"numeric", year:"numeric" })} · {formatTime(item.start_at)}{item.end_at ? `–${formatTime(item.end_at)}` : ""}</p>{item.description && <p className="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.description}</p>}{item.override_fields.length>0 && <p className="mt-2 text-[0.68rem] text-warning">{t("calendar.overridesPreserved", { fields: item.override_fields.join(", ") })}</p>}{item.conflict_internal_ids.length>0 && <p className="mt-2 text-[0.68rem] text-destructive">{t("calendar.conflictWith", { count: item.conflict_internal_ids.length })}</p>}{item.source_warning && <p className="mt-2 text-[0.68rem] leading-5 text-warning">{item.source_warning}</p>}</div><label className="space-y-1 text-xs"><span className="sr-only">{t("calendar.decisionFor", { title: item.title })}</span><select className="workspace-select min-w-44" value={decisions[item.preview_key] ?? "skip"} onChange={(e)=>setDecisions((current)=>({...current,[item.preview_key]:e.target.value as CalendarDecision}))} aria-label={t("calendar.decisionFor", { title: item.title })}>{decisionOptions(item).map((option)=><option key={option} value={option}>{t(`calendar.decision.${option}`)}</option>)}</select></label></div></div>)}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4"><p className="max-w-2xl text-[0.68rem] leading-5 text-muted-foreground">{t("calendar.commitNotice")}</p><div className="flex gap-2"><Button variant="outline" onClick={()=>setPreview(null)}>{t("common.cancel")}</Button><Button onClick={commit} disabled={busy}><CheckCircle2 className="size-4" />{t("calendar.applySelected")}</Button></div></div>
    </CardContent></Card>}

    <section className="mb-5"><div className="mb-3"><h2 className="font-heading text-lg font-medium">{t("calendar.sourcesTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("calendar.sourcesDescription")}</p></div>{connections.length===0 ? <Card className="rounded-[18px] border-dashed bg-transparent p-6 text-sm text-muted-foreground">{t("calendar.noSources")}</Card> : <div className="grid gap-3 md:grid-cols-2">{connections.map((source)=><Card key={source.id} className="rounded-[18px] border-border/80 bg-surface-raised py-0 shadow-none"><CardContent className="p-4"><div className="flex items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-medium">{source.display_name}</h3><Badge variant="outline" className="rounded-full">{source.status=== "active" ? t("calendar.active") : t("calendar.revokedStatus")}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{source.source_type.replace("manual_","").toUpperCase()} · {source.default_timezone}</p><p className="mt-2 text-[0.68rem] text-muted-foreground">{source.last_sync_at ? t("calendar.lastSync", { date: `${formatDate(source.last_sync_at,{month:"short",day:"numeric"})} ${formatTime(source.last_sync_at)}` }) : t("calendar.notSynced")}</p></div><CalendarClock className="size-4 text-primary" /></div><div className="mt-4 flex flex-wrap gap-2">{source.status === "active" && <Button variant="outline" size="sm" disabled={busy} onClick={()=>void revoke(source.id)}><Unplug className="size-3.5" />{t("calendar.revoke")}</Button>}<Button variant="ghost" size="sm" disabled={busy} onClick={()=>void cleanup(source.id,false)}><Link2 className="size-3.5" />{t("calendar.deleteImportedKeep")}</Button><Button variant="ghost" size="sm" disabled={busy} className="text-destructive" onClick={()=>void cleanup(source.id,true)}><Trash2 className="size-3.5" />{t("calendar.deleteImportedRemove")}</Button></div></CardContent></Card>)}</div>}</section>

    <section className="pb-10"><div className="mb-3"><h2 className="font-heading text-lg font-medium">{t("calendar.importedTitle")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("calendar.importedDescription")}</p></div>{items.length===0 ? <Card className="rounded-[18px] border-dashed bg-transparent p-6 text-sm text-muted-foreground">{t("calendar.noImported")}</Card> : <div className="space-y-2">{items.map((item)=><Card key={item.id} className={`rounded-[16px] border-border/80 bg-surface-raised py-0 shadow-none ${highlightId===item.id?"ring-1 ring-primary/40":""}`}><CardContent className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-sm font-medium">{item.title}</p><Badge variant="outline" className="rounded-full">{t(`calendar.kind.${item.kind}`)}</Badge><Badge variant="outline" className="rounded-full text-primary">{item.source_badge}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{formatDate(item.start_at,{month:"short",day:"numeric",year:"numeric"})} · {formatTime(item.start_at)} · {t(`calendar.importStatus.${item.import_status}`)}</p></div><div className="text-right text-[0.65rem] text-muted-foreground">{t("calendar.syncedAt", { date: `${formatDate(item.last_sync_at,{month:"short",day:"numeric"})} ${formatTime(item.last_sync_at)}` })}{item.override_fields.length>0 && <span className="mt-1 block text-warning">{t("calendar.personalOverrides")}</span>}</div></CardContent></Card>)}</div>}</section>
  </div>;
}

function decisionOptions(item: CalendarPreview["items"][number]): CalendarDecision[] {
  if (item.change_type === "new") return ["import","skip"];
  if (item.change_type === "changed") return ["update","skip"];
  if (item.change_type === "duplicate") return item.matched_internal_id ? ["link_existing","skip"] : ["skip"];
  if (item.change_type === "conflict") return ["import","skip"];
  if (item.change_type === "deleted") return ["keep_personal","remove_internal","skip"];
  return ["skip"];
}
