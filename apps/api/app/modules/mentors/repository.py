from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import RLock


class MentorRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _init_schema(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS mentor_relationships (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                mentor_label TEXT NOT NULL,
                mentor_name TEXT,
                purpose TEXT NOT NULL,
                status TEXT NOT NULL,
                invitation_token_hash TEXT NOT NULL UNIQUE,
                mentor_access_token_hash TEXT UNIQUE,
                invite_expires_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                accepted_at TEXT,
                revoked_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mentor_relationships_student ON mentor_relationships(student_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_mentor_relationships_access ON mentor_relationships(mentor_access_token_hash);

            CREATE TABLE IF NOT EXISTS consent_grants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                category TEXT NOT NULL,
                granted_at TEXT NOT NULL,
                revoked_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_consent_active ON consent_grants(relationship_id, revoked_at, category);

            CREATE TABLE IF NOT EXISTS mentor_shared_snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                academic_json TEXT,
                career_json TEXT,
                readiness_json TEXT,
                captured_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mentor_snapshots ON mentor_shared_snapshots(relationship_id, captured_at DESC);

            CREATE TABLE IF NOT EXISTS guidance_requests (
                id TEXT PRIMARY KEY,
                relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                title TEXT NOT NULL,
                question TEXT NOT NULL,
                context_note TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_guidance_requests_relationship ON guidance_requests(relationship_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS mentor_recommendations (
                id TEXT PRIMARY KEY,
                relationship_id TEXT NOT NULL REFERENCES mentor_relationships(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                guidance_request_id TEXT REFERENCES guidance_requests(id) ON DELETE SET NULL,
                kind TEXT NOT NULL,
                title TEXT NOT NULL,
                rationale TEXT NOT NULL,
                suggested_action TEXT NOT NULL DEFAULT '',
                suggested_minutes INTEGER,
                status TEXT NOT NULL,
                student_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                decided_at TEXT,
                planned_at TEXT,
                plan_idempotency_key TEXT,
                plan_action_json TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_mentor_recommendations_relationship ON mentor_recommendations(relationship_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS mentor_access_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                relationship_id TEXT NOT NULL,
                student_id TEXT NOT NULL,
                actor_type TEXT NOT NULL,
                event_type TEXT NOT NULL,
                categories_json TEXT NOT NULL DEFAULT '[]',
                detail TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_mentor_audit_student ON mentor_access_audit(student_id, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_mentor_audit_relationship ON mentor_access_audit(relationship_id, occurred_at DESC);
            """)

    def create_relationship(self, values: dict, categories: list[str], snapshot: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO mentor_relationships
                (id,student_id,mentor_label,mentor_name,purpose,status,invitation_token_hash,mentor_access_token_hash,invite_expires_at,expires_at,accepted_at,revoked_at,created_at,updated_at)
                VALUES (:id,:student_id,:mentor_label,:mentor_name,:purpose,:status,:invitation_token_hash,:mentor_access_token_hash,:invite_expires_at,:expires_at,:accepted_at,:revoked_at,:created_at,:updated_at)""", values)
            db.executemany("INSERT INTO consent_grants(relationship_id,student_id,category,granted_at,revoked_at) VALUES (?,?,?,?,NULL)", [(values["id"], values["student_id"], c, values["created_at"]) for c in categories])
            db.execute("INSERT INTO mentor_shared_snapshots(relationship_id,student_id,academic_json,career_json,readiness_json,captured_at) VALUES (?,?,?,?,?,?)", (
                values["id"], values["student_id"], snapshot.get("academic_json"), snapshot.get("career_json"), snapshot.get("readiness_json"), values["created_at"]
            ))
            db.commit()
        return self.relationship(values["id"])

    def relationship(self, relationship_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_relationships WHERE id=?", (relationship_id,)).fetchone()

    def relationships_for_student(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_relationships WHERE student_id=? ORDER BY created_at DESC", (student_id,)).fetchall()

    def by_invitation_hash(self, token_hash: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_relationships WHERE invitation_token_hash=?", (token_hash,)).fetchone()

    def by_access_hash(self, token_hash: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_relationships WHERE mentor_access_token_hash=?", (token_hash,)).fetchone()

    def update_relationship(self, relationship_id: str, **fields):
        if not fields:
            return self.relationship(relationship_id)
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            db.execute(f"UPDATE mentor_relationships SET {sets} WHERE id=?", (*fields.values(), relationship_id))
            db.commit()
        return self.relationship(relationship_id)

    def active_categories(self, relationship_id: str):
        with self._connect() as db:
            return [row["category"] for row in db.execute("SELECT category FROM consent_grants WHERE relationship_id=? AND revoked_at IS NULL ORDER BY category", (relationship_id,)).fetchall()]

    def update_categories(self, relationship_id: str, student_id: str, categories: list[str], occurred_at: str):
        desired = set(categories)
        with self._lock, self._connect() as db:
            current = {row["category"] for row in db.execute("SELECT category FROM consent_grants WHERE relationship_id=? AND revoked_at IS NULL", (relationship_id,)).fetchall()}
            for category in current - desired:
                db.execute("UPDATE consent_grants SET revoked_at=? WHERE relationship_id=? AND category=? AND revoked_at IS NULL", (occurred_at, relationship_id, category))
            for category in desired - current:
                db.execute("INSERT INTO consent_grants(relationship_id,student_id,category,granted_at,revoked_at) VALUES (?,?,?,?,NULL)", (relationship_id, student_id, category, occurred_at))
            db.commit()

    def add_snapshot(self, relationship_id: str, student_id: str, snapshot: dict, captured_at: str):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO mentor_shared_snapshots(relationship_id,student_id,academic_json,career_json,readiness_json,captured_at) VALUES (?,?,?,?,?,?)", (
                relationship_id, student_id, snapshot.get("academic_json"), snapshot.get("career_json"), snapshot.get("readiness_json"), captured_at
            ))
            db.commit()

    def latest_snapshot(self, relationship_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_shared_snapshots WHERE relationship_id=? ORDER BY id DESC LIMIT 1", (relationship_id,)).fetchone()

    def create_guidance_request(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO guidance_requests(id,relationship_id,student_id,title,question,context_note,status,created_at,updated_at)
                VALUES (:id,:relationship_id,:student_id,:title,:question,:context_note,:status,:created_at,:updated_at)""", values)
            db.commit()
        return self.guidance_request(values["id"])

    def guidance_request(self, request_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM guidance_requests WHERE id=?", (request_id,)).fetchone()

    def guidance_requests(self, relationship_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM guidance_requests WHERE relationship_id=? ORDER BY created_at DESC", (relationship_id,)).fetchall()

    def update_guidance_request(self, request_id: str, **fields):
        with self._lock, self._connect() as db:
            sets = ",".join(f"{k}=?" for k in fields)
            db.execute(f"UPDATE guidance_requests SET {sets} WHERE id=?", (*fields.values(), request_id))
            db.commit()

    def create_recommendation(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO mentor_recommendations
                (id,relationship_id,student_id,guidance_request_id,kind,title,rationale,suggested_action,suggested_minutes,status,student_note,created_at,decided_at,planned_at,plan_idempotency_key,plan_action_json)
                VALUES (:id,:relationship_id,:student_id,:guidance_request_id,:kind,:title,:rationale,:suggested_action,:suggested_minutes,:status,:student_note,:created_at,:decided_at,:planned_at,:plan_idempotency_key,:plan_action_json)""", values)
            db.commit()
        return self.recommendation(values["id"])

    def recommendation(self, recommendation_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_recommendations WHERE id=?", (recommendation_id,)).fetchone()

    def recommendations(self, relationship_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_recommendations WHERE relationship_id=? ORDER BY created_at DESC", (relationship_id,)).fetchall()

    def update_recommendation(self, recommendation_id: str, **fields):
        with self._lock, self._connect() as db:
            sets = ",".join(f"{k}=?" for k in fields)
            db.execute(f"UPDATE mentor_recommendations SET {sets} WHERE id=?", (*fields.values(), recommendation_id))
            db.commit()
        return self.recommendation(recommendation_id)

    def audit(self, relationship_id: str, student_id: str, actor_type: str, event_type: str, categories_json: str, detail: str, occurred_at: str):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO mentor_access_audit(relationship_id,student_id,actor_type,event_type,categories_json,detail,occurred_at) VALUES (?,?,?,?,?,?,?)", (relationship_id, student_id, actor_type, event_type, categories_json, detail, occurred_at))
            db.commit()

    def audit_history(self, relationship_id: str, student_id: str, limit: int = 100):
        with self._connect() as db:
            return db.execute("SELECT * FROM mentor_access_audit WHERE relationship_id=? AND student_id=? ORDER BY occurred_at DESC, id DESC LIMIT ?", (relationship_id, student_id, limit)).fetchall()
