import { describe, expect, it } from "vitest";
import type { BaselineAssessmentResult } from "../demo-data/types";
import { freeLearningPaths, freePathForSkill, freePathWeeks } from "../demo-data/free-learning-paths";
import { createDemoState } from "../demo-data/seed";
import { demoReducer } from "../state/demo-provider";

const example: BaselineAssessmentResult = {
  answers: {},
  overallScore: 43,
  skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 },
  correctCount: 0,
  totalQuestions: 12,
};

describe("Docker free learning path", () => {
  it("has a complete $0 sequence with sources, practice, project, and verification", () => {
    const path = freePathForSkill("docker")!;
    expect(freeLearningPaths).toHaveLength(9);
    expect(path.costUSD).toBe(0);
    expect(path.steps.map((step) => step.title)).toEqual([
      "Docker fundamentals", "Images and containers", "Networking and volumes", "Docker Compose",
      "Hands-on lab", "Containerize a real project", "LumaPath skill verification",
    ]);
    expect(path.steps.reduce((sum, step) => sum + step.durationHours, 0)).toBe(path.durationHours);
    expect(path.steps.map((step) => step.kind)).toContain("selected YouTube learning");
    expect(path.steps.map((step) => step.kind)).toContain("free lab");
    expect(path.steps.map((step) => step.kind)).toContain("mini assessment");
    expect(path.evidenceEarned).toHaveLength(3);
    expect(freePathWeeks(path, 6)).toBe(3);
    expect(freePathWeeks(path, 12)).toBe(2);
  });

  it("adds the path to shared state without adding calendar blocks", () => {
    const seed = createDemoState();
    const onboarded = { ...seed, onboarding: { ...seed.onboarding, completed: true } };
    const assessed = demoReducer(onboarded, { type: "set-assessment", result: example });
    const added = demoReducer(assessed, { type: "add-free-path", skillId: "docker", pathId: "docker-open-path" });
    expect(added.selectedFreePathBySkill.docker).toBe("docker-open-path");
    expect(added.planBlocks).toBe(assessed.planBlocks);
    expect(added.tasks).toBe(assessed.tasks);
    expect(demoReducer(assessed, { type: "add-free-path", skillId: "cloud", pathId: "docker-open-path" })).toBe(assessed);
    expect(demoReducer(assessed, { type: "add-free-path", skillId: "docker", pathId: "unknown" })).toBe(assessed);
    const switched = demoReducer(added, { type: "choose-resource", skillId: "docker", resourceId: "docker-docs-start" });
    expect(switched.selectedFreePathBySkill.docker).toBeUndefined();
  });
});
