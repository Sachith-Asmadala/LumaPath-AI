"use client";

import { scenarioAt } from "@/lib/demo-data/scenario";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, CircleSlash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDemo } from "@/lib/state/demo-provider";
import type { PlanBlock, TaskCategory } from "@/lib/demo-data/types";

function localInput(value?: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

export function TaskEditorDialog({ block, open, onOpenChange }: { block: PlanBlock | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, addTask, updateTask, completeTask, missTask, setSimulationAnnouncement } = useDemo();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("Academic");
  const [minutes, setMinutes] = useState(45);
  const [startAt, setStartAt] = useState(scenarioAt(2, "19:00"));
  const [dueAt, setDueAt] = useState("");
  const task = state.tasks.find((item) => item.id === block?.taskId);
  const isNew = !task;
  const SubmitIcon = isNew ? CalendarClock : Save;

  useEffect(() => {
    setTitle(block?.title ?? "");
    setCategory(block?.category ?? "Academic");
    setMinutes(task?.estimatedMinutes ?? 45);
    setStartAt(localInput(block?.startAt) || scenarioAt(2, "19:00"));
    setDueAt(localInput(task?.dueAt));
  }, [block, task?.estimatedMinutes, task?.dueAt]);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!title.trim() || !block) return;
    const input = {
      title: title.trim(),
      category,
      estimatedMinutes: minutes,
      dueAt: dueAt ? `${dueAt}:00` : undefined,
      startAt: `${startAt}:00`,
      description: task?.description ?? "A task added to the demo plan.",
    };
    if (task) updateTask({ ...input, id: task.id });
    else addTask(input);
    onOpenChange(false);
  };

  const markCompleted = () => {
    if (!task) return;
    completeTask(task.id);
    setSimulationAnnouncement(`${task.title} marked as completed.`);
    onOpenChange(false);
  };
  const markMissed = () => {
    if (!task) return;
    missTask(task.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] rounded-[20px] border-border bg-surface-raised p-5 sm:max-w-[430px] sm:p-6">
        <DialogHeader className="text-left"><p className="type-eyebrow text-primary">{isNew ? "Plan a task" : "Task details"}</p><DialogTitle className="font-heading text-xl font-semibold tracking-[-0.03em]">{isNew ? "Add to your week" : task?.title ?? block?.title}</DialogTitle><DialogDescription className="text-[0.73rem]">{isNew ? "Choose a category and reserve a realistic time block." : task?.description ?? "A fixed schedule item."}</DialogDescription></DialogHeader>
        <form onSubmit={save} className="mt-3 space-y-4">
          <Field><FieldLabel htmlFor="task-title">Task name</FieldLabel><Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Review database indexing" required maxLength={100} className="h-10 rounded-[12px] bg-background/60" /><FieldDescription>Use a specific action you can finish in one session.</FieldDescription></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="task-category">Category</FieldLabel><Select value={category} onValueChange={(value) => setCategory(value as TaskCategory)}><SelectTrigger id="task-category" className="h-10 rounded-[12px] bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{(["Academic", "Career", "Personal", "Internship", "AI Recommended"] as const).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="task-minutes">Duration</FieldLabel><Select value={String(minutes)} onValueChange={(value) => setMinutes(Number(value))}><SelectTrigger id="task-minutes" className="h-10 rounded-[12px] bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{[25, 30, 45, 60, 75, 90, 120].map((item) => <SelectItem key={item} value={String(item)}>{item} minutes</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <Field><FieldLabel htmlFor="task-start">Schedule</FieldLabel><Input id="task-start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required className="h-10 rounded-[12px] bg-background/60" /></Field>
          <Field><FieldLabel htmlFor="task-due">Deadline <span className="font-normal text-muted-foreground">(optional)</span></FieldLabel><Input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-10 rounded-[12px] bg-background/60" /></Field>
          <DialogFooter className="gap-2 sm:justify-between">
            {!isNew && <div className="flex gap-2"><Button type="button" variant="outline" onClick={markCompleted} disabled={task?.status === "completed"} className="h-9 rounded-[11px] text-[0.65rem]"><CheckCircle2 className="size-3.5" />Complete</Button><Button type="button" variant="outline" onClick={markMissed} disabled={task?.status === "missed" || task?.status === "completed"} className="h-9 rounded-[11px] text-[0.65rem]"><CircleSlash2 className="size-3.5" />Miss</Button></div>}
            <Button type="submit" disabled={!title.trim()} className="h-9 flex-1 rounded-[11px] text-xs sm:flex-none"><SubmitIcon className="size-3.5" />{isNew ? "Add task" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
