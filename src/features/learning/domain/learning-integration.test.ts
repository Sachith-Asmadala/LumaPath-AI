import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { freePathForSkill } from "@/data/demo/free-learning-paths";
import { demoReducer } from "@/state/demo-provider";
import { completionEligibility, externalCertificateEvidence, learningProgress, safeExternalUrl } from "@/features/learning/domain/learning";
import { reassessmentQuestions } from "@/features/career/domain/path-assessments";
import { contextualReply } from "@/features/assistant/domain/contextual-reply";

const at = "2026-09-28T10:00:00Z";
function planned() {
  let state = createDemoState();
  state = { ...state, student: { ...state.student, id: "student-onboarded" }, onboarding: { ...state.onboarding, completed: true, weeklyLearningHours: 8 } };
  state = demoReducer(state, { type: "set-assessment", at, result: { answers: {}, overallScore: 43, correctCount: 0, totalQuestions: 12, skillScores: { Linux: 82, Git: 74, Networking: 61, Docker: 44, "CI/CD": 23, Cloud: 31 } } });
  state = demoReducer(state, { type: "add-free-path", skillId: "docker", pathId: freePathForSkill("docker")!.id });
  return demoReducer(state, { type: "schedule-free-path", skillId: "docker", pathId: freePathForSkill("docker")!.id });
}

describe("connected learning", () => {
  it("provides a free path and deterministic assessment for every DevOps stage", () => {
    for (const skill of ["linux", "git", "networking", "docker", "cicd", "cloud", "terraform", "kubernetes", "monitoring"]) {
      expect(freePathForSkill(skill)?.steps.some((step) => step.kind === "portfolio project")).toBe(true);
      expect(reassessmentQuestions(skill).length).toBeGreaterThanOrEqual(3);
    }
  });

  it("requires genuine completion, project evidence and a passing attempt for a local record", () => {
    let state = planned();
    const learning = learningProgress(state, "docker")!;
    expect(learning.scheduled).toBe(true);
    expect(completionEligibility(state, "docker").eligible).toBe(false);
    expect(demoReducer(state, { type: "record-completion", skillId: "docker", at })).toBe(state);
    const verification = learning.steps.find((step) => step.id === "verification")!.tasks[0];
    expect(demoReducer(state, { type: "complete-task", taskId: verification.id, at })).toBe(state);
    expect(demoReducer(state, { type: "complete-focus-session", taskId: verification.id, minutes: 60 })).toBe(state);
    for (const task of learning.steps.filter((step) => step.id !== "verification").flatMap((step) => step.tasks)) state = demoReducer(state, { type: "complete-task", taskId: task.id, at });
    const answers = Object.fromEntries(reassessmentQuestions("docker").map((question) => [question.id, question.correctAnswer]));
    state = demoReducer(state, { type: "submit-skill-reassessment", skillId: "docker", answers, at });
    expect(state.skillReassessments.docker?.passed).toBe(true);
    expect(state.careerSkills.find((skill) => skill.id === "cicd")?.status).toBe("available");
    expect(completionEligibility(state, "docker").eligible).toBe(false);
    state = demoReducer(state, { type: "submit-project", skillId: "docker", url: "https://example.com/my-project", at });
    expect(completionEligibility(state, "docker").eligible).toBe(true);
    state = demoReducer(state, { type: "record-completion", skillId: "docker", at });
    expect(state.completionRecords).toHaveLength(1);
    expect(demoReducer(state, { type: "record-completion", skillId: "docker", at })).toBe(state);
    const removed = demoReducer(state, { type: "remove-personal-evidence", evidenceId: "project-docker" });
    expect(removed.completionRecords).toHaveLength(0);
    expect(removed.assessmentHistory).toHaveLength(2);
  });

  it("validates external records without granting verification or readiness", () => {
    const state = planned();
    const input = { title: "Earned course certificate", provider: "External provider", course: "My course", skillId: "docker", completedAt: "2026-09-01", url: "https://example.com/certificate", credentialId: "123" };
    expect(safeExternalUrl("javascript:alert(1)")).toBeNull();
    expect(safeExternalUrl("https://user:password@example.com")).toBeNull();
    expect(externalCertificateEvidence(state, { ...input, completedAt: "2026-02-30" }, at)).toBeNull();
    const added = demoReducer(state, { type: "add-certificate", input, at });
    expect(added.readiness.score).toBe(state.readiness.score);
    const certificate = added.evidence.find((item) => item.kind === "external-certificate")!;
    expect(certificate.status).toBe("self-reported");
    expect(demoReducer(added, { type: "verify-evidence", evidenceId: certificate.id })).toBe(added);
    expect(demoReducer(added, { type: "add-certificate", input, at })).toBe(added);
  });

  it("clears private context without moving tasks and responds to explicit crisis language", () => {
    const state = createDemoState();
    state.capacity = { ...state.capacity, lifeLoadFactors: { "Family responsibilities": "High" }, lifeLoadNote: "Private note" };
    const cleared = demoReducer(state, { type: "clear-life-load" });
    expect(cleared.capacity.lifeLoadNote).toBe("");
    expect(cleared.capacity.lifeLoadFactors).toEqual({});
    expect(cleared.planBlocks).toEqual(state.planBlocks);
    expect(contextualReply("I might hurt myself", "/planner", state)).toContain("emergency");
    expect(contextualReply("My workload", "/planner", state)).not.toContain("Private note");
  });
});
