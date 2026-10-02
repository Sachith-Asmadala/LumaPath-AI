from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
from pathlib import Path
import sqlite3
from threading import RLock
from typing import Any, Iterable
from uuid import uuid4

from .definitions import ALLOWED_COHORT_DEFINITION_KEYS, APPROVED_METRIC_KEYS, METRIC_VERSION, PURPOSE_CODE


class InstitutionalAnalyticsRepository:
    """Persistence boundary for DOC-F25.

    Dashboard reads are served from aggregate rows only. Cohort membership stores only an
    HMAC-derived subject key, never the direct student identifier. Source-domain identifiers
    are read transiently during a refresh and are never copied into aggregate tables.
    """

    def __init__(self, database_path: str, subject_key_secret: str):
        self.database_path = database_path
        self._secret = subject_key_secret.encode("utf-8")
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()
        self._ensure_metric_approvals()

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        return db

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS institutional_analytics_cohorts (
                    id TEXT PRIMARY KEY,
                    institution_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    definition_json TEXT NOT NULL,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(institution_id, id)
                );
                CREATE INDEX IF NOT EXISTS idx_institutional_cohort_institution
                    ON institutional_analytics_cohorts(institution_id, active, name);

                CREATE TABLE IF NOT EXISTS institutional_analytics_cohort_subjects (
                    cohort_id TEXT NOT NULL REFERENCES institutional_analytics_cohorts(id) ON DELETE CASCADE,
                    institution_id TEXT NOT NULL,
                    subject_key TEXT NOT NULL,
                    added_at TEXT NOT NULL,
                    PRIMARY KEY(cohort_id, subject_key)
                );
                CREATE INDEX IF NOT EXISTS idx_institutional_subject_lookup
                    ON institutional_analytics_cohort_subjects(institution_id, subject_key);

                CREATE TABLE IF NOT EXISTS institutional_analytics_metric_approvals (
                    metric_key TEXT NOT NULL,
                    metric_version TEXT NOT NULL,
                    approved INTEGER NOT NULL,
                    purpose TEXT NOT NULL,
                    approved_at TEXT NOT NULL,
                    PRIMARY KEY(metric_key, metric_version)
                );

                CREATE TABLE IF NOT EXISTS institutional_analytics_aggregates (
                    id TEXT PRIMARY KEY,
                    institution_id TEXT NOT NULL,
                    cohort_id TEXT NOT NULL REFERENCES institutional_analytics_cohorts(id) ON DELETE CASCADE,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    metric_key TEXT NOT NULL,
                    dimension_key TEXT NOT NULL DEFAULT '',
                    dimension_label TEXT NOT NULL DEFAULT '',
                    metric_version TEXT NOT NULL,
                    revision INTEGER NOT NULL,
                    value REAL,
                    unit TEXT NOT NULL,
                    sample_size INTEGER,
                    suppressed INTEGER NOT NULL,
                    suppression_reason TEXT,
                    trend_json TEXT NOT NULL DEFAULT '[]',
                    purpose TEXT NOT NULL,
                    source_latest_at TEXT,
                    refreshed_at TEXT NOT NULL,
                    UNIQUE(cohort_id, period_start, period_end, timezone, metric_key, dimension_key, metric_version, revision)
                );
                CREATE INDEX IF NOT EXISTS idx_institutional_aggregate_lookup
                    ON institutional_analytics_aggregates(
                        institution_id, cohort_id, period_start, period_end, timezone, metric_version, revision DESC
                    );

                CREATE TABLE IF NOT EXISTS institutional_analytics_support_signals (
                    id TEXT PRIMARY KEY,
                    institution_id TEXT NOT NULL,
                    subject_key TEXT NOT NULL,
                    signal_type TEXT NOT NULL,
                    topic_key TEXT,
                    occurred_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_institutional_support_signal_time
                    ON institutional_analytics_support_signals(institution_id, signal_type, occurred_at);

                CREATE TABLE IF NOT EXISTS institutional_analytics_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    administrator_id TEXT NOT NULL,
                    administrator_role TEXT NOT NULL,
                    institution_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    cohort_id TEXT,
                    purpose TEXT NOT NULL,
                    detail_json TEXT NOT NULL DEFAULT '{}',
                    occurred_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_institutional_analytics_audit_lookup
                    ON institutional_analytics_audit(institution_id, occurred_at DESC);
                """
            )

    def _ensure_metric_approvals(self) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            db.executemany(
                """INSERT OR IGNORE INTO institutional_analytics_metric_approvals
                (metric_key, metric_version, approved, purpose, approved_at)
                VALUES (?, ?, 1, ?, ?)""",
                [(key, METRIC_VERSION, PURPOSE_CODE, now) for key in APPROVED_METRIC_KEYS],
            )
            db.commit()

    def subject_key(self, institution_id: str, student_id: str) -> str:
        message = f"{institution_id}\x1f{student_id}".encode("utf-8")
        return hmac.new(self._secret, message, hashlib.sha256).hexdigest()

    def upsert_cohort(
        self,
        *,
        cohort_id: str,
        institution_id: str,
        name: str,
        definition: dict[str, str | int | bool],
        student_ids: Iterable[str],
    ) -> None:
        """Provision a cohort from a trusted institutional source.

        Direct student identifiers are used only to derive subject keys in memory and are not
        written to DOC-F25 tables.
        """

        unknown_definition_keys = set(definition) - ALLOWED_COHORT_DEFINITION_KEYS
        if unknown_definition_keys:
            raise ValueError(f"Unsupported cohort definition keys: {', '.join(sorted(unknown_definition_keys))}")
        now = datetime.now(timezone.utc).isoformat()
        subject_keys = sorted({self.subject_key(institution_id, student_id) for student_id in student_ids})
        if not subject_keys:
            raise ValueError("A cohort must contain at least one subject before provisioning.")
        with self._lock, self._connect() as db:
            existing = db.execute(
                "SELECT institution_id FROM institutional_analytics_cohorts WHERE id=?",
                (cohort_id,),
            ).fetchone()
            if existing and existing["institution_id"] != institution_id:
                raise ValueError("A cohort cannot be moved across institution boundaries.")
            db.execute(
                """INSERT INTO institutional_analytics_cohorts
                (id,institution_id,name,definition_json,active,created_at,updated_at)
                VALUES (?,?,?,?,1,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    institution_id=excluded.institution_id,
                    name=excluded.name,
                    definition_json=excluded.definition_json,
                    active=1,
                    updated_at=excluded.updated_at""",
                (cohort_id, institution_id, name, json.dumps(definition, sort_keys=True), now, now),
            )
            db.execute("DELETE FROM institutional_analytics_cohort_subjects WHERE cohort_id=?", (cohort_id,))
            db.executemany(
                """INSERT INTO institutional_analytics_cohort_subjects
                (cohort_id,institution_id,subject_key,added_at) VALUES (?,?,?,?)""",
                [(cohort_id, institution_id, key, now) for key in subject_keys],
            )
            db.commit()

    def list_cohorts(self, institution_id: str) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT c.*, COUNT(s.subject_key) AS member_count
                FROM institutional_analytics_cohorts c
                LEFT JOIN institutional_analytics_cohort_subjects s ON s.cohort_id=c.id
                WHERE c.institution_id=? AND c.active=1
                GROUP BY c.id ORDER BY c.name""",
                (institution_id,),
            ).fetchall()
        return [self._cohort_dict(row) for row in rows]

    def get_cohort(self, cohort_id: str) -> dict[str, Any] | None:
        with self._connect() as db:
            row = db.execute(
                """SELECT c.*, COUNT(s.subject_key) AS member_count
                FROM institutional_analytics_cohorts c
                LEFT JOIN institutional_analytics_cohort_subjects s ON s.cohort_id=c.id
                WHERE c.id=? GROUP BY c.id""",
                (cohort_id,),
            ).fetchone()
        return self._cohort_dict(row) if row else None

    @staticmethod
    def _cohort_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "institution_id": row["institution_id"],
            "name": row["name"],
            "definition": json.loads(row["definition_json"]),
            "member_count": int(row["member_count"]),
        }

    def cohort_subject_keys(self, cohort_id: str) -> set[str]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT subject_key FROM institutional_analytics_cohort_subjects WHERE cohort_id=?",
                (cohort_id,),
            ).fetchall()
        return {row["subject_key"] for row in rows}

    def approved_metric_keys(self, purpose: str) -> set[str]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT metric_key FROM institutional_analytics_metric_approvals
                WHERE metric_version=? AND approved=1 AND purpose=?""",
                (METRIC_VERSION, purpose),
            ).fetchall()
        return {row["metric_key"] for row in rows}

    def set_metric_approval(self, metric_key: str, approved: bool, purpose: str = PURPOSE_CODE) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            db.execute(
                """INSERT INTO institutional_analytics_metric_approvals
                (metric_key,metric_version,approved,purpose,approved_at) VALUES (?,?,?,?,?)
                ON CONFLICT(metric_key,metric_version) DO UPDATE SET
                    approved=excluded.approved,purpose=excluded.purpose,approved_at=excluded.approved_at""",
                (metric_key, METRIC_VERSION, int(approved), purpose, now),
            )
            db.commit()

    def add_support_signal(
        self,
        *,
        institution_id: str,
        student_id: str,
        signal_type: str,
        occurred_at: datetime,
        topic_key: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            db.execute(
                """INSERT INTO institutional_analytics_support_signals
                (id,institution_id,subject_key,signal_type,topic_key,occurred_at,created_at)
                VALUES (?,?,?,?,?,?,?)""",
                (
                    str(uuid4()),
                    institution_id,
                    self.subject_key(institution_id, student_id),
                    signal_type,
                    topic_key,
                    occurred_at.astimezone(timezone.utc).isoformat(),
                    now,
                ),
            )
            db.commit()

    def analytics_events_before(self, end_utc: datetime) -> list[dict[str, Any]]:
        if not self._table_exists("analytics_activity_events"):
            return []
        with self._connect() as db:
            rows = db.execute(
                """SELECT student_id,event_type,occurred_at,source_type,source_id,module,measurement_kind,payload_json
                FROM analytics_activity_events WHERE occurred_at < ? ORDER BY occurred_at""",
                (end_utc.isoformat(),),
            ).fetchall()
        return [
            {
                "student_id": row["student_id"],
                "event_type": row["event_type"],
                "occurred_at": row["occurred_at"],
                "source_type": row["source_type"],
                "source_id": row["source_id"],
                "module": row["module"],
                "measurement_kind": row["measurement_kind"],
                "payload": json.loads(row["payload_json"]),
            }
            for row in rows
        ]

    def internship_preparation_activity(self, start_utc: datetime, end_utc: datetime) -> list[dict[str, str]]:
        sources = [
            ("internship_applications", "student_id", "created_at", "internship_application"),
            ("cv_analysis_snapshots", "student_id", "analyzed_at", "cv_analysis"),
            ("interview_sessions", "student_id", "created_at", "interview_practice"),
        ]
        result: list[dict[str, str]] = []
        with self._connect() as db:
            for table, student_col, time_col, kind in sources:
                if not self._table_exists(table, connection=db):
                    continue
                rows = db.execute(
                    f"SELECT {student_col} AS student_id, {time_col} AS occurred_at FROM {table} "
                    f"WHERE {time_col}>=? AND {time_col}<?",
                    (start_utc.isoformat(), end_utc.isoformat()),
                ).fetchall()
                result.extend({"student_id": row["student_id"], "occurred_at": row["occurred_at"], "kind": kind} for row in rows)
        return result

    def mentor_guidance_activity(self, start_utc: datetime, end_utc: datetime) -> list[dict[str, str]]:
        if not self._table_exists("guidance_requests"):
            return []
        with self._connect() as db:
            rows = db.execute(
                """SELECT student_id,created_at AS occurred_at FROM guidance_requests
                WHERE created_at>=? AND created_at<?""",
                (start_utc.isoformat(), end_utc.isoformat()),
            ).fetchall()
        return [{"student_id": row["student_id"], "occurred_at": row["occurred_at"]} for row in rows]

    def support_signals(self, institution_id: str, signal_type: str, start_utc: datetime, end_utc: datetime) -> list[dict[str, str]]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT subject_key,occurred_at,COALESCE(topic_key,'') AS topic_key
                FROM institutional_analytics_support_signals
                WHERE institution_id=? AND signal_type=? AND occurred_at>=? AND occurred_at<?""",
                (institution_id, signal_type, start_utc.isoformat(), end_utc.isoformat()),
            ).fetchall()
        return [dict(row) for row in rows]

    def next_revision(self, cohort_id: str, period_start: str, period_end: str, timezone_name: str) -> int:
        with self._connect() as db:
            row = db.execute(
                """SELECT COALESCE(MAX(revision),0) AS revision FROM institutional_analytics_aggregates
                WHERE cohort_id=? AND period_start=? AND period_end=? AND timezone=? AND metric_version=?""",
                (cohort_id, period_start, period_end, timezone_name, METRIC_VERSION),
            ).fetchone()
        return int(row["revision"]) + 1

    def save_aggregate_rows(
        self,
        *,
        institution_id: str,
        cohort_id: str,
        period_start: str,
        period_end: str,
        timezone_name: str,
        revision: int,
        rows: list[dict[str, Any]],
        purpose: str,
        source_latest_at: str | None,
        refreshed_at: str,
    ) -> None:
        with self._lock, self._connect() as db:
            for row in rows:
                db.execute(
                    """INSERT INTO institutional_analytics_aggregates
                    (id,institution_id,cohort_id,period_start,period_end,timezone,metric_key,dimension_key,
                     dimension_label,metric_version,revision,value,unit,sample_size,suppressed,suppression_reason,
                     trend_json,purpose,source_latest_at,refreshed_at)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        str(uuid4()), institution_id, cohort_id, period_start, period_end, timezone_name,
                        row["metric_key"], row.get("dimension_key", ""), row.get("dimension_label", ""),
                        METRIC_VERSION, revision, row.get("value"), row["unit"], row.get("sample_size"),
                        int(row.get("suppressed", False)), row.get("suppression_reason"),
                        json.dumps(row.get("trend", []), separators=(",", ":"), sort_keys=True), purpose,
                        source_latest_at, refreshed_at,
                    ),
                )
            db.commit()

    def latest_aggregate_rows(
        self,
        *,
        institution_id: str,
        cohort_id: str,
        period_start: str,
        period_end: str,
        timezone_name: str,
    ) -> list[dict[str, Any]]:
        with self._connect() as db:
            revision_row = db.execute(
                """SELECT MAX(revision) AS revision FROM institutional_analytics_aggregates
                WHERE institution_id=? AND cohort_id=? AND period_start=? AND period_end=? AND timezone=?
                  AND metric_version=?""",
                (institution_id, cohort_id, period_start, period_end, timezone_name, METRIC_VERSION),
            ).fetchone()
            if not revision_row or revision_row["revision"] is None:
                return []
            rows = db.execute(
                """SELECT * FROM institutional_analytics_aggregates
                WHERE institution_id=? AND cohort_id=? AND period_start=? AND period_end=? AND timezone=?
                  AND metric_version=? AND revision=?
                ORDER BY metric_key, dimension_key""",
                (
                    institution_id, cohort_id, period_start, period_end, timezone_name,
                    METRIC_VERSION, int(revision_row["revision"]),
                ),
            ).fetchall()
        return [
            {
                **dict(row),
                "trend": json.loads(row["trend_json"]),
                "suppressed": bool(row["suppressed"]),
            }
            for row in rows
        ]

    def audit(
        self,
        *,
        administrator_id: str,
        administrator_role: str,
        institution_id: str,
        action: str,
        cohort_id: str | None,
        purpose: str,
        detail: dict[str, Any] | None = None,
    ) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            db.execute(
                """INSERT INTO institutional_analytics_audit
                (administrator_id,administrator_role,institution_id,action,cohort_id,purpose,detail_json,occurred_at)
                VALUES (?,?,?,?,?,?,?,?)""",
                (
                    administrator_id, administrator_role, institution_id, action, cohort_id, purpose,
                    json.dumps(detail or {}, separators=(",", ":"), sort_keys=True), now,
                ),
            )
            db.commit()

    def audits(self, institution_id: str, limit: int = 100) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                """SELECT * FROM institutional_analytics_audit WHERE institution_id=?
                ORDER BY occurred_at DESC, id DESC LIMIT ?""",
                (institution_id, limit),
            ).fetchall()
        return [{**dict(row), "detail": json.loads(row["detail_json"])} for row in rows]

    def purge_expired_aggregates(self, retention_days: int, now: datetime | None = None) -> int:
        now = now or datetime.now(timezone.utc)
        cutoff = (now - timedelta(days=retention_days)).isoformat()
        with self._connect() as db:
            cur = db.execute("DELETE FROM institutional_analytics_aggregates WHERE refreshed_at < ?", (cutoff,))
            db.execute("DELETE FROM institutional_analytics_support_signals WHERE occurred_at < ?", (cutoff,))
            db.commit()
            return int(cur.rowcount)

    def _table_exists(self, table: str, *, connection: sqlite3.Connection | None = None) -> bool:
        if connection is not None:
            row = connection.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
            return bool(row)
        with self._connect() as db:
            row = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone()
        return bool(row)
