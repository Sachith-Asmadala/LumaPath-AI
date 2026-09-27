import type { CareerReadiness, ReadinessMetric } from "../demo-data/types";

export function calculateReadinessScore(breakdown: ReadinessMetric[]): number {
  const weight = breakdown.reduce((sum, item) => sum + item.weight, 0);
  if (weight === 0) return 0;
  const score = breakdown.reduce((sum, item) => sum + item.value * item.weight, 0) / weight;
  return Math.round(score);
}

/**
 * Demo scoring model: a relevant verified event adds a transparent score delta and
 * adjusts the corresponding visible sub-score by its relative weight.
 */
export function raiseReadiness(
  current: CareerReadiness,
  metricId: ReadinessMetric["id"],
  scoreDelta: number,
): CareerReadiness {
  const target = current.breakdown.find((item) => item.id === metricId);
  const subscoreDelta = target ? Math.ceil(scoreDelta / target.weight) : 0;
  const breakdown = current.breakdown.map((item) =>
    item.id === metricId ? { ...item, value: Math.min(100, item.value + subscoreDelta) } : item,
  );
  const score = Math.min(100, current.score + scoreDelta);
  return { score, weeklyDelta: current.weeklyDelta + (score - current.score), breakdown };
}
