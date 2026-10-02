import { describe, expect, it } from "vitest";
import { canCoordinateTeamWork, canCorrectActivityRecord, fitTone } from "@/features/teams/domain/teams";

describe("DOC-F21 team collaboration domain", () => {
  it("keeps assignment approval limited to coordinators, owners or the explicit project owner", () => {
    expect(canCoordinateTeamWork("owner", "m1", "m2")).toBe(true);
    expect(canCoordinateTeamWork("coordinator", "m1", "m2")).toBe(true);
    expect(canCoordinateTeamWork("member", "m1", "m1")).toBe(true);
    expect(canCoordinateTeamWork("member", "m1", "m2")).toBe(false);
  });

  it("never treats corrected/correction events as correctable originals", () => {
    expect(canCorrectActivityRecord("member", "m1", { actor_membership_id: "m1", corrected: false, correction_of_event_id: null })).toBe(true);
    expect(canCorrectActivityRecord("member", "m1", { actor_membership_id: "m1", corrected: true, correction_of_event_id: null })).toBe(false);
    expect(canCorrectActivityRecord("owner", "m1", { actor_membership_id: "m2", corrected: false, correction_of_event_id: 3 })).toBe(false);
  });

  it("visually separates strong and cautionary allocation states without an effort rank", () => {
    expect(fitTone("strong")).toContain("text-success");
    expect(fitTone("capacity_conflict")).toContain("text-warning");
    expect(fitTone("skill_gap")).toContain("text-warning");
  });
});
