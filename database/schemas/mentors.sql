-- DOC-F24 reference schema. Runtime SQLite tables are created by MentorRepository.
CREATE TABLE mentor_relationships (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  mentor_label TEXT NOT NULL,
  mentor_name TEXT,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','active','revoked','expired')),
  invitation_token_hash TEXT NOT NULL UNIQUE,
  mentor_access_token_hash TEXT UNIQUE,
  invite_expires_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE consent_grants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  category TEXT NOT NULL,
  granted_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE mentor_shared_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  academic_json TEXT,
  career_json TEXT,
  readiness_json TEXT,
  captured_at TEXT NOT NULL
);

CREATE TABLE guidance_requests (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  context_note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE mentor_recommendations (
  id TEXT PRIMARY KEY,
  relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  guidance_request_id TEXT REFERENCES guidance_requests(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('comment','recommendation')),
  title TEXT NOT NULL,
  rationale TEXT NOT NULL,
  suggested_action TEXT NOT NULL DEFAULT '',
  suggested_minutes INTEGER,
  status TEXT NOT NULL CHECK (status IN ('proposed','accepted','dismissed','planned')),
  student_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  decided_at TEXT,
  planned_at TEXT,
  plan_idempotency_key TEXT,
  plan_action_json TEXT
);

CREATE TABLE mentor_access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL,
  student_id TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  categories_json TEXT NOT NULL DEFAULT '[]',
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
