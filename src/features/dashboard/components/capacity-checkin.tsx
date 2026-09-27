"use client";

import { useEffect, useState } from "react";
import { Activity, ChevronDown, Clock3, Gauge, RefreshCw, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { MotionButton } from "@/components/motion/animated";
import { useDemo } from "@/lib/state/demo-provider";
import type { StudentCapacity } from "@/lib/demo-data/types";
import type { LifeLoadFactor, LifeLoadImpact } from "@/lib/demo-data/types";
import { lifeLoadFactorOptions, lifeLoadImpacts } from "@/lib/domain/life-load";
import { RecoveryMode } from "./recovery-mode";

const timeOptions = [90, 120, 150, 180, 270, 300, 360];
import { capacityPresets, capacityStages, availableCapacity, isLowCapacity } from "@/lib/domain/dashboard";

const energyLabels = ["Low", "Drained", "Steady", "Good", "High"];
const energyDescription = ["low", "low", "medium", "high", "high"];
const focusLabels: StudentCapacity["focus"][] = ["low", "medium", "high"];
const workloadLabels: StudentCapacity["workload"][] = ["light", "moderate", "heavy"];

function formatAvailable(minutes: number) {
  if (minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h` : ""}${remainder ? ` ${remainder}m` : ""}`.trim();
}

export function CapacityCheckIn() {
  const { state, updateCapacity } = useDemo();
  const [draft, setDraft] = useState<StudentCapacity>(state.capacity);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDraft(state.capacity), [state.capacity]);
  const isLow = isLowCapacity(draft);
  const workloadDescription = draft.workload === "moderate" ? "normal" : draft.workload === "light" ? "manageable" : "heavy";

  const update = (key: keyof StudentCapacity, value: StudentCapacity[keyof StudentCapacity]) => setDraft((previous) => ({ ...previous, [key]: value }));
  const toggleFactor = (factor: LifeLoadFactor, selected: boolean) => setDraft((previous) => {
    const factors = { ...previous.lifeLoadFactors };
    if (selected) factors[factor] = "Medium";
    else delete factors[factor];
    return { ...previous, lifeLoadFactors: factors };
  });
  const updateImpact = (factor: LifeLoadFactor, impact: LifeLoadImpact) => setDraft((previous) => ({ ...previous, lifeLoadFactors: { ...previous.lifeLoadFactors, [factor]: impact } }));
  const submit = async () => {
    setBusy(true);
    await updateCapacity(draft);
    setBusy(false);
  };

  return (
    <Card className="rounded-[20px] border-border/85 bg-surface-raised py-0 shadow-none">
      <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="type-eyebrow mb-2 text-muted-foreground">Daily input</p><CardTitle className="type-section-title flex items-center gap-2"><Activity className="size-4 text-primary" aria-hidden="true" />Life Load Check-In</CardTitle><p className="mt-1.5 text-xs text-muted-foreground">Share what affects your time today. Your plan adapts to your capacity.</p></div>
          <span className="rounded-[11px] border border-border/70 bg-background/60 px-2 py-1 text-[0.6rem] font-mono text-muted-foreground">TODAY</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">
        <div role="group" aria-label="Capacity presets" className="grid grid-cols-3 gap-2">{capacityPresets.map((preset) => <button key={preset.label} type="button" aria-pressed={Object.entries(preset.capacity).every(([key, value]) => draft[key as keyof StudentCapacity] === value)} onClick={() => setDraft((previous) => ({ ...preset.capacity, lifeLoadFactors: previous.lifeLoadFactors, lifeLoadNote: previous.lifeLoadNote }))} className="rounded-xl border border-border bg-background/30 p-3 text-center text-xs transition-colors hover:border-primary/40 hover:bg-primary/[0.04] aria-pressed:border-primary/60 aria-pressed:bg-primary/[0.09] aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"><span className="mb-1 block text-lg" aria-hidden="true">{preset.icon}</span><span className="block font-medium">{preset.label}</span><span className="mt-1 block text-muted-foreground">{formatAvailable(preset.capacity.availableMinutes)} available</span></button>)}</div>
        <div className="rounded-[11px] border border-primary/15 bg-primary/[0.035] px-3 py-2.5 text-[0.65rem] leading-5 text-foreground/85"><span className="font-medium text-primary">Your capacity:</span> {formatAvailable(availableCapacity(draft))} available · {energyDescription[draft.energy - 1]} energy · {draft.focus} focus · {workloadDescription} workload</div>
        <details className="group rounded-[12px] border border-border/70 bg-background/25"><summary className="flex cursor-pointer list-none items-center justify-between rounded-[12px] px-3 py-2.5 text-xs font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">Advanced<ChevronDown className="size-3.5 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary><div className="space-y-4 border-t border-border/70 px-3 py-4">
        <Field>
          <FieldLabel htmlFor="available-time" className="mb-1.5 flex items-center gap-2 text-[0.68rem] font-medium text-foreground/80"><Clock3 className="size-3.5 text-muted-foreground" />Available time</FieldLabel>
          <Select value={String(draft.availableMinutes)} onValueChange={(value) => update("availableMinutes", Number(value))}>
            <SelectTrigger id="available-time" className="h-9 rounded-[12px] border-border/80 bg-background/65 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>{timeOptions.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatAvailable(minutes)} available</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel className="mb-2 flex items-center justify-between text-[0.66rem] font-medium text-foreground/80"><span className="flex items-center gap-1.5"><Gauge className="size-3.5 text-muted-foreground" />Energy</span><span className="text-primary">{energyLabels[draft.energy - 1]}</span></FieldLabel>
            <Slider aria-label="Energy level" min={1} max={5} step={1} value={[draft.energy]} onValueChange={(value) => update("energy", (value[0] ?? 4) as StudentCapacity["energy"])} className="py-1" />
          </Field>
          <Field>
            <FieldLabel htmlFor="focus-level" className="mb-2 flex items-center gap-1.5 text-[0.66rem] font-medium text-foreground/80"><Activity className="size-3.5 text-muted-foreground" />Focus</FieldLabel>
            <Select value={draft.focus} onValueChange={(value) => update("focus", value as StudentCapacity["focus"])}>
              <SelectTrigger id="focus-level" className="h-8 rounded-[11px] border-border/80 bg-background/65 text-[0.68rem]"><SelectValue /></SelectTrigger><SelectContent>{focusLabels.map((label) => <SelectItem key={label} value={label} className="capitalize">{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="workload-level" className="mb-1.5 flex items-center gap-1.5 text-[0.66rem] font-medium text-foreground/80"><Users className="size-3.5 text-muted-foreground" />Workload</FieldLabel>
            <Select value={draft.workload} onValueChange={(value) => update("workload", value as StudentCapacity["workload"])}>
              <SelectTrigger id="workload-level" className="h-8 rounded-[11px] border-border/80 bg-background/65 text-[0.68rem]"><SelectValue /></SelectTrigger><SelectContent>{workloadLabels.map((label) => <SelectItem key={label} value={label} className="capitalize">{label}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="commitment" className="mb-1.5 text-[0.66rem] font-medium text-foreground/80">Unexpected time</FieldLabel>
            <Select value={String(draft.unexpectedCommitmentMinutes)} onValueChange={(value) => update("unexpectedCommitmentMinutes", Number(value))}>
              <SelectTrigger id="commitment" className="h-8 rounded-[11px] border-border/80 bg-background/65 text-[0.68rem]"><SelectValue /></SelectTrigger><SelectContent>{[0, 30, 60, 90, 120].map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{minutes === 0 ? "None" : `${minutes} min`}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
        </div></details>
        <details className="group rounded-[12px] border border-border/70 bg-background/25"><summary className="flex cursor-pointer list-none items-center justify-between rounded-[12px] px-3 py-3 text-sm font-medium text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">Life load factors <span className="flex items-center gap-2 text-xs font-normal text-muted-foreground">Optional<ChevronDown className="size-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></span></summary>
          <div className="space-y-4 border-t border-border/70 px-3 py-4">
            <p className="text-xs leading-5 text-muted-foreground">Select anything reducing the time you can plan today. Impact only adjusts your planning buffer.</p>
            <fieldset className="space-y-2"><legend className="mb-2 text-xs font-medium text-foreground">What is affecting your day?</legend>{lifeLoadFactorOptions.map((factor) => {
              const impact = draft.lifeLoadFactors?.[factor];
              return <div key={factor} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-background/45 px-3 py-2.5"><label className="flex min-h-8 min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-sm text-foreground"><input type="checkbox" checked={Boolean(impact)} onChange={(event) => toggleFactor(factor, event.target.checked)} className="size-4 shrink-0 accent-primary" />{factor}</label>{impact && <div className="flex items-center gap-2"><label htmlFor={`impact-${factor}`} className="text-xs text-muted-foreground">Impact</label><Select value={impact} onValueChange={(value) => updateImpact(factor, value as LifeLoadImpact)}><SelectTrigger id={`impact-${factor}`} aria-label={`${factor} impact`} className="h-10 w-28 rounded-lg border-border/80 bg-background/65 text-sm"><SelectValue /></SelectTrigger><SelectContent>{lifeLoadImpacts.map((level) => <SelectItem key={level} value={level}>{level}</SelectItem>)}</SelectContent></Select></div>}</div>;
            })}</fieldset>
            <Field><FieldLabel htmlFor="life-load-note" className="text-sm">Anything else affecting your day?</FieldLabel><textarea id="life-load-note" value={draft.lifeLoadNote ?? ""} onChange={(event) => update("lifeLoadNote", event.target.value)} maxLength={280} rows={3} placeholder="I need to help my family tonight." className="mt-2 w-full resize-y rounded-xl border border-border bg-background/65 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" /><p className="mt-1 text-xs text-muted-foreground">Optional context. This text does not change the capacity calculation.</p></Field>
          </div>
        </details>
        {isLow && <p className="text-[0.62rem] text-warning">A smaller plan will protect your highest priority.</p>}
        <MotionButton onClick={submit} disabled={busy || state.simulation.kind !== null} className="h-9 w-full rounded-[12px] text-xs font-semibold" aria-label="Update the plan with this capacity">
          <RefreshCw className={`size-3.5 ${busy ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />{busy ? state.simulation.step ?? "Updating your plan…" : "Update My Plan"}
        </MotionButton>
        {busy && <div className="rounded-xl border border-primary/15 bg-primary/[0.035] p-3 text-xs"><p className="mb-2 font-medium text-primary">LumaPath is adapting your day</p><ol className="space-y-1.5">{capacityStages.map((step, index) => { const current = capacityStages.indexOf(state.simulation.step ?? ""); return <li key={step} className={`flex items-center gap-2 transition-colors duration-200 motion-reduce:transition-none ${index <= current + 1 ? "text-foreground" : "text-muted-foreground"}`}><span aria-hidden="true" className={`grid size-4 shrink-0 place-items-center rounded-full text-[0.67rem] ${index <= current ? "bg-primary/15 text-primary" : index === current + 1 ? "bg-primary/10 text-primary" : "text-muted-foreground"}`}>{index <= current ? "✓" : index === current + 1 ? "●" : "○"}</span>{step}</li>; })}</ol></div>}
        {state.recoveryPending && <RecoveryMode />}
        {state.simulation.message === "Life load plan adapted" && <p role="status" className="rounded-xl border border-primary/15 bg-primary/[0.035] px-3 py-2.5 text-sm leading-5 text-foreground">{state.simulation.announcement}</p>}
        <p className="sr-only" aria-live="polite">{state.simulation.announcement}</p>
      </CardContent>
    </Card>
  );
}
