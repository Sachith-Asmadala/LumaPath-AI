"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, Check, Circle, CloudDownload, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { useDemo } from "@/lib/state/demo-provider";
import { mockUniversityLms } from "@/lib/integrations/lms/mock-university-lms";
import type { LmsAssignment } from "@/lib/integrations/lms/types";

const syncSteps = ["Connecting...", "Courses found", "Reading assignments", "Checking deadlines"];

function wait(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

export default function UniversityLmsImportPage() {
  const { state, importLmsAssignments } = useDemo();
  const [assignments, setAssignments] = useState<readonly LmsAssignment[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [stage, setStage] = useState(-1);
  const syncRun = useRef(false);
  const reduced = useReducedMotion();

  async function sync() {
    if (syncRun.current) return;
    syncRun.current = true;
    setSyncing(true);
    setAssignments(null);
    for (let index = 0; index < syncSteps.length; index++) {
      setStage(index);
      await wait(reduced ? 90 : 500);
    }
    setAssignments(await mockUniversityLms.listAssignments());
    setSyncing(false);
    syncRun.current = false;
  }

  async function importSelected(selected: readonly LmsAssignment[]) {
    if (importing || syncing) return;
    setImporting(true);
    try {
      await importLmsAssignments(selected);
    } finally {
      setImporting(false);
    }
  }

  const imported = (assignment: LmsAssignment) => state.tasks.some((task) => task.source === assignment.source && task.externalId === assignment.externalId);
  const newCount = assignments?.filter((assignment) => !imported(assignment)).length ?? 0;

  return <main className="mx-auto w-full max-w-[960px] px-4 pb-12 pt-5 sm:px-6 sm:pt-7 lg:px-8 lg:pt-8">
    <Link href="/tasks" className="mb-6 inline-flex min-h-10 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"><ArrowLeft className="size-4" />Back to Tasks</Link>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="type-eyebrow mb-2 text-primary">Tasks / Import / University LMS</p><TypographyH1>Smart Deadline Import</TypographyH1><TypographyP className="mt-2">Preview assignments from a controlled demo LMS, then choose which deadlines to add to your plan.</TypographyP></div><Button onClick={sync} disabled={syncing || importing} className="min-h-11 rounded-xl"><CloudDownload className="size-4" />{syncing ? "Syncing..." : assignments ? "Sync Again" : "Sync University"}</Button></div>

    <Card className="rounded-2xl border-border/80 bg-surface-raised px-5 py-5 shadow-none sm:px-6"><div className="flex items-start justify-between gap-4"><div><h2 className="text-sm font-semibold">{mockUniversityLms.label}</h2><p className="mt-1 text-xs text-muted-foreground">Controlled sample assignments. No university account or password is needed.</p></div><span className="rounded-full border border-primary/20 bg-primary/[0.06] px-2.5 py-1 text-[0.7rem] text-primary">Demo source</span></div>
      {stage >= 0 && <ol className="mt-5 grid gap-3 sm:grid-cols-4" aria-label="University sync progress" aria-live="polite">{syncSteps.map((label, index) => { const complete = index < stage || (!syncing && assignments !== null); const current = syncing && index === stage; return <li key={label} className={`flex items-center gap-2 text-xs ${complete || current ? "text-foreground" : "text-muted-foreground"}`}>{complete ? <Check className="size-4 shrink-0 text-success" aria-hidden="true" /> : current ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" /> : <Circle className="size-4 shrink-0" aria-hidden="true" />}<span>{label}</span></li>; })}</ol>}
    </Card>

    <AnimatePresence mode="wait"><motion.div key={assignments ? "results" : "empty"} initial={{ opacity: 0, x: reduced ? 0 : 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: reduced ? 0 : -8 }} transition={{ duration: reduced ? 0.01 : 0.2 }}>
      {assignments ? <section className="mt-7" aria-label="Assignments available to import"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-semibold">{assignments.length} assignments found</h2><p className="mt-1 text-xs text-muted-foreground">Importing again updates matching tasks by source and assignment ID.</p></div><Button onClick={() => importSelected(assignments)} disabled={importing || assignments.length === 0} className="min-h-11 rounded-xl">{importing ? "Updating plan..." : newCount === 0 ? "Update All" : "Import All"}</Button></div>
        <div className="space-y-3">{assignments.map((assignment) => <Card key={`${assignment.source}:${assignment.externalId}`} className="rounded-2xl border-border/80 bg-surface-raised px-5 py-4 shadow-none sm:px-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-semibold">{assignment.title}</h3>{imported(assignment) && <span className="rounded-full bg-success/10 px-2 py-0.5 text-[0.7rem] text-success">In your tasks</span>}</div><p className="mt-1 text-xs text-muted-foreground">{assignment.module} · Due {new Date(assignment.dueAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p className="mt-2 text-xs leading-5 text-foreground/75">{assignment.description}</p><p className="mt-2 text-[0.7rem] text-muted-foreground">{mockUniversityLms.label} · {assignment.status}</p></div><Button variant="outline" className="min-h-11 shrink-0 rounded-xl" disabled={importing} onClick={() => importSelected([assignment])}>{imported(assignment) ? "Update" : "Import"}<ArrowRight className="size-4" /></Button></div></Card>)}</div>
        <Link href="/planner" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm text-primary hover:underline">View planner<ArrowRight className="size-4" /></Link>
      </section> : <p className="mt-7 text-sm text-muted-foreground">Select Sync University to review the sample deadlines before importing.</p>}
    </motion.div></AnimatePresence>
  </main>;
}
