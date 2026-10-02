import type { DemoState, PlanBlock, Task } from "@/data/demo/types";

export type CalendarItemKind = "lecture" | "exam" | "deadline" | "event" | "workshop";
export type CalendarChangeType = "new" | "unchanged" | "changed" | "duplicate" | "conflict" | "deleted";
export type CalendarDecision = "import" | "update" | "link_existing" | "skip" | "keep_personal" | "remove_internal";

export interface CalendarExistingRecord {
  internal_id: string;
  record_type: "task" | "planner_event";
  title: string;
  start_at?: string | null;
  end_at?: string | null;
  due_at?: string | null;
  external_item_id?: string | null;
}

export interface CalendarPreviewItem {
  preview_key: string;
  external_id: string;
  recurrence_key: string;
  kind: CalendarItemKind;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  timezone: string;
  confidence: number;
  source_updated_at: string | null;
  change_type: CalendarChangeType;
  matched_internal_id: string | null;
  mapped_record_type: "task" | "planner_event" | null;
  conflict_internal_ids: string[];
  override_fields: Array<"title" | "start_at" | "end_at" | "due_at">;
  source_warning: string | null;
  selected_by_default: boolean;
}

export interface CalendarPreview {
  sync_run_id: string;
  connection_id: string;
  connection_name: string;
  source_format: "ics" | "csv" | "provider";
  timezone: string;
  status: "preview_ready";
  items: CalendarPreviewItem[];
  new_count: number;
  changed_count: number;
  duplicate_count: number;
  conflict_count: number;
  deleted_count: number;
  unchanged_count: number;
  generated_at: string;
}

export interface CalendarApplyAction {
  operation: "create" | "update" | "tag" | "delete" | "detach";
  external_item_id: string;
  internal_record_id: string | null;
  record_type: "task" | "planner_event" | null;
  title: string | null;
  kind: CalendarItemKind | null;
  start_at: string | null;
  end_at: string | null;
  due_at: string | null;
  source_label: string | null;
  override_fields: string[];
}

export interface CalendarCommitResult {
  sync_run_id: string;
  connection_id: string;
  committed: boolean;
  actions: CalendarApplyAction[];
  imported: number;
  updated: number;
  linked: number;
  skipped: number;
  removed: number;
  kept_personal: number;
  committed_at: string;
}

export interface CalendarConnection {
  id: string;
  source_type: "manual_ics" | "manual_csv" | "provider";
  display_name: string;
  status: "active" | "revoked";
  default_timezone: string;
  scopes: string[];
  last_sync_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
  provider_connected: boolean;
}

export interface CalendarImportedItem {
  id: string;
  connection_id: string;
  external_id: string;
  recurrence_key: string;
  kind: CalendarItemKind;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  timezone: string;
  confidence: number;
  source_updated_at: string | null;
  source_state: "active" | "deleted";
  import_status: "imported" | "linked" | "ignored" | "detached";
  mapped_record_type: "task" | "planner_event" | null;
  mapped_internal_id: string | null;
  override_fields: string[];
  last_sync_at: string;
  source_badge: string;
}

export function buildCalendarExistingRecords(state: DemoState): CalendarExistingRecord[] {
  const tasks = state.tasks.map((task): CalendarExistingRecord => ({
    internal_id: task.id,
    record_type: "task",
    title: task.title,
    due_at: task.dueAt ?? null,
    external_item_id: task.externalId ?? null,
  }));
  const blocks = state.planBlocks.map((block): CalendarExistingRecord => ({
    internal_id: block.id,
    record_type: "planner_event",
    title: block.title,
    start_at: block.startAt,
    end_at: block.endAt,
    external_item_id: block.externalId ?? null,
  }));
  return [...tasks, ...blocks];
}

export function defaultCalendarDecision(item: CalendarPreviewItem): CalendarDecision {
  if (item.change_type === "new") return "import";
  if (item.change_type === "changed") return "update";
  if (item.change_type === "duplicate" && item.matched_internal_id) return "link_existing";
  return "skip";
}

const plusMinutes = (iso: string, minutes: number) => new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();

export function applyCalendarActions(state: DemoState, actions: CalendarApplyAction[]): Pick<DemoState, "tasks" | "planBlocks" | "simulation"> {
  let tasks = [...state.tasks];
  let planBlocks = [...state.planBlocks];
  for (const action of actions) {
    if (!action.internal_record_id || !action.record_type) continue;
    const source = action.source_label ?? "Calendar";
    if (action.operation === "delete") {
      if (action.record_type === "task") {
        tasks = tasks.filter((task) => task.id !== action.internal_record_id);
        planBlocks = planBlocks.filter((block) => block.taskId !== action.internal_record_id);
      } else {
        planBlocks = planBlocks.filter((block) => block.id !== action.internal_record_id);
      }
      continue;
    }
    if (action.operation === "detach") {
      if (action.record_type === "task") tasks = tasks.map((task) => task.id === action.internal_record_id ? { ...task, source: undefined, externalId: undefined } : task);
      else planBlocks = planBlocks.map((block) => block.id === action.internal_record_id ? { ...block, source: undefined, externalId: undefined } : block);
      continue;
    }
    if (action.operation === "tag") {
      if (action.record_type === "task") tasks = tasks.map((task) => task.id === action.internal_record_id ? { ...task, source, externalId: action.external_item_id } : task);
      else planBlocks = planBlocks.map((block) => block.id === action.internal_record_id ? { ...block, source, externalId: action.external_item_id } : block);
      continue;
    }
    if (action.record_type === "task") {
      const existing = tasks.find((task) => task.id === action.internal_record_id);
      if (!existing && action.operation === "create") {
        const task: Task = {
          id: action.internal_record_id,
          title: action.title ?? "Imported deadline",
          category: "Academic",
          status: "upcoming",
          estimatedMinutes: 60,
          dueAt: action.due_at ?? undefined,
          progress: 0,
          difficulty: 2,
          careerSkillIds: [],
          riskScore: 45,
          careerRelevance: 20,
          description: "Imported academic deadline. Review the task details and plan study time before relying on this record.",
          externalId: action.external_item_id,
          source,
        };
        tasks.push(task);
      } else if (existing) {
        const preserve = new Set(action.override_fields);
        tasks = tasks.map((task) => task.id === action.internal_record_id ? {
          ...task,
          title: preserve.has("title") ? task.title : (action.title ?? task.title),
          dueAt: preserve.has("due_at") ? task.dueAt : (action.due_at ?? task.dueAt),
          externalId: action.external_item_id,
          source,
        } : task);
      }
      continue;
    }
    const existing = planBlocks.find((block) => block.id === action.internal_record_id);
    if (!existing && action.operation === "create" && action.start_at) {
      const block: PlanBlock = {
        id: action.internal_record_id,
        taskId: null,
        title: action.title ?? "Imported calendar event",
        category: "Academic",
        startAt: action.start_at,
        endAt: action.end_at ?? plusMinutes(action.start_at, 60),
        isFixed: true,
        externalId: action.external_item_id,
        source,
      };
      planBlocks.push(block);
    } else if (existing && action.start_at) {
      const preserve = new Set(action.override_fields);
      planBlocks = planBlocks.map((block) => block.id === action.internal_record_id ? {
        ...block,
        title: preserve.has("title") ? block.title : (action.title ?? block.title),
        startAt: preserve.has("start_at") ? block.startAt : action.start_at!,
        endAt: preserve.has("end_at") ? block.endAt : (action.end_at ?? plusMinutes(action.start_at!, 60)),
        isFixed: true,
        externalId: action.external_item_id,
        source,
      } : block);
    }
  }
  return {
    tasks,
    planBlocks,
    simulation: { ...state.simulation, announcement: "Approved calendar changes were applied to your LumaPath plan." },
  };
}
