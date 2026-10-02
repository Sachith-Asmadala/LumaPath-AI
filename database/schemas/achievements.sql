-- DOC-F27 private achievements / non-punitive consistency state.
-- Runtime migrations are created defensively by AchievementRepository as well.
CREATE TABLE achievement_definitions (
  definition_key TEXT NOT NULL,
  version TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  target INTEGER NOT NULL,
  unit TEXT NOT NULL,
  optional_career INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (definition_key, version)
);

CREATE TABLE awarded_achievements (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  definition_key TEXT NOT NULL,
  definition_version TEXT NOT NULL,
  awarded_at TEXT NOT NULL,
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('active','withdrawn')),
  evidence_json TEXT NOT NULL,
  restored_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (student_id, definition_key, definition_version)
);
CREATE INDEX idx_awards_owner ON awarded_achievements(student_id, awarded_at DESC);

CREATE TABLE streak_state (
  student_id TEXT PRIMARY KEY,
  current_count INTEGER NOT NULL,
  longest_count INTEGER NOT NULL,
  last_qualifying_date TEXT,
  grace_days_used INTEGER NOT NULL,
  state TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  qualifying_dates_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE achievement_preferences (
  student_id TEXT PRIMARY KEY,
  feature_visible INTEGER NOT NULL DEFAULT 1,
  celebrations_enabled INTEGER NOT NULL DEFAULT 0,
  streak_visible INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE achievement_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  definition_key TEXT,
  occurred_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
