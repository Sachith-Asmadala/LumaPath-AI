import { describe, expect, it } from "vitest";
import type { BaselineAssessmentResult } from "../demo-data/types";
import { createDemoState } from "../demo-data/seed";
import { demoReducer } from "../state/demo-provider";
import { generateSkillGap, skillGapLevel } from "./skill-gap";

const demoResult: BaselineAssessmentResult = {
  answers: {},
  overallScore: 43,
  skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 },
  correctCount: 0,
  totalQuestions: 12,
};

describe("assessment skill gaps", () => {
  it("uses the requested threshold boundaries", () => {
    expect(skillGapLevel(70)).toBe("strong");
    expect(skillGapLevel(69)).toBe("improve");
    expect(skillGapLevel(40)).toBe("improve");
    expect(skillGapLevel(39)).toBe("gap");
  });

  it("classifies the seeded example and recommends Docker before CI/CD", () => {
    const gap = generateSkillGap(demoResult);
    expect(gap.strong).toEqual(["Linux", "Git"]);
    expect(gap.improve).toEqual(["Networking", "Docker"]);
    expect(gap.gap).toEqual(["CI/CD", "Cloud"]);
    expect(gap.recommendedSkill).toBe("Docker");
    expect(gap.prerequisiteSkills).toEqual(["Git"]);
    expect(gap.unlocks).toEqual(["CI/CD"]);
    expect(demoReducer(createDemoState(), { type: "set-assessment", result: demoResult }).skillGap).toEqual(gap);
  });

  it("recommends a prerequisite before a blocked downstream gap", () => {
    const result = { ...demoResult, skillScores: { ...demoResult.skillScores, Git: 50, Docker: 20 } };
    expect(generateSkillGap(result).recommendedSkill).toBe("Git");
  });

  it("has no next skill when every assessed skill is on target", () => {
    const result = { ...demoResult, skillScores: { Linux: 70, Git: 70, Networking: 70, Docker: 70, "CI/CD": 70, Cloud: 70 } };
    expect(generateSkillGap(result).recommendedSkill).toBeNull();
  });
});
