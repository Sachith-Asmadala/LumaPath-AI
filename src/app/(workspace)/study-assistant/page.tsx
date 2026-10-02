"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, BookOpenCheck, BrainCircuit, CalendarPlus, Check, ChevronRight, CircleHelp, Clock3, FileQuestion, ListTodo, LoaderCircle, ShieldCheck, Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import type { TaskCategory } from "@/data/demo/types";
import {
  assistantModes,
  buildAssistantContextSnapshot,
  responseNeedsQuestion,
  studyContextOptions,
  type AssistantQuizQuestion,
  type ProposedAssistantAction,
  type StudyAssistantMode,
  type StudyAssistantResponse,
  type StudyContextKind,
} from "@/features/assistant/domain/study-assistant";
import { approveStudyAssistantAction, requestStudyAssistant, sendStudyAssistantFeedback, StudyAssistantApiError, syncStudyAssistantContext } from "@/features/assistant/services/study-assistant";
import { useDemo } from "@/state/demo-provider";
import { localeOptions, useLocale } from "@/i18n";

const modeIcons: Record<StudyAssistantMode, typeof Sparkles> = {
  concept_explanation: CircleHelp,
  revision_plan: BookOpenCheck,
  quiz: FileQuestion,
  assignment_breakdown: ListTodo,
  todays_study_suggestion: BrainCircuit,
};

const validCategories: readonly TaskCategory[] = ["Academic", "Career", "career-learning", "Personal", "Internship", "AI Recommended"];

function inputDateTime(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function categoryOf(value?: string | null): TaskCategory {
  return validCategories.includes(value as TaskCategory) ? value as TaskCategory : "Academic";
}

function contextKey(kind: StudyContextKind, id: string) {
  return `${kind}:${id}`;
}

export default function StudyAssistantPage() {
  const { state, addTask } = useDemo();
  const { locale, t } = useLocale();
  const options = useMemo(() => studyContextOptions(state), [state]);
  const [mode, setMode] = useState<StudyAssistantMode>("concept_explanation");
  const [selectedKey, setSelectedKey] = useState("");
  const [question, setQuestion] = useState("");
  const [response, setResponse] = useState<StudyAssistantResponse | null>(null);
  const [actions, setActions] = useState<ProposedAssistantAction[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const taskId = params.get("task");
    const skillId = params.get("objective");
    const moduleId = params.get("module");
    const requestedMode = params.get("mode") as StudyAssistantMode | null;
    if (requestedMode && assistantModes.some((item) => item.value === requestedMode)) setMode(requestedMode);
    if (taskId && options.some((item) => item.kind === "task" && item.id === taskId)) setSelectedKey(contextKey("task", taskId));
    else if (skillId && options.some((item) => item.kind === "learning_objective" && item.id === skillId)) setSelectedKey(contextKey("learning_objective", skillId));
    else if (moduleId && options.some((item) => item.kind === "module" && item.id === moduleId)) setSelectedKey(contextKey("module", moduleId));
  }, [options]);

  const selected = options.find((option) => contextKey(option.kind, option.id) === selectedKey) ?? null;
  const grouped = useMemo(() => ({
    module: options.filter((item) => item.kind === "module"),
    task: options.filter((item) => item.kind === "task"),
    learning_objective: options.filter((item) => item.kind === "learning_objective"),
  }), [options]);

  const modeLabel = (value: StudyAssistantMode) => t({
    concept_explanation: "assistant.mode.explain",
    revision_plan: "assistant.mode.revision",
    quiz: "assistant.mode.quiz",
    assignment_breakdown: "assistant.mode.breakdown",
    todays_study_suggestion: "assistant.mode.today",
  }[value]);
  const requestedLanguage = localeOptions.find((item) => item.code === locale)?.nativeLabel ?? locale;

  useEffect(() => {
    if (mode === "assignment_breakdown" && selected?.kind !== "task") setResponse(null);
  }, [mode, selected]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (!selected) { setError(t("assistant.contextRequired")); return; }
    if (mode === "assignment_breakdown" && selected.kind !== "task") { setError(t("assistant.taskRequired")); return; }
    if (responseNeedsQuestion(mode) && !question.trim()) { setError(t("assistant.questionRequired")); return; }
    setLoading(true);
    setResponse(null);
    setActions([]);
    setSavedIds(new Set());
    setFeedback(null);
    try {
      await syncStudyAssistantContext(state.student.id, buildAssistantContextSnapshot(state));
      const next = await requestStudyAssistant(state.student.id, {
        session_id: response?.session_id,
        mode,
        context_ref: { kind: selected.kind, id: selected.id, label: selected.label },
        question: question.trim(),
        locale,
      });
      setResponse(next);
      setActions(next.proposed_actions.map((action) => structuredClone(action)));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Study Assistant could not complete this request.");
    } finally {
      setLoading(false);
    }
  };

  const patchAction = (id: string, patch: Partial<ProposedAssistantAction>) => {
    setActions((current) => current.map((action) => action.id === id ? { ...action, ...patch } : action));
  };

  const patchQuiz = (actionId: string, index: number, patch: Partial<AssistantQuizQuestion>) => {
    setActions((current) => current.map((action) => action.id !== actionId ? action : {
      ...action,
      quiz: action.quiz.map((questionItem, questionIndex) => questionIndex === index ? { ...questionItem, ...patch } : questionItem),
    }));
  };

  const saveAction = async (action: ProposedAssistantAction) => {
    if (!response) return;
    try {
      await approveStudyAssistantAction(state.student.id, response.response_id, response.session_id, action);
      if ((action.kind === "task" || action.kind === "plan_item") && action.estimated_minutes && action.start_at) {
        addTask({
          title: action.title,
          category: categoryOf(action.category),
          estimatedMinutes: action.estimated_minutes,
          dueAt: action.due_at ?? undefined,
          startAt: action.start_at,
          description: action.description,
        });
      }
      setSavedIds((current) => new Set(current).add(action.id));
      toast.success(action.kind === "quiz_set" ? t("assistant.quizSaved") : t("assistant.itemSaved"));
    } catch (saveError) {
      toast.error(saveError instanceof StudyAssistantApiError ? saveError.message : "This suggestion could not be saved.");
    }
  };

  const submitFeedback = async (helpful: boolean) => {
    if (!response || feedback) return;
    try {
      await sendStudyAssistantFeedback(state.student.id, response.session_id, response.response_id, helpful);
      setFeedback(helpful ? "up" : "down");
    } catch {
      toast.error("Feedback could not be saved.");
    }
  };

  return <div className="mx-auto w-full max-w-[1220px] px-4 py-6 sm:px-6 lg:px-8">
    <Reveal><div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div><p className="type-eyebrow mb-2 flex items-center gap-2 text-primary"><Sparkles className="size-3.5" />{t("assistant.eyebrow")}</p><TypographyH1>{t("assistant.title")}</TypographyH1><TypographyP className="mt-2 max-w-2xl">{t("assistant.subtitle")}</TypographyP></div>
      <div className="flex flex-wrap gap-2 text-[0.68rem] text-muted-foreground"><span className="rounded-full border border-border bg-card px-3 py-2">{t("assistant.structured")}</span><span className="rounded-full border border-border bg-card px-3 py-2">{t("assistant.reviewBeforeSave")}</span><span className="rounded-full border border-border bg-card px-3 py-2">{t("assistant.noInventedDeadlines")}</span></div>
    </div></Reveal>

    <div className="grid gap-5 xl:grid-cols-[0.88fr_1.35fr]">
      <div className="space-y-4">
        <Card className="rounded-2xl p-5">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><ShieldCheck className="size-4" /></span><div><h2 className="text-sm font-medium">{t("assistant.chooseContext")}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("assistant.chooseContextHint")}</p></div></div>
          {options.length ? <div className="mt-4"><Label htmlFor="assistant-context" className="sr-only">{t("assistant.context")}</Label><select id="assistant-context" value={selectedKey} onChange={(event) => { setSelectedKey(event.target.value); setResponse(null); setActions([]); setError(""); }} className="workspace-select h-11 w-full" aria-label={t("assistant.context")}><option value="">{t("assistant.selectContext")}</option>{grouped.module.length > 0 && <optgroup label={t("assistant.modules")}>{grouped.module.map((item) => <option key={item.id} value={contextKey(item.kind, item.id)}>{item.label}</option>)}</optgroup>}{grouped.task.length > 0 && <optgroup label={t("assistant.activeTasks")}>{grouped.task.map((item) => <option key={item.id} value={contextKey(item.kind, item.id)}>{item.label}</option>)}</optgroup>}{grouped.learning_objective.length > 0 && <optgroup label={t("assistant.learningObjectives")}>{grouped.learning_objective.map((item) => <option key={item.id} value={contextKey(item.kind, item.id)}>{item.label}</option>)}</optgroup>}</select></div> : <div className="mt-4 rounded-xl border border-dashed border-border p-4"><p className="text-sm font-medium">{t("assistant.noContext")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("assistant.noContextHint")}</p><div className="mt-3 flex flex-wrap gap-2"><Button asChild variant="outline" size="sm"><Link href="/settings">{t("assistant.openProfile")}</Link></Button><Button asChild variant="outline" size="sm"><Link href="/planner?add=assignment">{t("assistant.addTask")}</Link></Button></div></div>}
          {selected && <div className="mt-3 rounded-xl border border-border/70 bg-muted/25 p-3"><p className="text-xs font-medium text-foreground">{selected.label}</p><p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{selected.meta} · {selected.description}</p></div>}
        </Card>

        <Card className="rounded-2xl p-5"><h2 className="text-sm font-medium">{t("assistant.chooseAction")}</h2><div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">{assistantModes.map((item) => { const Icon = modeIcons[item.value]; const disabled = item.value === "assignment_breakdown" && selected?.kind !== "task"; return <button key={item.value} type="button" disabled={disabled} onClick={() => { setMode(item.value); setResponse(null); setActions([]); setError(""); }} className={`flex min-h-[4.5rem] items-start gap-3 rounded-xl border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45 ${mode === item.value ? "border-primary/30 bg-primary/[0.055]" : "border-border/70 bg-white/[0.018] hover:bg-white/[0.04]"}`}><Icon className={`mt-0.5 size-4 shrink-0 ${mode === item.value ? "text-primary" : "text-muted-foreground"}`} /><span><span className="block text-xs font-medium text-foreground">{modeLabel(item.value)}</span><span className="mt-1 block text-[0.66rem] leading-5 text-muted-foreground">{item.description}</span></span></button>; })}</div></Card>
      </div>

      <div className="space-y-4">
        <Card className="rounded-2xl p-5 sm:p-6">
          <form onSubmit={submit}>
            <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-xl border border-primary/15 bg-primary/8 text-primary"><Sparkles className="size-4" /></span><div><h2 className="text-sm font-medium">{t("assistant.askGoal")}</h2><p className="mt-1 text-xs text-muted-foreground">{modeLabel(mode)}</p></div></div>
            <div className="mt-4"><Label htmlFor="assistant-question" className="text-xs">{mode === "concept_explanation" ? t("assistant.explainPrompt") : mode === "quiz" ? t("assistant.quizPrompt") : t("assistant.extraDirection")}</Label><Textarea id="assistant-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={4} placeholder={mode === "concept_explanation" ? "Example: Explain database indexing and when it helps." : mode === "revision_plan" ? "Example: Focus on the parts I need before the assignment." : mode === "quiz" ? "Example: Focus on indexing and query plans." : "Add any useful direction without pasting secrets or private credentials."} className="mt-2 min-h-28 resize-y rounded-xl" /></div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><p className="max-w-xl text-[0.66rem] leading-5 text-muted-foreground">{t("assistant.untrustedHint")}</p><Button type="submit" disabled={loading || !selected || (responseNeedsQuestion(mode) && !question.trim())} className="h-11 rounded-xl px-5">{loading ? <><LoaderCircle className="size-4 animate-spin" />{t("assistant.building")}</> : <>{t("assistant.ask")}<ChevronRight className="size-4" /></>}</Button></div>
            {error && <div role="alert" className="mt-4 flex gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.045] p-3 text-xs leading-5 text-foreground"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><div><p>{error}</p>{error.includes("unavailable") && <p className="mt-1 text-muted-foreground">Run the FastAPI sidecar on port 8000, or set <code>LUMAPATH_API_URL</code> for the Next.js proxy.</p>}</div></div>}
          </form>
        </Card>

        {loading && <Card className="rounded-2xl p-6" aria-live="polite"><div className="space-y-3"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-4/5" /><div className="grid gap-3 pt-2 sm:grid-cols-2"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div></div></Card>}

        {!loading && !response && !error && <Card className="rounded-2xl border-dashed p-6 text-center"><BrainCircuit className="mx-auto size-6 text-primary" /><h2 className="mt-3 text-sm font-medium">{t("assistant.contextFirst")}</h2><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted-foreground">{t("assistant.contextFirstDescription")}</p></Card>}

        {response && <div className="space-y-4" aria-live="polite">
          {response.locale_fallback && <Card role="status" className="rounded-2xl border-warning/25 bg-warning/[0.045] p-4 text-xs leading-5 text-muted-foreground"><AlertTriangle className="mr-2 inline size-4 text-warning" />{t("assistant.localeFallback", { language: requestedLanguage })}</Card>}
          <Card className="rounded-2xl border-primary/15 bg-primary/[0.025] p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="type-eyebrow text-primary">Luma · structured study help</p><h2 className="mt-2 font-heading text-xl sm:text-2xl">{response.title}</h2></div>{response.general_guidance && <span className="rounded-full border border-warning/25 bg-warning/[0.07] px-3 py-1.5 text-[0.62rem] text-warning">{t("assistant.generalGuidance")}</span>}</div><p className="mt-3 text-sm leading-6 text-foreground/90">{response.summary}</p><div className="mt-4 flex flex-wrap gap-2">{response.context_used.map((context) => <span key={`${context.kind}-${context.id}`} className="rounded-full border border-border bg-card px-3 py-1.5 text-[0.65rem] text-muted-foreground">{t("assistant.used", { label: context.label })}</span>)}{response.citations.map((citation) => <span key={citation.id} title={citation.note} className="rounded-full border border-primary/15 bg-primary/[0.035] px-3 py-1.5 text-[0.65rem] text-primary">{t("assistant.source", { title: citation.title, source: citation.source })}</span>)}</div></Card>

          {response.blocks.map((block, index) => <Card key={`${block.kind}-${index}`} className="rounded-2xl p-5 sm:p-6"><div className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-primary" /><h3 className="text-sm font-medium">{block.title}</h3></div>{block.body && <p className="mt-2 text-xs leading-6 text-muted-foreground">{block.body}</p>}{block.items.length > 0 && <div className="mt-4 space-y-2">{block.items.map((item) => <div key={item.id} className="rounded-xl border border-border/70 bg-white/[0.018] p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-medium text-foreground">{item.title}</p>{item.meta && <span className="shrink-0 text-[0.64rem] text-primary">{item.meta}</span>}</div>{item.detail && <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{item.detail}</p>}</div>)}</div>}{block.kind === "quiz" && block.quiz.length > 0 && <div className="mt-4 space-y-2">{block.quiz.map((item, questionIndex) => <div key={item.id} className="rounded-xl border border-border/70 p-3"><p className="text-xs font-medium">{questionIndex + 1}. {item.prompt}</p><p className="mt-2 text-[0.66rem] text-muted-foreground">{t("assistant.optionsEditable", { count: item.choices.length })}</p></div>)}</div>}</Card>)}

          <Card className="rounded-2xl p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary"><Sparkles className="size-3.5" /></span><div><h3 className="text-sm font-medium">{t("assistant.why")}</h3><p className="mt-2 text-xs leading-6 text-muted-foreground">{response.why_this}</p></div></div></Card>

          {response.warnings.length > 0 && <Card className="rounded-2xl border-warning/20 bg-warning/[0.035] p-5"><div className="flex gap-3"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" /><div><h3 className="text-sm font-medium">{t("assistant.notAssumed")}</h3><ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">{response.warnings.map((warning) => <li key={warning}>• {warning}</li>)}</ul></div></div></Card>}

          {actions.length > 0 && <Card className="rounded-2xl p-5 sm:p-6"><div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-end"><div><p className="type-eyebrow text-primary">{t("assistant.reviewGate")}</p><h3 className="mt-1 font-heading text-lg">{t("assistant.editBeforeSave")}</h3></div><p className="text-[0.66rem] text-muted-foreground">{t("assistant.reviewHint")}</p></div><div className="mt-4 space-y-3">{actions.map((action) => <ActionEditor key={action.id} action={action} saved={savedIds.has(action.id)} onPatch={(patch) => patchAction(action.id, patch)} onPatchQuiz={(index, patch) => patchQuiz(action.id, index, patch)} onSave={() => saveAction(action)} />)}</div></Card>}

          <div className="flex items-center justify-between rounded-2xl border border-border/70 px-4 py-3"><p className="text-xs text-muted-foreground">{t("assistant.useful")}</p><div className="flex gap-1"><Button variant={feedback === "up" ? "secondary" : "ghost"} size="icon-sm" disabled={Boolean(feedback)} onClick={() => submitFeedback(true)} aria-label={t("assistant.helpful")}><ThumbsUp className="size-3.5" /></Button><Button variant={feedback === "down" ? "secondary" : "ghost"} size="icon-sm" disabled={Boolean(feedback)} onClick={() => submitFeedback(false)} aria-label={t("assistant.notHelpful")}><ThumbsDown className="size-3.5" /></Button></div></div>
        </div>}
      </div>
    </div>
  </div>;
}

function ActionEditor({ action, saved, onPatch, onPatchQuiz, onSave }: { action: ProposedAssistantAction; saved: boolean; onPatch: (patch: Partial<ProposedAssistantAction>) => void; onPatchQuiz: (index: number, patch: Partial<AssistantQuizQuestion>) => void; onSave: () => void }) {
  const { t } = useLocale();
  if (action.kind === "quiz_set") return <div className="rounded-2xl border border-border/75 bg-white/[0.018] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-medium text-foreground">{action.title}</p><p className="mt-1 text-[0.66rem] text-muted-foreground">{t("assistant.editableQuiz", { count: action.quiz.length })}</p></div><Button onClick={onSave} disabled={saved || action.quiz.some((item) => !item.prompt.trim() || item.choices.some((choice) => !choice.trim()))} variant={saved ? "secondary" : "outline"} className="h-10 rounded-xl text-xs">{saved ? <><Check className="size-3.5" />{t("common.saved")}</> : <>{t("assistant.saveQuiz")}</>}</Button></div><div className="mt-4 space-y-4">{action.quiz.map((question, index) => <div key={question.id} className="rounded-xl border border-border/60 p-3"><Label htmlFor={`${action.id}-${question.id}`} className="text-[0.68rem]">{t("assistant.questionNumber", { number: index + 1 })}</Label><Input id={`${action.id}-${question.id}`} value={question.prompt} onChange={(event) => onPatchQuiz(index, { prompt: event.target.value })} className="mt-2 h-10 text-xs" maxLength={500} /> <div className="mt-3 grid gap-2 sm:grid-cols-2">{question.choices.map((choice, choiceIndex) => <div key={`${question.id}-${choiceIndex}`} className="flex items-center gap-2"><input type="radio" name={`${action.id}-${question.id}-answer`} checked={question.answer_index === choiceIndex} onChange={() => onPatchQuiz(index, { answer_index: choiceIndex })} aria-label={t("assistant.markOptionCorrect", { number: choiceIndex + 1 })} /><Input value={choice} onChange={(event) => onPatchQuiz(index, { choices: question.choices.map((item, itemIndex) => itemIndex === choiceIndex ? event.target.value : item) })} className="h-9 text-xs" maxLength={500} /></div>)}</div></div>)}</div></div>;

  const canSave = Boolean(action.estimated_minutes && action.start_at);
  return <div className="rounded-2xl border border-border/75 bg-white/[0.018] p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex items-center gap-2 text-[0.64rem] text-primary">{action.kind === "task" ? <ListTodo className="size-3.5" /> : <CalendarPlus className="size-3.5" />}{action.kind === "task" ? t("assistant.taskSuggestion") : t("assistant.plannerSuggestion")}</div><Input aria-label={t("assistant.suggestedItemTitle")} value={action.title} onChange={(event) => onPatch({ title: event.target.value })} maxLength={180} className="mt-2 h-10 text-xs" /></div><Button onClick={onSave} disabled={saved || !canSave || !action.title.trim()} variant={saved ? "secondary" : "outline"} className="h-10 rounded-xl text-xs">{saved ? <><Check className="size-3.5" />{t("common.saved")}</> : <>{t("assistant.approveSave")}</>}</Button></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><div><Label className="text-[0.66rem]">{t("assistant.duration")}</Label><div className="relative mt-1"><Clock3 className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" /><Input type="number" min={5} max={480} value={action.estimated_minutes ?? ""} onChange={(event) => onPatch({ estimated_minutes: Number(event.target.value) })} className="h-10 pl-9 text-xs" /></div></div><div><Label className="text-[0.66rem]">{t("assistant.start")}</Label><Input type="datetime-local" value={inputDateTime(action.start_at)} onChange={(event) => onPatch({ start_at: event.target.value ? `${event.target.value}:00` : null })} className="mt-1 h-10 text-xs" /></div></div>{action.description && <p className="mt-3 text-[0.68rem] leading-5 text-muted-foreground">{action.description}</p>}{!canSave && <p className="mt-3 text-[0.66rem] text-warning">{t("assistant.noSlot")}</p>}</div>;
}
