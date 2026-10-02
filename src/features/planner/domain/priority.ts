import type { NextBestAction, RiskLevel, Task } from "@/data/demo/types";

export interface PriorityFactors {
  urgency: number;
  academicImpact: number;
  careerRelevance: number;
  capacityFit: number;
}

export interface PriorityScore {
  score: number;
  reasons: NextBestAction["reasons"];
}

const scoreReasons: NextBestAction["reasons"] = [
  { label: "Deadline urgency", points: 28 },
  { label: "Career relevance", points: 24 },
  { label: "Prerequisite importance", points: 19 },
  { label: "Academic impact", points: 12 },
  { label: "Available capacity", points: 10 },
  { label: "Effort penalty", points: -7 },
];

export function calculatePriorityScore(reasons = scoreReasons): PriorityScore {
  return {
    score: reasons.reduce((total, reason) => total + reason.points, 0),
    reasons: reasons.map((reason) => ({ ...reason })),
  };
}

export function riskLevel(score: number): RiskLevel {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

export function buildNextBestAction(
  task: Task,
  overrides?: Partial<Pick<NextBestAction, "title" | "durationMinutes" | "score" | "rationale" | "metrics" | "reasons" | "deadlineRisk" | "careerImpact" | "energyFit">>,
): NextBestAction {
  const priority = calculatePriorityScore(overrides?.reasons);
  const metrics: PriorityFactors = {
    urgency: Math.min(99, task.riskScore),
    academicImpact: task.category === "Academic" ? 84 : 68,
    careerRelevance: task.careerRelevance,
    capacityFit: 84,
  };

  return {
    taskId: task.id,
    title: overrides?.title ?? task.title,
    durationMinutes: overrides?.durationMinutes ?? task.estimatedMinutes,
    score: overrides?.score ?? priority.score,
    deadlineRisk: overrides?.deadlineRisk ?? riskLevel(task.riskScore),
    careerImpact: overrides?.careerImpact ?? (task.careerRelevance >= 75 ? "High" : task.careerRelevance >= 55 ? "Moderate" : "Low"),
    energyFit: overrides?.energyFit ?? "Good",
    rationale: overrides?.rationale ?? task.description,
    metrics: { ...metrics, ...overrides?.metrics },
    reasons: overrides?.reasons?.map((reason) => ({ ...reason })) ?? priority.reasons,
  };
}
