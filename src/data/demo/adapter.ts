import { createDemoState } from "@/data/demo/seed";
import type { DemoState } from "@/data/demo/types";

export const demoStateStorageKey = "lumapath-demo-state-v1";

export function readStoredDemoState(): DemoState | null {
  try {
    const raw = window.localStorage.getItem(demoStateStorageKey);
    if (!raw) return null;
    const state = JSON.parse(raw) as DemoState;
    return state?.onboarding?.completed && Array.isArray(state.tasks) && Array.isArray(state.planBlocks)
      && Array.isArray(state.careerSkills) && Array.isArray(state.evidence) && Boolean(state.readiness)
      && Boolean(state.selectedResourceBySkill) && Boolean(state.selectedFreePathBySkill)
      && Boolean(state.scheduledPathBySkill) && Boolean(state.skillReassessments)
      ? { ...state, assessmentHistory: state.assessmentHistory ?? [], assessmentDraft: state.assessmentDraft ?? { answers: {}, index: 0 }, resourceBookmarks: state.resourceBookmarks ?? [], completionRecords: state.completionRecords ?? [], learningGoal: state.learningGoal ?? null } : null;
  } catch {
    return null;
  }
}

export function storeDemoState(state: DemoState): void {
  try {
    window.localStorage.setItem(demoStateStorageKey, JSON.stringify({
      ...state,
      recoveryPending: false,
      simulation: { kind: null, step: null, message: null, result: [], announcement: "" },
    }));
  } catch { /* The in-memory demo remains usable without storage. */ }
}

/** Replace this typed local adapter with API-backed repositories when the backend is ready. */
export const demoDataAdapter = {
  load(): DemoState {
    return createDemoState();
  },
  reset(): DemoState {
    return createDemoState();
  },
};
