import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { scenarioAt } from "@/data/demo/scenario";
import { selectActionableSkill, selectAgenda, selectTaskCollection } from "@/features/workspace/domain/workspace";
import { weeklyPlannedHours } from "@/features/dashboard/domain/dashboard";
import { demoReducer } from "@/state/demo-provider";

describe("workspace collections", () => {
  it("combines task filters and sorts without mutating shared tasks", () => {
    const state = createDemoState();
    const before = structuredClone(state.tasks);
    const result = selectTaskCollection(state.tasks, { view: "active", query: "database", category: "Academic", sort: "deadline" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((task) => task.category === "Academic" && task.title.toLowerCase().includes("database"))).toBe(true);
    expect(state.tasks).toEqual(before);
    const sorted = selectTaskCollection(state.tasks, { view: "all", query: "", category: "all", sort: "duration" });
    expect(sorted.map((task) => task.estimatedMinutes)).toEqual([...state.tasks].map((task) => task.estimatedMinutes).sort((a, b) => a - b));
  });
  it("never recommends an unmet prerequisite, even if the skill is marked in progress", () => {
    const state = createDemoState();
    expect(selectActionableSkill(state)?.id).toBe("docker");
    state.careerSkills = state.careerSkills.map((skill) => skill.id === "git" ? { ...skill, status: "locked" } : skill);
    expect(selectActionableSkill(state)?.id).not.toBe("docker");
    state.careerSkills = state.careerSkills.map((skill) => ({ ...skill, status: "verified" }));
    expect(selectActionableSkill(state)).toBeUndefined();
  });
  it("groups every plan block chronologically and includes career-learning in analytics", () => {
    const state = createDemoState();
    state.planBlocks = [{ id: "later", taskId: null, title: "Project", category: "career-learning", startAt: scenarioAt(2, "19:00:00"), endAt: scenarioAt(2, "20:30:00") }, { id: "earlier", taskId: null, title: "Study", category: "Academic", startAt: scenarioAt(0, "10:00:00"), endAt: scenarioAt(0, "11:00:00") }];
    expect(selectAgenda(state).map((day) => day.blocks[0].id)).toEqual(["earlier", "later"]);
    expect(selectAgenda(state)[1].minutes).toBe(90);
    expect(weeklyPlannedHours(state)[2].career).toBe(1.5);
  });
  it("undo preserves other feed updates and cannot unplan a scheduled item", () => {
    const seed = createDemoState();
    const dismissed = demoReducer(seed, { type: "set-feed-status", itemId: "container-release", status: "dismissed" });
    const saved = demoReducer(dismissed, { type: "set-feed-status", itemId: "kubernetes-fundamentals", status: "saved" });
    const undo = demoReducer(saved, { type: "set-feed-status", itemId: "container-release", status: "new" });
    expect(undo.intelligenceItems.find((item) => item.id === "kubernetes-fundamentals")?.status).toBe("saved");
    const planned = demoReducer(undo, { type: "plan-intelligence", itemId: "container-release" });
    expect(demoReducer(planned, { type: "set-feed-status", itemId: "container-release", status: "new" })).toBe(planned);
    expect(demoReducer(planned, { type: "plan-intelligence", itemId: "container-release" })).toBe(planned);
  });
  it("rejects invalid focus minutes without changing progress", () => {
    const state = createDemoState();
    for (const minutes of [0, -25, NaN, Infinity]) expect(demoReducer(state, { type: "complete-focus-session", taskId: "docker-lab", minutes })).toBe(state);
  });
});
