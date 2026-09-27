import { describe, expect, it } from "vitest";
import { createDemoState } from "./seed";
import { canCompleteOnboarding, moduleNames } from "./onboarding";
import { demoReducer } from "../state/demo-provider";

const completeDraft = {
  name: "  Asha Perera  ",
  university: "Colombo University",
  degree: "Computer Science",
  academicYear: "Year 3",
  semester: "Semester 2",
  currentModules: "Databases, Cloud Systems\nSoftware Engineering",
  careerGoal: "DevOps Engineer" as const,
  weeklyLearningHours: 8,
  budget: "under $20/month" as const,
  preferredLearning: ["hands-on" as const, "projects" as const],
  language: "English",
  goal: "internship" as const,
};

describe("student onboarding", () => {
  it("requires academic context and at least one learning format", () => {
    const initial = createDemoState();
    expect(canCompleteOnboarding(initial.onboarding)).toBe(false);
    expect(canCompleteOnboarding({ ...initial.onboarding, ...completeDraft, preferredLearning: [] })).toBe(false);
    expect(canCompleteOnboarding({ ...initial.onboarding, ...completeDraft })).toBe(true);
    expect(moduleNames(completeDraft.currentModules)).toEqual(["Databases", "Cloud Systems", "Software Engineering"]);
  });

  it("commits the new student without resetting dashboard demo work", () => {
    const initial = createDemoState();
    const edited = demoReducer(initial, { type: "update-onboarding", patch: completeDraft });
    const completed = demoReducer(edited, { type: "complete-onboarding" });
    expect(completed.onboarding.completed).toBe(true);
    expect(completed.student.name).toBe("Asha Perera");
    expect(completed.student.initials).toBe("AP");
    expect(completed.student.university).toBe("Colombo University");
    expect(completed.tasks).toEqual(initial.tasks);
    expect(demoReducer(completed, { type: "reset" }).onboarding).toEqual(completed.onboarding);
  });
});
