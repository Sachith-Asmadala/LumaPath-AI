from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock


class NotificationRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        db.execute("PRAGMA journal_mode=WAL")
        return db

    def _init_schema(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS notification_preferences (
              student_id TEXT PRIMARY KEY,
              timezone TEXT NOT NULL,
              quiet_hours_enabled INTEGER NOT NULL,
              quiet_hours_start TEXT NOT NULL,
              quiet_hours_end TEXT NOT NULL,
              mute_non_critical INTEGER NOT NULL,
              max_non_critical_per_day INTEGER NOT NULL,
              max_non_critical_per_hour INTEGER NOT NULL,
              in_app_enabled INTEGER NOT NULL,
              push_enabled INTEGER NOT NULL,
              push_permission_granted INTEGER NOT NULL,
              email_enabled INTEGER NOT NULL,
              email_consent INTEGER NOT NULL,
              categories_json TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS notification_candidates (
              id TEXT PRIMARY KEY,
              student_id TEXT NOT NULL,
              notification_type TEXT NOT NULL,
              source_type TEXT NOT NULL,
              source_id TEXT NOT NULL,
              display_label TEXT NOT NULL DEFAULT '',
              reason TEXT NOT NULL,
              action_href TEXT NOT NULL,
              urgency TEXT NOT NULL,
              sensitive INTEGER NOT NULL DEFAULT 0,
              occurred_at TEXT NOT NULL,
              deliver_after TEXT NOT NULL,
              expires_at TEXT,
              state TEXT NOT NULL,
              suppression_reason TEXT,
              idempotency_key TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_notification_candidate_key
              ON notification_candidates(student_id, idempotency_key);
            CREATE INDEX IF NOT EXISTS idx_notification_candidate_due
              ON notification_candidates(student_id, state, deliver_after);
            CREATE INDEX IF NOT EXISTS idx_notification_candidate_source
              ON notification_candidates(student_id, source_type, source_id, state);
            CREATE TABLE IF NOT EXISTS notification_deliveries (
              id TEXT PRIMARY KEY,
              candidate_id TEXT NOT NULL REFERENCES notification_candidates(id) ON DELETE CASCADE,
              student_id TEXT NOT NULL,
              channel TEXT NOT NULL,
              title TEXT NOT NULL,
              body TEXT NOT NULL,
              status TEXT NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              provider_message_id TEXT,
              error_code TEXT,
              delivered_at TEXT,
              opened_at TEXT,
              dismissed_at TEXT,
              acted_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(candidate_id, channel)
            );
            CREATE INDEX IF NOT EXISTS idx_notification_inbox
              ON notification_deliveries(student_id, channel, delivered_at DESC);
            """)

    def get_preferences(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM notification_preferences WHERE student_id=?", (student_id,)).fetchone()

    def upsert_preferences(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO notification_preferences
              (student_id,timezone,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,mute_non_critical,max_non_critical_per_day,max_non_critical_per_hour,in_app_enabled,push_enabled,push_permission_granted,email_enabled,email_consent,categories_json,updated_at)
              VALUES (:student_id,:timezone,:quiet_hours_enabled,:quiet_hours_start,:quiet_hours_end,:mute_non_critical,:max_non_critical_per_day,:max_non_critical_per_hour,:in_app_enabled,:push_enabled,:push_permission_granted,:email_enabled,:email_consent,:categories_json,:updated_at)
              ON CONFLICT(student_id) DO UPDATE SET timezone=excluded.timezone,quiet_hours_enabled=excluded.quiet_hours_enabled,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,mute_non_critical=excluded.mute_non_critical,max_non_critical_per_day=excluded.max_non_critical_per_day,max_non_critical_per_hour=excluded.max_non_critical_per_hour,in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,push_permission_granted=excluded.push_permission_granted,email_enabled=excluded.email_enabled,email_consent=excluded.email_consent,categories_json=excluded.categories_json,updated_at=excluded.updated_at""", values)
            db.commit()
        return self.get_preferences(values["student_id"])

    def insert_candidate(self, values: dict):
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM notification_candidates WHERE student_id=? AND idempotency_key=?", (values["student_id"], values["idempotency_key"])).fetchone()
            if existing:
                return existing, True
            db.execute("""UPDATE notification_candidates SET state='resolved', updated_at=:updated_at
                WHERE student_id=:student_id AND notification_type=:notification_type AND source_type=:source_type AND source_id=:source_id
                  AND state IN ('pending','deferred','delivered')""", values)
            db.execute("""INSERT INTO notification_candidates
              (id,student_id,notification_type,source_type,source_id,display_label,reason,action_href,urgency,sensitive,occurred_at,deliver_after,expires_at,state,suppression_reason,idempotency_key,created_at,updated_at)
              VALUES (:id,:student_id,:notification_type,:source_type,:source_id,:display_label,:reason,:action_href,:urgency,:sensitive,:occurred_at,:deliver_after,:expires_at,:state,:suppression_reason,:idempotency_key,:created_at,:updated_at)""", values)
            db.commit()
            return db.execute("SELECT * FROM notification_candidates WHERE id=?", (values["id"],)).fetchone(), False

    def resolve_source(self, student_id: str, notification_type: str, source_type: str, source_id: str, now: str) -> int:
        with self._lock, self._connect() as db:
            cur = db.execute("UPDATE notification_candidates SET state='resolved',updated_at=? WHERE student_id=? AND notification_type=? AND source_type=? AND source_id=? AND state IN ('pending','deferred','delivered')", (now, student_id, notification_type, source_type, source_id))
            db.commit()
            return cur.rowcount

    def update_candidate(self, candidate_id: str, state: str, now: str, suppression_reason: str | None = None, deliver_after: str | None = None):
        with self._lock, self._connect() as db:
            db.execute("UPDATE notification_candidates SET state=?, suppression_reason=?, deliver_after=COALESCE(?,deliver_after), updated_at=? WHERE id=?", (state, suppression_reason, deliver_after, now, candidate_id))
            db.commit()

    def expire_candidates(self, student_id: str, now: str) -> int:
        with self._lock, self._connect() as db:
            cur = db.execute("""UPDATE notification_candidates SET state='expired', suppression_reason='expired', updated_at=?
                WHERE student_id=? AND expires_at IS NOT NULL AND expires_at<=? AND state IN ('pending','deferred','delivered')""", (now, student_id, now))
            db.commit()
            return cur.rowcount

    def due_candidates(self, student_id: str, now: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM notification_candidates WHERE student_id=? AND state IN ('pending','deferred') AND deliver_after<=? ORDER BY CASE urgency WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, occurred_at", (student_id, now)).fetchall()

    def get_candidate(self, candidate_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM notification_candidates WHERE id=?", (candidate_id,)).fetchone()

    def count_recent_noncritical(self, student_id: str, since_iso: str) -> int:
        with self._connect() as db:
            return int(db.execute("""SELECT COUNT(*) FROM notification_deliveries d JOIN notification_candidates c ON c.id=d.candidate_id
                WHERE d.student_id=? AND d.channel='in_app' AND d.delivered_at>=? AND c.urgency!='critical' AND d.status IN ('delivered','opened','acted','dismissed')""", (student_id, since_iso)).fetchone()[0])

    def get_delivery(self, candidate_id: str, channel: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM notification_deliveries WHERE candidate_id=? AND channel=?", (candidate_id, channel)).fetchone()

    def create_delivery(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT OR IGNORE INTO notification_deliveries
              (id,candidate_id,student_id,channel,title,body,status,attempt_count,provider_message_id,error_code,delivered_at,opened_at,dismissed_at,acted_at,created_at,updated_at)
              VALUES (:id,:candidate_id,:student_id,:channel,:title,:body,:status,:attempt_count,:provider_message_id,:error_code,:delivered_at,:opened_at,:dismissed_at,:acted_at,:created_at,:updated_at)""", values)
            db.commit()
        return self.get_delivery(values["candidate_id"], values["channel"])

    def update_delivery_attempt(self, delivery_id: str, *, status: str, attempt_count: int, now: str, provider_message_id: str | None = None, error_code: str | None = None, delivered_at: str | None = None):
        with self._lock, self._connect() as db:
            db.execute("UPDATE notification_deliveries SET status=?,attempt_count=?,provider_message_id=?,error_code=?,delivered_at=COALESCE(?,delivered_at),updated_at=? WHERE id=?", (status, attempt_count, provider_message_id, error_code, delivered_at, now, delivery_id))
            db.commit()

    def failed_deliveries(self, student_id: str, max_attempts: int):
        with self._connect() as db:
            return db.execute("SELECT d.*,c.urgency,c.sensitive FROM notification_deliveries d JOIN notification_candidates c ON c.id=d.candidate_id WHERE d.student_id=? AND d.status='failed' AND d.attempt_count<? ORDER BY d.updated_at", (student_id, max_attempts)).fetchall()

    def inbox(self, student_id: str, include_dismissed: bool):
        where = "" if include_dismissed else "AND d.status!='dismissed'"
        with self._connect() as db:
            return db.execute(f"""SELECT d.*,c.notification_type,c.urgency,c.reason,c.action_href,c.source_type,c.source_id,c.created_at AS candidate_created_at,c.expires_at,c.state AS candidate_state
                FROM notification_deliveries d JOIN notification_candidates c ON c.id=d.candidate_id
                WHERE d.student_id=? AND d.channel='in_app' AND d.delivered_at IS NOT NULL {where}
                ORDER BY d.delivered_at DESC LIMIT 100""", (student_id,)).fetchall()

    def get_delivery_owned(self, delivery_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM notification_deliveries WHERE id=?", (delivery_id,)).fetchone()

    def mark_delivery(self, delivery_id: str, field: str, status: str, now: str):
        if field not in {"opened_at", "dismissed_at", "acted_at"}:
            raise ValueError("Invalid delivery timestamp field")
        with self._lock, self._connect() as db:
            db.execute(f"UPDATE notification_deliveries SET {field}=COALESCE({field},?),status=?,updated_at=? WHERE id=?", (now, status, now, delivery_id))
            db.commit()


    def student_ids_for_processing(self) -> list[str]:
        with self._connect() as db:
            ids = {row[0] for row in db.execute("SELECT student_id FROM notification_preferences UNION SELECT student_id FROM notification_candidates UNION SELECT student_id FROM notification_deliveries").fetchall()}
            try:
                ids.update(row[0] for row in db.execute("SELECT DISTINCT student_id FROM application_reminders").fetchall())
            except sqlite3.OperationalError:
                pass
        return sorted(str(item) for item in ids if item)


    def calendar_items(self, student_id: str):
        with self._connect() as db:
            try:
                return db.execute("""SELECT i.*,c.display_name AS connection_name,c.status AS connection_status
                    FROM external_calendar_items i JOIN integration_connections c ON c.id=i.connection_id
                    WHERE i.student_id=? AND i.source_state='active' AND i.import_status IN ('imported','linked')
                    ORDER BY i.start_at""", (student_id,)).fetchall()
            except sqlite3.OperationalError:
                return []

    def has_active_calendar_connection(self, student_id: str) -> bool:
        with self._connect() as db:
            try:
                row = db.execute("SELECT 1 FROM integration_connections WHERE student_id=? AND status='active' LIMIT 1", (student_id,)).fetchone()
                return bool(row)
            except sqlite3.OperationalError:
                return False

    def internship_reminders(self, student_id: str):
        with self._connect() as db:
            try:
                return db.execute("""SELECT r.*,a.company,a.role,a.status AS application_status,a.archived
                    FROM application_reminders r JOIN internship_applications a ON a.id=r.application_id
                    WHERE r.student_id=? ORDER BY r.updated_at DESC""", (student_id,)).fetchall()
            except sqlite3.OperationalError:
                return []
