"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent } from "react";
import {
  AlertTriangle,
  BookOpenCheck,
  Check,
  Clock3,
  FileCheck2,
  FileQuestion,
  FileText,
  Files,
  LoaderCircle,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Reveal } from "@/components/motion/animated";
import { TypographyH1, TypographyP } from "@/components/shared/typography";
import { studyContextOptions } from "@/features/assistant/domain/study-assistant";
import {
  buildDocumentPlannerContext,
  documentKindOptions,
  formatBytes,
  type DocumentFlashcard,
  type DocumentKind,
  type DocumentProposedAction,
  type DocumentQuizQuestion,
  type DocumentSourceRef,
  type StudentDocument,
} from "@/features/documents/domain/documents";
import {
  approveDocumentAction,
  deleteStudentDocument,
  DocumentApiError,
  listStudentDocuments,
  retryStudentDocument,
  uploadStudentDocument,
} from "@/features/documents/services/documents";
import { useDemo } from "@/state/demo-provider";
import { useLocale } from "@/i18n";
import type { TaskCategory } from "@/data/demo/types";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".pdf", ".pptx", ".docx", ".txt"];
const validCategories: readonly TaskCategory[] = ["Academic", "Career", "career-learning", "Personal", "Internship", "AI Recommended"];

function categoryOf(value?: string | null): TaskCategory {
  return validCategories.includes(value as TaskCategory) ? value as TaskCategory : "Academic";
}

function statusProgress(status: StudentDocument["status"]) {
  if (status === "queued") return 18;
  if (status === "processing") return 68;
  return 100;
}

function statusClass(status: StudentDocument["status"]) {
  if (status === "ready") return "border-success/20 bg-success/8 text-success";
  if (status === "failed") return "border-risk/25 bg-risk/10 text-risk";
  if (status === "processing") return "border-primary/20 bg-primary/8 text-primary";
  return "border-border bg-muted/50 text-muted-foreground";
}

function inputDateTime(value?: string | null) {
  return value ? value.slice(0, 16) : "";
}

function sourceLabel(refs: DocumentSourceRef[]) {
  return refs.map((ref) => ref.locator).join(" · ");
}

function SourceChips({ refs }: { refs: DocumentSourceRef[] }) {
  const { t } = useLocale();
  if (!refs.length) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5" aria-label={t("documents.sourceLocations")}>{refs.map((ref) => <span key={`${ref.chunk_id}-${ref.locator}`} className="rounded-md border border-border/70 bg-muted/40 px-2 py-1 font-mono text-[0.58rem] text-muted-foreground">{ref.locator}</span>)}</div>;
}

export default function DocumentsPage() {
  const { state, addTask } = useDemo();
  const { t, formatDate } = useLocale();
  const [documents, setDocuments] = useState<StudentDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<DocumentKind | "auto">("auto");
  const [moduleId, setModuleId] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [actions, setActions] = useState<DocumentProposedAction[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [deleteArmed, setDeleteArmed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const moduleOptions = useMemo(() => studyContextOptions(state).filter((item) => item.kind === "module"), [state]);
  const selected = documents.find((item) => item.id === selectedId) ?? null;
  const pending = documents.some((item) => item.status === "queued" || item.status === "processing");

  const refresh = async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const next = await listStudentDocuments(state.student.id);
      setDocuments(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id ?? ""));
      if (!quiet) setError("");
    } catch (requestError) {
      if (!quiet) setError(requestError instanceof Error ? requestError.message : "Documents could not be loaded.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, [state.student.id]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setInterval(() => { void refresh(true); }, 1200);
    return () => window.clearInterval(timer);
  }, [pending, state.student.id]);

  useEffect(() => {
    if (selected?.status === "ready" && selected.analysis) {
      setActions(selected.analysis.proposed_actions.map((item) => structuredClone(item)));
      setSavedIds(new Set(selected.analysis.proposed_actions.filter((item) => item.approval_status === "approved").map((item) => item.id)));
    } else {
      setActions([]);
      setSavedIds(new Set());
    }
    setDeleteArmed(false);
  }, [selected?.id, selected?.updated_at, selected?.status]);

  const validatePickedFile = (picked: File) => {
    const extension = `.${picked.name.split(".").pop()?.toLowerCase() ?? ""}`;
    if (!ACCEPTED_EXTENSIONS.includes(extension)) return "Use a PDF, PPTX, DOCX or UTF-8 TXT file.";
    if (picked.size > MAX_UPLOAD_BYTES) return "This file is larger than the 15 MB upload limit.";
    if (!picked.size) return "The selected file is empty.";
    return "";
  };

  const chooseFile = (picked: File | null) => {
    if (!picked) return;
    const issue = validatePickedFile(picked);
    if (issue) { setError(issue); setFile(null); return; }
    setError("");
    setFile(picked);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files.item(0));
  };

  const submitUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) { setError("Choose a document before uploading."); return; }
    const issue = validatePickedFile(file);
    if (issue) { setError(issue); return; }
    setUploading(true);
    setError("");
    try {
      const record = await uploadStudentDocument(state.student.id, file, kind, moduleId || null);
      setDocuments((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      setSelectedId(record.id);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      toast.success(record.duplicate ? "This document was already uploaded; the existing analysis was opened." : "Document accepted and queued for private processing.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "The document could not be uploaded.");
    } finally {
      setUploading(false);
    }
  };

  const patchAction = (id: string, patch: Partial<DocumentProposedAction>) => setActions((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  const patchFlashcard = (actionId: string, cardIndex: number, patch: Partial<DocumentFlashcard>) => setActions((current) => current.map((item) => item.id !== actionId ? item : { ...item, flashcards: item.flashcards.map((card, index) => index === cardIndex ? { ...card, ...patch } : card) }));
  const patchQuiz = (actionId: string, questionIndex: number, patch: Partial<DocumentQuizQuestion>) => setActions((current) => current.map((item) => item.id !== actionId ? item : { ...item, quiz: item.quiz.map((question, index) => index === questionIndex ? { ...question, ...patch } : question) }));
  const patchQuizChoice = (actionId: string, questionIndex: number, choiceIndex: number, value: string) => setActions((current) => current.map((item) => item.id !== actionId ? item : { ...item, quiz: item.quiz.map((question, index) => index !== questionIndex ? question : { ...question, choices: question.choices.map((choice, inner) => inner === choiceIndex ? value : choice) }) }));

  const saveAction = async (action: DocumentProposedAction) => {
    if (!selected) return;
    try {
      await approveDocumentAction(state.student.id, selected.id, action, buildDocumentPlannerContext(state));
      if ((action.kind === "task" || action.kind === "plan_item") && action.estimated_minutes && action.start_at) {
        addTask({
          title: action.title,
          category: categoryOf(action.category),
          estimatedMinutes: action.estimated_minutes,
          dueAt: action.due_at ?? undefined,
          startAt: action.start_at,
          description: `${action.description}${action.source_refs.length ? ` Source: ${sourceLabel(action.source_refs)}.` : ""}`,
        });
      }
      setSavedIds((current) => new Set(current).add(action.id));
      toast.success(action.kind === "flashcard_set" ? "Edited flashcards approved and saved." : action.kind === "quiz_set" ? "Edited quiz approved and saved." : "Approved study action added to Planner.");
    } catch (requestError) {
      toast.error(requestError instanceof DocumentApiError ? requestError.message : "This action could not be saved.");
    }
  };

  const retry = async () => {
    if (!selected) return;
    try {
      await retryStudentDocument(state.student.id, selected.id);
      setDocuments((current) => current.map((item) => item.id === selected.id ? { ...item, status: "queued", error_code: null, error_message: null } : item));
      toast.success("Document queued for another processing attempt.");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Retry could not be started.");
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!deleteArmed) { setDeleteArmed(true); return; }
    try {
      await deleteStudentDocument(state.student.id, selected.id);
      setDocuments((current) => current.filter((item) => item.id !== selected.id));
      setSelectedId(documents.find((item) => item.id !== selected.id)?.id ?? "");
      setDeleteArmed(false);
      toast.success("Source file and derived study data deleted together.");
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : "Document could not be deleted.");
    }
  };

  return <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
    <Reveal className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div className="max-w-3xl">
        <div className="mb-2 flex items-center gap-2 text-[0.62rem] font-medium uppercase tracking-[0.16em] text-primary"><Files className="size-3.5" />{t("documents.eyebrow")}</div>
        <TypographyH1>{t("documents.title")}</TypographyH1>
        <TypographyP className="mt-2 max-w-2xl text-sm text-muted-foreground">{t("documents.subtitle")}</TypographyP>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" className="h-10 rounded-xl text-xs"><Link href="/study-assistant"><Sparkles className="size-3.5" />{t("documents.openAssistant")}</Link></Button>
        <Button onClick={() => void refresh()} variant="ghost" className="h-10 rounded-xl text-xs"><RefreshCcw className="size-3.5" />{t("common.refresh")}</Button>
      </div>
    </Reveal>

    {error && <Card role="alert" className="mb-5 flex items-start gap-3 rounded-2xl border-risk/20 bg-risk/5 p-4 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk" /><div><p className="font-medium text-foreground">{t("documents.attention")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{error}</p></div></Card>}

    <div className="grid gap-5 xl:grid-cols-[390px_minmax(0,1fr)]">
      <div className="space-y-5">
        <Card className="rounded-[20px] p-5">
          <div className="mb-4 flex items-center gap-2"><UploadCloud className="size-4 text-primary" /><h2 className="text-sm font-medium">{t("documents.uploadMaterial")}</h2></div>
          <form onSubmit={submitUpload} className="space-y-4">
            <input ref={inputRef} type="file" accept=".pdf,.pptx,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" className="sr-only" onChange={(event) => chooseFile(event.target.files?.item(0) ?? null)} />
            <div
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`rounded-2xl border border-dashed p-5 text-center transition-colors ${dragging ? "border-primary/50 bg-primary/5" : "border-border bg-muted/20"}`}
            >
              <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-xl border border-border bg-background"><FileText className="size-4 text-primary" /></div>
              <p className="text-sm font-medium">{file ? file.name : t("documents.drop")}</p>
              <p className="mt-1 text-[0.68rem] leading-5 text-muted-foreground">{file ? `${formatBytes(file.size)} · ${t("documents.readyValidation")}` : t("documents.supported")}</p>
              <Button type="button" variant="outline" className="mt-3 h-9 rounded-xl text-xs" onClick={() => inputRef.current?.click()}>{t("documents.chooseFile")}</Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div><Label htmlFor="document-kind" className="text-[0.68rem]">{t("documents.type")}</Label><select id="document-kind" value={kind} onChange={(event) => setKind(event.target.value as DocumentKind | "auto")} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring">{documentKindOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
              <div><Label htmlFor="document-module" className="text-[0.68rem]">{t("documents.moduleOptional")}</Label><select id="document-module" value={moduleId} onChange={(event) => setModuleId(event.target.value)} className="mt-1 h-10 w-full rounded-xl border border-input bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">{t("documents.noModule")}</option>{moduleOptions.map((module) => <option key={module.id} value={module.id}>{module.label}</option>)}</select></div>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/25 p-3 text-[0.66rem] leading-5 text-muted-foreground"><ShieldCheck className="mr-1.5 inline size-3.5 text-success" />{t("documents.securityHint")}</div>
            <Button type="submit" disabled={!file || uploading} className="h-10 w-full rounded-xl text-xs">{uploading ? <><LoaderCircle className="size-3.5 animate-spin motion-reduce:animate-none" />{t("documents.validating")}</> : <><UploadCloud className="size-3.5" />{t("documents.uploadProcess")}</>}</Button>
          </form>
        </Card>

        <Card className="rounded-[20px] p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-medium">{t("documents.library")}</h2><Badge variant="outline" className="rounded-full text-[0.6rem]">{documents.length}</Badge></div>
          {loading ? <div className="space-y-2"><Skeleton className="h-20 rounded-xl" /><Skeleton className="h-20 rounded-xl" /></div> : documents.length ? <div className="space-y-2">{documents.map((document) => <button key={document.id} type="button" onClick={() => setSelectedId(document.id)} className={`w-full rounded-xl border p-3 text-left transition-colors ${selectedId === document.id ? "border-primary/25 bg-primary/5" : "border-border/70 bg-muted/15 hover:bg-muted/35"}`}>
            <div className="flex items-start gap-3"><div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-border bg-background"><FileText className="size-3.5 text-primary" /></div><div className="min-w-0 flex-1"><p className="truncate text-xs font-medium text-foreground">{document.original_name}</p><p className="mt-1 text-[0.62rem] text-muted-foreground">{formatBytes(document.size_bytes)} · {document.kind.replaceAll("_", " ")}</p><div className="mt-2 flex items-center gap-2"><Badge variant="outline" className={`rounded-full px-2 py-0.5 text-[0.58rem] ${statusClass(document.status)}`}>{document.status === "queued" ? t("documents.queued") : document.status === "processing" ? t("documents.processing") : document.status === "ready" ? t("documents.ready") : t("documents.failed")}</Badge>{document.duplicate && <span className="text-[0.58rem] text-muted-foreground">{t("documents.existingUpload")}</span>}</div></div></div>
            {(document.status === "queued" || document.status === "processing") && <Progress value={statusProgress(document.status)} className="mt-3" />}
          </button>)}</div> : <div className="rounded-xl border border-dashed border-border p-5 text-center"><Files className="mx-auto size-5 text-muted-foreground" /><p className="mt-2 text-xs font-medium">{t("documents.noFiles")}</p><p className="mt-1 text-[0.65rem] leading-5 text-muted-foreground">{t("documents.noFilesHint")}</p></div>}
        </Card>
      </div>

      <div className="min-w-0">
        {!selected ? <Card className="flex min-h-[520px] items-center justify-center rounded-[20px] p-8 text-center"><div className="max-w-md"><BookOpenCheck className="mx-auto size-8 text-muted-foreground" /><h2 className="mt-4 text-lg font-medium">{t("documents.chooseUpload")}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{t("documents.chooseUploadHint")}</p></div></Card> : <DocumentWorkspace
          document={selected}
          actions={actions}
          savedIds={savedIds}
          deleteArmed={deleteArmed}
          onPatchAction={patchAction}
          onPatchFlashcard={patchFlashcard}
          onPatchQuiz={patchQuiz}
          onPatchQuizChoice={patchQuizChoice}
          onSave={saveAction}
          onRetry={retry}
          onDelete={remove}
          onCancelDelete={() => setDeleteArmed(false)}
        />}
      </div>
    </div>
  </div>;
}

function DocumentWorkspace({
  document,
  actions,
  savedIds,
  deleteArmed,
  onPatchAction,
  onPatchFlashcard,
  onPatchQuiz,
  onPatchQuizChoice,
  onSave,
  onRetry,
  onDelete,
  onCancelDelete,
}: {
  document: StudentDocument;
  actions: DocumentProposedAction[];
  savedIds: Set<string>;
  deleteArmed: boolean;
  onPatchAction: (id: string, patch: Partial<DocumentProposedAction>) => void;
  onPatchFlashcard: (actionId: string, cardIndex: number, patch: Partial<DocumentFlashcard>) => void;
  onPatchQuiz: (actionId: string, questionIndex: number, patch: Partial<DocumentQuizQuestion>) => void;
  onPatchQuizChoice: (actionId: string, questionIndex: number, choiceIndex: number, value: string) => void;
  onSave: (action: DocumentProposedAction) => Promise<void>;
  onRetry: () => Promise<void>;
  onDelete: () => Promise<void>;
  onCancelDelete: () => void;
}) {
  const { t, formatDate, formatTime, formatNumber } = useLocale();
  const analysis = document.analysis;
  return <div className="space-y-5">
    <Card className="rounded-[20px] p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline" className={`rounded-full px-2.5 py-1 text-[0.62rem] ${statusClass(document.status)}`}>{document.status === "queued" ? t("documents.queued") : document.status === "processing" ? t("documents.processing") : document.status === "ready" ? t("documents.ready") : t("documents.failed")}</Badge><span className="font-mono text-[0.6rem] text-muted-foreground">{document.kind.replaceAll("_", " ")}</span></div><h2 className="mt-3 truncate font-heading text-xl font-semibold tracking-tight">{document.original_name}</h2><p className="mt-1 text-xs text-muted-foreground">{formatBytes(document.size_bytes)} · {t("documents.privateRetention", { date: formatDate(document.retention_expires_at) })} · {t("documents.malwareScan", { status: document.scan_status })}</p></div><div className="flex flex-wrap gap-2">{document.status === "failed" && <Button onClick={() => void onRetry()} variant="outline" className="h-9 rounded-xl text-xs"><RefreshCcw className="size-3.5" />{t("documents.retry")}</Button>}<Button onClick={() => void onDelete()} variant={deleteArmed ? "destructive" : "ghost"} className="h-9 rounded-xl text-xs"><Trash2 className="size-3.5" />{deleteArmed ? t("documents.confirmDelete") : t("documents.delete")}</Button>{deleteArmed && <Button onClick={onCancelDelete} variant="ghost" className="h-9 rounded-xl text-xs">{t("documents.cancelDelete")}</Button>}</div></div>
      {(document.status === "queued" || document.status === "processing") && <div className="mt-5 rounded-2xl border border-border/70 bg-muted/20 p-4" role="status" aria-live="polite"><div className="flex items-center gap-2 text-sm font-medium"><LoaderCircle className="size-4 animate-spin text-primary motion-reduce:animate-none" />{document.status === "queued" ? t("documents.waitingWorker") : t("documents.extracting")}</div><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("documents.backgroundHint")}</p><Progress value={statusProgress(document.status)} className="mt-3" /></div>}
      {document.status === "failed" && <div className="mt-5 rounded-2xl border border-risk/20 bg-risk/5 p-4"><div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-risk" /><div><p className="text-sm font-medium">{t("documents.failedSafe")}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{document.error_message ?? "The file could not be processed. Retry it or upload a clean copy."}</p><p className="mt-2 font-mono text-[0.58rem] text-muted-foreground">Attempt {document.processing_attempts}</p></div></div></div>}
    </Card>

    {document.status === "ready" && analysis && <Tabs defaultValue="insights" className="gap-4">
      <TabsList variant="line" className="h-auto flex-wrap justify-start gap-2"><TabsTrigger value="insights" className="h-9 px-3 text-xs">{t("documents.insights")}</TabsTrigger><TabsTrigger value="dates" className="h-9 px-3 text-xs">{t("documents.datesActions")}</TabsTrigger><TabsTrigger value="flashcards" className="h-9 px-3 text-xs">{t("documents.flashcards")}</TabsTrigger><TabsTrigger value="quiz" className="h-9 px-3 text-xs">{t("documents.quiz")}</TabsTrigger></TabsList>

      <TabsContent value="insights" className="space-y-4">
        {analysis.warnings.map((warning) => <Card key={warning} className="rounded-2xl border-warning/20 bg-warning/5 p-4"><p className="text-xs leading-5 text-muted-foreground"><AlertTriangle className="mr-1.5 inline size-3.5 text-warning" />{warning}</p></Card>)}
        <Card className="rounded-[20px] p-5"><div className="flex items-center gap-2"><FileCheck2 className="size-4 text-primary" /><h3 className="text-sm font-medium">{t("documents.groundedSummary")}</h3></div><p className="mt-3 text-sm leading-7 text-foreground/90">{analysis.summary}</p><SourceChips refs={analysis.summary_source_refs} /></Card>
        <Card className="rounded-[20px] p-5"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><BookOpenCheck className="size-4 text-primary" /><h3 className="text-sm font-medium">{t("documents.outcomes")}</h3></div><Badge variant="outline" className="rounded-full text-[0.6rem]">{analysis.learning_outcomes.length}</Badge></div><div className="mt-4 space-y-3">{analysis.learning_outcomes.map((outcome, index) => <div key={outcome.id} className="rounded-xl border border-border/70 bg-muted/15 p-3"><div className="flex gap-3"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/8 font-mono text-[0.62rem] text-primary">{index + 1}</span><div><p className="text-xs leading-5 text-foreground">{outcome.text}</p>{outcome.derived && <p className="mt-1 text-[0.6rem] text-warning">{t("documents.derivedOutcome")}</p>}<SourceChips refs={outcome.source_refs} /></div></div></div>)}</div></Card>
        <Card className="rounded-[20px] p-5"><div className="flex items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Clock3 className="size-4 text-primary" /><h3 className="text-sm font-medium">{t("documents.studyTime")}</h3></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{analysis.study_time_rationale}</p></div><strong className="font-heading text-2xl text-primary">{t("common.minutes", { count: formatNumber(analysis.study_time_minutes) })}</strong></div></Card>
      </TabsContent>

      <TabsContent value="dates" className="space-y-4">
        <Card className="rounded-[20px] p-5"><div className="flex items-center justify-between"><div><h3 className="text-sm font-medium">{t("documents.foundDates")}</h3><p className="mt-1 text-xs text-muted-foreground">{t("documents.dateUnconfirmed")}</p></div><Badge variant="outline" className="rounded-full text-[0.6rem]">{analysis.dates.length}</Badge></div>{analysis.dates.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{analysis.dates.map((candidate) => <div key={candidate.id} className="rounded-xl border border-border/70 bg-muted/15 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-medium">{candidate.label}</p><span className="font-mono text-[0.58rem] text-warning">{t("documents.confidenceUnconfirmed", { value: formatNumber(Math.round(candidate.confidence * 100)) })}</span></div><p className="mt-2 text-xs leading-5 text-muted-foreground">{candidate.raw_text}</p>{candidate.normalized_date && <p className="mt-2 text-[0.66rem] text-foreground">{t("documents.parsedDate", { date: formatDate(candidate.normalized_date) })}</p>}<SourceChips refs={candidate.source_refs} /></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">{t("documents.noDates")}</div>}</Card>
        <ActionReview actions={actions.filter((item) => item.kind === "task" || item.kind === "plan_item")} savedIds={savedIds} onPatch={onPatchAction} onSave={onSave} />
      </TabsContent>

      <TabsContent value="flashcards" className="space-y-4"><StudyToolEditor actions={actions.filter((item) => item.kind === "flashcard_set")} savedIds={savedIds} onPatchFlashcard={onPatchFlashcard} onPatchQuiz={onPatchQuiz} onPatchQuizChoice={onPatchQuizChoice} onSave={onSave} mode="flashcards" /></TabsContent>
      <TabsContent value="quiz" className="space-y-4"><StudyToolEditor actions={actions.filter((item) => item.kind === "quiz_set")} savedIds={savedIds} onPatchFlashcard={onPatchFlashcard} onPatchQuiz={onPatchQuiz} onPatchQuizChoice={onPatchQuizChoice} onSave={onSave} mode="quiz" /></TabsContent>
    </Tabs>}
  </div>;
}

function ActionReview({ actions, savedIds, onPatch, onSave }: { actions: DocumentProposedAction[]; savedIds: Set<string>; onPatch: (id: string, patch: Partial<DocumentProposedAction>) => void; onSave: (action: DocumentProposedAction) => Promise<void> }) {
  const { t, formatDate, formatTime } = useLocale();
  return <Card className="rounded-[20px] p-5"><div className="mb-4"><h3 className="text-sm font-medium">{t("documents.reviewPlanner")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("documents.reviewPlannerHint")}</p></div><div className="space-y-4">{actions.map((action) => {
    const saved = savedIds.has(action.id);
    return <div key={action.id} className="rounded-2xl border border-border/70 bg-muted/15 p-4"><div className="grid gap-3 lg:grid-cols-2"><div className="lg:col-span-2"><Label className="text-[0.66rem]">{t("documents.titleField")}</Label><Input aria-label={t("documents.actionTitleLabel", { title: action.title })} value={action.title} onChange={(event) => onPatch(action.id, { title: event.target.value })} className="mt-1 h-10 text-xs" /></div><div><Label className="text-[0.66rem]">{t("documents.studyMinutes")}</Label><Input aria-label={t("documents.studyTimeLabel", { title: action.title })} type="number" min={5} max={480} value={action.estimated_minutes ?? ""} onChange={(event) => onPatch(action.id, { estimated_minutes: Number(event.target.value) })} className="mt-1 h-10 text-xs" /></div><div><Label className="text-[0.66rem]">{t("documents.plannerStart")}</Label><Input aria-label={t("documents.plannerStartLabel", { title: action.title })} type="datetime-local" value={inputDateTime(action.start_at)} onChange={(event) => onPatch(action.id, { start_at: event.target.value ? `${event.target.value}:00` : null })} className="mt-1 h-10 text-xs" /></div>{action.due_at && <div className="lg:col-span-2 rounded-xl border border-warning/20 bg-warning/5 p-3"><div className="flex items-start gap-2"><Checkbox id={`confirm-${action.id}`} checked={action.date_confirmed} onCheckedChange={(value) => onPatch(action.id, { date_confirmed: value === true })} /><Label htmlFor={`confirm-${action.id}`} className="cursor-pointer text-xs leading-5">{t("documents.confirmDate")}</Label></div><p className="mt-2 text-[0.64rem] text-muted-foreground">{t("documents.candidateDate", { date: `${formatDate(action.due_at)} ${formatTime(action.due_at)}` })}</p></div>}<div className="lg:col-span-2"><Label className="text-[0.66rem]">{t("documents.description")}</Label><Textarea aria-label={t("documents.descriptionLabel", { title: action.title })} value={action.description} onChange={(event) => onPatch(action.id, { description: event.target.value })} className="mt-1 min-h-20 text-xs" /></div></div><SourceChips refs={action.source_refs} /><div className="mt-4 flex items-center justify-between gap-3"><p className="text-[0.62rem] text-muted-foreground">{t("documents.serverRevalidation")}</p><Button disabled={saved || !action.start_at || Boolean(action.due_at && !action.date_confirmed)} onClick={() => void onSave(action)} className="h-9 shrink-0 rounded-xl text-xs">{saved ? <><Check className="size-3.5" />{t("common.saved")}</> : t("documents.approveSave")}</Button></div></div>;
  })}{!actions.length && <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">{t("documents.noActions")}</div>}</div></Card>;
}

function StudyToolEditor({ actions, savedIds, onPatchFlashcard, onPatchQuiz, onPatchQuizChoice, onSave, mode }: { actions: DocumentProposedAction[]; savedIds: Set<string>; onPatchFlashcard: (actionId: string, cardIndex: number, patch: Partial<DocumentFlashcard>) => void; onPatchQuiz: (actionId: string, questionIndex: number, patch: Partial<DocumentQuizQuestion>) => void; onPatchQuizChoice: (actionId: string, questionIndex: number, choiceIndex: number, value: string) => void; onSave: (action: DocumentProposedAction) => Promise<void>; mode: "flashcards" | "quiz" }) {
  const { t, formatNumber } = useLocale();
  const typeLabel = mode === "flashcards" ? t("documents.flashcards") : t("documents.quiz");
  const action = actions[0];
  if (!action) return <Card className="rounded-[20px] p-8 text-center"><FileQuestion className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{t("documents.noGenerated", { type: typeLabel })}</p><p className="mt-1 text-xs text-muted-foreground">{t("documents.noGeneratedHint", { type: typeLabel })}</p></Card>;
  const saved = savedIds.has(action.id);
  return <Card className="rounded-[20px] p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h3 className="text-sm font-medium">{mode === "flashcards" ? t("documents.editableFlashcards") : t("documents.editableQuiz")}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{t("documents.editToolsHint")}</p></div><Button disabled={saved} onClick={() => void onSave(action)} className="h-9 rounded-xl text-xs">{saved ? <><Check className="size-3.5" />{t("common.saved")}</> : t("documents.approveType", { type: typeLabel })}</Button></div>
    <div className="mt-5 space-y-4">{mode === "flashcards" ? action.flashcards.map((card, index) => <div key={card.id} className="rounded-2xl border border-border/70 bg-muted/15 p-4"><p className="mb-3 font-mono text-[0.6rem] text-muted-foreground">{t("documents.flashcards")} {formatNumber(index + 1)}</p><Label className="text-[0.66rem]">{t("documents.front")}</Label><Textarea aria-label={t("documents.flashcardFrontLabel", { number: formatNumber(index + 1) })} value={card.front} onChange={(event) => onPatchFlashcard(action.id, index, { front: event.target.value })} className="mt-1 min-h-16 text-xs" /><Label className="mt-3 block text-[0.66rem]">{t("documents.back")}</Label><Textarea aria-label={t("documents.flashcardBackLabel", { number: formatNumber(index + 1) })} value={card.back} onChange={(event) => onPatchFlashcard(action.id, index, { back: event.target.value })} className="mt-1 min-h-20 text-xs" /><SourceChips refs={card.source_refs} /></div>) : action.quiz.map((question, index) => <div key={question.id} className="rounded-2xl border border-border/70 bg-muted/15 p-4"><p className="mb-3 font-mono text-[0.6rem] text-muted-foreground">{t("documents.quiz")} {formatNumber(index + 1)}</p><Label className="text-[0.66rem]">{t("documents.prompt")}</Label><Textarea aria-label={t("documents.quizPromptLabel", { number: formatNumber(index + 1) })} value={question.prompt} onChange={(event) => onPatchQuiz(action.id, index, { prompt: event.target.value })} className="mt-1 min-h-16 text-xs" /><div className="mt-3 grid gap-2">{question.choices.map((choice, choiceIndex) => <div key={`${question.id}-${choiceIndex}`} className="flex items-center gap-2"><span className={`flex size-6 shrink-0 items-center justify-center rounded-lg text-[0.62rem] ${choiceIndex === question.answer_index ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}>{String.fromCharCode(65 + choiceIndex)}</span><Input aria-label={t("documents.quizChoiceLabel", { question: formatNumber(index + 1), choice: formatNumber(choiceIndex + 1) })} value={choice} onChange={(event) => onPatchQuizChoice(action.id, index, choiceIndex, event.target.value)} className="h-9 text-xs" /></div>)}</div><Label className="mt-3 block text-[0.66rem]">{t("documents.explanation")}</Label><Textarea aria-label={t("documents.quizExplanationLabel", { number: formatNumber(index + 1) })} value={question.explanation} onChange={(event) => onPatchQuiz(action.id, index, { explanation: event.target.value })} className="mt-1 min-h-16 text-xs" /><SourceChips refs={question.source_refs} /></div>)}</div>
  </Card>;
}
