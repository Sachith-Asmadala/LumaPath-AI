-- DOC-F20 reference schema. Runtime SQLite creation is kept in
-- apps/api/app/modules/notifications/repository.py for the competition prototype.

CREATE TABLE notification_preferences (
  student_id TEXT PRIMARY KEY,
  timezone TEXT NOT NULL,
  quiet_hours_enabled INTEGER NOT NULL,
  quiet_hours_start TEXT NOT NULL,
  quiet_hours_end TEXT NOT NULL,
  mute_non_critical INTEGER NOT NULL,
  max_non_critical_per_day INTEGER NOT NULL,
  max_non_critical_per_hour INTEGER NOT NULL,
  in_app_enabled INTEGER NOT NULL,
  push_enabled INTEGER NOT NULL,
  push_permission_granted INTEGER NOT NULL,
  email_enabled INTEGER NOT NULL,
  email_consent INTEGER NOT NULL,
  categories_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_candidates (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  notification_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  display_label TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL,
  action_href TEXT NOT NULL,
  urgency TEXT NOT NULL,
  sensitive INTEGER NOT NULL DEFAULT 0,
  occurred_at TEXT NOT NULL,
  deliver_after TEXT NOT NULL,
  expires_at TEXT,
  state TEXT NOT NULL,
  suppression_reason TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX uq_notification_candidate_key ON notification_candidates(student_id,idempotency_key);
CREATE INDEX idx_notification_candidate_due ON notification_candidates(student_id,state,deliver_after);
CREATE INDEX idx_notification_candidate_source ON notification_candidates(student_id,source_type,source_id,state);

CREATE TABLE notification_deliveries (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL REFERENCES notification_candidates(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  provider_message_id TEXT,
  error_code TEXT,
  delivered_at TEXT,
  opened_at TEXT,
  dismissed_at TEXT,
  acted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(candidate_id,channel)
);
CREATE INDEX idx_notification_inbox ON notification_deliveries(student_id,channel,delivered_at DESC);
