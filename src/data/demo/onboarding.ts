import type { OnboardingState, StudentProfile } from "@/data/demo/types";

export const onboardingStorageKey = "lumapath-onboarding-v1";

export function moduleNames(input: string): string[] {
  return input.split(/[,\n]/).map((module) => module.trim()).filter(Boolean);
}

export function canCompleteOnboarding(draft: OnboardingState): boolean {
  return Boolean(
    draft.name.trim() && draft.university.trim() && draft.degree.trim()
    && draft.academicYear && draft.semester && moduleNames(draft.currentModules).length
    && draft.careerGoal === "DevOps Engineer"
    && Number.isInteger(draft.weeklyLearningHours) && draft.weeklyLearningHours >= 1 && draft.weeklyLearningHours <= 40
    && draft.budget && draft.preferredLearning.length && draft.language.trim() && draft.goal,
  );
}

export function studentFromOnboarding(student: StudentProfile, draft: OnboardingState): StudentProfile {
  const name = draft.name.trim();
  return {
    ...student,
    id: "student-onboarded",
    name,
    university: draft.university.trim(),
    targetRole: draft.careerGoal,
    initials: name.split(/\s+/).slice(0, 2).map((part) => part[0].toUpperCase()).join(""),
  };
}

export function readCompletedOnboarding(): OnboardingState | null {
  try {
    const raw = window.localStorage.getItem(onboardingStorageKey);
    if (!raw) return null;
    const draft = JSON.parse(raw) as OnboardingState;
    return draft.completed && Array.isArray(draft.preferredLearning) && canCompleteOnboarding(draft) ? draft : null;
  } catch {
    return null;
  }
}

export const onboardingDraftStorageKey = "lumapath-onboarding-draft-v1";
export function readOnboardingDraft(defaults: OnboardingState): OnboardingState | null {
  try {
    const raw = window.localStorage.getItem(onboardingDraftStorageKey);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || draft.completed || typeof draft.name !== "string" || !Array.isArray(draft.preferredLearning)) return null;
    return { ...defaults, ...draft, draftStep: Math.min(2, Math.max(0, Number(draft.draftStep) || 0)), completed: false };
  } catch { return null; }
}
