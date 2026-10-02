from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any


class AchievementRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode = WAL")
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS achievement_definitions (
                definition_key TEXT NOT NULL,
                version TEXT NOT NULL,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                target INTEGER NOT NULL,
                unit TEXT NOT NULL,
                optional_career INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(definition_key, version)
            );
            CREATE TABLE IF NOT EXISTS awarded_achievements (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                definition_key TEXT NOT NULL,
                definition_version TEXT NOT NULL,
                awarded_at TEXT NOT NULL,
                evidence_status TEXT NOT NULL CHECK(evidence_status IN ('active','withdrawn')),
                evidence_json TEXT NOT NULL,
                restored_at TEXT,
                updated_at TEXT NOT NULL,
                UNIQUE(student_id, definition_key, definition_version)
            );
            CREATE INDEX IF NOT EXISTS idx_awards_owner ON awarded_achievements(student_id, awarded_at DESC);
            CREATE TABLE IF NOT EXISTS streak_state (
                student_id TEXT PRIMARY KEY,
                current_count INTEGER NOT NULL,
                longest_count INTEGER NOT NULL,
                last_qualifying_date TEXT,
                grace_days_used INTEGER NOT NULL,
                state TEXT NOT NULL,
                rule_version TEXT NOT NULL,
                qualifying_dates_json TEXT NOT NULL,
                evidence_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS achievement_preferences (
                student_id TEXT PRIMARY KEY,
                feature_visible INTEGER NOT NULL DEFAULT 1,
                celebrations_enabled INTEGER NOT NULL DEFAULT 0,
                streak_visible INTEGER NOT NULL DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS achievement_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                definition_key TEXT,
                occurred_at TEXT NOT NULL,
                detail TEXT NOT NULL DEFAULT ''
            );
            """)

    def upsert_definitions(self, definitions: list[dict[str, Any]]) -> None:
        with self._lock, self._connect() as db:
            db.executemany("""INSERT INTO achievement_definitions
                (definition_key,version,category,title,description,target,unit,optional_career)
                VALUES (:definition_key,:version,:category,:title,:description,:target,:unit,:optional_career)
                ON CONFLICT(definition_key,version) DO UPDATE SET category=excluded.category,title=excluded.title,
                description=excluded.description,target=excluded.target,unit=excluded.unit,optional_career=excluded.optional_career""", definitions)
            db.commit()

    def definitions(self, version: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM achievement_definitions WHERE version=? ORDER BY rowid", (version,)).fetchall()

    def award(self, values: dict[str, Any]) -> tuple[sqlite3.Row, bool, bool]:
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM awarded_achievements WHERE student_id=? AND definition_key=? AND definition_version=?", (values["student_id"], values["definition_key"], values["definition_version"])).fetchone()
            if existing:
                restored = existing["evidence_status"] == "withdrawn"
                db.execute("""UPDATE awarded_achievements SET evidence_status='active', evidence_json=:evidence_json,
                    restored_at=CASE WHEN evidence_status='withdrawn' THEN :updated_at ELSE restored_at END, updated_at=:updated_at
                    WHERE id=:id""", {"id": existing["id"], "evidence_json": values["evidence_json"], "updated_at": values["updated_at"]})
                db.commit()
                return db.execute("SELECT * FROM awarded_achievements WHERE id=?", (existing["id"],)).fetchone(), False, restored
            db.execute("""INSERT INTO awarded_achievements
                (id,student_id,definition_key,definition_version,awarded_at,evidence_status,evidence_json,restored_at,updated_at)
                VALUES (:id,:student_id,:definition_key,:definition_version,:awarded_at,'active',:evidence_json,NULL,:updated_at)""", values)
            db.commit()
            return db.execute("SELECT * FROM awarded_achievements WHERE id=?", (values["id"],)).fetchone(), True, False

    def withdraw(self, student_id: str, definition_key: str, version: str, now_iso: str) -> bool:
        with self._lock, self._connect() as db:
            cur = db.execute("""UPDATE awarded_achievements SET evidence_status='withdrawn',updated_at=?
                WHERE student_id=? AND definition_key=? AND definition_version=? AND evidence_status='active'""", (now_iso, student_id, definition_key, version))
            db.commit()
            return bool(cur.rowcount)

    def awards(self, student_id: str, version: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM awarded_achievements WHERE student_id=? AND definition_version=? ORDER BY awarded_at DESC", (student_id, version)).fetchall()

    def save_streak(self, values: dict[str, Any]) -> None:
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO streak_state
                (student_id,current_count,longest_count,last_qualifying_date,grace_days_used,state,rule_version,qualifying_dates_json,evidence_json,updated_at)
                VALUES (:student_id,:current_count,:longest_count,:last_qualifying_date,:grace_days_used,:state,:rule_version,:qualifying_dates_json,:evidence_json,:updated_at)
                ON CONFLICT(student_id) DO UPDATE SET current_count=excluded.current_count,longest_count=excluded.longest_count,
                last_qualifying_date=excluded.last_qualifying_date,grace_days_used=excluded.grace_days_used,state=excluded.state,
                rule_version=excluded.rule_version,qualifying_dates_json=excluded.qualifying_dates_json,evidence_json=excluded.evidence_json,updated_at=excluded.updated_at""", values)
            db.commit()

    def streak(self, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM streak_state WHERE student_id=?", (student_id,)).fetchone()

    def preferences(self, student_id: str, now_iso: str) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM achievement_preferences WHERE student_id=?", (student_id,)).fetchone()
            if not row:
                db.execute("INSERT INTO achievement_preferences(student_id,feature_visible,celebrations_enabled,streak_visible,updated_at) VALUES (?,1,0,1,?)", (student_id, now_iso))
                db.commit()
                row = db.execute("SELECT * FROM achievement_preferences WHERE student_id=?", (student_id,)).fetchone()
            return row

    def update_preferences(self, student_id: str, values: dict[str, Any]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO achievement_preferences(student_id,feature_visible,celebrations_enabled,streak_visible,updated_at)
                VALUES (:student_id,:feature_visible,:celebrations_enabled,:streak_visible,:updated_at)
                ON CONFLICT(student_id) DO UPDATE SET feature_visible=excluded.feature_visible,celebrations_enabled=excluded.celebrations_enabled,
                streak_visible=excluded.streak_visible,updated_at=excluded.updated_at""", {**values, "student_id": student_id})
            db.commit()
            return db.execute("SELECT * FROM achievement_preferences WHERE student_id=?", (student_id,)).fetchone()

    def audit(self, student_id: str, event_type: str, occurred_at: str, definition_key: str | None = None, detail: str = "") -> None:
        with self._connect() as db:
            db.execute("INSERT INTO achievement_audit(student_id,event_type,definition_key,occurred_at,detail) VALUES (?,?,?,?,?)", (student_id,event_type,definition_key,occurred_at,detail[:300]))
            db.commit()

    def table_exists(self, table: str) -> bool:
        with self._connect() as db:
            return bool(db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (table,)).fetchone())

    def query(self, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(sql, args).fetchall()
