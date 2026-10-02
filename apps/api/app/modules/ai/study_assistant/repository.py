from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import Any, Protocol

from .schemas import AssistantContextRef, ProposedAction, StudentAssistantContextSnapshot, StudyAssistantResponse


class AssistantRepository(Protocol):
    def sync_context(self, student_id: str, snapshot: StudentAssistantContextSnapshot) -> None: ...
    def get_context(self, student_id: str) -> StudentAssistantContextSnapshot | None: ...
    def get_or_create_session(self, session_id: str, student_id: str) -> "AssistantSessionRecord": ...
    def save_response(self, record: "AssistantSessionRecord", response: StudyAssistantResponse, question_digest: str) -> None: ...
    def get_response(self, session_id: str, response_id: str, student_id: str) -> StudyAssistantResponse | None: ...
    def save_action(self, session_id: str, student_id: str, action: ProposedAction) -> None: ...
    def audit(self, student_id: str, event: str, metadata: dict[str, str] | None = None) -> None: ...
    def save_feedback(self, session_id: str, response_id: str, student_id: str, helpful: bool, note: str) -> None: ...


@dataclass(frozen=True, slots=True)
class AssistantAuditEvent:
    id: str
    student_id: str
    event: str
    created_at: datetime
    metadata: dict[str, str]


@dataclass(slots=True)
class AssistantSessionRecord:
    session_id: str
    student_id: str
    created_at: datetime
    updated_at: datetime
    context_refs: list[AssistantContextRef] = field(default_factory=list)
    response_types: list[str] = field(default_factory=list)
    question_digests: list[str] = field(default_factory=list)
    responses: dict[str, StudyAssistantResponse] = field(default_factory=dict)
    feedback: dict[str, dict[str, Any]] = field(default_factory=dict)
    saved_actions: dict[str, ProposedAction] = field(default_factory=dict)


class InMemoryAssistantRepository:
    """Prototype repository with explicit ownership and retention.

    Raw prompts are deliberately never stored. Production can replace this with a SQL repository
    without changing the service contract.
    """

    def __init__(self, session_retention_hours: int = 72) -> None:
        self._contexts: dict[str, StudentAssistantContextSnapshot] = {}
        self._sessions: dict[str, AssistantSessionRecord] = {}
        self._audit: list[AssistantAuditEvent] = []
        self._lock = RLock()
        self._retention = timedelta(hours=max(1, session_retention_hours))

    def _purge_expired(self) -> None:
        cutoff = datetime.now(timezone.utc) - self._retention
        stale = [key for key, value in self._sessions.items() if value.updated_at < cutoff]
        for key in stale:
            self._sessions.pop(key, None)

    def sync_context(self, student_id: str, snapshot: StudentAssistantContextSnapshot) -> None:
        with self._lock:
            self._contexts[student_id] = snapshot.model_copy(deep=True)

    def get_context(self, student_id: str) -> StudentAssistantContextSnapshot | None:
        with self._lock:
            value = self._contexts.get(student_id)
            return value.model_copy(deep=True) if value else None

    def get_or_create_session(self, session_id: str, student_id: str) -> AssistantSessionRecord:
        with self._lock:
            self._purge_expired()
            existing = self._sessions.get(session_id)
            if existing and existing.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            now = datetime.now(timezone.utc)
            if existing:
                existing.updated_at = now
                return existing
            record = AssistantSessionRecord(session_id=session_id, student_id=student_id, created_at=now, updated_at=now)
            self._sessions[session_id] = record
            return record

    def save_response(self, record: AssistantSessionRecord, response: StudyAssistantResponse, question_digest: str) -> None:
        with self._lock:
            record.updated_at = datetime.now(timezone.utc)
            record.context_refs.append(response.context_used[0])
            record.response_types.append(response.mode.value)
            record.question_digests.append(question_digest)
            record.responses[response.response_id] = response.model_copy(deep=True)

    def get_response(self, session_id: str, response_id: str, student_id: str) -> StudyAssistantResponse | None:
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                return None
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            response = record.responses.get(response_id)
            return response.model_copy(deep=True) if response else None

    def save_action(self, session_id: str, student_id: str, action: ProposedAction) -> None:
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                raise KeyError("Session not found.")
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            record.saved_actions[action.id] = action.model_copy(deep=True)
            record.updated_at = datetime.now(timezone.utc)

    def audit(self, student_id: str, event: str, metadata: dict[str, str] | None = None) -> None:
        with self._lock:
            self._audit.append(AssistantAuditEvent(
                id=f"audit_{len(self._audit) + 1}", student_id=student_id, event=event,
                created_at=datetime.now(timezone.utc), metadata=dict(metadata or {}),
            ))

    def audit_events(self, student_id: str) -> list[AssistantAuditEvent]:
        with self._lock:
            return [item for item in self._audit if item.student_id == student_id]

    def save_feedback(self, session_id: str, response_id: str, student_id: str, helpful: bool, note: str) -> None:
        with self._lock:
            record = self._sessions.get(session_id)
            if not record:
                raise KeyError("Session not found.")
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            if response_id not in record.responses:
                raise KeyError("Response not found.")
            record.feedback[response_id] = {"helpful": helpful, "note": note.strip()}
            record.updated_at = datetime.now(timezone.utc)

class SqliteAssistantRepository:
    """Durable SQLite repository for the Study Assistant bounded context.

    The repository stores structured context/sessions/actions/feedback only. Raw user prompts are
    never accepted by this API and therefore cannot be persisted accidentally.
    """

    def __init__(self, database_path: str, session_retention_hours: int = 72) -> None:
        from pathlib import Path
        import sqlite3

        self._sqlite3 = sqlite3
        self._path = str(Path(database_path).expanduser().resolve())
        Path(self._path).parent.mkdir(parents=True, exist_ok=True)
        self._retention = timedelta(hours=max(1, session_retention_hours))
        self._lock = RLock()
        # The current context snapshot is deliberately process-local. The web client re-syncs it
        # before each assistant request, so durable storage contains sessions/actions/audit only.
        self._contexts: dict[str, StudentAssistantContextSnapshot] = {}
        self._ensure_schema()

    def _connect(self):
        connection = self._sqlite3.connect(self._path, timeout=10)
        connection.row_factory = self._sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
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
                """
            )

    @staticmethod
    def _now() -> datetime:
        return datetime.now(timezone.utc)

    def _purge_expired(self, connection) -> None:
        cutoff = (self._now() - self._retention).isoformat()
        connection.execute("DELETE FROM assistant_sessions WHERE updated_at < ?", (cutoff,))

    @staticmethod
    def _record_from_row(row) -> AssistantSessionRecord:
        import json

        responses_raw = json.loads(row["responses_json"])
        actions_raw = json.loads(row["saved_actions_json"])
        return AssistantSessionRecord(
            session_id=row["session_id"],
            student_id=row["student_id"],
            created_at=datetime.fromisoformat(row["created_at"]),
            updated_at=datetime.fromisoformat(row["updated_at"]),
            context_refs=[AssistantContextRef.model_validate(item) for item in json.loads(row["context_refs_json"])],
            response_types=list(json.loads(row["response_types_json"])),
            question_digests=list(json.loads(row["question_digests_json"])),
            responses={key: StudyAssistantResponse.model_validate(value) for key, value in responses_raw.items()},
            feedback=dict(json.loads(row["feedback_json"])),
            saved_actions={key: ProposedAction.model_validate(value) for key, value in actions_raw.items()},
        )

    def _write_record(self, connection, record: AssistantSessionRecord) -> None:
        import json

        connection.execute(
            """
            INSERT INTO assistant_sessions (
                session_id, student_id, created_at, updated_at, context_refs_json,
                response_types_json, question_digests_json, responses_json, feedback_json, saved_actions_json
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                student_id=excluded.student_id,
                updated_at=excluded.updated_at,
                context_refs_json=excluded.context_refs_json,
                response_types_json=excluded.response_types_json,
                question_digests_json=excluded.question_digests_json,
                responses_json=excluded.responses_json,
                feedback_json=excluded.feedback_json,
                saved_actions_json=excluded.saved_actions_json
            """,
            (
                record.session_id,
                record.student_id,
                record.created_at.isoformat(),
                record.updated_at.isoformat(),
                json.dumps([item.model_dump(mode="json") for item in record.context_refs], separators=(",", ":")),
                json.dumps(record.response_types, separators=(",", ":")),
                json.dumps(record.question_digests, separators=(",", ":")),
                json.dumps({key: value.model_dump(mode="json") for key, value in record.responses.items()}, separators=(",", ":")),
                json.dumps(record.feedback, separators=(",", ":")),
                json.dumps({key: value.model_dump(mode="json") for key, value in record.saved_actions.items()}, separators=(",", ":")),
            ),
        )

    def sync_context(self, student_id: str, snapshot: StudentAssistantContextSnapshot) -> None:
        with self._lock:
            self._contexts[student_id] = snapshot.model_copy(deep=True)

    def get_context(self, student_id: str) -> StudentAssistantContextSnapshot | None:
        with self._lock:
            value = self._contexts.get(student_id)
            return value.model_copy(deep=True) if value else None

    def get_or_create_session(self, session_id: str, student_id: str) -> AssistantSessionRecord:
        with self._lock, self._connect() as connection:
            self._purge_expired(connection)
            row = connection.execute("SELECT * FROM assistant_sessions WHERE session_id = ?", (session_id,)).fetchone()
            if row:
                record = self._record_from_row(row)
                if record.student_id != student_id:
                    raise PermissionError("Session belongs to another student.")
                record.updated_at = self._now()
            else:
                now = self._now()
                record = AssistantSessionRecord(session_id=session_id, student_id=student_id, created_at=now, updated_at=now)
            self._write_record(connection, record)
            return record

    def save_response(self, record: AssistantSessionRecord, response: StudyAssistantResponse, question_digest: str) -> None:
        with self._lock, self._connect() as connection:
            row = connection.execute("SELECT * FROM assistant_sessions WHERE session_id = ?", (record.session_id,)).fetchone()
            if not row:
                raise KeyError("Session not found.")
            persisted = self._record_from_row(row)
            if persisted.student_id != record.student_id:
                raise PermissionError("Session belongs to another student.")
            persisted.updated_at = self._now()
            persisted.context_refs.append(response.context_used[0])
            persisted.response_types.append(response.mode.value)
            persisted.question_digests.append(question_digest)
            persisted.responses[response.response_id] = response.model_copy(deep=True)
            self._write_record(connection, persisted)
            # Keep the caller's record coherent for tests/debugging without exposing raw prompts.
            record.updated_at = persisted.updated_at
            record.context_refs = list(persisted.context_refs)
            record.response_types = list(persisted.response_types)
            record.question_digests = list(persisted.question_digests)
            record.responses = dict(persisted.responses)

    def get_response(self, session_id: str, response_id: str, student_id: str) -> StudyAssistantResponse | None:
        with self._lock, self._connect() as connection:
            self._purge_expired(connection)
            row = connection.execute("SELECT * FROM assistant_sessions WHERE session_id = ?", (session_id,)).fetchone()
            if not row:
                return None
            record = self._record_from_row(row)
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            response = record.responses.get(response_id)
            return response.model_copy(deep=True) if response else None

    def save_action(self, session_id: str, student_id: str, action: ProposedAction) -> None:
        with self._lock, self._connect() as connection:
            self._purge_expired(connection)
            row = connection.execute("SELECT * FROM assistant_sessions WHERE session_id = ?", (session_id,)).fetchone()
            if not row:
                raise KeyError("Session not found.")
            record = self._record_from_row(row)
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            record.saved_actions[action.id] = action.model_copy(deep=True)
            record.updated_at = self._now()
            self._write_record(connection, record)

    def audit(self, student_id: str, event: str, metadata: dict[str, str] | None = None) -> None:
        import json
        import uuid

        with self._lock, self._connect() as connection:
            connection.execute(
                "INSERT INTO assistant_audit(id, student_id, event, created_at, metadata_json) VALUES (?, ?, ?, ?, ?)",
                (f"audit_{uuid.uuid4().hex}", student_id, event, self._now().isoformat(), json.dumps(dict(metadata or {}), separators=(",", ":"))),
            )

    def audit_events(self, student_id: str) -> list[AssistantAuditEvent]:
        import json

        with self._lock, self._connect() as connection:
            rows = connection.execute("SELECT * FROM assistant_audit WHERE student_id = ? ORDER BY created_at", (student_id,)).fetchall()
        return [AssistantAuditEvent(id=row["id"], student_id=row["student_id"], event=row["event"], created_at=datetime.fromisoformat(row["created_at"]), metadata=json.loads(row["metadata_json"])) for row in rows]

    def save_feedback(self, session_id: str, response_id: str, student_id: str, helpful: bool, note: str) -> None:
        with self._lock, self._connect() as connection:
            self._purge_expired(connection)
            row = connection.execute("SELECT * FROM assistant_sessions WHERE session_id = ?", (session_id,)).fetchone()
            if not row:
                raise KeyError("Session not found.")
            record = self._record_from_row(row)
            if record.student_id != student_id:
                raise PermissionError("Session belongs to another student.")
            if response_id not in record.responses:
                raise KeyError("Response not found.")
            record.feedback[response_id] = {"helpful": helpful, "note": note.strip()}
            record.updated_at = self._now()
            self._write_record(connection, record)

