-- DOC-F09 reference schema. Runtime creation is handled by SqliteDocumentRepository.
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  storage_name TEXT NOT NULL UNIQUE,
  extension TEXT NOT NULL,
  kind TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  scan_status TEXT NOT NULL,
  module_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  retention_expires_at TEXT NOT NULL,
  processing_attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT
);

CREATE TABLE document_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  locator_type TEXT NOT NULL,
  locator TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE document_analysis_results (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  result_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE document_proposed_actions (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'proposed',
  payload_json TEXT NOT NULL,
  approved_at TEXT,
  created_at TEXT NOT NULL
);
