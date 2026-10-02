-- DOC-F23 reference schema. The FastAPI SQLite repository creates the same tables.
-- Provider credentials are optional and only used by future explicitly-authorized connectors.

CREATE TABLE integration_connections (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL,
  source_type TEXT NOT NULL,              -- manual_ics | manual_csv | provider
  display_name TEXT NOT NULL,
  status TEXT NOT NULL,                   -- active | revoked
  default_timezone TEXT NOT NULL,         -- IANA timezone
  provider_key TEXT,
  encrypted_credentials TEXT,             -- Fernet ciphertext only; never plaintext
  scopes_json TEXT NOT NULL DEFAULT '[]',
  sync_cursor TEXT,                       -- promoted only after an approved provider preview is committed
  last_sync_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_integration_connections_owner
  ON integration_connections(student_id, status, updated_at);

CREATE TABLE external_calendar_items (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  recurrence_key TEXT NOT NULL DEFAULT '',
  item_kind TEXT NOT NULL,                 -- lecture | exam | deadline | event | workshop
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',    -- untrusted source content
  start_at TEXT NOT NULL,                  -- normalized UTC ISO timestamp
  end_at TEXT,
  timezone TEXT NOT NULL,                  -- source IANA timezone
  confidence REAL NOT NULL,
  source_updated_at TEXT,
  source_hash TEXT NOT NULL,
  source_state TEXT NOT NULL,               -- active | deleted
  import_status TEXT NOT NULL,              -- imported | linked | ignored | detached
  mapped_record_type TEXT,                  -- task | planner_event
  mapped_internal_id TEXT,
  imported_title TEXT,
  imported_start_at TEXT,
  imported_end_at TEXT,
  imported_due_at TEXT,
  user_overrides_json TEXT NOT NULL DEFAULT '[]',
  last_seen_run_id TEXT,
  last_sync_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(connection_id, external_id, recurrence_key)
);
CREATE INDEX idx_external_calendar_owner
  ON external_calendar_items(student_id, connection_id, source_state, start_at);

CREATE TABLE calendar_sync_runs (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,                     -- parsing | preview_ready | committed | failed
  source_filename TEXT NOT NULL,
  source_format TEXT NOT NULL,              -- ics | csv | provider
  source_hash TEXT NOT NULL,
  preview_json TEXT NOT NULL DEFAULT '[]',
  commit_json TEXT,
  commit_idempotency_key TEXT,
  next_cursor TEXT,                       -- staged provider cursor; does not advance connection until commit
  error_code TEXT,
  error_detail TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_calendar_sync_owner
  ON calendar_sync_runs(student_id, connection_id, created_at DESC);

CREATE TABLE calendar_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id TEXT NOT NULL,
  connection_id TEXT,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);
