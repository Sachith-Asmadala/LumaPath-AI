import type { DemoState, PlanBlock, Task } from "@/data/demo/types";
import { planningCapacityMinutes } from "@/features/capacity/domain/life-load";

export type PathwayPace = "light" | "balanced" | "ambitious";
export type PathwayStatus = "draft" | "active" | "superseded" | "rejected";
export type MilestoneState = "credited" | "completed" | "in_progress" | "available" | "locked";

export interface LearningResourceView {
  id: string;
  title: string;
  source: string;
  source_url: string | null;
  cost_type: string | null;
  price_usd: number | null;
  language: string | null;
  format: string | null;
  estimated_minutes: number | null;
  resource_type?: string | null;
  quality_score?: number | null;
  metadata_complete: boolean;
  ranking_reason: string;
}

export interface PathwayStepView {
  id: string;
  skill_id: string;
  name: string;
  order: number;
  prerequisites: string[];
  state: MilestoneState;
  proficiency: number;
  estimated_minutes: number;
  target_evidence: string[];
  evidence_refs: string[];
  transferable_credit: boolean;
  completion_source: string | null;
  selected_resource: LearningResourceView | null;
  alternative_resources: LearningResourceView[];
  resource_decision: "recommended" | "accepted" | "deferred" | "replaced";
  resource_reason: string | null;
}

export interface WeeklyActionView {
  id: string;
  step_id: string;
  skill_id: string;
  title: string;
  week_start: string;
  start_at: string;
  end_at: string;
  planned_minutes: number;
  status: "draft" | "approved" | "deferred";
  prerequisite_ready: boolean;
  rationale: string;
  source_label: string;
  internal_task_id: string | null;
}

export interface ChangeSummaryView {
  added_skills: string[];
  removed_skills: string[];
  preserved_completed_skills: string[];
  moved_weekly_actions: string[];
  resource_changes: string[];
  explanations: string[];
}

export interface PathwayView {
  id: string;
  version: number;
  status: PathwayStatus;
  target_role: string;
  goal: string;
  pace: PathwayPace;
  definition_version: string;
  parent_pathway_id: string | null;
  recalculation_reason: string[];
  weekly_learning_minutes: number;
  daily_available_minutes: number;
  timezone: string;
  target_date: string | null;
  steps: PathwayStepView[];
  weekly_actions: WeeklyActionView[];
  warnings: string[];
  change_summary: ChangeSummaryView | null;
  created_at: string;
  approved_at: string | null;
}

export interface CurrentRoadmapView {
  active: PathwayView | null;
  pending_draft: PathwayView | null;
}

export interface PlannerPathwayAction {
  plan_item_id: string;
  internal_task_id: string;
  pathway_id: string;
  pathway_version: number;
  step_id: string;
  skill_id: string;
  title: string;
  start_at: string;
  end_at: string;
  planned_minutes: number;
  source_label: string;
  description: string;
}

export interface PathwayContextOptions {
  targetRole: string;
  goal: string;
  pace: PathwayPace;
  timezone?: string;
  planningStart?: string;
  targetDate?: string;
}

export function buildPathwayContext(state: DemoState, options: PathwayContextOptions) {
  const timezone = options.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Asia/Colombo";
  const today = options.planningStart ?? new Date().toISOString().slice(0, 10);
  const evidenceBySkill = new Map<string, string[]>();
  for (const evidence of state.evidence) {
    if (!["verified", "submitted", "self-reported"].includes(evidence.status)) continue;
    const refs = evidenceBySkill.get(evidence.skillId) ?? [];
    refs.push(`evidence:${evidence.id}:${evidence.status}`);
    evidenceBySkill.set(evidence.skillId, refs);
  }
  return {
    target_role: options.targetRole,
    goal: options.goal,
    pace: options.pace,
    timezone,
    planning_start: today,
    target_date: options.targetDate ?? null,
    weekly_learning_minutes: Math.max(0, Math.round(state.onboarding.weeklyLearningHours * 60)),
    daily_available_minutes: Math.max(0, planningCapacityMinutes(state.capacity)),
    skills: state.careerSkills.map((skill) => ({
      skill_id: skill.id,
      status: skill.status,
      proficiency: skill.proficiency,
      evidence_refs: evidenceBySkill.get(skill.id) ?? [],
    })),
    // Deliberately send only scheduling/risk facts. Task descriptions and private notes
    // are unnecessary for capacity allocation and stay in the client-owned prototype state.
    academic_tasks: state.tasks.filter((task) => task.category === "Academic" && task.status !== "completed").map((task) => ({
      id: task.id,
      title: "Academic obligation",
      due_at: task.dueAt ?? null,
      remaining_minutes: Math.max(0, Math.round(task.estimatedMinutes * (1 - task.progress / 100))),
      risk_score: task.riskScore,
      status: task.status,
    })),
    planner_blocks: state.planBlocks.map((block) => ({
      id: block.id,
      start_at: block.startAt,
      end_at: block.endAt,
      category: block.category,
      is_fixed: Boolean(block.isFixed),
    })),
    resource_preferences: {
      language: state.onboarding.language || "English",
      budget: state.onboarding.budget,
      formats: [...state.onboarding.preferredLearning],
    },
  };
}

export function buildRecalculationReasons(active: PathwayView, context: ReturnType<typeof buildPathwayContext>) {
  const reasons: string[] = [];
  if (active.target_role !== context.target_role) reasons.push(`Career goal changed from ${active.target_role} to ${context.target_role}.`);
  if (active.goal !== context.goal) reasons.push("Career learning goal wording changed.");
  if (active.pace !== context.pace) reasons.push(`Roadmap pace changed from ${active.pace} to ${context.pace}.`);
  if (active.weekly_learning_minutes !== context.weekly_learning_minutes) reasons.push(`Weekly learning capacity changed from ${active.weekly_learning_minutes} to ${context.weekly_learning_minutes} minutes.`);
  if (active.daily_available_minutes !== context.daily_available_minutes) reasons.push(`Daily planning capacity changed from ${active.daily_available_minutes} to ${context.daily_available_minutes} minutes.`);
  if ((active.target_date ?? null) !== (context.target_date ?? null)) reasons.push("Career target date changed.");
  const credited = new Set(active.steps.filter((step) => ["credited", "completed"].includes(step.state)).map((step) => step.skill_id));
  const changedEvidence = context.skills.some((skill) => ["verified", "completed"].includes(skill.status) && !credited.has(skill.skill_id));
  if (changedEvidence) reasons.push("New skill evidence can change prerequisite credit.");
  if (!reasons.length) reasons.push("Roadmap context was refreshed using the latest capacity, evidence and academic plan.");
  return reasons;
}

export function applyPathwayPlanActions(state: DemoState, actions: PlannerPathwayAction[]): Pick<DemoState, "tasks" | "planBlocks" | "simulation"> {
  const tasks = [...state.tasks];
  const planBlocks = [...state.planBlocks];
  for (const action of actions) {
    if (tasks.some((task) => task.id === action.internal_task_id) || planBlocks.some((block) => block.externalId === action.plan_item_id)) continue;
    const task: Task = {
      id: action.internal_task_id,
      title: action.title,
      category: "career-learning",
      status: "upcoming",
      estimatedMinutes: action.planned_minutes,
      progress: 0,
      difficulty: 2,
      careerSkillIds: [action.skill_id],
      skill: action.skill_id,
      riskScore: 20,
      careerRelevance: 92,
      description: action.description,
      learningPathId: action.pathway_id,
      learningStepId: action.step_id,
      externalId: action.plan_item_id,
      source: action.source_label,
    };
    const block: PlanBlock = {
      id: `block-${action.internal_task_id}`,
      taskId: action.internal_task_id,
      title: action.title,
      category: "career-learning",
      startAt: action.start_at,
      endAt: action.end_at,
      externalId: action.plan_item_id,
      source: action.source_label,
    };
    tasks.push(task);
    planBlocks.push(block);
  }
  return {
    tasks,
    planBlocks,
    simulation: { ...state.simulation, announcement: `${actions.length} approved roadmap commitment${actions.length === 1 ? "" : "s"} added to Planner.` },
  };
}

export async function pathwayRequest<T>(path: string, studentId: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    cache: "no-store",
    headers: { "X-Luma-Student-Id": studentId, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail ?? "Roadmap service request failed.");
  return body as T;
}
