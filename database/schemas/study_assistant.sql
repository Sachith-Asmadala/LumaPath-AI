-- DOC-F08 Context-Aware Study Assistant
-- No raw prompt column is intentionally present.
-- Current assistant context snapshots are intentionally process-local and re-synced before use.

CREATE TABLE IF NOT EXISTS assistant_sessions (
    session_id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    context_refs_json TEXT NOT NULL DEFAULT '[]',
    response_types_json TEXT NOT NULL DEFAULT '[]',
    question_digests_json TEXT NOT NULL DEFAULT '[]',
    responses_json TEXT NOT NULL DEFAULT '{}',
    feedback_json TEXT NOT NULL DEFAULT '{}',
    saved_actions_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_student ON assistant_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_assistant_sessions_updated ON assistant_sessions(updated_at);

CREATE TABLE IF NOT EXISTS assistant_audit (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    event TEXT NOT NULL,
    created_at TEXT NOT NULL,
    metadata_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_assistant_audit_student ON assistant_audit(student_id, created_at);
