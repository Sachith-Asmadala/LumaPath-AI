"use client";

import { useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDemo } from "@/state/demo-provider";
import { getNotificationPreferences, updateNotificationPreferences } from "@/features/notifications/services/notifications";
import { useSubscription } from "./subscription-provider";
import { useProExperience } from "./pro-experience-provider";
import { hasProFeatures } from "../entitlements";
import { ProBadge } from "./pro-badge";

export function ProControls() {
  const { state } = useDemo();
  const { subscription } = useSubscription();
  const { preferences, savePreferences } = useProExperience();
  const [draft, setDraft] = useState(preferences);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => setDraft(preferences), [preferences]);
  if (!hasProFeatures(subscription?.plan)) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setMessage("");
    try {
      if (draft.notificationIntensity !== preferences.notificationIntensity) {
        const next = await getNotificationPreferences(state.student.id);
        const limits = { quiet: [2, 1], balanced: [6, 2], focused: [10, 3] }[draft.notificationIntensity];
        await updateNotificationPreferences(state.student.id, { timezone: next.timezone, quiet_hours_enabled: next.quiet_hours_enabled, quiet_hours_start: next.quiet_hours_start, quiet_hours_end: next.quiet_hours_end, mute_non_critical: draft.notificationIntensity === "quiet", max_non_critical_per_day: limits[0], max_non_critical_per_hour: limits[1], in_app_enabled: next.in_app_enabled, push_enabled: next.push_enabled, push_permission_granted: next.push_permission_granted, email_enabled: next.email_enabled, email_consent: next.email_consent, categories: next.categories });
      }
      savePreferences(draft); setMessage("Pro preferences saved. Your planner and career tools will use these defaults.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your preferences could not be saved. Please retry."); }
    finally { setSaving(false); }
  }
  return <section id="pro-controls" aria-label="Pro controls" className="pro-card scroll-mt-24"><p className="pro-card-label"><SlidersHorizontal size={16} />Make Pro work your way<ProBadge /></p><h2 className="mt-3 text-xl font-medium">Your pace. Your priorities.</h2><p className="mt-2 text-xs leading-6 text-muted-foreground">Set planning defaults, the learning depth you prefer, and how much guidance you receive.</p><form onSubmit={event => void save(event)} className="mt-5 space-y-4"><label className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4"><input type="checkbox" checked={draft.automaticPlanning} onChange={event => setDraft(old => ({ ...old, automaticPlanning: event.target.checked }))} className="mt-0.5 size-4 accent-primary" /><span><strong className="block text-sm font-medium">Automatic adaptive planning</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">Replan flexible work when deadlines, capacity or approved preparation tasks change. Fixed events and focus reservations stay protected.</span></span></label><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><label className="space-y-2 text-xs">Weekly career-learning hours<Input aria-label="Weekly career-learning hours" type="number" min={1} max={40} required value={draft.weeklyHours} onChange={event => setDraft(old => ({ ...old, weeklyHours: Number(event.target.value) }))} /></label><label className="space-y-2 text-xs">Target date<Input aria-label="Pro target date" type="date" required value={draft.targetDate} onChange={event => setDraft(old => ({ ...old, targetDate: event.target.value }))} /></label><label className="space-y-2 text-xs">Preferred learning difficulty<select aria-label="Preferred learning difficulty" className="workspace-select block w-full" value={draft.difficulty} onChange={event => setDraft(old => ({ ...old, difficulty: event.target.value as typeof old.difficulty }))}><option value="beginner">Foundations</option><option value="intermediate">Practical intermediate</option><option value="advanced">Advanced challenges</option></select></label><label className="space-y-2 text-xs">Planning style<select aria-label="Planning style" className="workspace-select block w-full" value={draft.planningStyle} onChange={event => setDraft(old => ({ ...old, planningStyle: event.target.value as typeof old.planningStyle }))}><option value="balanced">Balanced progress</option><option value="deadline-first">Protect deadlines first</option><option value="career-first">Career momentum</option></select></label><label className="space-y-2 text-xs">Notification intensity<select aria-label="Notification intensity" className="workspace-select block w-full" value={draft.notificationIntensity} onChange={event => setDraft(old => ({ ...old, notificationIntensity: event.target.value as typeof old.notificationIntensity }))}><option value="quiet">Quiet · critical updates</option><option value="balanced">Balanced · up to 6 daily</option><option value="focused">Focused · up to 10 daily</option></select></label></div><Button disabled={saving} type="submit" className="rounded-xl">{saving ? "Saving preferences…" : "Save Pro preferences"}</Button>{message && <p role="status" className="text-xs text-success">{message}</p>}{error && <p role="alert" className="text-xs text-destructive">{error}</p>}</form></section>;
}
