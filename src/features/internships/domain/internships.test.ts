import { describe, expect, it } from "vitest";
import { CLOSED_APPLICATION_STATUSES, STATUS_TRANSITIONS } from "@/features/internships/domain/internships";

describe("internship application workflow", () => {
  it("does not allow jumping from interested directly to applied", () => {
    expect(STATUS_TRANSITIONS.interested).toEqual(["preparing", "withdrawn"]);
    expect(STATUS_TRANSITIONS.interested).not.toContain("applied");
  });

  it("keeps closed outcomes terminal in the configured workflow", () => {
    for (const status of CLOSED_APPLICATION_STATUSES) expect(STATUS_TRANSITIONS[status]).toEqual([]);
  });

  it("supports the expected applied-to-response/interview outcomes", () => {
    expect(STATUS_TRANSITIONS.applied).toEqual(expect.arrayContaining(["awaiting_response", "interviewing", "offer", "rejected", "withdrawn"]));
  });
});
