import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { buildAssistantContextSnapshot, isStudyAssistantResponse, responseNeedsQuestion, studyContextOptions } from "@/features/assistant/domain/study-assistant";

describe("Study Assistant context assembly", () => {
  it("builds only the current student's module, task, goal, capacity and saved-material references", () => {
    const state = createDemoState();
    state.student = { ...state.student, id: "student-onboarded" };
    state.onboarding = { ...state.onboarding, completed: true, currentModules: "Database Systems, Software Engineering", goal: "internship" };
    state.resourceBookmarks = ["docker-notes-core"];
    const options = studyContextOptions(state);
    expect(options.some((item) => item.kind === "module" && item.label === "Database Systems")).toBe(true);
    expect(options.some((item) => item.kind === "task" && item.id === "database-assignment")).toBe(true);
    expect(options.some((item) => item.kind === "learning_objective" && item.id === "skill-docker")).toBe(true);

    const snapshot = buildAssistantContextSnapshot(state);
    expect(snapshot.student_id).toBe("student-onboarded");
    expect(snapshot.modules.map((module) => module.name).sort()).toEqual([
      "Applied Statistics", "Cloud Computing", "Computer Networks", "Database Systems", "Operating Systems", "Software Engineering",
    ]);
    expect(snapshot.tasks.every((task) => task.owner_id === "student-onboarded")).toBe(true);
    expect(snapshot.plan_blocks.every((block) => block.owner_id === "student-onboarded")).toBe(true);
    expect(snapshot.materials[0]).toMatchObject({ id: "docker-notes-core", owner_id: "student-onboarded" });
    expect(snapshot.capacity.planning_minutes).toBeLessThanOrEqual(snapshot.capacity.available_minutes);
  });

  it("requires a question only for concept explanation", () => {
    expect(responseNeedsQuestion("concept_explanation")).toBe(true);
    expect(responseNeedsQuestion("revision_plan")).toBe(false);
    expect(responseNeedsQuestion("quiz")).toBe(false);
  });
});

describe("Study Assistant structured output validation", () => {
  it("accepts the expected response contract and rejects unrestricted text", () => {
    const valid = {
      response_id: "resp-1", session_id: "session-1", mode: "concept_explanation", title: "Concept help", summary: "Summary",
      requested_locale: "en", response_locale: "en", locale_fallback: false,
      blocks: [{ kind: "explanation", title: "Understand", body: "Body", items: [], quiz: [] }],
      context_used: [{ kind: "module", id: "module-db", label: "Database Systems" }], why_this: "Selected context", proposed_actions: [], citations: [], warnings: [], general_guidance: true,
    };
    expect(isStudyAssistantResponse(valid)).toBe(true);
    expect(isStudyAssistantResponse("plain unrestricted model text")).toBe(false);
    expect(isStudyAssistantResponse({ ...valid, blocks: [] })).toBe(false);
  });
});
