import { describe, expect, it } from "vitest";
import type { BaselineAssessmentResult } from "../demo-data/types";
import { createDemoState } from "../demo-data/seed";
import { demoReducer } from "../state/demo-provider";
import { buildDevOpsRoadmap, devOpsRoadmapSteps, roadmapUnlocks } from "./personalized-roadmap";

const example: BaselineAssessmentResult = {
  answers: {},
  overallScore: 43,
  skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 },
  correctCount: 0,
  totalQuestions: 12,
};

describe("personalized DevOps roadmap", () => {
  it("uses the requested prerequisite order and recommends Docker for the example", () => {
    const skills = buildDevOpsRoadmap(example, [], 6, "Docker");
    expect(skills.map((skill) => skill.name)).toEqual(["Linux", "Git", "Networking", "Docker", "CI/CD", "Cloud", "Terraform", "Kubernetes", "Monitoring"]);
    expect(skills.map((skill) => skill.prerequisites)).toEqual([[], ...devOpsRoadmapSteps.slice(0, -1).map((step) => [step.id])]);
    expect(skills.map((skill) => skill.status)).toEqual(["completed", "completed", "completed", "in-progress", "locked", "locked", "locked", "locked", "locked"]);
    expect(skills.find((skill) => skill.id === "docker")).toMatchObject({ proficiency: 44, targetScore: 75, estimatedWeeks: 2 });
    expect(roadmapUnlocks(skills, "docker")).toEqual(["CI/CD"]);
  });

  it("changes time estimates with the student's weekly hours", () => {
    const prior = createDemoState().careerSkills;
    const sixHours = buildDevOpsRoadmap(example, prior, 6, "Docker");
    const threeHours = buildDevOpsRoadmap(example, prior, 3, "Docker");
    expect(threeHours.find((skill) => skill.id === "docker")!.estimatedWeeks).toBeGreaterThan(sixHours.find((skill) => skill.id === "docker")!.estimatedWeeks!);
  });

  it("preserves verified evidence on a retake", () => {
    const first = buildDevOpsRoadmap(example, [], 6, "Docker");
    const prior = first.map((skill) => skill.id === "linux" ? { ...skill, status: "verified" as const } : skill);
    expect(buildDevOpsRoadmap(example, prior, 6, "Docker")[0].status).toBe("verified");
  });

  it("keeps an untouched, unlocked first skill available", () => {
    const zero = { ...example, skillScores: { Linux: 0, Git: 0, Networking: 0, Docker: 0, "CI/CD": 0, Cloud: 0 } };
    const skills = buildDevOpsRoadmap(zero, [], 6, "Linux");
    expect(skills[0].status).toBe("available");
    expect(skills[1].status).toBe("locked");
  });

  it("stores the roadmap in the existing career skill state on assessment submission", () => {
    const state = createDemoState();
    const updated = demoReducer(state, { type: "set-assessment", result: example });
    expect(updated.careerSkills).toHaveLength(9);
    expect(updated.careerSkills.find((skill) => skill.id === "networking")?.status).toBe("completed");
    expect(updated.skillGap?.recommendedSkill).toBe("Docker");
  });
});
