import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { buildDocumentPlannerContext, documentStatusLabel, formatBytes, isStudentDocument } from "@/features/documents/domain/documents";

describe("document workspace domain", () => {
  it("builds owner-scoped planner validation context from the existing prototype state", () => {
    const state = createDemoState();
    state.student = { ...state.student, id: "student-docs" };
    const context = buildDocumentPlannerContext(state);
    expect(context.student_id).toBe("student-docs");
    expect(context.plan_blocks.length).toBe(state.planBlocks.length);
    expect(context.plan_blocks.every((block) => block.owner_id === "student-docs")).toBe(true);
    expect(context.planning_minutes).toBeGreaterThanOrEqual(0);
  });

  it("recognises the structured document response instead of arbitrary text", () => {
    expect(isStudentDocument({ id: "doc-1", original_name: "week4.pdf", status: "ready" })).toBe(true);
    expect(isStudentDocument("plain text")).toBe(false);
    expect(isStudentDocument({ id: "doc-1", original_name: "week4.pdf", status: "invented" })).toBe(false);
  });

  it("uses stable labels for status and file size", () => {
    expect(documentStatusLabel("processing")).toBe("Processing");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });
});
