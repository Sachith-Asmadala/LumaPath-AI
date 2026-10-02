from __future__ import annotations

from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from threading import RLock
from typing import Any

from .schemas import DocumentAnalysis, DocumentKind, DocumentProposedAction, DocumentRecord, DocumentStatus


class SqliteDocumentRepository:
    def __init__(self, database_path: str) -> None:
        self.path = str(Path(database_path).expanduser().resolve())
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._ensure_schema()

    def _connect(self):
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS documents (
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
                CREATE INDEX IF NOT EXISTS idx_documents_owner_created ON documents(owner_id, created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_documents_owner_hash ON documents(owner_id, sha256);

                CREATE TABLE IF NOT EXISTS document_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    owner_id TEXT NOT NULL,
                    ordinal INTEGER NOT NULL,
                    locator_type TEXT NOT NULL,
                    locator TEXT NOT NULL,
                    text TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_document_chunks_document ON document_chunks(document_id, ordinal);

                CREATE TABLE IF NOT EXISTS document_analysis_results (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    owner_id TEXT NOT NULL,
                    result_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_document_analysis_document ON document_analysis_results(document_id, result_type);

                CREATE TABLE IF NOT EXISTS document_proposed_actions (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
                    owner_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'proposed',
                    payload_json TEXT NOT NULL,
                    approved_at TEXT,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_document_actions_document ON document_proposed_actions(document_id, status);

                CREATE TABLE IF NOT EXISTS document_audit (
                    id TEXT PRIMARY KEY,
                    document_id TEXT,
                    owner_id TEXT NOT NULL,
                    event TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_document_audit_owner ON document_audit(owner_id, created_at DESC);
                """
            )

    @staticmethod
    def _now() -> str:
        return datetime.now(timezone.utc).isoformat()

    def create(self, values: dict[str, Any]) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """INSERT INTO documents
                (id, owner_id, original_name, storage_name, extension, kind, mime_type, size_bytes, sha256, status, scan_status, module_id, created_at, updated_at, retention_expires_at, processing_attempts)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)""",
                (
                    values["id"], values["owner_id"], values["original_name"], values["storage_name"], values["extension"], values["kind"],
                    values["mime_type"], values["size_bytes"], values["sha256"], values["status"], values["scan_status"], values.get("module_id"),
                    values["created_at"], values["updated_at"], values["retention_expires_at"],
                ),
            )

    def find_duplicate(self, owner_id: str, sha256: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM documents WHERE owner_id=? AND sha256=? ORDER BY created_at DESC LIMIT 1", (owner_id, sha256)).fetchone()

    def get_row(self, document_id: str, owner_id: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM documents WHERE id=? AND owner_id=?", (document_id, owner_id)).fetchone()

    def get_any_row(self, document_id: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM documents WHERE id=?", (document_id,)).fetchone()

    def list_rows(self, owner_id: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM documents WHERE owner_id=? ORDER BY created_at DESC", (owner_id,)).fetchall()

    def expired_rows(self, now_iso: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM documents WHERE retention_expires_at <= ?", (now_iso,)).fetchall()

    def update_status(self, document_id: str, owner_id: str, status: DocumentStatus, *, error_code: str | None = None, error_message: str | None = None, increment_attempt: bool = False) -> None:
        with self._lock, self._connect() as connection:
            connection.execute(
                """UPDATE documents SET status=?, error_code=?, error_message=?, updated_at=?, processing_attempts=processing_attempts + ?
                WHERE id=? AND owner_id=?""",
                (status.value, error_code, error_message, self._now(), 1 if increment_attempt else 0, document_id, owner_id),
            )

    def replace_chunks(self, document_id: str, owner_id: str, chunks: list[dict]) -> None:
        now = self._now()
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM document_chunks WHERE document_id=? AND owner_id=?", (document_id, owner_id))
            connection.executemany(
                "INSERT INTO document_chunks (id, document_id, owner_id, ordinal, locator_type, locator, text, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [(item["id"], document_id, owner_id, item["ordinal"], item["locator_type"], item["locator"], item["text"], now) for item in chunks],
            )

    def get_chunks(self, document_id: str, owner_id: str) -> list[dict]:
        with self._connect() as connection:
            rows = connection.execute("SELECT id, ordinal, locator_type, locator, text FROM document_chunks WHERE document_id=? AND owner_id=? ORDER BY ordinal", (document_id, owner_id)).fetchall()
        return [dict(row) for row in rows]

    def save_analysis(self, document_id: str, owner_id: str, analysis: DocumentAnalysis) -> None:
        now = self._now()
        payloads = {
            "summary": {"summary": analysis.summary, "source_refs": [item.model_dump(mode="json") for item in analysis.summary_source_refs]},
            "learning_outcomes": [item.model_dump(mode="json") for item in analysis.learning_outcomes],
            "dates": [item.model_dump(mode="json") for item in analysis.dates],
            "study_time": {"minutes": analysis.study_time_minutes, "rationale": analysis.study_time_rationale},
            "flashcards": [item.model_dump(mode="json") for item in analysis.flashcards],
            "quiz": [item.model_dump(mode="json") for item in analysis.quiz],
            "warnings": analysis.warnings,
        }
        with self._lock, self._connect() as connection:
            connection.execute("DELETE FROM document_analysis_results WHERE document_id=? AND owner_id=?", (document_id, owner_id))
            connection.executemany(
                "INSERT INTO document_analysis_results (id, document_id, owner_id, result_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                [(f"analysis_{document_id}_{kind}", document_id, owner_id, kind, json.dumps(payload, separators=(",", ":")), now) for kind, payload in payloads.items()],
            )
            connection.execute("DELETE FROM document_proposed_actions WHERE document_id=? AND owner_id=?", (document_id, owner_id))
            connection.executemany(
                "INSERT INTO document_proposed_actions (id, document_id, owner_id, kind, status, payload_json, created_at) VALUES (?, ?, ?, ?, 'proposed', ?, ?)",
                [(action.id, document_id, owner_id, action.kind, action.model_dump_json(), now) for action in analysis.proposed_actions],
            )

    def load_analysis(self, document_id: str, owner_id: str) -> DocumentAnalysis | None:
        with self._connect() as connection:
            rows = connection.execute("SELECT result_type, payload_json FROM document_analysis_results WHERE document_id=? AND owner_id=?", (document_id, owner_id)).fetchall()
            actions = connection.execute("SELECT status, payload_json FROM document_proposed_actions WHERE document_id=? AND owner_id=? ORDER BY created_at, id", (document_id, owner_id)).fetchall()
        if not rows:
            return None
        values = {row["result_type"]: json.loads(row["payload_json"]) for row in rows}
        summary = values.get("summary", {})
        study = values.get("study_time", {})
        return DocumentAnalysis.model_validate({
            "summary": summary.get("summary", ""),
            "summary_source_refs": summary.get("source_refs", []),
            "learning_outcomes": values.get("learning_outcomes", []),
            "dates": values.get("dates", []),
            "study_time_minutes": study.get("minutes", 15),
            "study_time_rationale": study.get("rationale", "Estimate unavailable."),
            "flashcards": values.get("flashcards", []),
            "quiz": values.get("quiz", []),
            "warnings": values.get("warnings", []),
            "proposed_actions": [{**json.loads(row["payload_json"]), "approval_status": row["status"]} for row in actions],
        })

    def approve_action(self, document_id: str, owner_id: str, action: DocumentProposedAction) -> None:
        with self._lock, self._connect() as connection:
            result = connection.execute(
                "UPDATE document_proposed_actions SET status='approved', payload_json=?, approved_at=? WHERE id=? AND document_id=? AND owner_id=?",
                (action.model_dump_json(), self._now(), action.id, document_id, owner_id),
            )
            if result.rowcount != 1:
                raise KeyError("Proposed action not found.")

    def get_action(self, document_id: str, owner_id: str, action_id: str):
        with self._connect() as connection:
            return connection.execute("SELECT * FROM document_proposed_actions WHERE id=? AND document_id=? AND owner_id=?", (action_id, document_id, owner_id)).fetchone()

    def delete(self, document_id: str, owner_id: str) -> str | None:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT storage_name FROM documents WHERE id=? AND owner_id=?", (document_id, owner_id)).fetchone()
            if not row:
                return None
            connection.execute("DELETE FROM documents WHERE id=? AND owner_id=?", (document_id, owner_id))
            return row["storage_name"]

    def audit(self, owner_id: str, event: str, document_id: str | None = None, metadata: dict[str, str] | None = None) -> None:
        import uuid
        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO document_audit (id, document_id, owner_id, event, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (f"da_{uuid.uuid4().hex}", document_id, owner_id, event, json.dumps(metadata or {}, separators=(",", ":")), self._now()),
            )
