import { describe, expect, it } from "vitest";
import { isCvDocument } from "@/features/cv/domain/cv";

describe("CV frontend contract", () => {
  it("requires a reviewable section list for a valid document", () => {
    expect(isCvDocument({ id: "cv-1", title: "CV", sections: [], sections_confirmed: false })).toBe(true);
    expect(isCvDocument({ id: "cv-1", title: "CV" })).toBe(false);
  });

  it("keeps source status separate from analysis", () => {
    const document = { id: "cv-1", title: "CV", sections: [{ key: "skills", title: "Skills", content: "Python" }], sections_confirmed: true, parse_status: "source_deleted", latest_analysis: { id: "a1" } };
    expect(isCvDocument(document)).toBe(true);
    expect(document.parse_status).toBe("source_deleted");
  });
});
