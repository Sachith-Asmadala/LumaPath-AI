-- DOC-F17 reference schema. Runtime SQLite initialization/migrations live in
-- apps/api/app/modules/interviews/repository.py.
CREATE TABLE interview_sessions (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  role TEXT NOT NULL,
  level TEXT NOT NULL,
  round_type TEXT NOT NULL,
  template_version TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  status TEXT NOT NULL,
  question_time_seconds INTEGER NOT NULL,
  max_followups_per_question INTEGER NOT NULL,
  current_question_id TEXT,
  current_question_started_at TEXT,
  current_question_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
  last_heartbeat_at TEXT,
  paused_at TEXT,
  pause_count INTEGER NOT NULL DEFAULT 0,
  max_pause_count INTEGER NOT NULL DEFAULT 3,
  recording_mode TEXT NOT NULL,
  store_recordings INTEGER NOT NULL DEFAULT 0,
  retention_days INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  feedback_status TEXT NOT NULL,
  feedback_error TEXT,
  feedback_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE interview_questions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  round_type TEXT NOT NULL,
  skill_ids_json TEXT NOT NULL,
  skill_names_json TEXT NOT NULL,
  evidence_refs_json TEXT NOT NULL DEFAULT '[]',
  is_followup INTEGER NOT NULL DEFAULT 0,
  parent_question_id TEXT,
  sequence INTEGER NOT NULL,
  time_limit_seconds INTEGER NOT NULL
);

CREATE TABLE interview_responses (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  started_at TEXT NOT NULL,
  submitted_at TEXT NOT NULL,
  active_seconds INTEGER NOT NULL,
  timed_out INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE interview_rubric_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
  response_id TEXT NOT NULL,
  criterion TEXT NOT NULL,
  score INTEGER NOT NULL,
  rationale TEXT NOT NULL,
  evidence_excerpt TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Recording preference/consent is deliberately separated from session answer data.
-- DOC-F17 does not expose a media-upload endpoint; no audio/video bytes are stored.
CREATE TABLE interview_recording_preferences (
  session_id TEXT PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  recording_mode TEXT NOT NULL,
  store_recordings INTEGER NOT NULL,
  consented_at TEXT NOT NULL,
  storage_locator TEXT
);

CREATE TABLE interview_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT ''
);
