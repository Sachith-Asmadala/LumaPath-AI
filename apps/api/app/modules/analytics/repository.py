from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any, Iterable
from uuid import uuid4


@dataclass(frozen=True, slots=True)
class ActivityEvent:
    id: str
    student_id: str
    idempotency_key: str
    event_type: str
    occurred_at: str
    timezone: str
    source_type: str
    source_id: str
    module: str | None
    measurement_kind: str
    payload: dict[str, Any]
    created_at: str


class AnalyticsRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        return connection

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS analytics_activity_events (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    idempotency_key TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_id TEXT NOT NULL,
                    module TEXT,
                    measurement_kind TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(student_id, idempotency_key)
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_events_student_time
                    ON analytics_activity_events(student_id, occurred_at);
                CREATE INDEX IF NOT EXISTS idx_analytics_events_source
                    ON analytics_activity_events(student_id, source_type, source_id, occurred_at);

                CREATE TABLE IF NOT EXISTS analytics_aggregates (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    grain TEXT NOT NULL,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    metric_version TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    metrics_json TEXT NOT NULL,
                    source_event_count INTEGER NOT NULL,
                    computed_at TEXT NOT NULL,
                    UNIQUE(student_id, grain, period_start, timezone, metric_version, revision)
                );
                CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_lookup
                    ON analytics_aggregates(student_id, grain, period_start, timezone, metric_version, revision DESC);
                """
            )

    def append_events(self, events: Iterable[ActivityEvent]) -> tuple[int, int]:
        accepted = 0
        duplicates = 0
        with self._lock, self._connect() as db:
            for event in events:
                try:
                    db.execute(
                        """INSERT INTO analytics_activity_events
                        (id, student_id, idempotency_key, event_type, occurred_at, timezone, source_type,
                         source_id, module, measurement_kind, payload_json, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                        (
                            event.id, event.student_id, event.idempotency_key, event.event_type,
                            event.occurred_at, event.timezone, event.source_type, event.source_id,
                            event.module, event.measurement_kind,
                            json.dumps(event.payload, separators=(",", ":"), sort_keys=True), event.created_at,
                        ),
                    )
                    accepted += 1
                except sqlite3.IntegrityError:
                    duplicates += 1
            db.commit()
        return accepted, duplicates

    def events(self, student_id: str, start_utc: datetime, end_utc: datetime) -> list[ActivityEvent]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT * FROM analytics_activity_events
                WHERE student_id = ? AND occurred_at >= ? AND occurred_at < ?
                ORDER BY occurred_at ASC, created_at ASC""",
                (student_id, start_utc.isoformat(), end_utc.isoformat()),
            ).fetchall()
        return [self._row_to_event(row) for row in rows]

    def all_events_until(self, student_id: str, end_utc: datetime) -> list[ActivityEvent]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT * FROM analytics_activity_events
                WHERE student_id = ? AND occurred_at < ?
                ORDER BY occurred_at ASC, created_at ASC""",
                (student_id, end_utc.isoformat()),
            ).fetchall()
        return [self._row_to_event(row) for row in rows]

    def latest_event_at(self, student_id: str) -> datetime | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT MAX(occurred_at) AS latest FROM analytics_activity_events WHERE student_id = ?",
                (student_id,),
            ).fetchone()
        if not row or not row["latest"]:
            return None
        return datetime.fromisoformat(row["latest"])

    def append_aggregate(
        self,
        *,
        student_id: str,
        grain: str,
        period_start: str,
        period_end: str,
        timezone_name: str,
        metric_version: str,
        metrics: dict[str, Any],
        source_event_count: int,
    ) -> int:
        with self._lock, self._connect() as db:
            row = db.execute(
                """SELECT COALESCE(MAX(revision), 0) AS revision FROM analytics_aggregates
                WHERE student_id = ? AND grain = ? AND period_start = ? AND timezone = ? AND metric_version = ?""",
                (student_id, grain, period_start, timezone_name, metric_version),
            ).fetchone()
            revision = int(row["revision"]) + 1
            db.execute(
                """INSERT INTO analytics_aggregates
                (id, student_id, grain, period_start, period_end, timezone, metric_version, revision,
                 metrics_json, source_event_count, computed_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    str(uuid4()), student_id, grain, period_start, period_end, timezone_name, metric_version,
                    revision, json.dumps(metrics, separators=(",", ":"), sort_keys=True), source_event_count,
                    datetime.now(timezone.utc).isoformat(),
                ),
            )
            db.commit()
        return revision

    def latest_aggregate(self, student_id: str, grain: str, period_start: str, timezone_name: str, metric_version: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute(
                """SELECT * FROM analytics_aggregates
                WHERE student_id = ? AND grain = ? AND period_start = ? AND timezone = ? AND metric_version = ?
                ORDER BY revision DESC LIMIT 1""",
                (student_id, grain, period_start, timezone_name, metric_version),
            ).fetchone()
        if not row:
            return None
        return {
            "revision": int(row["revision"]),
            "metrics": json.loads(row["metrics_json"]),
            "source_event_count": int(row["source_event_count"]),
            "computed_at": row["computed_at"],
        }

    @staticmethod
    def _row_to_event(row: sqlite3.Row) -> ActivityEvent:
        return ActivityEvent(
            id=row["id"], student_id=row["student_id"], idempotency_key=row["idempotency_key"],
            event_type=row["event_type"], occurred_at=row["occurred_at"], timezone=row["timezone"],
            source_type=row["source_type"], source_id=row["source_id"], module=row["module"],
            measurement_kind=row["measurement_kind"], payload=json.loads(row["payload_json"]),
            created_at=row["created_at"],
        )
