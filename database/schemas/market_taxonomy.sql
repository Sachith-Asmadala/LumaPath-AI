-- DOC-F34 | governed market signals + immutable role/skill taxonomy publication
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS taxonomy_versions (
  version TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK(status IN ('draft','review','approved','retired')),
  profile_scope TEXT NOT NULL CHECK(profile_scope IN ('international','regional')),
  region_code TEXT,
  parent_version TEXT,
  snapshot_json TEXT NOT NULL,
  methodology_version TEXT NOT NULL,
  change_summary TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  retired_at TEXT,
  is_default INTEGER NOT NULL DEFAULT 0,
  CHECK ((profile_scope='regional' AND region_code IS NOT NULL) OR (profile_scope='international' AND region_code IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_taxonomy_versions_profile ON taxonomy_versions(profile_scope,region_code,status,approved_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_default_international ON taxonomy_versions(is_default)
  WHERE is_default=1 AND profile_scope='international' AND status='approved';
CREATE TRIGGER IF NOT EXISTS trg_taxonomy_snapshot_immutable
BEFORE UPDATE OF snapshot_json,parent_version,profile_scope,region_code,methodology_version ON taxonomy_versions
BEGIN SELECT RAISE(ABORT, 'taxonomy version snapshots are immutable'); END;

CREATE TABLE IF NOT EXISTS market_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('job_aggregate','certification_objectives','technology_source')),
  canonical_url TEXT NOT NULL,
  licensing_policy TEXT NOT NULL,
  trust_score INTEGER NOT NULL CHECK(trust_score BETWEEN 0 AND 100),
  status TEXT NOT NULL CHECK(status IN ('approved','review','blocked')),
  bias_review_status TEXT NOT NULL CHECK(bias_review_status IN ('approved','pending','rejected')),
  regions_json TEXT NOT NULL,
  retention_days INTEGER NOT NULL,
  max_age_days INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS market_observations (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES market_sources(id),
  role_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  profile_scope TEXT NOT NULL CHECK(profile_scope IN ('international','regional')),
  region_code TEXT,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  sample_size INTEGER NOT NULL CHECK(sample_size>0),
  skill_share REAL NOT NULL CHECK(skill_share BETWEEN 0 AND 1),
  methodology TEXT NOT NULL,
  provenance_url TEXT NOT NULL,
  content_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  retained_until TEXT NOT NULL,
  ingested_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_market_observations_signal ON market_observations(role_id,skill_id,profile_scope,region_code,period_end DESC);

CREATE TABLE IF NOT EXISTS skill_signals (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  profile_scope TEXT NOT NULL,
  region_code TEXT,
  label TEXT NOT NULL CHECK(label IN ('emerging','stable','declining')),
  delta REAL NOT NULL,
  recent_share REAL NOT NULL,
  prior_share REAL NOT NULL,
  sample_size INTEGER NOT NULL,
  source_count INTEGER NOT NULL,
  confidence REAL NOT NULL,
  recency_days REAL NOT NULL,
  methodology_version TEXT NOT NULL,
  methodology TEXT NOT NULL,
  source_ids_json TEXT NOT NULL,
  observation_ids_json TEXT NOT NULL,
  publication_eligible INTEGER NOT NULL,
  limitations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS change_proposals (
  id TEXT PRIMARY KEY,
  signal_id TEXT NOT NULL REFERENCES skill_signals(id),
  base_version TEXT NOT NULL REFERENCES taxonomy_versions(version),
  candidate_version TEXT REFERENCES taxonomy_versions(version),
  role_id TEXT NOT NULL,
  role_name TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  profile_scope TEXT NOT NULL,
  region_code TEXT,
  change_type TEXT NOT NULL CHECK(change_type IN ('increase_priority','decrease_priority','add_requirement','retire_requirement')),
  current_required_proficiency INTEGER,
  proposed_required_proficiency INTEGER,
  impact_level TEXT NOT NULL CHECK(impact_level IN ('low','high')),
  status TEXT NOT NULL CHECK(status IN ('draft','review','approved','rejected')),
  observed_signal TEXT NOT NULL,
  signal_confidence REAL NOT NULL,
  rationale TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  decided_at TEXT,
  decision_rationale TEXT,
  resulting_version TEXT
);

CREATE TABLE IF NOT EXISTS taxonomy_approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proposal_id TEXT NOT NULL REFERENCES change_proposals(id),
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
  rationale TEXT NOT NULL,
  decided_at TEXT NOT NULL,
  resulting_version TEXT
);

CREATE TABLE IF NOT EXISTS taxonomy_impact_notifications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  pathway_id TEXT NOT NULL,
  target_role TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT NOT NULL,
  proposal_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','kept_current','recalculation_drafted','dismissed')),
  created_at TEXT NOT NULL,
  decided_at TEXT,
  draft_pathway_id TEXT,
  UNIQUE(student_id,pathway_id,to_version)
);

CREATE TABLE IF NOT EXISTS taxonomy_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
