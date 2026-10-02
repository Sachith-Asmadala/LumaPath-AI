-- DOC-F28 + DOC-F32 Opportunity Recommendations / Opportunity Readiness reference schema.
-- SQLite runtime creates and migrates the same logical tables from OpportunityRepository.

CREATE TABLE opportunities (
  id TEXT PRIMARY KEY,
  catalogue_version TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  provider TEXT NOT NULL,
  summary TEXT NOT NULL,
  starts_on TEXT,
  closes_on TEXT,
  location_mode TEXT NOT NULL,
  location TEXT,
  cost_type TEXT NOT NULL,
  cost_amount REAL,
  currency TEXT,
  target_roles_json TEXT NOT NULL,
  required_skills_json TEXT NOT NULL,
  useful_skills_json TEXT NOT NULL,
  minimum_readiness INTEGER,
  eligibility_json TEXT NOT NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT,
  source_name TEXT NOT NULL,
  source_checked_at TEXT NOT NULL,
  source_expires_at TEXT,
  trust_status TEXT NOT NULL,
  application_steps_json TEXT NOT NULL DEFAULT '[]',
  requirement_version TEXT NOT NULL DEFAULT 'legacy',
  sponsored INTEGER NOT NULL DEFAULT 0,
  sponsor_name TEXT,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_opportunity_canonical_url
  ON opportunities(canonical_url) WHERE canonical_url IS NOT NULL;

CREATE TABLE opportunity_skills (
  opportunity_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK (relationship IN ('required','useful')),
  PRIMARY KEY (opportunity_id, skill_id, relationship),
  FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
);

CREATE TABLE opportunity_requirements (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  requirement_version TEXT NOT NULL,
  requirement_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('skill','profile')),
  label TEXT NOT NULL,
  operator TEXT NOT NULL,
  expected_json TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1,
  source_text TEXT NOT NULL,
  source_reference TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(opportunity_id, requirement_version, requirement_key)
);
CREATE INDEX idx_opportunity_requirements_lookup
  ON opportunity_requirements(opportunity_id, requirement_version, requirement_key);

CREATE TABLE source_validation_history (
  id TEXT PRIMARY KEY,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  student_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('trusted','untrusted','stale','expired','quarantined','reported')),
  source_url TEXT NOT NULL,
  trust_status TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  freshness_expires_at TEXT NOT NULL,
  opportunity_expires_on TEXT,
  requirement_version TEXT NOT NULL,
  detail TEXT NOT NULL,
  fingerprint TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_source_validation_fingerprint
  ON source_validation_history(opportunity_id, scope, IFNULL(student_id,''), fingerprint);
CREATE INDEX idx_source_validation_latest
  ON source_validation_history(opportunity_id, scope, checked_at DESC);
CREATE INDEX idx_source_validation_student
  ON source_validation_history(student_id, opportunity_id, checked_at DESC);

CREATE TABLE recommendation_snapshots (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  personalized INTEGER NOT NULL,
  catalogue_version TEXT NOT NULL,
  result_json TEXT NOT NULL,
  context_summary_json TEXT NOT NULL
);
CREATE INDEX idx_recommendation_owner
  ON recommendation_snapshots(student_id, created_at DESC);

CREATE TABLE eligibility_evaluations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  requirement_version TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  source_validation_id TEXT NOT NULL,
  pathway_id TEXT,
  pathway_version INTEGER,
  overall_status TEXT NOT NULL CHECK (overall_status IN ('met','unmet','unknown')),
  result_json TEXT NOT NULL,
  evidence_summary_json TEXT NOT NULL,
  evaluated_at TEXT NOT NULL
);
CREATE INDEX idx_eligibility_eval_owner
  ON eligibility_evaluations(student_id, opportunity_id, evaluated_at DESC);

CREATE TABLE opportunity_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('save','dismiss','report','planned')),
  reason TEXT,
  occurred_at TEXT NOT NULL,
  UNIQUE (student_id, opportunity_id, action)
);
CREATE INDEX idx_opportunity_interactions_owner
  ON opportunity_interactions(student_id, occurred_at DESC);

CREATE TABLE preparation_plans (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  eligibility_evaluation_id TEXT NOT NULL REFERENCES eligibility_evaluations(id),
  source_validation_id TEXT NOT NULL,
  requirement_version TEXT NOT NULL,
  proposal_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','approved','invalidated')),
  deadline TEXT,
  timezone TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  approved_at TEXT,
  invalidated_at TEXT,
  invalidation_reason TEXT
);
CREATE INDEX idx_preparation_plan_owner
  ON preparation_plans(student_id, opportunity_id, generated_at DESC);

CREATE TABLE preparation_plan_items (
  id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES preparation_plans(id) ON DELETE CASCADE,
  requirement_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('gap','verification','application_step')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  estimated_minutes INTEGER NOT NULL,
  suggested_start_at TEXT,
  suggested_end_at TEXT,
  approved_action_id TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(plan_id, id)
);
CREATE INDEX idx_preparation_items_plan ON preparation_plan_items(plan_id, created_at);

CREATE TABLE opportunity_plan_actions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  end_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (student_id, idempotency_key)
);

CREATE TABLE application_tracking (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('interested','preparing','applied','follow_up','result')),
  result TEXT,
  follow_up_at TEXT,
  source_validation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, opportunity_id)
);
CREATE INDEX idx_application_tracking_owner
  ON application_tracking(student_id, updated_at DESC);

CREATE TABLE application_tracking_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id TEXT NOT NULL REFERENCES application_tracking(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  opportunity_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  result TEXT,
  follow_up_at TEXT,
  source_validation_id TEXT,
  occurred_at TEXT NOT NULL
);
CREATE INDEX idx_application_tracking_events
  ON application_tracking_events(student_id, opportunity_id, occurred_at DESC);
