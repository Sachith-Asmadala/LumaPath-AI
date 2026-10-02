from __future__ import annotations

from pathlib import Path
import json
import sqlite3
from threading import RLock


class InternshipRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS internship_applications (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                company TEXT NOT NULL,
                role TEXT NOT NULL,
                source_type TEXT NOT NULL,
                source_reference TEXT,
                source_url TEXT,
                application_deadline TEXT,
                application_deadline_confirmed INTEGER NOT NULL DEFAULT 0,
                contact_name TEXT NOT NULL DEFAULT '',
                contact_email TEXT NOT NULL DEFAULT '',
                interview_at TEXT,
                interview_at_confirmed INTEGER NOT NULL DEFAULT 0,
                follow_up_at TEXT,
                follow_up_at_confirmed INTEGER NOT NULL DEFAULT 0,
                notes TEXT NOT NULL DEFAULT '',
                next_action TEXT NOT NULL DEFAULT '',
                timezone TEXT NOT NULL,
                status TEXT NOT NULL,
                archived INTEGER NOT NULL DEFAULT 0,
                outcome_notes TEXT NOT NULL DEFAULT '',
                create_idempotency_key TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_create_key
                ON internship_applications(student_id, create_idempotency_key);
            CREATE UNIQUE INDEX IF NOT EXISTS uq_internship_recommendation
                ON internship_applications(student_id, source_type, source_reference)
                WHERE source_type='recommendation' AND source_reference IS NOT NULL;
            CREATE INDEX IF NOT EXISTS idx_internship_student_status
                ON internship_applications(student_id, archived, status, updated_at DESC);

            CREATE TABLE IF NOT EXISTS application_requirements (
                id TEXT PRIMARY KEY,
                application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT '',
                required INTEGER NOT NULL DEFAULT 1,
                evidence_status TEXT NOT NULL DEFAULT 'unknown',
                evidence_refs_json TEXT NOT NULL DEFAULT '[]'
            );
            CREATE INDEX IF NOT EXISTS idx_application_requirements
                ON application_requirements(student_id, application_id);

            CREATE TABLE IF NOT EXISTS application_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                from_status TEXT,
                to_status TEXT,
                note TEXT NOT NULL DEFAULT '',
                idempotency_key TEXT,
                occurred_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_application_event_key
                ON application_events(student_id, application_id, idempotency_key)
                WHERE idempotency_key IS NOT NULL;

            CREATE TABLE IF NOT EXISTS application_reminders (
                id TEXT PRIMARY KEY,
                application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                remind_at TEXT NOT NULL,
                timezone TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                notifications_enabled INTEGER NOT NULL,
                quiet_hours_start TEXT,
                quiet_hours_end TEXT,
                effective_notification_at TEXT,
                idempotency_key TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_application_reminder_key
                ON application_reminders(student_id, application_id, idempotency_key);

            CREATE TABLE IF NOT EXISTS application_planner_actions (
                id TEXT PRIMARY KEY,
                application_id TEXT NOT NULL REFERENCES internship_applications(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                start_at TEXT NOT NULL,
                duration_minutes INTEGER NOT NULL,
                description TEXT NOT NULL,
                idempotency_key TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_application_planner_key
                ON application_planner_actions(student_id, application_id, idempotency_key);
            """)

    def create_application(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            columns = ",".join(values)
            placeholders = ",".join(f":{key}" for key in values)
            db.execute(f"INSERT INTO internship_applications ({columns}) VALUES ({placeholders})", values)
            db.commit()
        return self.get_application(values["id"])

    def get_application(self, application_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM internship_applications WHERE id=?", (application_id,)).fetchone()

    def by_create_key(self, student_id: str, key: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM internship_applications WHERE student_id=? AND create_idempotency_key=?", (student_id, key)).fetchone()

    def by_recommendation(self, student_id: str, source_reference: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM internship_applications WHERE student_id=? AND source_type='recommendation' AND source_reference=?", (student_id, source_reference)).fetchone()

    def list_applications(self, student_id: str, include_archived: bool = False) -> list[sqlite3.Row]:
        sql = "SELECT * FROM internship_applications WHERE student_id=?"
        args: list[object] = [student_id]
        if not include_archived:
            sql += " AND archived=0"
        sql += " ORDER BY updated_at DESC"
        with self._connect() as db:
            return db.execute(sql, args).fetchall()

    def update_application(self, application_id: str, student_id: str, values: dict) -> sqlite3.Row | None:
        setters = ",".join(f"{key} = :{key}" for key in values)
        params = {**values, "id": application_id, "student_id": student_id}
        with self._lock, self._connect() as db:
            cur = db.execute(f"UPDATE internship_applications SET {setters} WHERE id=:id AND student_id=:student_id", params)
            db.commit()
        return self.get_application(application_id) if cur.rowcount else None

    def delete_application(self, application_id: str, student_id: str) -> bool:
        with self._lock, self._connect() as db:
            cur = db.execute("DELETE FROM internship_applications WHERE id=? AND student_id=?", (application_id, student_id))
            db.commit()
        return bool(cur.rowcount)

    def replace_requirements(self, application_id: str, student_id: str, rows: list[dict]) -> None:
        with self._lock, self._connect() as db:
            db.execute("DELETE FROM application_requirements WHERE application_id=? AND student_id=?", (application_id, student_id))
            if rows:
                db.executemany("""INSERT INTO application_requirements
                    (id,application_id,student_id,skill_name,detail,required,evidence_status,evidence_refs_json)
                    VALUES (:id,:application_id,:student_id,:skill_name,:detail,:required,:evidence_status,:evidence_refs_json)""", rows)
            db.commit()

    def requirements(self, application_id: str, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM application_requirements WHERE application_id=? AND student_id=? ORDER BY required DESC, skill_name", (application_id, student_id)).fetchall()

    def add_event(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            try:
                db.execute("""INSERT INTO application_events
                    (application_id,student_id,event_type,from_status,to_status,note,idempotency_key,occurred_at)
                    VALUES (:application_id,:student_id,:event_type,:from_status,:to_status,:note,:idempotency_key,:occurred_at)""", values)
                db.commit()
            except sqlite3.IntegrityError:
                pass
            if values.get("idempotency_key"):
                return db.execute("SELECT * FROM application_events WHERE student_id=? AND application_id=? AND idempotency_key=?", (values["student_id"], values["application_id"], values["idempotency_key"])).fetchone()
            return db.execute("SELECT * FROM application_events WHERE application_id=? ORDER BY id DESC LIMIT 1", (values["application_id"],)).fetchone()

    def events(self, application_id: str, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM application_events WHERE application_id=? AND student_id=? ORDER BY occurred_at,id", (application_id, student_id)).fetchall()

    def upsert_reminder(self, values: dict) -> tuple[sqlite3.Row, bool]:
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM application_reminders WHERE student_id=? AND application_id=? AND idempotency_key=?", (values["student_id"], values["application_id"], values["idempotency_key"])).fetchone()
            if existing:
                return existing, True
            db.execute("""INSERT INTO application_reminders
                (id,application_id,student_id,kind,title,remind_at,timezone,enabled,notifications_enabled,quiet_hours_start,quiet_hours_end,effective_notification_at,idempotency_key,created_at,updated_at)
                VALUES (:id,:application_id,:student_id,:kind,:title,:remind_at,:timezone,:enabled,:notifications_enabled,:quiet_hours_start,:quiet_hours_end,:effective_notification_at,:idempotency_key,:created_at,:updated_at)""", values)
            db.commit()
            return db.execute("SELECT * FROM application_reminders WHERE id=?", (values["id"],)).fetchone(), False

    def get_reminder(self, reminder_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM application_reminders WHERE id=?", (reminder_id,)).fetchone()

    def update_reminder(self, reminder_id: str, application_id: str, student_id: str, values: dict) -> sqlite3.Row | None:
        setters = ",".join(f"{key} = :{key}" for key in values)
        params = {**values, "id": reminder_id, "application_id": application_id, "student_id": student_id}
        with self._lock, self._connect() as db:
            cur = db.execute(f"UPDATE application_reminders SET {setters} WHERE id=:id AND application_id=:application_id AND student_id=:student_id", params)
            db.commit()
        return self.get_reminder(reminder_id) if cur.rowcount else None

    def reminders(self, application_id: str, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM application_reminders WHERE application_id=? AND student_id=? ORDER BY remind_at", (application_id, student_id)).fetchall()

    def create_planner_action(self, values: dict) -> tuple[sqlite3.Row, bool]:
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM application_planner_actions WHERE student_id=? AND application_id=? AND idempotency_key=?", (values["student_id"], values["application_id"], values["idempotency_key"])).fetchone()
            if existing:
                return existing, True
            db.execute("""INSERT INTO application_planner_actions
                (id,application_id,student_id,kind,title,start_at,duration_minutes,description,idempotency_key,created_at)
                VALUES (:id,:application_id,:student_id,:kind,:title,:start_at,:duration_minutes,:description,:idempotency_key,:created_at)""", values)
            db.commit()
            return db.execute("SELECT * FROM application_planner_actions WHERE id=?", (values["id"],)).fetchone(), False

    def portfolio_evidence(self, student_id: str, skill_name: str) -> list[str]:
        with self._connect() as db:
            try:
                rows = db.execute("""SELECT pse.status,pse.evidence_json,pas.project_id
                    FROM portfolio_skill_evidence pse
                    JOIN portfolio_analysis_snapshots pas ON pas.id=pse.snapshot_id
                    WHERE pse.student_id=? AND lower(pse.skill_name)=lower(?) AND pse.status IN ('observed','self_reported')
                    ORDER BY pas.analyzed_at DESC LIMIT 4""", (student_id, skill_name)).fetchall()
            except sqlite3.OperationalError:
                return []
        refs: list[str] = []
        for row in rows:
            try:
                evidence = json.loads(row["evidence_json"])
            except Exception:
                evidence = []
            refs.extend(str(item) for item in evidence[:2])
        return list(dict.fromkeys(refs))[:4]
