import { describe, expect, it } from "vitest";
import { EVIDENCE_TYPES, statusTone } from "@/features/evidence-passport/domain/evidence-passport";

describe("DOC-F31 evidence passport domain", () => {
  it("covers every supported evidence type exactly once", () => {
    expect(new Set(EVIDENCE_TYPES).size).toBe(6);
    expect(EVIDENCE_TYPES).toEqual(expect.arrayContaining(["manual_project","repository","live_demo","certificate","assessment","mentor_validation"]));
  });

  it("keeps disputed evidence visually distinct from trusted evidence", () => {
    expect(statusTone("observed")).toContain("text-success");
    expect(statusTone("reviewed")).toContain("text-success");
    expect(statusTone("disputed")).toContain("text-destructive");
    expect(statusTone("stale")).toContain("text-warning");
  });
});
