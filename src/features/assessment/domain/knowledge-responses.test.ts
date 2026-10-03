import { describe, expect, it } from "vitest";
import { baselineQuestions, scoreBaselineAssessment } from "./baseline-assessment";
import { knowledgeResponses, withKnowledgeResponses } from "./knowledge-responses";
import { reassessmentQuestions, scoreSkillReassessment } from "@/features/career/domain/path-assessments";
import { dockerReassessmentQuestions, scoreDockerReassessment } from "@/features/career/domain/skill-reassessment";

describe("honest quiz responses", () => {
  it.each(knowledgeResponses)("accepts '%s' as an answered question without awarding points", answer => {
    const answers = Object.fromEntries(baselineQuestions.map(question => [question.id, answer]));
    expect(scoreBaselineAssessment(answers)).toMatchObject({ answers, correctCount: 0, overallScore: 0 });
    const dockerAnswers = Object.fromEntries(dockerReassessmentQuestions.map(question => [question.id, answer]));
    expect(scoreDockerReassessment(dockerAnswers)).toEqual({ score: 0, correctCount: 0 });
    for (const skill of ['linux','git','networking','docker','cicd','cloud','terraform','kubernetes','monitoring']) {
      const questions = reassessmentQuestions(skill);
      expect(questions.length).toBeGreaterThan(0);
      for (const question of questions) expect(question.options.slice(-2)).toEqual(knowledgeResponses);
      expect(scoreSkillReassessment(skill, Object.fromEntries(questions.map(question => [question.id,answer])))).toMatchObject({score:0,correctCount:0});
    }
  });
  it("preserves correct choices and avoids duplicate reflection responses", () => {
    const options = ['Correct','Incorrect',...knowledgeResponses];
    expect(withKnowledgeResponses(options)).toEqual(options);
    expect(scoreBaselineAssessment(Object.fromEntries(baselineQuestions.map(question => [question.id,question.correctAnswer])))?.overallScore).toBe(100);
    expect(scoreBaselineAssessment({})).toBeNull();
  });
});
