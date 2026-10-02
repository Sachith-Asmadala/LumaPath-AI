-- DOC-F30 Daily Learning & Market Intelligence
-- Authoritative runtime DDL is also maintained in IntelligenceRepository._init_schema().

CREATE TABLE content_sources (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_url TEXT NOT NULL,
  allowed_domains_json TEXT NOT NULL,
  categories_json TEXT NOT NULL,
  source_type TEXT NOT NULL,
  trust_score INTEGER NOT NULL CHECK(trust_score BETWEEN 0 AND 100),
  trust_status TEXT NOT NULL CHECK(trust_status IN ('approved','review','blocked')),
  storage_policy TEXT NOT NULL CHECK(storage_policy IN ('metadata_only','metadata_excerpt')),
  max_excerpt_chars INTEGER NOT NULL,
  max_age_days INTEGER NOT NULL,
  terms_url TEXT NOT NULL,
  last_success_at TEXT,
  last_attempt_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES content_sources(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  canonical_url TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  topics_json TEXT NOT NULL DEFAULT '[]',
  target_roles_json TEXT NOT NULL DEFAULT '[]',
  difficulty TEXT NOT NULL,
  reading_minutes INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  trust_status TEXT NOT NULL CHECK(trust_status IN ('active','quarantined','expired')),
  quarantine_reason TEXT,
  ingestion_run_id TEXT,
  ingested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE article_skills (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  skill_id TEXT NOT NULL,
  relationship TEXT NOT NULL CHECK(relationship IN ('primary','related')),
  PRIMARY KEY(article_id, skill_id)
);

CREATE TABLE feed_recommendations (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id),
  feed_date TEXT NOT NULL,
  generation_id TEXT NOT NULL,
  rank_position INTEGER NOT NULL,
  score REAL NOT NULL,
  active_pathway_id TEXT NOT NULL,
  pathway_version INTEGER NOT NULL,
  target_role TEXT NOT NULL,
  active_step_id TEXT,
  active_skill_id TEXT,
  ranking_version TEXT NOT NULL,
  explanation_version TEXT NOT NULL,
  explanation TEXT NOT NULL,
  factors_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  invalidated_at TEXT,
  UNIQUE(student_id, feed_date, generation_id, article_id)
);

CREATE TABLE article_interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id),
  action TEXT NOT NULL CHECK(action IN ('save','unsave','dismiss','report','add_to_plan')),
  reason TEXT,
  recommendation_id TEXT,
  ranking_version TEXT,
  explanation_version TEXT,
  idempotency_key TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

-- Operational support table used to distinguish honest ingestion failure from a genuinely empty feed.
CREATE TABLE content_ingestion_runs (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL REFERENCES content_sources(id),
  ingestion_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
  candidate_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  quarantined_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  rejected_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);
