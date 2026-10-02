-- DOC-F31 Evidence Passport reference schema.
-- Runtime migrations are currently applied by EvidencePassportRepository for the prototype.

CREATE TABLE evidence_certificates (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  title TEXT NOT NULL,
  issuer TEXT NOT NULL,
  acquired_at TEXT,
  expires_at TEXT,
  credential_reference TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  proficiency INTEGER,
  reference_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE skill_evidence (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  evidence_type TEXT NOT NULL CHECK(evidence_type IN ('manual_project','repository','live_demo','certificate','assessment','mentor_validation')),
  title TEXT NOT NULL,
  source_origin TEXT NOT NULL,
  source_ref TEXT NOT NULL,
  source_url TEXT,
  issuer TEXT,
  acquired_at TEXT,
  expires_at TEXT,
  observed_at TEXT NOT NULL,
  last_reviewed_at TEXT,
  reference_hash TEXT NOT NULL,
  verification_status TEXT NOT NULL CHECK(verification_status IN ('verified','observed','reviewed','self_declared','stale','disputed','expired')),
  confidence REAL NOT NULL,
  proficiency INTEGER,
  correction_note TEXT NOT NULL DEFAULT '',
  owner_disputed INTEGER NOT NULL DEFAULT 0,
  source_missing INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(student_id, source_ref, skill_id, evidence_type)
);

CREATE TABLE verification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_id TEXT NOT NULL REFERENCES skill_evidence(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  old_status TEXT,
  new_status TEXT,
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);

CREATE TABLE evidence_mentor_validation_requests (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  relationship_id TEXT NOT NULL,
  skill_id TEXT NOT NULL,
  skill_name TEXT NOT NULL,
  status TEXT NOT NULL,
  request_note TEXT NOT NULL DEFAULT '',
  mentor_note TEXT NOT NULL DEFAULT '',
  proficiency INTEGER,
  created_at TEXT NOT NULL,
  responded_at TEXT
);

-- Consent/share grants remain separate from evidence records so revocation never mutates evidence.
CREATE TABLE evidence_share_grants (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  access_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE evidence_access_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  share_id TEXT,
  actor_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  evidence_ids_json TEXT NOT NULL DEFAULT '[]',
  detail TEXT NOT NULL DEFAULT '',
  occurred_at TEXT NOT NULL
);
