-- DOC-F14 reference schema. Runtime SQLite schema is created by apps/api/app/modules/portfolio/repository.py.
CREATE TABLE portfolio_projects (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target_role TEXT NOT NULL,
  project_url TEXT,
  live_demo_url TEXT,
  facts_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE external_repositories (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_repository_id TEXT NOT NULL,
  full_name TEXT NOT NULL,
  repository_url TEXT NOT NULL,
  live_demo_url TEXT,
  visibility TEXT NOT NULL,
  access_status TEXT NOT NULL,
  authorization_reference TEXT NOT NULL,
  authorization_scope TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  revoked_at TEXT,
  facts_json TEXT NOT NULL,
  UNIQUE(student_id, provider, external_repository_id)
);

CREATE TABLE portfolio_analysis_snapshots (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  source_repository_id TEXT,
  target_role TEXT NOT NULL,
  source_timestamp TEXT NOT NULL,
  analyzed_at TEXT NOT NULL,
  completeness_score INTEGER NOT NULL,
  indicators_json TEXT NOT NULL,
  factual_description TEXT NOT NULL,
  stale INTEGER NOT NULL DEFAULT 0,
  disclaimer TEXT NOT NULL
);

CREATE TABLE portfolio_skill_evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_id TEXT NOT NULL REFERENCES portfolio_analysis_snapshots(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  evidence_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_timestamp TEXT NOT NULL
);

CREATE TABLE portfolio_recommendations (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL REFERENCES portfolio_analysis_snapshots(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  priority TEXT NOT NULL,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL,
  editable_text TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT
);
