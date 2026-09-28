import { freePathForSkill, type FreePathStep } from "../demo-data/free-learning-paths";
import { learningResources } from "../demo-data/resources";
import type { DemoState, SkillEvidence } from "../demo-data/types";
import { resourceLearningPath } from "./learning-path-scheduler";

export function safeExternalUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function selectedLearningPath(state: DemoState, skillId: string) {
  const id = state.scheduledPathBySkill[skillId] ?? state.selectedFreePathBySkill[skillId] ?? state.selectedResourceBySkill[skillId];
  const free = freePathForSkill(skillId);
  if (free?.id === id) return free;
  const resource = learningResources.find((item) => item.id === id && item.skill === skillId);
  if (!resource) return null;
  const scheduled = resourceLearningPath(resource);
  return { ...scheduled, title: resource.title, steps: scheduled.steps.map((step): FreePathStep => ({ ...step,
    kind: step.id === "lab" ? "free lab" : step.id === "project" ? "portfolio project" : step.id === "verification" ? "mini assessment" : ["Coursera", "Udemy"].includes(resource.provider) ? "guided course" : resource.format === "video" ? "selected YouTube learning" : "official documentation",
    sources: step.id === "course" ? [{ label: resource.provider, url: resource.url }] : free?.steps.find((item) => item.id === step.id)?.sources ?? [],
  })) };
}

export function learningProgress(state: DemoState, skillId: string) {
  const path = selectedLearningPath(state, skillId);
  if (!path) return null;
  const steps = path.steps.map((step) => {
    const tasks = state.tasks.filter((task) => (task.learningPathId === path.id && task.learningStepId === step.id) || task.id.startsWith(`learning-${path.id}-${step.id}-`));
    const total = tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const progress = total ? Math.round(tasks.reduce((sum, task) => sum + task.estimatedMinutes * (task.status === "completed" ? 100 : task.progress), 0) / total) : 0;
    return { ...step, tasks, progress, complete: tasks.length > 0 && tasks.every((task) => task.status === "completed") };
  });
  const total = steps.reduce((sum, step) => sum + step.durationHours, 0);
  const progress = total ? Math.round(steps.reduce((sum, step) => sum + step.durationHours * step.progress, 0) / total) : 0;
  return { path, steps, progress, scheduled: Boolean(state.scheduledPathBySkill[skillId]), missingStages: Boolean(state.scheduledPathBySkill[skillId]) && steps.some((step) => !step.tasks.length) };
}

export function completionEligibility(state: DemoState, skillId: string) {
  const learning = learningProgress(state, skillId);
  const project = state.evidence.find((item) => item.kind === "project" && item.skillId === skillId && item.url);
  const attempt = [...state.assessmentHistory].reverse().find((item) => item.kind === "skill" && item.skillId === skillId && item.score >= (state.careerSkills.find((skill) => skill.id === skillId)?.targetScore ?? 75));
  return { learning, project, attempt, eligible: Boolean(learning?.scheduled && learning.steps.every((step) => step.complete) && project && safeExternalUrl(project.url!) && attempt) };
}

export function recordCompletion(state: DemoState, skillId: string, at: string): DemoState {
  const { eligible, learning, project, attempt } = completionEligibility(state, skillId);
  if (!eligible || !learning || !project?.url || !attempt || state.completionRecords.some((record) => record.pathId === learning.path.id)) return state;
  return { ...state, completionRecords: [...state.completionRecords, { id: `LP-${skillId}-${attempt.id}-${at}`, skillId, pathId: learning.path.id, studentName: state.student.name, title: learning.path.title, completedAt: at, assessmentAttemptId: attempt.id, assessmentScore: attempt.score, projectUrl: project.url }] };
}

export type ExternalCertificateInput = { title: string; provider: string; course: string; skillId: string; completedAt: string; url: string; credentialId: string };
export function externalCertificateEvidence(state: DemoState, input: ExternalCertificateInput, at: string): SkillEvidence | null {
  const url = safeExternalUrl(input.url);
  if (!url || !input.title.trim() || !input.provider.trim() || !input.course.trim() || !state.careerSkills.some((skill) => skill.id === input.skillId) || !/^\d{4}-\d{2}-\d{2}$/.test(input.completedAt) || !Number.isFinite(Date.parse(input.completedAt)) || new Date(input.completedAt).toISOString().slice(0, 10) !== input.completedAt || input.completedAt > at.slice(0, 10) || state.evidence.some((item) => item.kind === "external-certificate" && item.url === url)) return null;
  return { id: `external-certificate-${state.evidence.length + 1}-${at}`, skillId: input.skillId, kind: "external-certificate", source: input.provider.trim(), provider: input.provider.trim(), label: input.title.trim(), course: input.course.trim(), completedAt: input.completedAt, url, credentialId: input.credentialId.trim(), status: "self-reported", confidence: 0 };
}
