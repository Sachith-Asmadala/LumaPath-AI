import type { DemoState } from "@/data/demo/types";
import { selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";
import { scoreSkillReassessment } from "@/features/career/domain/path-assessments";
import { raiseReadiness } from "@/features/career/domain/readiness";
import { buildNextBestAction } from "@/features/planner/domain/priority";

export function applySkillAssessment(state: DemoState, skillId: string, answers: Record<string, string>, at: string, retake = false): DemoState {
  const completion = selectLearningPathCompletion(state, skillId);
  const skill = state.careerSkills.find((item) => item.id === skillId);
  const scored = scoreSkillReassessment(skillId, answers);
  if (!completion?.pathComplete || !skill || (skill.status === "verified" && !retake) || !scored) return state;
  const threshold = skill.targetScore ?? 75;
  const passed = scored.score >= threshold;
  const firstPass = passed && skill.status !== "verified";
  const readiness = firstPass ? raiseReadiness(state.readiness, "technical", 2) : state.readiness;
  const careerSkills = state.careerSkills.map((item) => item.id === skillId ? { ...item, status: passed ? "verified" as const : item.status, proficiency: skill.status === "verified" ? Math.max(item.proficiency, scored.score) : scored.score } : { ...item });
  for (const item of careerSkills) {
    if (item.status === "locked" && item.prerequisites.every((id) => careerSkills.some((parent) => parent.id === id && ["completed", "verified"].includes(parent.status)))) item.status = "available";
  }
  const id = `${skillId}-assessment`;
  const evidenceItem = { id, skillId, source: "LumaPath Assessment", label: `${skill.name} reassessment · ${scored.score}%`, status: passed ? "verified" as const : "submitted" as const, confidence: scored.score, ...(passed ? { verifiedAt: at.slice(0, 10) } : {}) };
  const evidence = !passed && skill.status === "verified" ? state.evidence : state.evidence.some((item) => item.id === id) ? state.evidence.map((item) => item.id === id ? evidenceItem : item) : [...state.evidence, evidenceItem];
  const completedTasks = passed ? state.tasks.filter((task) => task.status !== "completed" && ((skillId === "docker" && task.id === "docker-lab") || task.id.startsWith(`learning-${completion.path.id}-verification-`))) : [];
  const completedIds = new Set(completedTasks.map((task) => task.id));
  const tasks = state.tasks.map((task) => completedIds.has(task.id) ? { ...task, status: "completed" as const, progress: 100, riskScore: 0, completedAt: at } : task);
  const prior = state.assessment?.skillScores[skill.name as keyof NonNullable<DemoState["assessment"]>["skillScores"]] ?? state.skillReassessments[skillId]?.newScore ?? skill.proficiency;
  const result = { answers: Object.fromEntries(scored.questions.map((question) => [question.id, answers[question.id]])), previousScore: prior, newScore: scored.score, correctCount: scored.correctCount, totalQuestions: scored.questions.length, threshold, passed, readinessBefore: state.readiness.score, readinessAfter: readiness.score };
  const next = tasks.find((task) => task.status !== "completed");
  return {
    ...state, careerSkills, evidence, readiness, tasks,
    skillReassessments: { ...state.skillReassessments, [skillId]: result },
    assessmentHistory: [...state.assessmentHistory, { id: `attempt-${state.assessmentHistory.length + 1}-${at}`, kind: "skill", skillId, careerGoal: state.onboarding.careerGoal, completedAt: at, answers: result.answers, score: scored.score, categoryScores: { [skill.name]: scored.score }, questionIds: scored.questions.map((question) => question.id) }],
    completedTaskCount: state.completedTaskCount + completedTasks.length,
    productiveMinutes: state.productiveMinutes + completedTasks.reduce((sum, task) => sum + Math.round(task.estimatedMinutes * (100 - task.progress) / 100), 0),
    activeAction: next ? buildNextBestAction(next) : state.activeAction,
    notifications: firstPass ? [{ id: `skill-${skillId}-${at}`, kind: "career", title: `${skill.name} verified`, description: "Your knowledge check passed. Review the next available stage.", href: "/career-path", createdAt: at, read: false }, ...state.notifications] : state.notifications,
    simulation: { ...state.simulation, announcement: passed ? `${skill.name} Verified → Pathway updated` : `${skill.name} reassessment: ${scored.score}%. Keep practicing toward ${threshold}%.` },
  };
}
