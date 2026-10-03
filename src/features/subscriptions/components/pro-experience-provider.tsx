"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useDemo } from "@/state/demo-provider";
import { useSubscription } from "./subscription-provider";
import { authorizeAdaptivePlanning, hasProFeatures } from "../entitlements";
import { buildAutomaticPlan, changedBlocks, defaultProPreferences, planningInput, type ProActivity, type ProPreferences } from "../pro-intelligence";

type ProExperience = {
  preferences: ProPreferences; savePreferences: (value: ProPreferences) => void;
  history: ProActivity[]; busy: boolean; status: string; warnings: string[];
  recalculate: (reason?: string) => Promise<void>; undo: () => void; canUndo: boolean;
};
const Context = createContext<ProExperience | null>(null);
export function useProExperience() { const value = useContext(Context); if (!value) throw new Error("ProExperienceProvider is required"); return value; }

export function ProExperienceProvider({ children }: { children: React.ReactNode }) {
  const { state, competitionResetVersion } = useDemo();
  return <StudentExperience key={`${state.student.id}:${competitionResetVersion}`}>{children}</StudentExperience>;
}

function StudentExperience({ children }: { children: React.ReactNode }) {
  const { state, onboardingReady, signedOut, applyPlannedBlocks } = useDemo();
  const { subscription } = useSubscription();
  const pro = hasProFeatures(subscription?.plan) && subscription?.subject_id === state.student.id && !signedOut;
  const [preferences, setPreferences] = useState(() => defaultProPreferences(state));
  const [history, setHistory] = useState<ProActivity[]>([]);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const key = `lumapath-pro-experience-v1:${state.student.id}`;
  const current = useRef({ state, preferences, pro });
  current.current = { state, preferences, pro };
  const requestVersion = useRef(0);
  const baseline = useRef<string | null>(null);
  const previous = useRef(state);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(key) ?? "null");
      if (stored?.preferences) {
        const value = stored.preferences;
        setPreferences(old => ({ ...old,
          automaticPlanning: typeof value.automaticPlanning === "boolean" ? value.automaticPlanning : true,
          weeklyHours: typeof value.weeklyHours === "number" && Number.isFinite(value.weeklyHours) ? Math.max(1, Math.min(40, value.weeklyHours)) : old.weeklyHours,
          difficulty: ["beginner", "intermediate", "advanced"].includes(value.difficulty) ? value.difficulty : old.difficulty,
          planningStyle: ["balanced", "deadline-first", "career-first"].includes(value.planningStyle) ? value.planningStyle : old.planningStyle,
          notificationIntensity: ["quiet", "balanced", "focused"].includes(value.notificationIntensity) ? value.notificationIntensity : old.notificationIntensity,
          targetDate: typeof value.targetDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.targetDate) ? value.targetDate : old.targetDate,
        }));
      }
      if (Array.isArray(stored?.history)) setHistory(stored.history.filter((item: ProActivity) => item && typeof item.id === "string" && typeof item.title === "string" && typeof item.at === "string" && ["plan", "readiness", "evidence", "preparation"].includes(item.kind)).slice(0, 30));
    } catch { /* Local preferences are optional. */ }
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (!ready) return;
    try { localStorage.setItem(key, JSON.stringify({ preferences, history })); } catch { /* Keep the current session usable. */ }
  }, [ready, key, preferences, history]);
  useEffect(() => () => { requestVersion.current++; }, []);
  useEffect(() => { if (!pro || !preferences.automaticPlanning) { requestVersion.current++; setBusy(false); } }, [pro, preferences.automaticPlanning]);

  const recalculate = useCallback(async (reason = "Your planning preferences changed") => {
    const snapshot = current.current;
    if (!snapshot.pro) return;
    const version = ++requestVersion.current;
    const input = planningInput(snapshot.state, snapshot.preferences);
    setBusy(true); setStatus("Checking deadlines, capacity and protected time…");
    try {
      if (!await authorizeAdaptivePlanning(snapshot.state.student.id)) { if (version === requestVersion.current) setStatus("Automatic planning is unavailable. Your current schedule is preserved."); return; }
      if (version !== requestVersion.current || !current.current.pro || planningInput(current.current.state, current.current.preferences) !== input) return;
      if (JSON.stringify(current.current.state.planBlocks) !== JSON.stringify(snapshot.state.planBlocks)) { setStatus("Your schedule changed during the review. Recalculate when you’re ready."); return; }
      const result = buildAutomaticPlan(snapshot.state, snapshot.preferences);
      setWarnings(result.unscheduled);
      if (result.changes.length) {
        applyPlannedBlocks(result.blocks, "Automatic plan adapted");
        setStatus(`${reason}. ${result.changes.length} block${result.changes.length === 1 ? "" : "s"} rescheduled.`);
      } else setStatus(result.unscheduled.length ? "Your plan needs a manual review; some work cannot fit safely." : "Your plan already fits your current priorities.");
    } finally { if (version === requestVersion.current) setBusy(false); }
  }, [applyPlannedBlocks]);

  const input = planningInput(state, preferences);
  const readyToPlan = ready && onboardingReady && !state.simulation.kind;
  useEffect(() => {
    if (!readyToPlan) return;
    const snapshot = current.current.state;
    const before = baseline.current;
    baseline.current = input;
    if (!before || before === input || !pro || !preferences.automaticPlanning) return;
    // The competition's deadline demonstration already applies its own constrained plan.
    if (snapshot.competition?.deadlineChanged && !previous.current.competition?.deadlineChanged) return;
    const reason = JSON.stringify(previous.current.capacity) !== JSON.stringify(snapshot.capacity) ? "Capacity changed" : "Deadlines or planned work changed";
    const timer = window.setTimeout(() => void recalculate(reason), 350);
    return () => { window.clearTimeout(timer); requestVersion.current++; setBusy(false); };
  }, [input, pro, readyToPlan, preferences.automaticPlanning, recalculate]);

  useEffect(() => {
    if (!ready || !onboardingReady || state.simulation.kind) return;
    const before = previous.current;
    previous.current = state;
    if (!pro || before.student.id !== state.student.id) return;
    const at = new Date().toISOString();
    const events: ProActivity[] = [];
    const changes = changedBlocks(before.planBlocks, state.planBlocks);
    if (changes.length) events.push({ id: crypto.randomUUID(), at, kind: "plan", title: state.simulation.message ?? "Plan updated", detail: `${changes.length} schedule changes`, changes, before: before.planBlocks, after: state.planBlocks });
    if (before.readiness.score !== state.readiness.score) events.push({ id: crypto.randomUUID(), at, kind: "readiness", title: "Career readiness updated", detail: `${before.readiness.score}% → ${state.readiness.score}%` });
    if (JSON.stringify(before.evidence) !== JSON.stringify(state.evidence)) events.push({ id: crypto.randomUUID(), at, kind: "evidence", title: "Evidence Passport updated", detail: `${state.evidence.filter(item => item.status === "verified").length} verified items · ${state.evidence.length} total evidence records` });
    const added = state.tasks.filter(task => !before.tasks.some(old => old.id === task.id) && /opportunit|preparation/i.test(`${task.source} ${task.description} ${task.title}`));
    if (added.length) events.push({ id: crypto.randomUUID(), at, kind: "preparation", title: "Opportunity preparation added", detail: added.map(task => task.title).join(" · ") });
    if (events.length) setHistory(old => [...events, ...old].slice(0, 30));
  }, [state, ready, onboardingReady, pro]);

  const latestPlan = history.find(item => item.kind === "plan");
  const canUndo = Boolean(pro && latestPlan?.before && latestPlan?.after && latestPlan.title !== "Previous plan restored" && JSON.stringify(state.planBlocks) === JSON.stringify(latestPlan.after));
  const undo = () => {
    if (!canUndo || !latestPlan?.before) return;
    requestVersion.current++;
    applyPlannedBlocks(latestPlan.before, "Previous plan restored");
    setBusy(false); setWarnings([]); setStatus("Previous plan restored. Future input changes can adapt it again.");
  };
  return <Context.Provider value={{ preferences, savePreferences: setPreferences, history, busy, status, warnings, recalculate, undo, canUndo }}>{children}</Context.Provider>;
}
