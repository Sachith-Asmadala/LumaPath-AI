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

/** Personal progress indicator; no externally earned certificates or self-reported skill claims add points. */
export function measuredReadiness(state: import("../demo-data/types").DemoState): CareerReadiness {
  const skills = state.careerSkills;
  const ratio = (count: number, total: number) => total ? Math.round(count / total * 100) : 0;
  const learning = state.tasks.filter((task) => task.category === "career-learning");
  const projects = state.evidence.filter((item) => item.kind === "project" && item.url && skills.some((skill) => skill.id === item.skillId));
  const breakdown: ReadinessMetric[] = [
    { id: "technical", label: "Assessed skill scores", value: skills.length ? Math.round(skills.reduce((sum, skill) => sum + skill.proficiency, 0) / skills.length) : 0, weight: 0.4 },
    { id: "coverage", label: "Required skill coverage", value: ratio(skills.filter((skill) => ["verified", "completed"].includes(skill.status)).length, skills.length), weight: 0.25 },
    { id: "projects", label: "Submitted projects", value: ratio(new Set(projects.map((item) => item.skillId)).size, skills.length), weight: 0.2 },
    { id: "learning", label: "Scheduled learning complete", value: ratio(learning.filter((task) => task.status === "completed").length, learning.length), weight: 0.15 },
  ];
  return { score: calculateReadinessScore(breakdown), weeklyDelta: 0, breakdown };
}
