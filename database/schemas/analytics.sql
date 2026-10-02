-- DOC-F18 reference schema. Runtime SQLite migrations are created by AnalyticsRepository.
CREATE TABLE analytics_activity_events (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  module TEXT,
  measurement_kind TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(student_id, idempotency_key)
);

CREATE TABLE analytics_aggregates (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  grain TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  timezone TEXT NOT NULL,
  metric_version TEXT NOT NULL,
  revision INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  source_event_count INTEGER NOT NULL,
  computed_at TEXT NOT NULL,
  UNIQUE(student_id, grain, period_start, timezone, metric_version, revision)
);
