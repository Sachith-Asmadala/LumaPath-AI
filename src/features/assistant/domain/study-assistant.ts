import { demoScenario } from "@/data/demo/scenario";
import { learningResources } from "@/data/demo/resources";
import type { DemoState, TaskCategory } from "@/data/demo/types";
import { moduleNames } from "@/data/demo/onboarding";
import { planningCapacityMinutes } from "@/features/capacity/domain/life-load";
import type { SupportedLocale } from "@/i18n/config";

export type StudyAssistantMode = "concept_explanation" | "revision_plan" | "quiz" | "assignment_breakdown" | "todays_study_suggestion";
export type StudyContextKind = "module" | "task" | "learning_objective";

export interface StudyContextRef {
  kind: StudyContextKind;
  id: string;
  label: string;
}

export interface StudyContextOption extends StudyContextRef {
  description: string;
  meta?: string;
}

export interface AssistantQuizQuestion {
  id: string;
  prompt: string;
  choices: string[];
  answer_index: number;
  explanation: string;
}

export interface AssistantResponseItem {
  id: string;
  title: string;
  detail: string;
  meta?: string | null;
}

export interface AssistantResponseBlock {
  kind: "explanation" | "steps" | "plan" | "quiz" | "notice";
  title: string;
  body: string;
  items: AssistantResponseItem[];
  quiz: AssistantQuizQuestion[];
}

export interface ProposedAssistantAction {
  id: string;
  kind: "task" | "plan_item" | "quiz_set";
  title: string;
  source_context_ref: StudyContextRef;
  estimated_minutes?: number | null;
  start_at?: string | null;
  due_at?: string | null;
  category?: TaskCategory | string | null;
  description: string;
  quiz: AssistantQuizQuestion[];
}

export interface AssistantCitation {
  id: string;
  title: string;
  source: string;
  note: string;
}

export interface StudyAssistantResponse {
  response_id: string;
  session_id: string;
  mode: StudyAssistantMode;
  title: string;
  summary: string;
  blocks: AssistantResponseBlock[];
  context_used: StudyContextRef[];
  why_this: string;
  proposed_actions: ProposedAssistantAction[];
  citations: AssistantCitation[];
  warnings: string[];
  general_guidance: boolean;
  requested_locale: SupportedLocale;
  response_locale: SupportedLocale;
  locale_fallback: boolean;
}

export interface StudyAssistantRequest {
  session_id?: string;
  mode: StudyAssistantMode;
  context_ref: StudyContextRef;
  question: string;
  locale: SupportedLocale;
}

export const assistantModes: readonly { value: StudyAssistantMode; label: string; short: string; description: string }[] = [
  { value: "concept_explanation", label: "Explain a concept", short: "Explain", description: "Understand a concept without inventing course requirements." },
  { value: "revision_plan", label: "Build a revision plan", short: "Revision", description: "Create editable study blocks around your time and deadlines." },
  { value: "quiz", label: "Generate a quiz", short: "Quiz", description: "Create an editable retrieval quiz tied to your selected context." },
  { value: "assignment_breakdown", label: "Break down an assignment", short: "Breakdown", description: "Review smaller tasks before anything is added to Planner." },
  { value: "todays_study_suggestion", label: "Suggest what to study today", short: "Today", description: "Use deadlines, risk, capacity and goals to choose a next step." },
] as const;

function slug(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 80) || "module";
}

export function studyContextOptions(state: DemoState): StudyContextOption[] {
  const modules = new Map<string, StudyContextOption>();
  for (const name of moduleNames(state.onboarding.currentModules)) {
    modules.set(name.toLowerCase(), { kind: "module", id: `module-${slug(name)}`, label: name, description: "Authorised module from your Student Profile", meta: "Module" });
  }
  for (const task of state.tasks) {
    if (!task.module?.trim()) continue;
    const name = task.module.trim();
    if (!modules.has(name.toLowerCase())) modules.set(name.toLowerCase(), { kind: "module", id: `module-${slug(name)}`, label: name, description: "Module attached to one of your academic tasks", meta: "Module" });
  }
  const tasks: StudyContextOption[] = state.tasks
    .filter((task) => task.status !== "completed" && task.status !== "missed")
    .map((task) => ({
      kind: "task", id: task.id, label: task.title, description: task.description,
      meta: task.dueAt ? `Task · due ${new Date(task.dueAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Task",
    }));
  const objectives: StudyContextOption[] = state.careerSkills
    .filter((skill) => skill.status === "in-progress" || skill.status === "available" || skill.status === "gap")
    .map((skill) => ({ kind: "learning_objective", id: `skill-${skill.id}`, label: skill.name, description: skill.description, meta: `${skill.status.replaceAll("-", " ")} · ${skill.proficiency}%` }));
  if (state.learningGoal?.title) objectives.unshift({ kind: "learning_objective", id: "learning-goal", label: state.learningGoal.title, description: `Personal learning goal for ${state.learningGoal.targetDate}.`, meta: "Learning goal" });
  return [...modules.values(), ...tasks, ...objectives];
}

export function buildAssistantContextSnapshot(state: DemoState) {
  const ownerId = state.student.id;
  const modules = new Map<string, { id: string; owner_id: string; name: string }>();
  for (const option of studyContextOptions(state).filter((item) => item.kind === "module")) {
    modules.set(option.id, { id: option.id, owner_id: ownerId, name: option.label });
  }
  const bookmarked = new Set(state.resourceBookmarks);
  const materials = learningResources.filter((resource) => bookmarked.has(resource.id)).map((resource) => ({
    id: resource.id,
    owner_id: ownerId,
    title: resource.title,
    source: resource.provider,
    excerpt: `Saved ${resource.contentType}. Tags: ${resource.tags.join(", ")}. Use the linked source for authoritative details.`,
    skill: resource.skill,
  }));
  return {
    student_id: ownerId,
    target_role: state.student.targetRole,
    student_goal: state.onboarding.goal,
    reference_date: demoScenario.date,
    modules: [...modules.values()],
    tasks: state.tasks.map((task) => ({
      id: task.id,
      owner_id: ownerId,
      title: task.title,
      category: task.category,
      status: task.status,
      estimated_minutes: task.estimatedMinutes,
      due_at: task.dueAt ?? null,
      progress: task.progress,
      risk_score: task.riskScore,
      description: task.description,
      module: task.module ?? null,
      career_skill_ids: task.careerSkillIds,
    })),
    learning_objectives: studyContextOptions(state).filter((item) => item.kind === "learning_objective").map((item) => ({
      id: item.id,
      owner_id: ownerId,
      title: item.label,
      description: item.description,
      status: item.meta?.split(" · ")[0] ?? "active",
    })),
    capacity: {
      available_minutes: state.capacity.availableMinutes,
      unexpected_commitment_minutes: state.capacity.unexpectedCommitmentMinutes,
      energy: state.capacity.energy,
      focus: state.capacity.focus,
      workload: state.capacity.workload,
      planning_minutes: planningCapacityMinutes(state.capacity),
    },
    plan_blocks: state.planBlocks.map((block) => ({ id: block.id, owner_id: ownerId, title: block.title, start_at: block.startAt, end_at: block.endAt, is_fixed: Boolean(block.isFixed) })),
    materials,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isStudyAssistantResponse(value: unknown): value is StudyAssistantResponse {
  if (!isObject(value)) return false;
  if (typeof value.response_id !== "string" || typeof value.session_id !== "string" || typeof value.title !== "string" || typeof value.summary !== "string" || typeof value.why_this !== "string") return false;
  if (!assistantModes.some((mode) => mode.value === value.mode)) return false;
  if (!Array.isArray(value.blocks) || value.blocks.length === 0 || !Array.isArray(value.context_used) || value.context_used.length === 0 || !Array.isArray(value.proposed_actions) || !Array.isArray(value.citations) || !Array.isArray(value.warnings) || typeof value.general_guidance !== "boolean") return false;
  if (!(["en", "si-LK", "ta-LK"] as const).includes(value.requested_locale as SupportedLocale) || !(["en", "si-LK", "ta-LK"] as const).includes(value.response_locale as SupportedLocale) || typeof value.locale_fallback !== "boolean") return false;
  return value.blocks.every((block) => isObject(block) && typeof block.kind === "string" && typeof block.title === "string" && typeof block.body === "string" && Array.isArray(block.items) && Array.isArray(block.quiz));
}

export function responseNeedsQuestion(mode: StudyAssistantMode) {
  return mode === "concept_explanation";
}
