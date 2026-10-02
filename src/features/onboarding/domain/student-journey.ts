import type { DemoState } from "@/data/demo/types";

/** Resume at the first unfinished step of the local student journey. */
export function nextStudentJourneyRoute(state: DemoState): string {
  if (!state.onboarding.completed) return "/onboarding";
  if (!state.assessment) return "/assessment";
  if (!Object.keys(state.selectedResourceBySkill).length && !Object.keys(state.selectedFreePathBySkill).length) return "/assessment/results";
  if (!Object.keys(state.scheduledPathBySkill).length) return "/career-path";
  return "/overview";
}
