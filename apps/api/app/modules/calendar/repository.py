from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock


class CalendarRepository:
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
            CREATE TABLE IF NOT EXISTS integration_connections (
              id TEXT PRIMARY KEY,
              student_id TEXT NOT NULL,
              source_type TEXT NOT NULL,
              display_name TEXT NOT NULL,
              status TEXT NOT NULL,
              default_timezone TEXT NOT NULL,
              provider_key TEXT,
              encrypted_credentials TEXT,
              scopes_json TEXT NOT NULL DEFAULT '[]',
              sync_cursor TEXT,
              last_sync_at TEXT,
              revoked_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_integration_connections_owner ON integration_connections(student_id, status, updated_at);
            CREATE TABLE IF NOT EXISTS external_calendar_items (
              id TEXT PRIMARY KEY,
              connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
              student_id TEXT NOT NULL,
              external_id TEXT NOT NULL,
              recurrence_key TEXT NOT NULL DEFAULT '',
              item_kind TEXT NOT NULL,
              title TEXT NOT NULL,
              description TEXT NOT NULL DEFAULT '',
              start_at TEXT NOT NULL,
              end_at TEXT,
              timezone TEXT NOT NULL,
              confidence REAL NOT NULL,
              source_updated_at TEXT,
              source_hash TEXT NOT NULL,
              source_state TEXT NOT NULL,
              import_status TEXT NOT NULL,
              mapped_record_type TEXT,
              mapped_internal_id TEXT,
              imported_title TEXT,
              imported_start_at TEXT,
              imported_end_at TEXT,
              imported_due_at TEXT,
              user_overrides_json TEXT NOT NULL DEFAULT '[]',
              last_seen_run_id TEXT,
              last_sync_at TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL,
              UNIQUE(connection_id, external_id, recurrence_key)
            );
            CREATE INDEX IF NOT EXISTS idx_external_calendar_owner ON external_calendar_items(student_id, connection_id, source_state, start_at);
            CREATE TABLE IF NOT EXISTS calendar_sync_runs (
              id TEXT PRIMARY KEY,
              connection_id TEXT NOT NULL REFERENCES integration_connections(id) ON DELETE CASCADE,
              student_id TEXT NOT NULL,
              status TEXT NOT NULL,
              source_filename TEXT NOT NULL,
              source_format TEXT NOT NULL,
              source_hash TEXT NOT NULL,
              preview_json TEXT NOT NULL DEFAULT '[]',
              commit_json TEXT,
              commit_idempotency_key TEXT,
              next_cursor TEXT,
              error_code TEXT,
              error_detail TEXT,
              started_at TEXT NOT NULL,
              completed_at TEXT,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_calendar_sync_owner ON calendar_sync_runs(student_id, connection_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS calendar_audit (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              student_id TEXT NOT NULL,
              connection_id TEXT,
              event_type TEXT NOT NULL,
              detail_json TEXT NOT NULL DEFAULT '{}',
              created_at TEXT NOT NULL
            );
            """)
            # Compatibility migrations for cumulative prototype databases created
            # before provider incremental-cursor support was added.
            connection_columns = {row[1] for row in db.execute("PRAGMA table_info(integration_connections)").fetchall()}
            if "sync_cursor" not in connection_columns:
                db.execute("ALTER TABLE integration_connections ADD COLUMN sync_cursor TEXT")
            run_columns = {row[1] for row in db.execute("PRAGMA table_info(calendar_sync_runs)").fetchall()}
            if "next_cursor" not in run_columns:
                db.execute("ALTER TABLE calendar_sync_runs ADD COLUMN next_cursor TEXT")
            db.commit()

    def create_connection(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO integration_connections
              (id,student_id,source_type,display_name,status,default_timezone,provider_key,encrypted_credentials,scopes_json,sync_cursor,last_sync_at,revoked_at,created_at,updated_at)
              VALUES (:id,:student_id,:source_type,:display_name,:status,:default_timezone,:provider_key,:encrypted_credentials,:scopes_json,:sync_cursor,:last_sync_at,:revoked_at,:created_at,:updated_at)""", values)
            db.commit()
        return self.get_connection(values["id"])

    def get_connection(self, connection_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM integration_connections WHERE id=?", (connection_id,)).fetchone()

    def list_connections(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM integration_connections WHERE student_id=? ORDER BY updated_at DESC", (student_id,)).fetchall()

    def update_connection(self, connection_id: str, **values):
        if not values: return self.get_connection(connection_id)
        allowed = {"display_name","status","sync_cursor","last_sync_at","revoked_at","updated_at","encrypted_credentials","scopes_json"}
        if set(values) - allowed: raise ValueError("Unsupported connection update")
        sets = ",".join(f"{k}=?" for k in values)
        with self._lock, self._connect() as db:
            db.execute(f"UPDATE integration_connections SET {sets} WHERE id=?", (*values.values(), connection_id))
            db.commit()
        return self.get_connection(connection_id)

    def create_sync_run(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO calendar_sync_runs
              (id,connection_id,student_id,status,source_filename,source_format,source_hash,preview_json,commit_json,commit_idempotency_key,next_cursor,error_code,error_detail,started_at,completed_at,created_at,updated_at)
              VALUES (:id,:connection_id,:student_id,:status,:source_filename,:source_format,:source_hash,:preview_json,:commit_json,:commit_idempotency_key,:next_cursor,:error_code,:error_detail,:started_at,:completed_at,:created_at,:updated_at)""", values)
            db.commit()
        return self.get_sync_run(values["id"])

    def get_sync_run(self, run_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM calendar_sync_runs WHERE id=?", (run_id,)).fetchone()

    def update_sync_run(self, run_id: str, **values):
        allowed = {"status","preview_json","commit_json","commit_idempotency_key","error_code","error_detail","completed_at","updated_at"}
        if set(values) - allowed: raise ValueError("Unsupported sync update")
        sets = ",".join(f"{k}=?" for k in values)
        with self._lock, self._connect() as db:
            db.execute(f"UPDATE calendar_sync_runs SET {sets} WHERE id=?", (*values.values(), run_id))
            db.commit()
        return self.get_sync_run(run_id)

    def find_item(self, connection_id: str, external_id: str, recurrence_key: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM external_calendar_items WHERE connection_id=? AND external_id=? AND recurrence_key=?", (connection_id, external_id, recurrence_key)).fetchone()

    def get_item(self, item_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM external_calendar_items WHERE id=?", (item_id,)).fetchone()

    def list_items(self, student_id: str, connection_id: str | None = None, include_deleted: bool = False):
        where = ["student_id=?"]; args: list[object] = [student_id]
        if connection_id: where.append("connection_id=?"); args.append(connection_id)
        if not include_deleted: where.append("source_state='active'")
        with self._connect() as db:
            return db.execute(f"SELECT * FROM external_calendar_items WHERE {' AND '.join(where)} ORDER BY start_at, title", args).fetchall()

    def active_items_for_connection(self, connection_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM external_calendar_items WHERE connection_id=? AND source_state='active'", (connection_id,)).fetchall()

    def upsert_item(self, values: dict):
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT id,created_at FROM external_calendar_items WHERE connection_id=? AND external_id=? AND recurrence_key=?", (values["connection_id"], values["external_id"], values["recurrence_key"])).fetchone()
            if existing:
                values = {**values, "id": existing["id"], "created_at": existing["created_at"]}
                db.execute("""UPDATE external_calendar_items SET
                  student_id=:student_id,item_kind=:item_kind,title=:title,description=:description,start_at=:start_at,end_at=:end_at,timezone=:timezone,confidence=:confidence,
                  source_updated_at=:source_updated_at,source_hash=:source_hash,source_state=:source_state,import_status=:import_status,mapped_record_type=:mapped_record_type,
                  mapped_internal_id=:mapped_internal_id,imported_title=:imported_title,imported_start_at=:imported_start_at,imported_end_at=:imported_end_at,imported_due_at=:imported_due_at,
                  user_overrides_json=:user_overrides_json,last_seen_run_id=:last_seen_run_id,last_sync_at=:last_sync_at,updated_at=:updated_at WHERE id=:id""", values)
            else:
                db.execute("""INSERT INTO external_calendar_items
                  (id,connection_id,student_id,external_id,recurrence_key,item_kind,title,description,start_at,end_at,timezone,confidence,source_updated_at,source_hash,source_state,import_status,mapped_record_type,mapped_internal_id,imported_title,imported_start_at,imported_end_at,imported_due_at,user_overrides_json,last_seen_run_id,last_sync_at,created_at,updated_at)
                  VALUES (:id,:connection_id,:student_id,:external_id,:recurrence_key,:item_kind,:title,:description,:start_at,:end_at,:timezone,:confidence,:source_updated_at,:source_hash,:source_state,:import_status,:mapped_record_type,:mapped_internal_id,:imported_title,:imported_start_at,:imported_end_at,:imported_due_at,:user_overrides_json,:last_seen_run_id,:last_sync_at,:created_at,:updated_at)""", values)
            db.commit()
            return db.execute("SELECT * FROM external_calendar_items WHERE id=?", (values["id"],)).fetchone()

    def update_item_overrides(self, item_id: str, fields: list[str], now: str):
        with self._lock, self._connect() as db:
            db.execute("UPDATE external_calendar_items SET user_overrides_json=?,updated_at=? WHERE id=?", (json.dumps(fields), now, item_id)); db.commit()
        return self.get_item(item_id)

    def delete_imported_items(self, connection_id: str) -> int:
        with self._lock, self._connect() as db:
            cur = db.execute("DELETE FROM external_calendar_items WHERE connection_id=?", (connection_id,)); db.commit(); return cur.rowcount

    def audit(self, student_id: str, connection_id: str | None, event_type: str, detail: dict, now: str):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO calendar_audit(student_id,connection_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)", (student_id, connection_id, event_type, json.dumps(detail, sort_keys=True), now)); db.commit()
