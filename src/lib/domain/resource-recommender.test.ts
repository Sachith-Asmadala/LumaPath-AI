import { describe, expect, it } from "vitest";
import { defaultOnboarding } from "../demo-data/seed";
import { learningResources } from "../demo-data/resources";
import { createDemoState } from "../demo-data/seed";
import { demoReducer } from "../state/demo-provider";
import { isWithinBudget, levelFromScore, recommendLearningResources } from "./resource-recommender";

const docker = { id: "docker", name: "Docker", proficiency: 44 };
const preferences = { ...defaultOnboarding, completed: true, preferredLearning: ["hands-on" as const], budget: "flexible" as const, goal: "internship" as const, language: "English", weeklyLearningHours: 8 };

describe("local learning resource recommender", () => {
  it("uses assessment score for level and returns at most two unique ranked paths", () => {
    expect(levelFromScore(39)).toBe("beginner");
    expect(levelFromScore(40)).toBe("intermediate");
    expect(levelFromScore(70)).toBe("advanced");
    const first = recommendLearningResources(docker, preferences);
    expect(first).toHaveLength(2);
    expect(first.map((item) => item.label)).toEqual(["Best Overall", "Best Credential Option"]);
    expect(new Set(first.map((item) => item.resource.id)).size).toBe(2);
    expect(recommendLearningResources(docker, preferences)).toEqual(first);
    expect(first.every((item) => item.reasons.length >= 3)).toBe(true);
  });

  it("enforces free-only budget, language, and weekly time", () => {
    const free = recommendLearningResources(docker, { ...preferences, budget: "free only" });
    expect(free.every((item) => item.resource.costType === "free")).toBe(true);
    expect(free.some((item) => item.label === "Best Credential Option")).toBe(false);
    expect(recommendLearningResources(docker, { ...preferences, language: "Sinhala" })).toEqual([]);
    expect(recommendLearningResources(docker, { ...preferences, weeklyLearningHours: 1 }).every((item) => item.resource.durationHours <= 4)).toBe(true);
    expect(isWithinBudget({ ...learningResources[0], price: 25 }, "under $20/month")).toBe(false);
  });

  it("uses certificate preference and rejects resources far above current level", () => {
    const certificate = learningResources.find((item) => item.id === "docker-coursera-projects")!;
    const internship = recommendLearningResources(docker, preferences, [certificate])[0];
    const certification = recommendLearningResources(docker, { ...preferences, goal: "certification" }, [certificate])[0];
    expect(certification.matchScore).toBeGreaterThan(internship.matchScore);
    expect(recommendLearningResources({ ...docker, proficiency: 0 }, preferences, [{ ...certificate, level: "advanced" }])).toEqual([]);
  });

  it("chooses only an eligible recommendation in the existing demo state", () => {
    const state = createDemoState();
    expect(demoReducer(state, { type: "choose-resource", skillId: "docker", resourceId: "docker-docs-start" })).toBe(state);
    const ready = { ...state, onboarding: { ...state.onboarding, completed: true }, assessment: { answers: {}, overallScore: 0, skillScores: { Linux: 0, Git: 0, Networking: 0, Docker: 0, "CI/CD": 0, Cloud: 0 }, correctCount: 0, totalQuestions: 12 } };
    const selected = demoReducer(ready, { type: "choose-resource", skillId: "docker", resourceId: "docker-docs-start" });
    expect(selected.selectedResourceBySkill.docker).toBe("docker-docs-start");
    expect(demoReducer(ready, { type: "choose-resource", skillId: "docker", resourceId: "docker-udemy-practical" })).toBe(ready);
    expect(demoReducer(ready, { type: "choose-resource", skillId: "cicd", resourceId: "docker-docs-start" })).toBe(ready);
  });
});
