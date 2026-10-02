import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import type { BaselineAssessmentResult } from "@/data/demo/types";
import { demoReducer } from "@/state/demo-provider";
import { nextStudentJourneyRoute } from "@/features/onboarding/domain/student-journey";

const baseline: BaselineAssessmentResult = {
  answers: {}, overallScore: 43, correctCount: 0, totalQuestions: 12,
  skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 },
};

describe("student journey", () => {
  it("resumes at the first unfinished step using the shared demo state", () => {
    const initial = createDemoState();
    expect(nextStudentJourneyRoute(initial)).toBe("/onboarding");
    const onboarded = { ...initial, onboarding: { ...initial.onboarding, completed: true, budget: "flexible" as const, preferredLearning: ["projects" as const], weeklyLearningHours: 8 } };
    expect(nextStudentJourneyRoute(onboarded)).toBe("/assessment");
    const assessed = demoReducer(onboarded, { type: "set-assessment", result: baseline });
    expect(nextStudentJourneyRoute(assessed)).toBe("/assessment/results");
    const chosen = demoReducer(assessed, { type: "choose-resource", skillId: "docker", resourceId: "docker-coursera-projects" });
    expect(nextStudentJourneyRoute(chosen)).toBe("/career-path");
    const planned = demoReducer(chosen, { type: "schedule-resource", skillId: "docker", resourceId: "docker-coursera-projects" });
    expect(planned).not.toBe(chosen);
    expect(planned.scheduledPathBySkill.docker).toBe("docker-coursera-projects");
    expect(planned.tasks.some((task) => task.id.startsWith("learning-docker-coursera-projects-course-") && task.category === "career-learning")).toBe(true);
    expect(planned.planBlocks).toHaveLength(chosen.planBlocks.length + planned.tasks.length - chosen.tasks.length);
    expect(nextStudentJourneyRoute(planned)).toBe("/overview");
    expect(demoReducer(planned, { type: "schedule-resource", skillId: "docker", resourceId: "docker-coursera-projects" })).toBe(planned);
    const retaken = demoReducer(planned, { type: "set-assessment", result: baseline });
    expect(retaken.scheduledPathBySkill).toEqual(planned.scheduledPathBySkill);
    expect(retaken.selectedResourceBySkill).toEqual(planned.selectedResourceBySkill);
    expect(retaken.tasks).toEqual(planned.tasks);
    expect(retaken.planBlocks).toEqual(planned.planBlocks);
    expect(nextStudentJourneyRoute(retaken)).toBe("/overview");
  });
});
