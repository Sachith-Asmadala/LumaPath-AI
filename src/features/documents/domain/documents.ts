import { demoScenario } from "@/data/demo/scenario";
import type { DemoState, TaskCategory } from "@/data/demo/types";
import { planningCapacityMinutes } from "@/features/capacity/domain/life-load";

export type DocumentKind = "pdf" | "slides" | "lab_sheet" | "research_paper" | "notes";
export type DocumentStatus = "queued" | "processing" | "ready" | "failed";

export interface DocumentSourceRef {
  chunk_id: string;
  locator_type: "page" | "slide" | "section" | "paragraphs";
  locator: string;
}

export interface DocumentLearningOutcome {
  id: string;
  text: string;
  source_refs: DocumentSourceRef[];
  derived: boolean;
}

export interface DocumentDateCandidate {
  id: string;
  label: string;
  raw_text: string;
  normalized_date?: string | null;
  confidence: number;
  official_status: "unconfirmed";
  requires_confirmation: boolean;
  source_refs: DocumentSourceRef[];
}

export interface DocumentFlashcard {
  id: string;
  front: string;
  back: string;
  source_refs: DocumentSourceRef[];
}

export interface DocumentQuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation: string;
  source_refs: DocumentSourceRef[];
}

export interface DocumentProposedAction {
  id: string;
  kind: "task" | "plan_item" | "flashcard_set" | "quiz_set";
  title: string;
  description: string;
  estimated_minutes?: number | null;
  start_at?: string | null;
  due_at?: string | null;
  category?: TaskCategory | string | null;
  date_confirmed: boolean;
  approval_status: "proposed" | "approved";
  source_refs: DocumentSourceRef[];
  flashcards: DocumentFlashcard[];
  quiz: DocumentQuizQuestion[];
}

export interface DocumentAnalysis {
  summary: string;
  summary_source_refs: DocumentSourceRef[];
  learning_outcomes: DocumentLearningOutcome[];
  dates: DocumentDateCandidate[];
  study_time_minutes: number;
  study_time_rationale: string;
  flashcards: DocumentFlashcard[];
  quiz: DocumentQuizQuestion[];
  proposed_actions: DocumentProposedAction[];
  warnings: string[];
}

export interface StudentDocument {
  id: string;
  owner_id: string;
  original_name: string;
  kind: DocumentKind;
  mime_type: string;
  size_bytes: number;
  sha256: string;
  status: DocumentStatus;
  scan_status: "clean" | "unavailable" | "skipped";
  module_id?: string | null;
  created_at: string;
  updated_at: string;
  retention_expires_at: string;
  processing_attempts: number;
  error_code?: string | null;
  error_message?: string | null;
  duplicate: boolean;
  analysis?: DocumentAnalysis | null;
}

export interface PlannerValidationContext {
  student_id: string;
  reference_date: string;
  planning_minutes: number;
  plan_blocks: Array<{ id: string; owner_id: string; title: string; start_at: string; end_at: string }>;
}

export const documentKindOptions: readonly { value: DocumentKind | "auto"; label: string; description: string }[] = [
  { value: "auto", label: "Auto-detect", description: "Use the file format as the document type." },
  { value: "pdf", label: "Lecture PDF", description: "Lecture notes or exported module material." },
  { value: "slides", label: "Lecture slides", description: "PowerPoint slides with slide-level references." },
  { value: "lab_sheet", label: "Lab sheet", description: "Practical instructions, worksheets or lab briefs." },
  { value: "research_paper", label: "Research paper", description: "Academic papers and reading material." },
  { value: "notes", label: "Study notes", description: "DOCX or UTF-8 text notes." },
] as const;

export function buildDocumentPlannerContext(state: DemoState): PlannerValidationContext {
  return {
    student_id: state.student.id,
    reference_date: demoScenario.date,
    planning_minutes: planningCapacityMinutes(state.capacity),
    plan_blocks: state.planBlocks.map((block) => ({
      id: block.id,
      owner_id: state.student.id,
      title: block.title,
      start_at: block.startAt,
      end_at: block.endAt,
    })),
  };
}

export function documentStatusLabel(status: DocumentStatus) {
  if (status === "queued") return "Queued";
  if (status === "processing") return "Processing";
  if (status === "ready") return "Ready";
  return "Failed";
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function isStudentDocument(value: unknown): value is StudentDocument {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === "string" && typeof item.original_name === "string" && ["queued", "processing", "ready", "failed"].includes(String(item.status));
}
