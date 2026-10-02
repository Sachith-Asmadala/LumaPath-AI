-- DOC-F25: privacy-preserving institutional aggregate analytics.
-- Runtime schema is created defensively by InstitutionalAnalyticsRepository.
-- Student identifiers are intentionally absent from DOC-F25 aggregate/support tables.

CREATE TABLE institutional_analytics_cohorts (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  name TEXT NOT NULL,
  definition_json TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(institution_id, id)
);

CREATE TABLE institutional_analytics_cohort_subjects (
  cohort_id TEXT NOT NULL REFERENCES institutional_analytics_cohorts(id) ON DELETE CASCADE,
  institution_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY(cohort_id, subject_key)
);

CREATE TABLE institutional_analytics_metric_approvals (
  metric_key TEXT NOT NULL,
  metric_version TEXT NOT NULL,
  approved INTEGER NOT NULL,
  purpose TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  PRIMARY KEY(metric_key, metric_version)
);

CREATE TABLE institutional_analytics_aggregates (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL REFERENCES institutional_analytics_cohorts(id) ON DELETE CASCADE,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  timezone TEXT NOT NULL,
  metric_key TEXT NOT NULL,
  dimension_key TEXT NOT NULL DEFAULT '',
  dimension_label TEXT NOT NULL DEFAULT '',
  metric_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  sample_size INTEGER,
  suppressed INTEGER NOT NULL,
  suppression_reason TEXT,
  trend_json TEXT NOT NULL DEFAULT '[]',
  purpose TEXT NOT NULL,
  source_latest_at TEXT,
  refreshed_at TEXT NOT NULL,
  UNIQUE(cohort_id, period_start, period_end, timezone, metric_key, dimension_key, metric_version, revision)
);

CREATE TABLE institutional_analytics_support_signals (
  id TEXT PRIMARY KEY,
  institution_id TEXT NOT NULL,
  subject_key TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  topic_key TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE institutional_analytics_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  administrator_id TEXT NOT NULL,
  administrator_role TEXT NOT NULL,
  institution_id TEXT NOT NULL,
  action TEXT NOT NULL,
  cohort_id TEXT,
  purpose TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);
