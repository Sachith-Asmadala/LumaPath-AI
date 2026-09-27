import type { BaselineAssessmentResult, BaselineSkill, SkillGapData, SkillGapLevel } from "../demo-data/types";
import { baselineSkills } from "./baseline-assessment";

export const strongThreshold = 70;
export const improveThreshold = 40;

const prerequisites: Record<BaselineSkill, readonly BaselineSkill[]> = {
  Linux: [],
  Git: ["Linux"],
  Networking: ["Linux"],
  Docker: ["Git"],
  "CI/CD": ["Docker"],
  Cloud: ["Git"],
};

export function skillGapLevel(score: number): SkillGapLevel {
  if (score >= strongThreshold) return "strong";
  return score >= improveThreshold ? "improve" : "gap";
}

export function generateSkillGap(result: BaselineAssessmentResult): SkillGapData {
  const levels = {} as Record<BaselineSkill, SkillGapLevel>;
  for (const skill of baselineSkills) levels[skill] = skillGapLevel(result.skillScores[skill]);

  const belowTarget = baselineSkills.filter((skill) => levels[skill] !== "strong");
  const eligible = belowTarget.filter((skill) => prerequisites[skill].every((required) => levels[required] === "strong"));

  // Prefer work that opens blocked downstream skills, then the lowest current score.
  const recommendedSkill = [...eligible].sort((left, right) => {
    const unlockCount = (skill: BaselineSkill) => baselineSkills.filter((candidate) =>
      levels[candidate] !== "strong" && prerequisites[candidate].includes(skill)).length;
    return unlockCount(right) - unlockCount(left)
      || result.skillScores[left] - result.skillScores[right]
      || baselineSkills.indexOf(left) - baselineSkills.indexOf(right);
  })[0] ?? null;

  return {
    levels,
    strong: baselineSkills.filter((skill) => levels[skill] === "strong"),
    improve: baselineSkills.filter((skill) => levels[skill] === "improve"),
    gap: baselineSkills.filter((skill) => levels[skill] === "gap"),
    recommendedSkill,
    prerequisiteSkills: recommendedSkill ? [...prerequisites[recommendedSkill]] : [],
    unlocks: recommendedSkill ? baselineSkills.filter((skill) => levels[skill] !== "strong" && prerequisites[skill].includes(recommendedSkill)) : [],
  };
}
