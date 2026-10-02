from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock


class CareerScenarioRepository:
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
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS simulation_scenarios (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    selected_role_ids_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('disposable','saved')),
                    created_at TEXT NOT NULL,
                    saved_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_simulation_scenarios_owner
                  ON simulation_scenarios(student_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS scenario_results (
                    id TEXT PRIMARY KEY,
                    scenario_id TEXT NOT NULL REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    taxonomy_version TEXT NOT NULL,
                    pathway_version INTEGER,
                    input_snapshot_json TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_scenario_results_owner
                  ON scenario_results(student_id, scenario_id, created_at DESC);

                CREATE TRIGGER IF NOT EXISTS trg_scenario_results_immutable
                BEFORE UPDATE ON scenario_results
                BEGIN
                    SELECT RAISE(ABORT, 'scenario_results are immutable');
                END;

                CREATE TABLE IF NOT EXISTS scenario_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    scenario_id TEXT NOT NULL REFERENCES simulation_scenarios(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    occurred_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_scenario_events_owner
                  ON scenario_events(student_id, scenario_id, occurred_at DESC);
                """
            )

    def create_scenario(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO simulation_scenarios(id,student_id,selected_role_ids_json,status,created_at,saved_at)
                VALUES (:id,:student_id,:selected_role_ids_json,:status,:created_at,:saved_at)""",
                values,
            )
            db.commit()
        return self.scenario(values["id"])

    def scenario(self, scenario_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM simulation_scenarios WHERE id=?", (scenario_id,)).fetchone()

    def list_saved(self, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM simulation_scenarios WHERE student_id=? AND status='saved' ORDER BY COALESCE(saved_at,created_at) DESC",
                (student_id,),
            ).fetchall()

    def set_saved(self, scenario_id: str, student_id: str, saved: bool, at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE simulation_scenarios SET status=?,saved_at=? WHERE id=? AND student_id=?",
                ("saved" if saved else "disposable", at if saved else None, scenario_id, student_id),
            )
            if cur.rowcount == 0:
                return None
            db.commit()
        return self.scenario(scenario_id)

    def create_result(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO scenario_results(id,scenario_id,student_id,taxonomy_version,pathway_version,input_snapshot_json,result_json,created_at)
                VALUES (:id,:scenario_id,:student_id,:taxonomy_version,:pathway_version,:input_snapshot_json,:result_json,:created_at)""",
                values,
            )
            db.commit()
        return self.result(values["id"])

    def result(self, result_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM scenario_results WHERE id=?", (result_id,)).fetchone()

    def latest_result(self, scenario_id: str, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM scenario_results WHERE scenario_id=? AND student_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
                (scenario_id, student_id),
            ).fetchone()

    def result_history(self, scenario_id: str, student_id: str):
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM scenario_results WHERE scenario_id=? AND student_id=? ORDER BY created_at DESC,rowid DESC",
                (scenario_id, student_id),
            ).fetchall()

    def audit(self, scenario_id: str, student_id: str, event_type: str, detail: str, at: str) -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO scenario_events(scenario_id,student_id,event_type,detail,occurred_at) VALUES (?,?,?,?,?)",
                (scenario_id, student_id, event_type, detail[:800], at),
            )
            db.commit()

    def query(self, sql: str, params: tuple = ()):
        with self._connect() as db:
            return db.execute(sql, params).fetchall()
