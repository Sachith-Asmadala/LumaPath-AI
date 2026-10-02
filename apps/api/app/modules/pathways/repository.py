from __future__ import annotations

import sqlite3
from pathlib import Path
from threading import RLock


class PathwayRepository:
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
                CREATE TABLE IF NOT EXISTS pathways (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    target_role TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    pace TEXT NOT NULL,
                    definition_version TEXT NOT NULL,
                    parent_pathway_id TEXT,
                    recalculation_reason_json TEXT NOT NULL DEFAULT '[]',
                    weekly_learning_minutes INTEGER NOT NULL,
                    daily_available_minutes INTEGER NOT NULL,
                    timezone TEXT NOT NULL,
                    context_json TEXT NOT NULL,
                    warnings_json TEXT NOT NULL DEFAULT '[]',
                    change_summary_json TEXT,
                    created_at TEXT NOT NULL,
                    approved_at TEXT,
                    rejected_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pathways_owner ON pathways(student_id, version DESC);
                CREATE INDEX IF NOT EXISTS idx_pathways_active ON pathways(student_id, status, version DESC);

                CREATE TABLE IF NOT EXISTS pathway_steps (
                    id TEXT PRIMARY KEY,
                    pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    step_order INTEGER NOT NULL,
                    prerequisites_json TEXT NOT NULL,
                    state TEXT NOT NULL,
                    proficiency INTEGER NOT NULL,
                    estimated_minutes INTEGER NOT NULL,
                    target_evidence_json TEXT NOT NULL,
                    evidence_refs_json TEXT NOT NULL,
                    transferable_credit INTEGER NOT NULL DEFAULT 0,
                    completion_source TEXT,
                    selected_resource_id TEXT,
                    selected_resource_json TEXT,
                    alternative_resources_json TEXT NOT NULL DEFAULT '[]',
                    resource_decision TEXT NOT NULL DEFAULT 'recommended',
                    resource_reason TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    UNIQUE(pathway_id, skill_id)
                );
                CREATE INDEX IF NOT EXISTS idx_pathway_steps_owner ON pathway_steps(student_id, pathway_id, step_order);

                CREATE TABLE IF NOT EXISTS pathway_plan_items (
                    id TEXT PRIMARY KEY,
                    pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
                    step_id TEXT NOT NULL REFERENCES pathway_steps(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    week_start TEXT NOT NULL,
                    start_at TEXT NOT NULL,
                    end_at TEXT NOT NULL,
                    planned_minutes INTEGER NOT NULL,
                    status TEXT NOT NULL,
                    prerequisite_ready INTEGER NOT NULL DEFAULT 0,
                    rationale TEXT NOT NULL,
                    source_label TEXT NOT NULL,
                    internal_task_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_pathway_plan_items ON pathway_plan_items(student_id, pathway_id, week_start, start_at);

                CREATE TABLE IF NOT EXISTS pathway_recalculations (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    source_pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
                    draft_pathway_id TEXT NOT NULL REFERENCES pathways(id) ON DELETE CASCADE,
                    trigger_reasons_json TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    decided_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_pathway_recalc_owner ON pathway_recalculations(student_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS pathway_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pathway_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def create_pathway(self, values: dict, steps: list[dict], plan_items: list[dict]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO pathways
                (id,student_id,version,status,target_role,goal,pace,definition_version,parent_pathway_id,recalculation_reason_json,
                 weekly_learning_minutes,daily_available_minutes,timezone,context_json,warnings_json,change_summary_json,created_at,approved_at,rejected_at)
                VALUES (:id,:student_id,:version,:status,:target_role,:goal,:pace,:definition_version,:parent_pathway_id,:recalculation_reason_json,
                 :weekly_learning_minutes,:daily_available_minutes,:timezone,:context_json,:warnings_json,:change_summary_json,:created_at,:approved_at,:rejected_at)""",
                values,
            )
            db.executemany(
                """INSERT INTO pathway_steps
                (id,pathway_id,student_id,skill_id,name,step_order,prerequisites_json,state,proficiency,estimated_minutes,target_evidence_json,evidence_refs_json,
                 transferable_credit,completion_source,selected_resource_id,selected_resource_json,alternative_resources_json,resource_decision,resource_reason,created_at,updated_at)
                VALUES (:id,:pathway_id,:student_id,:skill_id,:name,:step_order,:prerequisites_json,:state,:proficiency,:estimated_minutes,:target_evidence_json,:evidence_refs_json,
                 :transferable_credit,:completion_source,:selected_resource_id,:selected_resource_json,:alternative_resources_json,:resource_decision,:resource_reason,:created_at,:updated_at)""",
                steps,
            )
            db.executemany(
                """INSERT INTO pathway_plan_items
                (id,pathway_id,step_id,student_id,skill_id,title,week_start,start_at,end_at,planned_minutes,status,prerequisite_ready,rationale,source_label,internal_task_id,created_at,updated_at)
                VALUES (:id,:pathway_id,:step_id,:student_id,:skill_id,:title,:week_start,:start_at,:end_at,:planned_minutes,:status,:prerequisite_ready,:rationale,:source_label,:internal_task_id,:created_at,:updated_at)""",
                plan_items,
            )
            db.commit()
        return self.get_pathway(values["id"])

    def get_pathway(self, pathway_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathways WHERE id=?", (pathway_id,)).fetchone()

    def current_active(self, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathways WHERE student_id=? AND status='active' ORDER BY version DESC LIMIT 1", (student_id,)).fetchone()

    def current_draft(self, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathways WHERE student_id=? AND status='draft' ORDER BY version DESC LIMIT 1", (student_id,)).fetchone()

    def latest_version(self, student_id: str) -> int:
        with self._connect() as db:
            row = db.execute("SELECT MAX(version) AS value FROM pathways WHERE student_id=?", (student_id,)).fetchone()
            return int(row["value"] or 0)

    def steps(self, pathway_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathway_steps WHERE pathway_id=? ORDER BY step_order", (pathway_id,)).fetchall()

    def step(self, pathway_id: str, step_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathway_steps WHERE pathway_id=? AND id=?", (pathway_id, step_id)).fetchone()

    def plan_items(self, pathway_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathway_plan_items WHERE pathway_id=? ORDER BY start_at", (pathway_id,)).fetchall()

    def plan_item(self, pathway_id: str, item_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathway_plan_items WHERE pathway_id=? AND id=?", (pathway_id, item_id)).fetchone()

    def update_pathway(self, pathway_id: str, **fields) -> sqlite3.Row:
        if not fields:
            return self.get_pathway(pathway_id)
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            db.execute(f"UPDATE pathways SET {sets} WHERE id=?", (*fields.values(), pathway_id))
            db.commit()
        return self.get_pathway(pathway_id)

    def supersede_active(self, student_id: str, except_pathway_id: str | None = None) -> None:
        with self._lock, self._connect() as db:
            if except_pathway_id:
                db.execute("UPDATE pathways SET status='superseded' WHERE student_id=? AND status='active' AND id<>?", (student_id, except_pathway_id))
            else:
                db.execute("UPDATE pathways SET status='superseded' WHERE student_id=? AND status='active'", (student_id,))
            db.commit()

    def update_step(self, pathway_id: str, step_id: str, **fields) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            cur = db.execute(f"UPDATE pathway_steps SET {sets} WHERE pathway_id=? AND id=?", (*fields.values(), pathway_id, step_id))
            if cur.rowcount == 0:
                return None
            db.commit()
        return self.step(pathway_id, step_id)

    def update_plan_item(self, pathway_id: str, item_id: str, **fields) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            cur = db.execute(f"UPDATE pathway_plan_items SET {sets} WHERE pathway_id=? AND id=?", (*fields.values(), pathway_id, item_id))
            if cur.rowcount == 0:
                return None
            db.commit()
        return self.plan_item(pathway_id, item_id)

    def defer_step_plan_items(self, pathway_id: str, step_id: str, updated_at: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE pathway_plan_items SET status='deferred', updated_at=? WHERE pathway_id=? AND step_id=? AND status='draft'", (updated_at, pathway_id, step_id))
            db.commit()

    def reactivate_step_plan_items(self, pathway_id: str, step_id: str, updated_at: str) -> None:
        """Return previously deferred, still-uncommitted actions to draft review state."""
        with self._lock, self._connect() as db:
            db.execute(
                "UPDATE pathway_plan_items SET status='draft', updated_at=? WHERE pathway_id=? AND step_id=? AND status='deferred'",
                (updated_at, pathway_id, step_id),
            )
            db.commit()

    def mark_step_plan_items_ready(self, pathway_id: str, step_id: str, updated_at: str) -> None:
        """Make forecast actions planner-eligible after their prerequisites are completed."""
        with self._lock, self._connect() as db:
            db.execute(
                "UPDATE pathway_plan_items SET prerequisite_ready=1, updated_at=? WHERE pathway_id=? AND step_id=?",
                (updated_at, pathway_id, step_id),
            )
            db.commit()

    def create_recalculation(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO pathway_recalculations(id,student_id,source_pathway_id,draft_pathway_id,trigger_reasons_json,status,created_at,decided_at) VALUES(:id,:student_id,:source_pathway_id,:draft_pathway_id,:trigger_reasons_json,:status,:created_at,:decided_at)",
                values,
            )
            db.commit()
            return db.execute("SELECT * FROM pathway_recalculations WHERE id=?", (values["id"],)).fetchone()

    def recalc_for_draft(self, draft_pathway_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM pathway_recalculations WHERE draft_pathway_id=? ORDER BY created_at DESC LIMIT 1", (draft_pathway_id,)).fetchone()

    def update_recalculation(self, recalculation_id: str, **fields) -> None:
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            db.execute(f"UPDATE pathway_recalculations SET {sets} WHERE id=?", (*fields.values(), recalculation_id))
            db.commit()

    def audit(self, pathway_id: str, student_id: str, event_type: str, occurred_at: str, detail: str = "") -> None:
        with self._connect() as db:
            db.execute("INSERT INTO pathway_audit(pathway_id,student_id,event_type,occurred_at,detail) VALUES(?,?,?,?,?)", (pathway_id, student_id, event_type, occurred_at, detail[:1000]))
            db.commit()
