-- DOC-F16 reference schema. Runtime SQLite migrations live in
-- apps/api/app/modules/internships/repository.py.
CREATE TABLE internship_applications (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  company TEXT NOT NULL,
  role TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual','recommendation')),
  source_reference TEXT,
  source_url TEXT,
  application_deadline TEXT,
  application_deadline_confirmed INTEGER NOT NULL DEFAULT 0,
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  interview_at TEXT,
  interview_at_confirmed INTEGER NOT NULL DEFAULT 0,
  follow_up_at TEXT,
  follow_up_at_confirmed INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  next_action TEXT NOT NULL DEFAULT '',
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  outcome_notes TEXT NOT NULL DEFAULT '',
  create_idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE application_requirements (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  required INTEGER NOT NULL DEFAULT 1,
  evidence_status TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE application_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  note TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  occurred_at TEXT NOT NULL
);

CREATE TABLE application_reminders (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  timezone TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  notifications_enabled INTEGER NOT NULL,
  quiet_hours_start TEXT,
  quiet_hours_end TEXT,
  effective_notification_at TEXT,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE application_planner_actions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  start_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL,
  description TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);
