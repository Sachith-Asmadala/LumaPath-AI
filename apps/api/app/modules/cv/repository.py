from __future__ import annotations

import sqlite3
import threading
from pathlib import Path


class CvRepository:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._ensure_schema()

    def _connect(self):
        db = sqlite3.connect(self.database_path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _ensure_schema(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS cv_documents (
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
                CREATE INDEX IF NOT EXISTS idx_cv_documents_owner ON cv_documents(student_id, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_cv_documents_expiry ON cv_documents(expires_at);

                CREATE TABLE IF NOT EXISTS cv_analysis_snapshots (
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
                CREATE INDEX IF NOT EXISTS idx_cv_analysis_document ON cv_analysis_snapshots(document_id, analyzed_at DESC);

                CREATE TABLE IF NOT EXISTS cv_suggestions (
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
                CREATE INDEX IF NOT EXISTS idx_cv_suggestions_analysis ON cv_suggestions(analysis_id);

                CREATE TABLE IF NOT EXISTS cv_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def create_document(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO cv_documents
                (id,student_id,source_type,title,original_filename,storage_name,canonical_mime,source_text,parse_status,parse_error,target_role,
                 retention_days,expires_at,created_at,updated_at,source_deleted_at,sections_confirmed_at,parsed_sections_json)
                VALUES (:id,:student_id,:source_type,:title,:original_filename,:storage_name,:canonical_mime,:source_text,:parse_status,:parse_error,:target_role,
                 :retention_days,:expires_at,:created_at,:updated_at,:source_deleted_at,:sections_confirmed_at,:parsed_sections_json)""",
                values,
            )
            db.commit()
        return self.get_document(values["id"])

    def get_document(self, document_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_documents WHERE id=?", (document_id,)).fetchone()

    def list_documents(self, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_documents WHERE student_id=? ORDER BY updated_at DESC", (student_id,)).fetchall()

    def update_sections(self, document_id: str, student_id: str, sections_json: str, confirmed_at: str | None, updated_at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE cv_documents SET parsed_sections_json=?, sections_confirmed_at=?, updated_at=?, parse_status='parsed', parse_error=NULL WHERE id=? AND student_id=?",
                (sections_json, confirmed_at, updated_at, document_id, student_id),
            )
            db.commit()
        return self.get_document(document_id) if cur.rowcount else None

    def mark_parse_failed(self, document_id: str, student_id: str, error: str, updated_at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE cv_documents SET parse_status='parse_failed', parse_error=?, updated_at=? WHERE id=? AND student_id=?",
                (error[:1200], updated_at, document_id, student_id),
            )
            db.commit()
        return self.get_document(document_id) if cur.rowcount else None

    def mark_source_deleted(self, document_id: str, student_id: str, at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE cv_documents SET source_text=NULL, storage_name=NULL, source_deleted_at=?, parse_status='source_deleted', updated_at=? WHERE id=? AND student_id=?",
                (at, at, document_id, student_id),
            )
            db.commit()
        return self.get_document(document_id) if cur.rowcount else None

    def delete_document(self, document_id: str, student_id: str) -> bool:
        with self._lock, self._connect() as db:
            cur = db.execute("DELETE FROM cv_documents WHERE id=? AND student_id=?", (document_id, student_id))
            db.commit()
            return cur.rowcount > 0

    def delete_analysis(self, document_id: str, student_id: str) -> bool:
        with self._lock, self._connect() as db:
            ids = [row["id"] for row in db.execute("SELECT id FROM cv_analysis_snapshots WHERE document_id=? AND student_id=?", (document_id, student_id)).fetchall()]
            for analysis_id in ids:
                db.execute("DELETE FROM cv_suggestions WHERE analysis_id=?", (analysis_id,))
            cur = db.execute("DELETE FROM cv_analysis_snapshots WHERE document_id=? AND student_id=?", (document_id, student_id))
            db.commit()
            return cur.rowcount > 0

    def save_analysis(self, analysis: dict, suggestions: list[dict]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO cv_analysis_snapshots
                (id,document_id,student_id,analysis_version,target_role,analyzed_at,word_count,findings_json,role_skills_json,ats_disclaimer,evidence_disclaimer)
                VALUES (:id,:document_id,:student_id,:analysis_version,:target_role,:analyzed_at,:word_count,:findings_json,:role_skills_json,:ats_disclaimer,:evidence_disclaimer)""",
                analysis,
            )
            for item in suggestions:
                db.execute(
                    """INSERT INTO cv_suggestions
                    (id,analysis_id,document_id,student_id,kind,section_key,title,rationale,evidence_refs_json,draft_text,status,created_at,decided_at)
                    VALUES (:id,:analysis_id,:document_id,:student_id,:kind,:section_key,:title,:rationale,:evidence_refs_json,:draft_text,:status,:created_at,NULL)""",
                    item,
                )
            db.commit()

    def latest_analysis(self, document_id: str, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_analysis_snapshots WHERE document_id=? AND student_id=? ORDER BY analyzed_at DESC LIMIT 1", (document_id, student_id)).fetchone()

    def suggestions(self, analysis_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_suggestions WHERE analysis_id=? ORDER BY created_at,id", (analysis_id,)).fetchall()

    def get_suggestion(self, suggestion_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_suggestions WHERE id=?", (suggestion_id,)).fetchone()

    def decide_suggestion(self, suggestion_id: str, student_id: str, status: str, draft_text: str | None, decided_at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE cv_suggestions SET status=?, draft_text=COALESCE(?,draft_text), decided_at=? WHERE id=? AND student_id=?",
                (status, draft_text, decided_at, suggestion_id, student_id),
            )
            db.commit()
        return self.get_suggestion(suggestion_id) if cur.rowcount else None

    def analysis_count_since(self, student_id: str, since_iso: str) -> int:
        with self._connect() as db:
            row = db.execute("SELECT COUNT(*) AS n FROM cv_analysis_snapshots WHERE student_id=? AND analyzed_at>=?", (student_id, since_iso)).fetchone()
        return int(row["n"])

    def expired_documents(self, now_iso: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM cv_documents WHERE expires_at<=?", (now_iso,)).fetchall()

    def audit(self, document_id: str, student_id: str, event_type: str, occurred_at: str, detail: str = "") -> None:
        with self._connect() as db:
            db.execute("INSERT INTO cv_audit(document_id,student_id,event_type,occurred_at,detail) VALUES (?,?,?,?,?)", (document_id,student_id,event_type,occurred_at,detail[:500]))
            db.commit()
