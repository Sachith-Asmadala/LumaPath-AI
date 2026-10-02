"use client";

import { scenarioAt } from "@/data/demo/scenario";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarClock, CheckCircle2, CircleSlash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDemo } from "@/state/demo-provider";
import type { PlanBlock, TaskCategory } from "@/data/demo/types";
import { useLocale } from "@/i18n/locale-provider";

function localInput(value?: string) {
  if (!value) return "";
  return value.slice(0, 16);
}

export function TaskEditorDialog({ block, open, onOpenChange }: { block: PlanBlock | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { state, addTask, updateTask, updatePlanBlock, completeTask, missTask, setSimulationAnnouncement } = useDemo();
  const { t, formatNumber } = useLocale();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<TaskCategory>("Academic");
  const [minutes, setMinutes] = useState(45);
  const [startAt, setStartAt] = useState(scenarioAt(2, "19:00"));
  const [dueAt, setDueAt] = useState("");
  const task = state.tasks.find((item) => item.id === block?.taskId);
  const isNew = !task && (!block || block.id === "new-plan-block");
  const isExistingFixedBlock = Boolean(block && !task && block.id !== "new-plan-block");
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
    else if (isExistingFixedBlock) updatePlanBlock({ ...block, title: input.title, category: input.category, startAt: input.startAt, endAt: new Date(new Date(input.startAt).getTime() + input.estimatedMinutes * 60_000).toISOString() });
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
        <DialogHeader className="text-left"><p className="type-eyebrow text-primary">{isNew ? t("planner.editor.planTask") : t("planner.editor.details")}</p><DialogTitle className="font-heading text-xl font-semibold tracking-[-0.03em]">{isNew ? t("planner.editor.addWeek") : task?.title ?? block?.title}</DialogTitle><DialogDescription className="text-[0.73rem]">{isNew ? t("planner.editor.newDescription") : task?.description ?? t("planner.editor.fixedDescription")}</DialogDescription></DialogHeader>
        <form onSubmit={save} className="mt-3 space-y-4">
          <Field><FieldLabel htmlFor="task-title">{t("planner.editor.taskName")}</FieldLabel><Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t("planner.editor.placeholder")} required maxLength={100} className="h-10 rounded-[12px] bg-background/60" /><FieldDescription>{t("planner.editor.taskHint")}</FieldDescription></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field><FieldLabel htmlFor="task-category">{t("planner.editor.category")}</FieldLabel><Select value={category} onValueChange={(value) => setCategory(value as TaskCategory)}><SelectTrigger id="task-category" className="h-10 rounded-[12px] bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{(["Academic", "Career", "career-learning", "Personal", "Internship", "AI Recommended"] as const).map((item) => <SelectItem key={item} value={item}>{item === "Academic" ? t("category.academic") : item === "Career" ? t("category.career") : item === "career-learning" ? t("category.careerLearning") : item === "Personal" ? t("category.personal") : item === "Internship" ? t("category.internship") : t("category.aiRecommended")}</SelectItem>)}</SelectContent></Select></Field>
            <Field><FieldLabel htmlFor="task-minutes">{t("planner.editor.duration")}</FieldLabel><Select value={String(minutes)} onValueChange={(value) => setMinutes(Number(value))}><SelectTrigger id="task-minutes" className="h-10 rounded-[12px] bg-background/60"><SelectValue /></SelectTrigger><SelectContent>{[25, 30, 45, 60, 75, 90, 120].map((item) => <SelectItem key={item} value={String(item)}>{t("common.minutes", { count: formatNumber(item) })}</SelectItem>)}</SelectContent></Select></Field>
          </div>
          <Field><FieldLabel htmlFor="task-start">{t("planner.editor.schedule")}</FieldLabel><Input id="task-start" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} required className="h-10 rounded-[12px] bg-background/60" /></Field>
          <Field><FieldLabel htmlFor="task-due">{t("planner.editor.deadline")} <span className="font-normal text-muted-foreground">({t("planner.editor.optional")})</span></FieldLabel><Input id="task-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-10 rounded-[12px] bg-background/60" /></Field>
          <DialogFooter className="gap-2 sm:justify-between">
            {!isNew && <div className="flex gap-2"><Button type="button" variant="outline" onClick={markCompleted} disabled={task?.status === "completed"} className="h-9 rounded-[11px] text-[0.65rem]"><CheckCircle2 className="size-3.5" />{t("planner.editor.complete")}</Button><Button type="button" variant="outline" onClick={markMissed} disabled={task?.status === "missed" || task?.status === "completed"} className="h-9 rounded-[11px] text-[0.65rem]"><CircleSlash2 className="size-3.5" />{t("planner.editor.miss")}</Button></div>}
            <Button type="submit" disabled={!title.trim()} className="h-9 flex-1 rounded-[11px] text-xs sm:flex-none"><SubmitIcon className="size-3.5" />{isNew ? t("planner.editor.addTask") : t("planner.editor.saveChanges")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
