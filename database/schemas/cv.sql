-- DOC-F15 reference schema. Runtime migrations are applied by CvRepository for the prototype.
CREATE TABLE cv_documents (
    id TEXT PRIMARY KEY,
    student_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('upload','paste')),
    title TEXT NOT NULL,
    original_filename TEXT,
    storage_name TEXT,
    canonical_mime TEXT,
    source_text TEXT,
    parse_status TEXT NOT NULL CHECK(parse_status IN ('parsed','parse_failed','source_deleted')),
    parse_error TEXT,
    target_role TEXT NOT NULL,
    retention_days INTEGER NOT NULL CHECK(retention_days IN (7,30,90)),
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    source_deleted_at TEXT,
    sections_confirmed_at TEXT,
    parsed_sections_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX idx_cv_documents_owner ON cv_documents(student_id, updated_at DESC);
CREATE INDEX idx_cv_documents_expiry ON cv_documents(expires_at);

CREATE TABLE cv_analysis_snapshots (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    analysis_version TEXT NOT NULL,
    target_role TEXT NOT NULL,
    analyzed_at TEXT NOT NULL,
    word_count INTEGER NOT NULL,
    findings_json TEXT NOT NULL,
    role_skills_json TEXT NOT NULL,
    ats_disclaimer TEXT NOT NULL,
    evidence_disclaimer TEXT NOT NULL
);

CREATE TABLE cv_suggestions (
    id TEXT PRIMARY KEY,
    analysis_id TEXT NOT NULL REFERENCES cv_analysis_snapshots(id) ON DELETE CASCADE,
    document_id TEXT NOT NULL REFERENCES cv_documents(id) ON DELETE CASCADE,
    student_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('wording','evidence_request')),
    section_key TEXT NOT NULL,
    title TEXT NOT NULL,
    rationale TEXT NOT NULL,
    evidence_refs_json TEXT NOT NULL,
    draft_text TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('proposed','accepted','dismissed')),
    created_at TEXT NOT NULL,
    decided_at TEXT
);

CREATE TABLE cv_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
);
