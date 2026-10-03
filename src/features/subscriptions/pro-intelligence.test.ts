import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import { scenarioAt } from "@/data/demo/scenario";
import { advancedPriorityFactors, buildAutomaticPlan, changedBlocks, defaultProPreferences } from "./pro-intelligence";
import { availableCapacity } from "@/features/dashboard/domain/dashboard";

const minutes = (start: string, end: string) => (Date.parse(end)-Date.parse(start))/60_000;
describe("Pro automatic planning", () => {
  it("keeps protected work and fits movable blocks around events, capacity and deadlines", () => {
    const state = createDemoState();
    const before = structuredClone(state);
    const result = buildAutomaticPlan(state, defaultProPreferences(state));
    expect(state).toEqual(before);
    expect(result.blocks.map(block => block.id).sort()).toEqual(state.planBlocks.map(block => block.id).sort());
    for (const block of state.planBlocks) {
      const task = state.tasks.find(task => task.id === block.taskId);
      if (block.isFixed || block.isFocusBlock || task?.status === "completed") expect(result.blocks.find(item => item.id === block.id)).toEqual(block);
    }
    for (const block of result.blocks.filter(item => !item.isConflict)) {
      const task = state.tasks.find(task => task.id === block.taskId);
      if (task?.dueAt) expect(Date.parse(block.endAt)).toBeLessThanOrEqual(Date.parse(task.dueAt));
      expect(result.blocks.filter(other => other.id !== block.id && !other.isConflict).some(other => Date.parse(block.startAt)<Date.parse(other.endAt) && Date.parse(block.endAt)>Date.parse(other.startAt))).toBe(false);
    }
    const days = new Set(result.blocks.filter(block => !block.isConflict).map(block => block.startAt.slice(0,10)));
    for (const day of days) {
      const total = result.blocks.filter(block => !block.isFixed && !block.isConflict && block.startAt.startsWith(day)).reduce((sum,block)=>sum+minutes(block.startAt,block.endAt),0);
      expect(total).toBeLessThanOrEqual(availableCapacity(state.capacity));
    }
  });
  it("preserves original work and reports unresolved slots when capacity is zero", () => {
    const state = createDemoState();
    state.capacity = {...state.capacity, availableMinutes:0, unexpectedCommitmentMinutes:0};
    const result = buildAutomaticPlan(state, defaultProPreferences(state));
    expect(result.unscheduled.length).toBeGreaterThan(0);
    expect(changedBlocks(state.planBlocks, result.blocks)).toEqual([]);
    expect(result.blocks).toHaveLength(state.planBlocks.length);
  });
  it("moves an urgent deadline ahead of career work and respects the weekly career budget", () => {
    const state = createDemoState();
    state.planBlocks = state.planBlocks.filter(block => ['block-database','block-docker'].includes(block.id));
    expect(state.planBlocks.length).toBe(2);
    state.tasks = state.tasks.map(task => task.id === 'database-assignment' ? {...task,dueAt:scenarioAt(0,'10:00'),riskScore:99} : task);
    const result = buildAutomaticPlan(state,{...defaultProPreferences(state),weeklyHours:1});
    const academic = result.blocks.find(block=>block.taskId==='database-assignment')!;
    expect(Date.parse(academic.endAt)).toBeLessThanOrEqual(Date.parse(scenarioAt(0,'10:00')));
    expect(academic.isConflict).toBe(false);
    for (let week=0;week<2;week++) {
      const career = result.blocks.filter(block=>block.category==='Career' && !block.isConflict && block.startAt>=scenarioAt(week*7,'00:00') && block.startAt<scenarioAt((week+1)*7,'00:00'));
      expect(career.reduce((sum,block)=>sum+minutes(block.startAt,block.endAt),0)).toBeLessThanOrEqual(60);
    }
  });
  it("explains priorities using five separate evidence and planning factors", () => {
    const state=createDemoState();
    const factors=advancedPriorityFactors(state);
    expect(factors.map(item=>item.label)).toEqual(['Deadline urgency','Career relevance','Dependency impact','Evidence confidence','Capacity fit']);
    state.evidence=[];
    expect(advancedPriorityFactors(state).find(item=>item.label==='Evidence confidence')?.value).toBe('Not yet evidenced');
  });
});
