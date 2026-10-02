import type { DemoState } from "@/data/demo/types";

export type AnalyticsMeasurementKind = "measured" | "estimated" | "mixed";
export type AnalyticsDataStatus = "complete" | "partial" | "empty";

export interface AnalyticsMetric {
  key: string;
  label: string;
  value: number | null;
  unit: string | null;
  measurement_kind: AnalyticsMeasurementKind;
  data_status: AnalyticsDataStatus;
  definition: string;
  explanation: string;
  source_count: number;
}

export interface AnalyticsTrendPoint {
  period: string;
  value: number | null;
  secondary_value: number | null;
  measurement_kind: AnalyticsMeasurementKind;
}

export interface AnalyticsModuleTrend {
  module: string;
  workload_hours: number;
  average_difficulty: number | null;
  task_count: number;
  source_ids: string[];
  history: AnalyticsTrendPoint[];
}

export interface AnalyticsSkillTrend {
  skill_id: string;
  current_proficiency: number;
  status: string;
  history: AnalyticsTrendPoint[];
}

export interface AnalyticsReadinessTrend {
  current_score: number | null;
  movement: number | null;
  history: AnalyticsTrendPoint[];
  reasons: string[];
}

export interface AnalyticsPlanPattern {
  reviewed: number;
  accepted: number;
  adjusted: number;
  acceptance_rate: number | null;
  adjustment_rate: number | null;
  data_status: AnalyticsDataStatus;
  definition: string;
}

export interface AnalyticsFreshness {
  latest_event_at: string | null;
  aggregate_computed_at: string | null;
  event_count: number;
  is_partial: boolean;
  note: string;
}

export interface AnalyticsDashboard {
  student_id: string;
  start_date: string;
  end_date: string;
  timezone: string;
  metric_version: string;
  headline: AnalyticsMetric[];
  daily_completion: AnalyticsTrendPoint[];
  module_trends: AnalyticsModuleTrend[];
  estimate_accuracy: AnalyticsMetric;
  readiness: AnalyticsReadinessTrend;
  skills: AnalyticsSkillTrend[];
  plan_patterns: AnalyticsPlanPattern;
  freshness: AnalyticsFreshness;
  empty: boolean;
  empty_message: string | null;
}

export interface AnalyticsSourceReference {
  source_type: string;
  source_id: string;
  occurred_at: string;
  module: string | null;
  measurement_kind: AnalyticsMeasurementKind;
  source_available: boolean;
  values: Record<string, string | number | boolean | null>;
}

export interface AnalyticsDrilldown {
  metric: string;
  start_date: string;
  end_date: string;
  timezone: string;
  definition: string;
  explanation: string;
  sources: AnalyticsSourceReference[];
  freshness: AnalyticsFreshness;
}

const baselineSkillId = (label: string) => {
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (key === "cicd") return "cicd";
  if (key === "networking") return "linux";
  return key;
};

/**
 * Temporary prototype bridge: normalize only metric-safe fields from the browser-owned demo state.
 * No task description, document text, prompt, university content or evidence body is sent.
 * Server-owned Task/Planner/Readiness modules should emit the same analytics events directly later.
 */
export function buildAnalyticsSyncPayload(state: DemoState, timezone = "Asia/Colombo") {
  const now = new Date().toISOString();
  const skillHistory = state.assessmentHistory.flatMap((attempt) => Object.entries(attempt.categoryScores).map(([name, proficiency]) => ({
    source_id: baselineSkillId(name),
    proficiency,
    observed_at: attempt.completedAt,
    reason: `${attempt.kind === "baseline" ? "Baseline" : "Skill"} assessment`,
  })));

  return {
    timezone,
    observed_at: now,
    productive_minutes_total: state.productiveMinutes,
    productive_measurement: "mixed" as const,
    tasks: state.tasks.map((task) => ({
      source_id: task.id,
      status: task.status,
      category: task.category,
      module: task.module ?? null,
      estimated_minutes: task.estimatedMinutes,
      difficulty: task.difficulty,
      due_at: task.dueAt ?? null,
      completed_at: task.completedAt ?? null,
      progress: task.progress,
    })),
    plan_blocks: state.planBlocks.map((block) => ({
      source_id: block.id,
      task_id: block.taskId,
      category: block.category,
      start_at: block.startAt,
      end_at: block.endAt,
      previous_start_at: block.previousStartAt ?? null,
      is_fixed: Boolean(block.isFixed),
      is_missed: Boolean(block.isMissed),
      is_conflict: Boolean(block.isConflict),
    })),
    readiness: {
      score: state.readiness.score,
      starting_score: state.readinessStartingScore ?? Math.max(0, state.readiness.score - state.readiness.weeklyDelta),
      breakdown: Object.fromEntries(state.readiness.breakdown.map((item) => [item.id, item.value])),
    },
    skills: state.careerSkills.map((skill) => ({
      source_id: skill.id,
      status: skill.status,
      proficiency: skill.proficiency,
    })),
    skill_history: skillHistory,
    deleted_sources: [] as string[],
  };
}

export function analyticsSourceLabel(state: DemoState, sourceType: string, sourceId: string): string {
  if (sourceType === "task") return state.tasks.find((task) => task.id === sourceId)?.title ?? sourceId;
  if (sourceType === "plan_block") return state.planBlocks.find((block) => block.id === sourceId)?.title ?? sourceId;
  if (sourceType === "skill") return state.careerSkills.find((skill) => skill.id === sourceId)?.name ?? sourceId;
  if (sourceType === "readiness") return "Career Readiness";
  if (sourceType === "productivity") return "Recorded productive time";
  return sourceId;
}

export function isAnalyticsDashboard(value: unknown): value is AnalyticsDashboard {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AnalyticsDashboard>;
  return typeof item.student_id === "string" && Array.isArray(item.headline) && Array.isArray(item.module_trends) && Boolean(item.freshness);
}

export function isAnalyticsDrilldown(value: unknown): value is AnalyticsDrilldown {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AnalyticsDrilldown>;
  return typeof item.metric === "string" && Array.isArray(item.sources) && typeof item.definition === "string";
}
