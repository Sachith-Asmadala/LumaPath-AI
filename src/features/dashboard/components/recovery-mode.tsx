"use client";

import { useMemo, useState } from "react";
import { ArrowRight, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/state/demo-provider";
import { buildRecoveryCandidate, recoveryPreviewRows, type RecoveryChoice } from "@/features/planner/domain/recovery-mode";

const choices: { id: Exclude<RecoveryChoice, "keep">; label: string }[] = [
  { id: "critical", label: "Protect only critical deadlines" },
  { id: "lighter", label: "Give me a lighter day" },
  { id: "career", label: "Reschedule career learning" },
  { id: "recommended", label: "Show recommended recovery plan" },
];

export function RecoveryMode() {
  const { state, keepCurrentPlan, applyRecoveryChoice } = useDemo();
  const [choice, setChoice] = useState<Exclude<RecoveryChoice, "keep"> | null>(null);
  const [applying, setApplying] = useState(false);
  const candidate = useMemo(() => choice && state.recoveryPending ? buildRecoveryCandidate(state, choice) : null, [choice, state]);
  const rows = candidate ? recoveryPreviewRows(state, candidate) : [];

  if (!state.recoveryPending) return null;

  const apply = async () => {
    if (!choice || applying) return;
    setApplying(true);
    await applyRecoveryChoice(choice);
    setApplying(false);
  };

  return <section aria-label="Recovery Mode" className="rounded-2xl border border-warning/25 bg-warning/[0.045] p-4 sm:p-5">
    <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-warning/25 bg-warning/10 text-warning"><CalendarClock className="size-4" aria-hidden="true" /></span><div><h3 className="font-heading text-base font-semibold text-foreground">Today looks heavier than usual.</h3><p className="mt-1 text-sm leading-5 text-muted-foreground">Choose how to handle your plan. Nothing moves until you apply a preview.</p></div></div>
    <div role="group" aria-label="Recovery choices" className="mt-4 grid gap-2">
      {choices.slice(0, 2).map((option) => <button key={option.id} type="button" aria-pressed={choice === option.id} onClick={() => setChoice(option.id)} className="min-h-11 rounded-xl border border-border bg-background/55 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 aria-pressed:border-primary/50 aria-pressed:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{option.label}</button>)}
      <button type="button" onClick={keepCurrentPlan} disabled={applying || state.simulation.kind !== null} className="min-h-11 rounded-xl border border-border bg-background/55 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">Keep my current plan</button>
      {choices.slice(2).map((option) => <button key={option.id} type="button" aria-pressed={choice === option.id} onClick={() => setChoice(option.id)} className="min-h-11 rounded-xl border border-border bg-background/55 px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:border-primary/40 aria-pressed:border-primary/50 aria-pressed:bg-primary/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{option.label}</button>)}
    </div>
    {choice && <div className="mt-4 rounded-xl border border-border bg-background/60 p-3" aria-label="Recovery schedule preview">
      <p className="text-xs font-semibold text-primary">Before / after schedule preview</p>
      {rows.length ? <div className="mt-3 grid grid-cols-2 gap-3 text-xs"><div><p className="mb-2 font-semibold text-muted-foreground">Before</p><ul className="space-y-2">{rows.map((row) => <li key={row.id} className="min-w-0"><span className="block truncate text-foreground">{row.title}</span><span className="text-muted-foreground">{row.before}</span></li>)}</ul></div><div><p className="mb-2 font-semibold text-muted-foreground">After</p><ul className="space-y-2">{rows.map((row) => <li key={row.id} className="min-w-0"><span className="block truncate text-foreground">{row.title}</span><span className="text-primary">{row.after}</span></li>)}</ul></div></div> : <p className="mt-2 text-sm text-muted-foreground">There are no flexible blocks to change today.</p>}
      <Button type="button" onClick={apply} disabled={applying || state.simulation.kind !== null} className="mt-4 h-11 w-full rounded-xl text-sm font-semibold"><ArrowRight className="size-4" aria-hidden="true" />{applying ? "Applying…" : "Apply Recovery Plan"}</Button>
    </div>}
  </section>;
}
