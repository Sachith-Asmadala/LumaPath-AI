import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { freePathForSkill } from "@/data/demo/free-learning-paths";
import type { BaselineAssessmentResult, DemoState } from "@/data/demo/types";
import { demoReducer } from "@/state/demo-provider";
import { scheduleLearningPath } from "@/features/planner/domain/learning-path-scheduler";
import { dockerReassessmentQuestions, scoreDockerReassessment, selectLearningPathCompletion } from "@/features/career/domain/skill-reassessment";

const path = freePathForSkill("docker")!;
const baseline: BaselineAssessmentResult = {
  answers: {}, overallScore: 43, correctCount: 0, totalQuestions: 12,
  skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 },
};

function scheduledState(): DemoState {
  const assessed = demoReducer(createDemoState(), { type: "set-assessment", result: baseline });
  const schedule = scheduleLearningPath(assessed, path)!;
  return {
    ...assessed,
    scheduledPathBySkill: { docker: path.id },
    tasks: [...assessed.tasks, ...schedule.tasks],
    planBlocks: [...assessed.planBlocks, ...schedule.blocks],
  };
}

function answers(correctCount: number): Record<string, string> {
  return Object.fromEntries(dockerReassessmentQuestions.map((question, index) => [
    question.id, index < correctCount ? question.correctAnswer : question.options.find((option) => option !== question.correctAnswer)!,
  ]));
}

describe("Docker learning path verification", () => {
  it("scores five deterministic questions and rejects incomplete answers", () => {
    expect(dockerReassessmentQuestions).toHaveLength(5);
    expect(scoreDockerReassessment(answers(4))).toEqual({ score: 80, correctCount: 4 });
    expect(scoreDockerReassessment({})).toBeNull();
  });

  it("shows completion only after course and lab tasks finish, with independent project evidence", () => {
    const state = scheduledState();
    expect(selectLearningPathCompletion(state, "docker")?.pathComplete).toBe(false);
    const learned = {
      ...state,
      tasks: state.tasks.map((task) => task.id.startsWith(`learning-${path.id}-`) && !task.id.includes("-project-") && !task.id.includes("-verification-")
        ? { ...task, status: "completed" as const, progress: 100 } : task),
    };
    expect(selectLearningPathCompletion(learned, "docker")).toMatchObject({ courseComplete: true, practiceComplete: true, projectComplete: false, pathComplete: true, assessmentComplete: false });
  });

  it("requires a completed path, keeps failed attempts in progress, and verifies only at the target", () => {
    const state = scheduledState();
    expect(demoReducer(state, { type: "submit-docker-reassessment", answers: answers(4) })).toBe(state);
    const learned = {
      ...state,
      tasks: state.tasks.map((task) => task.id.startsWith(`learning-${path.id}-`) && !task.id.includes("-project-") && !task.id.includes("-verification-")
        ? { ...task, status: "completed" as const, progress: 100 } : task),
    };
    const bypass = demoReducer(learned, { type: "complete-task", taskId: "docker-lab" });
    expect(bypass.careerSkills.find((skill) => skill.id === "docker")?.status).toBe("in-progress");
    expect(demoReducer(bypass, { type: "complete-skill", skillId: "docker" })).toBe(bypass);
    expect(demoReducer(bypass, { type: "verify-evidence", evidenceId: "docker-assessment" })).toBe(bypass);

    const failed = demoReducer(bypass, { type: "submit-docker-reassessment", answers: answers(3) });
    expect(failed.skillReassessments.docker).toMatchObject({ previousScore: 44, newScore: 60, passed: false });
    expect(failed.careerSkills.find((skill) => skill.id === "docker")?.status).toBe("in-progress");
    expect(failed.readiness.score).toBe(bypass.readiness.score);
    expect(failed.evidence.find((item) => item.id === "docker-assessment")?.status).toBe("submitted");

    const passed = demoReducer(failed, { type: "submit-docker-reassessment", answers: answers(4) });
    expect(passed.skillReassessments.docker).toMatchObject({ previousScore: 44, newScore: 80, passed: true, readinessBefore: failed.readiness.score, readinessAfter: failed.readiness.score + 2 });
    expect(passed.careerSkills.find((skill) => skill.id === "docker")).toMatchObject({ status: "verified", proficiency: 80 });
    expect(passed.careerSkills.find((skill) => skill.id === "cicd")?.status).toBe("available");
    expect(passed.evidence.find((item) => item.id === "docker-assessment")).toMatchObject({ status: "verified", confidence: 80 });
    expect(passed.tasks.filter((task) => task.id.startsWith(`learning-${path.id}-verification-`)).every((task) => task.status === "completed")).toBe(true);
    expect(demoReducer(passed, { type: "submit-docker-reassessment", answers: answers(5) })).toBe(passed);
  });
});
