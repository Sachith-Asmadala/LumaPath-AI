from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import sqlite3
from threading import RLock


@dataclass(slots=True)
class FocusSessionRecord:
    id: str
    student_id: str
    task_id: str
    task_title: str
    objective: str
    planned_work_minutes: int
    planned_break_minutes: int
    task_estimated_minutes: int
    task_progress_before: int
    task_progress_after: int | None
    timezone: str
    status: str
    started_at: str
    active_segment_started_at: str | None
    last_heartbeat_at: str | None
    paused_at: str | None
    ended_at: str | None
    accumulated_active_seconds: int
    notes: str
    next_step: str
    result: str | None
    estimate_feedback: str | None
    suggested_estimated_minutes: int | None
    estimate_explanation: str | None
    productive_minutes: int
    created_at: str
    updated_at: str


class FocusSessionRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode = WAL")
        return db

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS focus_sessions (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    task_title TEXT NOT NULL,
                    objective TEXT NOT NULL,
                    planned_work_minutes INTEGER NOT NULL,
                    planned_break_minutes INTEGER NOT NULL,
                    task_estimated_minutes INTEGER NOT NULL,
                    task_progress_before INTEGER NOT NULL,
                    task_progress_after INTEGER,
                    timezone TEXT NOT NULL,
                    status TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    active_segment_started_at TEXT,
                    last_heartbeat_at TEXT,
                    paused_at TEXT,
                    ended_at TEXT,
                    accumulated_active_seconds INTEGER NOT NULL DEFAULT 0,
                    notes TEXT NOT NULL DEFAULT '',
                    next_step TEXT NOT NULL DEFAULT '',
                    result TEXT,
                    estimate_feedback TEXT,
                    suggested_estimated_minutes INTEGER,
                    estimate_explanation TEXT,
                    productive_minutes INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_focus_student_status
                    ON focus_sessions(student_id, status, updated_at DESC);
                CREATE INDEX IF NOT EXISTS idx_focus_student_task
                    ON focus_sessions(student_id, task_id, updated_at DESC);
                CREATE TABLE IF NOT EXISTS focus_session_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                CREATE INDEX IF NOT EXISTS idx_focus_audit_student
                    ON focus_session_audit(student_id, session_id, occurred_at);
                """
            )
            columns = {row[1] for row in db.execute("PRAGMA table_info(focus_sessions)").fetchall()}
            if "last_heartbeat_at" not in columns:
                db.execute("ALTER TABLE focus_sessions ADD COLUMN last_heartbeat_at TEXT")

    def create(self, record: FocusSessionRecord) -> FocusSessionRecord:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO focus_sessions
                (id, student_id, task_id, task_title, objective, planned_work_minutes, planned_break_minutes,
                 task_estimated_minutes, task_progress_before, task_progress_after, timezone, status, started_at,
                 active_segment_started_at, last_heartbeat_at, paused_at, ended_at, accumulated_active_seconds, notes, next_step,
                 result, estimate_feedback, suggested_estimated_minutes, estimate_explanation, productive_minutes,
                 created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                tuple(getattr(record, field) for field in record.__dataclass_fields__),
            )
            db.commit()
        return record

    def get(self, session_id: str) -> FocusSessionRecord | None:
        with self._connect() as db:
            row = db.execute("SELECT * FROM focus_sessions WHERE id = ?", (session_id,)).fetchone()
        return self._row(row) if row else None

    def active_for_student(self, student_id: str) -> FocusSessionRecord | None:
        with self._connect() as db:
            row = db.execute(
                """SELECT * FROM focus_sessions
                WHERE student_id = ? AND status IN ('running','paused')
                ORDER BY updated_at DESC LIMIT 1""",
                (student_id,),
            ).fetchone()
        return self._row(row) if row else None

    def save(self, record: FocusSessionRecord) -> FocusSessionRecord:
        fields = [field for field in record.__dataclass_fields__ if field != "id"]
        setters = ", ".join(f"{field} = ?" for field in fields)
        values = [getattr(record, field) for field in fields] + [record.id]
        with self._lock, self._connect() as db:
            db.execute(f"UPDATE focus_sessions SET {setters} WHERE id = ?", values)
            db.commit()
        return record

    def recent_for_student(self, student_id: str, limit: int = 20) -> list[FocusSessionRecord]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM focus_sessions WHERE student_id = ? ORDER BY updated_at DESC LIMIT ?",
                (student_id, limit),
            ).fetchall()
        return [self._row(row) for row in rows]

    def audit(self, session_id: str, student_id: str, event_type: str, occurred_at: str, detail: str = "") -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO focus_session_audit(session_id, student_id, event_type, occurred_at, detail) VALUES (?, ?, ?, ?, ?)",
                (session_id, student_id, event_type, occurred_at, detail[:500]),
            )
            db.commit()

    @staticmethod
    def _row(row: sqlite3.Row) -> FocusSessionRecord:
        return FocusSessionRecord(**{key: row[key] for key in row.keys()})
