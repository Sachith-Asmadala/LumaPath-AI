import { describe, expect, it } from "vitest";
import { buildMentorShareSnapshot } from "./mentors";
import { createDemoState } from "@/data/demo/seed";

describe("mentor sharing snapshot", () => {
  it("contains summary facts but excludes private capacity/check-in notes and raw content", () => {
    const state = createDemoState();
    state.capacity.lifeLoadNote = "Private family detail";
    state.tasks[0] = { ...state.tasks[0], description: "Private task detail" };
    const snapshot = buildMentorShareSnapshot(state);
    const text = JSON.stringify(snapshot);
    expect(snapshot.career_readiness.score).toBe(state.readiness.score);
    expect(text).not.toContain("Private family detail");
    expect(text).not.toContain("Private task detail");
    expect(text).not.toContain("lifeLoadNote");
  });

  it("shares only concise academic deadline fields", () => {
    const state = createDemoState();
    const snapshot = buildMentorShareSnapshot(state);
    for (const deadline of snapshot.academic_summary.upcoming_deadlines) {
      expect(Object.keys(deadline).sort()).toEqual(["due_at", "module", "title"]);
    }
  });
});
