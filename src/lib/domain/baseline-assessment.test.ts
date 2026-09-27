import { describe, expect, it } from "vitest";
import { baselineQuestions, baselineSkills, scoreBaselineAssessment } from "./baseline-assessment";

describe("DevOps baseline assessment", () => {
  it("has twelve unique questions, two for each skill, with valid answers and weights", () => {
    expect(baselineQuestions).toHaveLength(12);
    expect(new Set(baselineQuestions.map((question) => question.id)).size).toBe(12);
    for (const skill of baselineSkills) expect(baselineQuestions.filter((question) => question.skill === skill)).toHaveLength(2);
    for (const question of baselineQuestions) {
      expect(question.options).toContain(question.correctAnswer);
      expect(question.options.length).toBeGreaterThanOrEqual(3);
      expect(question.weight).toBeGreaterThan(0);
    }
  });

  it("rejects missing or invalid answers", () => {
    expect(scoreBaselineAssessment({})).toBeNull();
    const answers = Object.fromEntries(baselineQuestions.map((question) => [question.id, question.correctAnswer]));
    answers[baselineQuestions[0].id] = "invalid";
    expect(scoreBaselineAssessment(answers)).toBeNull();
  });

  it("scores weighted answers for each skill and overall", () => {
    const correct = Object.fromEntries(baselineQuestions.map((question) => [question.id, question.correctAnswer]));
    const perfect = scoreBaselineAssessment(correct);
    expect(perfect?.overallScore).toBe(100);
    expect(perfect?.correctCount).toBe(12);
    for (const skill of baselineSkills) expect(perfect?.skillScores[skill]).toBe(100);

    const wrong = Object.fromEntries(baselineQuestions.map((question) => [question.id, question.options.find((option) => option !== question.correctAnswer)!]));
    expect(scoreBaselineAssessment(wrong)?.overallScore).toBe(0);

    const oneCorrect = { ...wrong, [baselineQuestions[0].id]: baselineQuestions[0].correctAnswer };
    expect(scoreBaselineAssessment(oneCorrect)).toMatchObject({ overallScore: 6, correctCount: 1, skillScores: { Linux: 33, Git: 0 } });
  });
});
