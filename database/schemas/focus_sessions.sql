-- DOC-F19 reference schema. Runtime SQLite creation/migration is owned by FocusSessionRepository.
CREATE TABLE focus_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title TEXT NOT NULL,
  objective TEXT NOT NULL,
  planned_work_minutes INTEGER NOT NULL,
  planned_break_minutes INTEGER NOT NULL,
  task_estimated_minutes INTEGER NOT NULL,
  task_progress_before INTEGER NOT NULL,
  task_progress_after INTEGER,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  active_segment_started_at TEXT,
  last_heartbeat_at TEXT,
  paused_at TEXT,
  ended_at TEXT,
  accumulated_active_seconds INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  result TEXT,
  estimate_feedback TEXT,
  suggested_estimated_minutes INTEGER,
  estimate_explanation TEXT,
  productive_minutes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_focus_student_status ON focus_sessions(student_id, status, updated_at DESC);
CREATE INDEX idx_focus_student_task ON focus_sessions(student_id, task_id, updated_at DESC);

CREATE TABLE focus_session_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
