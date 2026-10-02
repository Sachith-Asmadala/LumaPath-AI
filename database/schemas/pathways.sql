-- DOC-F13 reference schema. Runtime SQLite creation lives in PathwayRepository.
CREATE TABLE pathways (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  target_role TEXT NOT NULL,
  goal TEXT NOT NULL,
  pace TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  parent_pathway_id TEXT,
  recalculation_reason_json TEXT NOT NULL,
  weekly_learning_minutes INTEGER NOT NULL,
  daily_available_minutes INTEGER NOT NULL,
  timezone TEXT NOT NULL,
  context_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  change_summary_json TEXT,
  created_at TEXT NOT NULL,
  approved_at TEXT,
  rejected_at TEXT
);

CREATE TABLE pathway_steps (
  id TEXT PRIMARY KEY,
  pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  name TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  prerequisites_json TEXT NOT NULL,
  state TEXT NOT NULL,
  proficiency INTEGER NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  target_evidence_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  transferable_credit INTEGER NOT NULL DEFAULT 0,
  completion_source TEXT,
  selected_resource_id TEXT,
  selected_resource_json TEXT,
  alternative_resources_json TEXT NOT NULL,
  resource_decision TEXT NOT NULL,
  resource_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(pathway_id, skill_id)
);

CREATE TABLE pathway_plan_items (
  id TEXT PRIMARY KEY,
  pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  step_id TEXT NOT NULL REFERENCES pathway_steps(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  title TEXT NOT NULL,
  week_start TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  status TEXT NOT NULL,
  prerequisite_ready INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  source_label TEXT NOT NULL,
  internal_task_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE pathway_recalculations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  source_pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  draft_pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
  trigger_reasons_json TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
