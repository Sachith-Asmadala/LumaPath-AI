import { describe, expect, it } from "vitest";
import { OPPORTUNITY_CATEGORIES, OPPORTUNITY_TRACKING_STATUSES } from "@/features/opportunities/domain/opportunities";

describe("DOC-F32 opportunity readiness domain", () => {
  it("covers every governed catalogue category exactly once", () => {
    expect(new Set(OPPORTUNITY_CATEGORIES).size).toBe(7);
    expect(OPPORTUNITY_CATEGORIES).toEqual(expect.arrayContaining(["internship", "hackathon", "competition", "workshop", "scholarship", "certification", "university_event"]));
  });

  it("keeps university events distinct from career opportunities", () => {
    expect(OPPORTUNITY_CATEGORIES.filter((item) => item === "university_event")).toHaveLength(1);
  });

  it("supports the complete student-owned application lifecycle", () => {
    expect(OPPORTUNITY_TRACKING_STATUSES).toEqual(["interested", "preparing", "applied", "follow_up", "result"]);
    expect(new Set(OPPORTUNITY_TRACKING_STATUSES).size).toBe(OPPORTUNITY_TRACKING_STATUSES.length);
  });
});
