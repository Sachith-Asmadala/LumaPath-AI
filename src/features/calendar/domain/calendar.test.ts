import { describe, expect, it } from "vitest";
import { createDemoState } from "@/data/demo/seed";
import {
  applyCalendarActions,
  buildCalendarExistingRecords,
  defaultCalendarDecision,
  type CalendarApplyAction,
  type CalendarPreviewItem,
} from "@/features/calendar/domain/calendar";

const previewItem = (change_type: CalendarPreviewItem["change_type"], matched_internal_id: string | null = null): CalendarPreviewItem => ({
  preview_key: `preview-${change_type}`,
  external_id: "source-1",
  recurrence_key: "base",
  kind: "lecture",
  title: "Networks Lecture",
  description: "Untrusted external description",
  start_at: "2026-10-20T03:30:00.000Z",
  end_at: "2026-10-20T04:30:00.000Z",
  timezone: "Asia/Colombo",
  confidence: 0.95,
  source_updated_at: null,
  change_type,
  matched_internal_id,
  mapped_record_type: matched_internal_id ? "planner_event" : null,
  conflict_internal_ids: [],
  override_fields: [],
  source_warning: null,
  selected_by_default: change_type === "new" || change_type === "changed",
});

describe("DOC-F23 calendar client mapping", () => {
  it("sends only record identity/timing fields for duplicate and override detection", () => {
    const state = createDemoState();
    state.tasks[0].description = "PRIVATE TASK NOTES SHOULD NOT LEAVE THE CLIENT";
    const records = buildCalendarExistingRecords(state);
    const serialized = JSON.stringify(records);
    expect(records.some((record) => record.record_type === "task")).toBe(true);
    expect(records.some((record) => record.record_type === "planner_event")).toBe(true);
    expect(serialized).not.toContain("PRIVATE TASK NOTES SHOULD NOT LEAVE THE CLIENT");
    expect(serialized).not.toContain("careerSkillIds");
  });

  it("uses review-safe defaults for new, changed, duplicate, conflict and deleted items", () => {
    expect(defaultCalendarDecision(previewItem("new"))).toBe("import");
    expect(defaultCalendarDecision(previewItem("changed"))).toBe("update");
    expect(defaultCalendarDecision(previewItem("duplicate", "plan-existing"))).toBe("link_existing");
    expect(defaultCalendarDecision(previewItem("conflict"))).toBe("skip");
    expect(defaultCalendarDecision(previewItem("deleted"))).toBe("skip");
  });

  it("creates source-traceable academic tasks and fixed planner events only after approved actions", () => {
    const state = createDemoState();
    const actions: CalendarApplyAction[] = [
      {
        operation: "create",
        external_item_id: "calitem-deadline",
        internal_record_id: "calendar-task-deadline",
        record_type: "task",
        title: "Database Assignment Deadline",
        kind: "deadline",
        start_at: null,
        end_at: null,
        due_at: "2026-10-22T18:29:00.000Z",
        source_label: "Calendar · academic.ics",
        override_fields: [],
      },
      {
        operation: "create",
        external_item_id: "calitem-exam",
        internal_record_id: "calendar-event-exam",
        record_type: "planner_event",
        title: "Database Exam",
        kind: "exam",
        start_at: "2026-10-25T03:30:00.000Z",
        end_at: "2026-10-25T05:30:00.000Z",
        due_at: null,
        source_label: "Calendar · academic.ics",
        override_fields: [],
      },
    ];
    const next = applyCalendarActions(state, actions);
    const task = next.tasks.find((item) => item.id === "calendar-task-deadline");
    const block = next.planBlocks.find((item) => item.id === "calendar-event-exam");
    expect(task).toMatchObject({ category: "Academic", externalId: "calitem-deadline", source: "Calendar · academic.ics" });
    expect(task?.dueAt).toBe("2026-10-22T18:29:00.000Z");
    expect(block).toMatchObject({ isFixed: true, externalId: "calitem-exam", source: "Calendar · academic.ics" });
  });

  it("preserves personal overrides during a source update", () => {
    const state = createDemoState();
    state.planBlocks.push({
      id: "calendar-event-1",
      taskId: null,
      title: "My renamed lecture",
      category: "Academic",
      startAt: "2026-10-20T04:00:00.000Z",
      endAt: "2026-10-20T05:00:00.000Z",
      isFixed: true,
      externalId: "calitem-1",
      source: "Calendar · source.ics",
    });
    const next = applyCalendarActions(state, [{
      operation: "update",
      external_item_id: "calitem-1",
      internal_record_id: "calendar-event-1",
      record_type: "planner_event",
      title: "Source lecture changed",
      kind: "lecture",
      start_at: "2026-10-20T06:00:00.000Z",
      end_at: "2026-10-20T07:00:00.000Z",
      due_at: null,
      source_label: "Calendar · source.ics",
      override_fields: ["title", "start_at"],
    }]);
    const block = next.planBlocks.find((item) => item.id === "calendar-event-1");
    expect(block?.title).toBe("My renamed lecture");
    expect(block?.startAt).toBe("2026-10-20T04:00:00.000Z");
    expect(block?.endAt).toBe("2026-10-20T07:00:00.000Z");
  });

  it("detaches or deletes imported records without damaging unrelated plan data", () => {
    const state = createDemoState();
    const originalTaskCount = state.tasks.length;
    state.planBlocks.push({
      id: "calendar-event-remove",
      taskId: null,
      title: "Workshop",
      category: "Academic",
      startAt: "2026-10-20T04:00:00.000Z",
      endAt: "2026-10-20T05:00:00.000Z",
      isFixed: true,
      externalId: "calitem-remove",
      source: "Calendar · source.ics",
    });
    state.tasks.push({
      id: "calendar-task-keep",
      title: "Imported deadline",
      category: "Academic",
      status: "upcoming",
      estimatedMinutes: 60,
      progress: 0,
      difficulty: 2,
      careerSkillIds: [],
      riskScore: 10,
      careerRelevance: 10,
      description: "Imported",
      externalId: "calitem-keep",
      source: "Calendar · source.ics",
    });
    const next = applyCalendarActions(state, [
      { operation: "delete", external_item_id: "calitem-remove", internal_record_id: "calendar-event-remove", record_type: "planner_event", title:null, kind:null, start_at:null, end_at:null, due_at:null, source_label:null, override_fields:[] },
      { operation: "detach", external_item_id: "calitem-keep", internal_record_id: "calendar-task-keep", record_type: "task", title:null, kind:null, start_at:null, end_at:null, due_at:null, source_label:null, override_fields:[] },
    ]);
    expect(next.planBlocks.some((item) => item.id === "calendar-event-remove")).toBe(false);
    const detached = next.tasks.find((item) => item.id === "calendar-task-keep");
    expect(detached?.externalId).toBeUndefined();
    expect(detached?.source).toBeUndefined();
    expect(next.tasks.length).toBe(originalTaskCount + 1);
  });
});
