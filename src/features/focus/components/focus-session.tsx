"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  ArrowLeft, Bell, CheckCircle2, Clock3, Coffee, Pause, Play, RefreshCw, ShieldCheck,
  Sparkles, Square, Timer, WifiOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { availableCapacity } from "@/features/dashboard/domain/dashboard";
import { formatFocusClock, isFocusSession, projectFocusTimer, type EstimateFeedback, type FocusSessionRecord } from "@/features/focus/domain/focus";
import { FocusApiError, finishFocusSession, getActiveFocusSession, getFocusSession, heartbeatFocusSession, pauseFocusSession, resumeFocusSession, startFocusSession } from "@/features/focus/services/focus";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n/locale-provider";

const CACHE_PREFIX = "lumapath-focus-active-v1";
const LAST_RESULT_PREFIX = "lumapath-focus-last-result-v1";
const estimateOptions: { value: EstimateFeedback; labelKey: string }[] = [
  { value: "much_less", labelKey: "focus.estimate.muchLess" },
  { value: "slightly_less", labelKey: "focus.estimate.slightlyLess" },
  { value: "about_right", labelKey: "focus.estimate.aboutRight" },
  { value: "slightly_more", labelKey: "focus.estimate.slightlyMore" },
  { value: "much_more", labelKey: "focus.estimate.muchMore" },
];

function cacheKey(studentId: string) { return `${CACHE_PREFIX}:${studentId}`; }
function lastResultKey(studentId: string) { return `${LAST_RESULT_PREFIX}:${studentId}`; }

function readCached(studentId: string): FocusSessionRecord | null {
  try {
    const raw = window.localStorage.getItem(cacheKey(studentId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isFocusSession(parsed) ? parsed : null;
  } catch { return null; }
}

function writeCached(studentId: string, session: FocusSessionRecord | null) {
  try {
    if (!session || !["running", "paused"].includes(session.persisted_status)) window.localStorage.removeItem(cacheKey(studentId));
    else window.localStorage.setItem(cacheKey(studentId), JSON.stringify(session));
  } catch { /* storage is best-effort only */ }
}

function readLastResult(studentId: string): FocusSessionRecord | null {
  try {
    const raw = window.localStorage.getItem(lastResultKey(studentId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isFocusSession(parsed)) return null;
    const ended = parsed as FocusSessionRecord;
    const age = Date.now() - new Date(ended.updated_at).getTime();
    return Number.isFinite(age) && age >= 0 && age <= 4 * 60 * 60 * 1000 ? ended : null;
  } catch { return null; }
}

function writeLastResult(studentId: string, session: FocusSessionRecord | null) {
  try {
    if (!session) window.localStorage.removeItem(lastResultKey(studentId));
    else window.localStorage.setItem(lastResultKey(studentId), JSON.stringify(session));
  } catch { /* storage is best-effort only */ }
}

export function FocusSession({ initialTaskId }: { initialTaskId?: string }) {
  const { state, completeFocusSession } = useDemo();
  const { t, formatNumber } = useLocale();
  const reduceMotion = useReducedMotion();
  const studentId = state.student.id;
  const capacity = availableCapacity(state.capacity);
  const initialTask = state.tasks.find((task) => task.id === initialTaskId)
    ?? state.tasks.find((task) => task.id === state.activeAction.taskId)
    ?? state.tasks.find((task) => task.status !== "completed");
  const [taskId, setTaskId] = useState(initialTask?.id ?? "");
  const selectedTask = state.tasks.find((task) => task.id === taskId);
  const [objective, setObjective] = useState(initialTask ? t("focus.defaultObjective", { task: initialTask.title }) : "");
  const [workMinutes, setWorkMinutes] = useState(Math.max(5, Math.min(initialTask?.estimatedMinutes ?? 25, capacity || 25, 90)));
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [session, setSession] = useState<FocusSessionRecord | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wrapUp, setWrapUp] = useState(false);
  const [finalSession, setFinalSession] = useState<FocusSessionRecord | null>(null);
  const [result, setResult] = useState<"completed" | "interrupted" | "abandoned">("completed");
  const [progressAfter, setProgressAfter] = useState(initialTask?.progress ?? 0);
  const [notes, setNotes] = useState("");
  const [nextStep, setNextStep] = useState("");
  const [estimateFeedback, setEstimateFeedback] = useState<EstimateFeedback>("about_right");
  const [manualEstimate, setManualEstimate] = useState("");
  const [notificationState, setNotificationState] = useState<NotificationPermission | "unsupported">("default");
  const notifiedBreak = useRef<string | null>(null);

  const timer = useMemo(() => session ? projectFocusTimer(session, now) : null, [session, now]);
  const activeTask = session ? state.tasks.find((task) => task.id === session.task_id) : selectedTask;

  const recover = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cached = typeof window !== "undefined" ? readCached(studentId) : null;
    try {
      const active = await getActiveFocusSession(studentId);
      setSession(active);
      setOffline(false);
      if (active) {
        setTaskId(active.task_id);
        setObjective(active.objective);
        setProgressAfter(active.task_progress_before);
        writeCached(studentId, active);
      } else {
        writeCached(studentId, null);
        const last = readLastResult(studentId);
        if (last && ["completed", "interrupted", "abandoned"].includes(last.persisted_status)) setFinalSession(last);
      }
    } catch (cause) {
      if (cached) {
        setSession(cached);
        setTaskId(cached.task_id);
        setObjective(cached.objective);
        setProgressAfter(cached.task_progress_before);
        setOffline(true);
        setError("Offline recovery mode: the saved timestamps are visible, but pause, resume and completion stay disabled until the server reconnects. No productive time will be recorded while disconnected.");
      } else {
        setError(cause instanceof FocusApiError ? cause.message : "Focus session could not be loaded safely.");
      }
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { void recover(); }, [recover]);
  useEffect(() => {
    if (typeof Notification === "undefined") setNotificationState("unsupported");
    else setNotificationState(Notification.permission);
  }, []);
  useEffect(() => {
    if (!session || !["running", "paused"].includes(session.persisted_status)) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [session]);
  useEffect(() => {
    if (!session || session.persisted_status !== "running" || offline) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const next = await heartbeatFocusSession(studentId, session.id);
        if (cancelled) return;
        if (next.persisted_status === "paused" && session.persisted_status === "running") {
          setError("LumaPath detected a long inactive gap and auto-paused at the last safe heartbeat, so sleep/offline time was not counted.");
        }
        setSession(next);
        setNow(Date.now());
      } catch {
        if (!cancelled) setOffline(true);
      }
    };
    const id = window.setInterval(() => void beat(), 15_000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [offline, session?.id, session?.persisted_status, studentId]);
  useEffect(() => { if (session) writeCached(studentId, session); }, [session, studentId]);
  useEffect(() => {
    if (!session || !timer?.breakDue || notificationState !== "granted" || notifiedBreak.current === session.id || typeof Notification === "undefined") return;
    notifiedBreak.current = session.id;
    new Notification("Focus block complete", { body: `You planned ${session.planned_break_minutes} minutes for a break. Pause or end when it feels right.` });
  }, [notificationState, session, timer?.breakDue]);

  const changeTask = (nextId: string) => {
    const task = state.tasks.find((item) => item.id === nextId);
    setTaskId(nextId);
    setObjective(task ? t("focus.defaultObjective", { task: task.title }) : "");
    setProgressAfter(task?.progress ?? 0);
    if (task) setWorkMinutes(Math.max(5, Math.min(task.estimatedMinutes, capacity || task.estimatedMinutes, 90)));
  };

  const enableNotification = async () => {
    if (typeof Notification === "undefined") { setNotificationState("unsupported"); return; }
    const permission = await Notification.requestPermission();
    setNotificationState(permission);
  };

  const start = async () => {
    if (!selectedTask || !objective.trim() || workMinutes < 5 || workMinutes > 240) return;
    setBusy(true); setError(null);
    try {
      writeLastResult(studentId, null);
      const created = await startFocusSession(studentId, {
        task_id: selectedTask.id,
        task_title: selectedTask.title,
        objective: objective.trim(),
        planned_work_minutes: Math.min(workMinutes, Math.max(5, capacity || workMinutes)),
        planned_break_minutes: breakMinutes,
        task_estimated_minutes: selectedTask.estimatedMinutes,
        task_progress_before: selectedTask.progress,
        timezone: "Asia/Colombo",
      });
      setSession(created); setNow(Date.now()); setOffline(false); setProgressAfter(selectedTask.progress);
    } catch (cause) { setError(cause instanceof FocusApiError ? cause.message : "The focus session could not be started."); }
    finally { setBusy(false); }
  };

  const pause = async () => {
    if (!session || offline) return;
    setBusy(true); setError(null);
    try { setSession(await pauseFocusSession(studentId, session.id)); setNow(Date.now()); }
    catch (cause) { setError(cause instanceof FocusApiError ? cause.message : "The session could not be paused safely."); }
    finally { setBusy(false); }
  };

  const resume = async () => {
    if (!session || offline) return;
    setBusy(true); setError(null);
    try { setSession(await resumeFocusSession(studentId, session.id)); setNow(Date.now()); }
    catch (cause) { setError(cause instanceof FocusApiError ? cause.message : "The session could not be resumed safely."); }
    finally { setBusy(false); }
  };

  const openWrapUp = async () => {
    if (!session || offline) return;
    if (session.persisted_status === "running") {
      setBusy(true); setError(null);
      try {
        const paused = await pauseFocusSession(studentId, session.id);
        setSession(paused);
        setProgressAfter(Math.max(paused.task_progress_before, activeTask?.progress ?? paused.task_progress_before));
      } catch (cause) {
        setError(cause instanceof FocusApiError ? cause.message : "The timer could not be frozen safely. Try again before ending.");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    setWrapUp(true);
  };

  const finish = async () => {
    if (!session || offline) return;
    setBusy(true); setError(null);
    try {
      const ended = await finishFocusSession(studentId, session.id, {
        result,
        task_progress_after: Math.max(session.task_progress_before, Math.min(100, progressAfter)),
        notes: notes.trim(),
        next_step: nextStep.trim(),
        estimate_feedback: result === "completed" ? estimateFeedback : null,
        manual_estimated_minutes: result === "completed" && manualEstimate ? Number(manualEstimate) : null,
      });
      if (ended.result === "completed" && ended.productive_minutes > 0) {
        completeFocusSession(ended.task_id, ended.productive_minutes, {
          progressAfter: ended.task_progress_after ?? undefined,
          suggestedEstimatedMinutes: ended.suggested_estimated_minutes ?? undefined,
          sessionId: ended.id,
          note: ended.notes,
          nextStep: ended.next_step,
          at: ended.ended_at ?? undefined,
        });
      }
      setFinalSession(ended); setSession(null); writeCached(studentId, null); writeLastResult(studentId, ended); setWrapUp(false);
    } catch (cause) { setError(cause instanceof FocusApiError ? cause.message : "The session could not be closed safely. No productive time was recorded."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="mx-auto grid min-h-[calc(100dvh-4.5rem)] max-w-[800px] place-items-center px-6"><p className="text-sm text-muted-foreground" role="status">{t("focus.recovering")}</p></div>;

  if (finalSession) return (
    <div className="focus-retreat mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[760px] flex-col px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-1 items-center justify-center">
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[560px] text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-[18px] border border-success/20 bg-success/[0.055] text-success"><CheckCircle2 className="size-7" /></span>
          <p className="type-eyebrow mt-5 text-success">{t("focus.sessionClosed")}</p>
          <h1 className="mt-2 font-heading text-[1.8rem] font-semibold tracking-[-0.035em] text-foreground">{finalSession.result === "completed" ? t("focus.progressRecorded") : t("focus.interruptionRecorded")}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{finalSession.result === "completed" ? `${finalSession.productive_minutes} measured focus minutes were linked to ${finalSession.task_title}.` : t("focus.zeroProductive")}</p>
          <Card className="mt-7 rounded-[20px] border-border/80 bg-surface-raised py-0 shadow-none"><div className="grid gap-0 sm:grid-cols-3"><SummaryCell label={t("focus.measuredTime")} value={`${finalSession.productive_minutes} min`} /><SummaryCell label={t("focus.progress")} value={`${finalSession.task_progress_before}% → ${finalSession.task_progress_after ?? finalSession.task_progress_before}%`} /><SummaryCell label={t("focus.futureEstimate")} value={finalSession.suggested_estimated_minutes ? `${finalSession.suggested_estimated_minutes} min` : t("focus.unchanged")} /></div></Card>
          {finalSession.estimate_explanation && <p className="mt-4 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 text-left text-xs leading-5 text-muted-foreground"><b className="text-foreground">{t("focus.whyEstimate")}</b> {finalSession.estimate_explanation}</p>}
          <div className="mt-6 flex flex-wrap justify-center gap-2"><Button asChild className="rounded-xl"><Link href="/tasks">{t("focus.backTasks")}</Link></Button><Button type="button" variant="outline" onClick={() => { writeLastResult(studentId, null); setFinalSession(null); }} className="rounded-xl">{t("focus.startAnother")}</Button><Button asChild variant="ghost" className="rounded-xl"><Link href="/overview">{t("focus.overview")}</Link></Button></div>
        </motion.div>
      </div>
    </div>
  );

  if (!session) return (
    <div className="focus-retreat mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[900px] flex-col px-4 py-5 sm:px-6 sm:py-8">
      <TopExit />
      <div className="flex flex-1 items-center justify-center py-8">
        <motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[600px]">
          <div className="mb-6 text-center"><p className="type-eyebrow mb-3 text-primary">{t("focus.oneTask")}</p><h1 className="font-heading text-[1.9rem] font-semibold tracking-[-0.035em] text-foreground">{t("focus.setupTitle")}</h1><p className="mx-auto mt-2 max-w-[34rem] text-sm leading-6 text-muted-foreground">{t("focus.setupDescription")}</p></div>
          <Card className="rounded-[24px] border-border/85 bg-surface-raised py-0 shadow-[var(--paper-shadow)]"><div className="space-y-5 p-5 sm:p-7">
            {error && <SafeError message={error} onRetry={() => void recover()} />}
            <div><Label htmlFor="focus-task" className="text-xs">{t("focus.task")}</Label><select id="focus-task" value={taskId} onChange={(event) => changeTask(event.target.value)} className="workspace-select mt-2 w-full" disabled={busy}><option value="">{t("focus.selectTask")}</option>{state.tasks.filter((task) => task.status !== "completed").map((task) => <option key={task.id} value={task.id}>{task.title} · {task.progress}%</option>)}</select></div>
            <div><Label htmlFor="focus-objective" className="text-xs">{t("focus.clearObjective")}</Label><Textarea id="focus-objective" value={objective} onChange={(event) => setObjective(event.target.value)} maxLength={500} rows={3} className="mt-2 resize-y rounded-xl" placeholder={t("focus.objectivePlaceholder")} /><p className="mt-1.5 text-[0.65rem] text-muted-foreground">{t("focus.objectiveHint")}</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="focus-duration" className="text-xs">{t("focus.workDuration")}</Label><div className="mt-2 flex items-center gap-2"><Input id="focus-duration" type="number" min={5} max={Math.min(240, Math.max(5, capacity || 240))} value={workMinutes} onChange={(event) => setWorkMinutes(Number(event.target.value))} className="rounded-xl" /><span className="text-xs text-muted-foreground">{t("focus.minutesUnit")}</span></div><p className="mt-1.5 text-[0.65rem] text-muted-foreground">{t("focus.capacity", { minutes: formatNumber(capacity) })}</p></div><div><Label htmlFor="break-duration" className="text-xs">{t("focus.breakDuration")}</Label><div className="mt-2 flex items-center gap-2"><Input id="break-duration" type="number" min={0} max={60} value={breakMinutes} onChange={(event) => setBreakMinutes(Number(event.target.value))} className="rounded-xl" /><span className="text-xs text-muted-foreground">{t("focus.minutesUnit")}</span></div><p className="mt-1.5 text-[0.65rem] text-muted-foreground">{t("focus.reminderOnly")}</p></div></div>
            <div className="flex flex-wrap gap-2" aria-label={t("focus.commonDurations")}>{[25, 50, 90].filter((minutes) => capacity <= 0 || minutes <= capacity).map((minutes) => <Button key={minutes} type="button" variant={workMinutes === minutes ? "default" : "outline"} onClick={() => setWorkMinutes(minutes)} className="h-9 rounded-full text-xs">{t("common.minutes", { count: formatNumber(minutes) })}</Button>)}</div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-5"><div><p className="text-xs font-medium text-foreground">{t("focus.browserNotification")}</p><p className="mt-1 text-[0.65rem] text-muted-foreground">{t("focus.notificationDescription")}</p></div><Button type="button" variant="outline" onClick={() => void enableNotification()} disabled={notificationState === "granted" || notificationState === "unsupported"} className="h-10 rounded-xl text-xs"><Bell className="size-3.5" />{notificationState === "granted" ? t("focus.enabled") : notificationState === "denied" ? t("focus.permissionDenied") : notificationState === "unsupported" ? t("focus.unavailable") : t("focus.enableReminder")}</Button></div>
            <Button onClick={() => void start()} disabled={busy || !selectedTask || objective.trim().length < 3 || workMinutes < 5 || capacity <= 0} className="h-11 w-full rounded-xl text-sm font-semibold"><Play className="size-4" />{busy ? t("focus.starting") : t("focus.start")}</Button>
          </div></Card>
        </motion.div>
      </div>
    </div>
  );

  if (wrapUp) return (
    <div className="focus-retreat mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[900px] flex-col px-4 py-5 sm:px-6 sm:py-8">
      <TopExit />
      <div className="flex flex-1 items-center justify-center py-8"><Card className="w-full max-w-[620px] rounded-[24px] border-border/85 bg-surface-raised py-0 shadow-[var(--paper-shadow)]"><div className="p-5 sm:p-7">
        <p className="type-eyebrow text-primary">{t("focus.closeSession")}</p><h1 className="mt-2 font-heading text-2xl font-semibold tracking-[-0.03em]">{t("focus.whatChanged")}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("focus.wrapDescription")}</p>
        {error && <div className="mt-4"><SafeError message={error} /></div>}
        <div className="mt-5"><Label htmlFor="focus-result" className="text-xs">{t("focus.sessionResult")}</Label><select id="focus-result" value={result} onChange={(event) => setResult(event.target.value as typeof result)} className="workspace-select mt-2 w-full"><option value="completed">{t("focus.completedWork")}</option><option value="interrupted">{t("focus.interruptedOption")}</option><option value="abandoned">{t("focus.abandonedOption")}</option></select></div>
        <div className="mt-5"><Label htmlFor="task-progress-after" className="text-xs">{t("focus.progressAfter")}</Label><div className="mt-2 flex items-center gap-3"><Input id="task-progress-after" type="number" min={session.task_progress_before} max={100} value={progressAfter} onChange={(event) => setProgressAfter(Number(event.target.value))} className="w-28 rounded-xl" /><span className="text-xs text-muted-foreground">{t("focus.startedAt", { value: formatNumber(session.task_progress_before) })}</span></div></div>
        {result === "completed" && <div className="mt-5 grid gap-4 sm:grid-cols-2"><div><Label htmlFor="estimate-feedback" className="text-xs">{t("focus.estimateAccuracy")}</Label><select id="estimate-feedback" value={estimateFeedback} onChange={(event) => setEstimateFeedback(event.target.value as EstimateFeedback)} className="workspace-select mt-2 w-full">{estimateOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey)}</option>)}</select></div><div><Label htmlFor="manual-estimate" className="text-xs">{t("focus.manualEstimate")}</Label><div className="mt-2 flex items-center gap-2"><Input id="manual-estimate" type="number" min={5} max={10080} value={manualEstimate} onChange={(event) => setManualEstimate(event.target.value)} placeholder={`${session.task_estimated_minutes}`} className="rounded-xl" /><span className="text-xs text-muted-foreground">{t("focus.minutesUnit")}</span></div></div></div>}
        <div className="mt-5"><Label htmlFor="focus-notes" className="text-xs">{t("focus.notesOptional")}</Label><Textarea id="focus-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={3} className="mt-2 resize-y rounded-xl" placeholder={t("focus.notesPlaceholder")} /></div>
        <div className="mt-5"><Label htmlFor="focus-next-step" className="text-xs">{t("focus.nextStepOptional")}</Label><Input id="focus-next-step" value={nextStep} onChange={(event) => setNextStep(event.target.value)} maxLength={500} className="mt-2 rounded-xl" placeholder={t("focus.nextStepPlaceholder")} /></div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" onClick={() => setWrapUp(false)} disabled={busy} className="rounded-xl">{t("focus.returnTimer")}</Button><Button onClick={() => void finish()} disabled={busy || progressAfter < session.task_progress_before || progressAfter > 100} className="rounded-xl"><CheckCircle2 className="size-4" />{busy ? t("focus.saving") : t("focus.saveClose")}</Button></div>
      </div></Card></div>
    </div>
  );

  return (
    <div className="focus-retreat mx-auto flex min-h-[calc(100dvh-4.5rem)] w-full max-w-[1050px] flex-col px-4 py-5 sm:px-6 sm:py-8">
      <TopExit />
      <div className="flex flex-1 flex-col items-center justify-center py-10"><motion.div initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-[600px]">
        <div className="mb-5 text-center"><p className="type-eyebrow mb-3 text-primary">{session.task_title}</p><h1 className="font-heading text-[1.8rem] font-semibold tracking-[-0.035em] text-foreground sm:text-3xl">{session.objective}</h1><p className="mx-auto mt-2 max-w-[32rem] text-sm leading-6 text-muted-foreground">{t("focus.activeDescription")}</p></div>
        {error && <div className="mb-4"><SafeError message={error} onRetry={offline ? () => void reconnect() : undefined} /></div>}
        <Card className="overflow-hidden rounded-[24px] border-border/85 bg-surface-raised py-0 shadow-[var(--paper-shadow)]"><div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="flex items-center gap-2 text-[0.65rem] text-muted-foreground"><ShieldCheck className="size-3.5 text-success" />{t("focus.timestampBacked")}</span><span className={`rounded-full border px-2.5 py-1 text-[0.62rem] ${offline ? "border-warning/25 bg-warning/5 text-warning" : "border-success/20 bg-success/5 text-success"}`}>{offline ? t("focus.offlineRecovery") : timer?.displayStatus === "paused" ? t("focus.paused") : timer?.breakDue ? t("focus.breakDue") : t("focus.runningState")}</span></div>
          {timer?.breakDue && <div className="mt-5 rounded-[16px] border border-pathway/20 bg-pathway/[0.05] p-4" role="status"><p className="flex items-center gap-2 text-sm font-medium text-foreground"><Coffee className="size-4 text-pathway" />{t("focus.workComplete")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("focus.breakMessage", { minutes: formatNumber(session.planned_break_minutes) })}</p></div>}
          <div className="my-8 text-center"><p className="font-mono text-[4.5rem] leading-none font-medium tracking-[-0.09em] text-foreground tabular-nums sm:text-[5rem]" aria-hidden="true">{formatFocusClock(timer?.remainingSeconds ?? 0)}</p><p className="sr-only">{Math.ceil((timer?.remainingSeconds ?? 0) / 60)} minutes remaining</p><p className="mt-3 text-[0.7rem] text-muted-foreground" aria-live="polite">{timer?.displayStatus === "paused" ? t("focus.elapsedFrozen") : timer?.breakDue ? t("focus.timeReached") : t("focus.timeRemaining")} · {t("focus.measuredElapsed", { minutes: formatNumber(Math.floor((timer?.elapsedSeconds ?? 0) / 60)) })}</p></div>
          <Progress value={timer?.progressPercent ?? 0} className="h-1.5 bg-muted" aria-label={`${Math.round(timer?.progressPercent ?? 0)} percent of planned focus time elapsed`} />
          <div className="mt-2 flex justify-between text-[0.62rem] text-muted-foreground"><span>{t("focus.startedAt", { value: formatNumber(session.task_progress_before) })} task progress</span><span>{session.planned_work_minutes} min plan</span></div>
          <div className="mt-6"><Label htmlFor="active-focus-notes" className="text-xs">{t("focus.sessionNotesOptional")}</Label><Textarea id="active-focus-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={2000} rows={2} className="mt-2 resize-y rounded-xl" placeholder={t("focus.activeNotesPlaceholder")} /></div>
          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">{session.persisted_status === "paused" ? <Button onClick={() => void resume()} disabled={busy || offline} variant="outline" className="h-11 min-w-36 rounded-[12px]"><Play className="size-4" />{t("focus.resume")}</Button> : <Button onClick={() => void pause()} disabled={busy || offline} variant="outline" className="h-11 min-w-36 rounded-[12px]"><Pause className="size-4" />{t("focus.pause")}</Button>}<Button onClick={() => void openWrapUp()} disabled={busy || offline} className="h-11 min-w-40 rounded-[12px]"><Square className="size-4" />{t("focus.end")}</Button></div>
          {offline && <div className="mt-4 text-center"><Button variant="ghost" onClick={() => void reconnect()} className="h-10 rounded-xl text-xs"><RefreshCw className="size-3.5" />{t("focus.reconnect")}</Button></div>}
          <div className="mt-7 grid gap-3 border-t border-border/65 pt-5 text-[0.65rem] text-muted-foreground sm:grid-cols-3"><span className="flex items-center gap-1.5"><Clock3 className="size-3.5" />{t("focus.workPlan", { minutes: formatNumber(session.planned_work_minutes) })}</span><span className="flex items-center gap-1.5"><Coffee className="size-3.5" />{t("focus.breakReminder", { minutes: formatNumber(session.planned_break_minutes) })}</span><span className="flex items-center gap-1.5"><Timer className="size-3.5" />{t("focus.estimate", { minutes: formatNumber(session.task_estimated_minutes) })}</span></div>
        </div></Card>
        <div className="mt-5 text-center"><p className="text-[0.65rem] leading-5 text-muted-foreground">{t("focus.refreshSafety")}</p></div>
      </motion.div></div>
    </div>
  );

  async function reconnect() {
    if (!session) return recover();
    setBusy(true); setError(null);
    try { setSession(session.persisted_status === "running" ? await heartbeatFocusSession(studentId, session.id) : await getFocusSession(studentId, session.id)); setOffline(false); setNow(Date.now()); }
    catch (cause) { setError(cause instanceof FocusApiError ? cause.message : "Still offline. No session result was recorded."); }
    finally { setBusy(false); }
  }
}

function TopExit() {
  const { t } = useLocale();
  return <div className="flex items-center justify-between"><Button asChild variant="ghost" className="h-9 gap-2 rounded-[11px] px-2 text-[0.68rem] text-muted-foreground hover:text-foreground"><Link href="/overview"><ArrowLeft className="size-3.5" />{t("focus.backDay")}</Link></Button><span className="flex items-center gap-2 text-[0.63rem] text-muted-foreground"><span className="size-1.5 rounded-full bg-success" />{t("focus.mode")}</span></div>;
}

function SafeError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useLocale();
  return <div className="flex items-start gap-3 rounded-[14px] border border-warning/20 bg-warning/[0.045] p-3 text-xs leading-5 text-muted-foreground" role="alert"><WifiOff className="mt-0.5 size-4 shrink-0 text-warning" /><div className="flex-1"><p>{message}</p>{onRetry && <Button type="button" variant="ghost" onClick={onRetry} className="mt-1 h-8 px-2 text-xs"><RefreshCw className="size-3.5" />{t("focus.tryAgain")}</Button>}</div></div>;
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-border/70 px-4 py-4 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"><p className="font-mono text-lg text-foreground">{value}</p><p className="mt-1 text-[0.62rem] text-muted-foreground">{label}</p></div>;
}
