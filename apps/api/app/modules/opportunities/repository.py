from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any


class OpportunityRepository:
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

    @staticmethod
    def _columns(db: sqlite3.Connection, table: str) -> set[str]:
        return {row[1] for row in db.execute(f"PRAGMA table_info({table})").fetchall()}

    def _ensure_column(self, db: sqlite3.Connection, table: str, name: str, ddl: str) -> None:
        if name not in self._columns(db, table):
            db.execute(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}")

    def _init_schema(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS opportunities (
                  id TEXT PRIMARY KEY, catalogue_version TEXT NOT NULL, category TEXT NOT NULL,
                  title TEXT NOT NULL, provider TEXT NOT NULL, summary TEXT NOT NULL,
                  starts_on TEXT, closes_on TEXT, location_mode TEXT NOT NULL, location TEXT,
                  cost_type TEXT NOT NULL, cost_amount REAL, currency TEXT,
                  target_roles_json TEXT NOT NULL, required_skills_json TEXT NOT NULL, useful_skills_json TEXT NOT NULL,
                  minimum_readiness INTEGER, eligibility_json TEXT NOT NULL,
                  source_url TEXT NOT NULL, source_name TEXT NOT NULL, source_checked_at TEXT NOT NULL,
                  trust_status TEXT NOT NULL, sponsored INTEGER NOT NULL DEFAULT 0, sponsor_name TEXT,
                  updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS opportunity_skills (
                  opportunity_id TEXT NOT NULL, skill_id TEXT NOT NULL, relationship TEXT NOT NULL,
                  PRIMARY KEY(opportunity_id, skill_id, relationship), FOREIGN KEY(opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
                );
                CREATE TABLE IF NOT EXISTS recommendation_snapshots (
                  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, created_at TEXT NOT NULL,
                  personalized INTEGER NOT NULL, catalogue_version TEXT NOT NULL,
                  result_json TEXT NOT NULL, context_summary_json TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_recommendation_owner ON recommendation_snapshots(student_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS opportunity_interactions (
                  id INTEGER PRIMARY KEY AUTOINCREMENT, student_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
                  action TEXT NOT NULL, reason TEXT, occurred_at TEXT NOT NULL,
                  UNIQUE(student_id, opportunity_id, action)
                );
                CREATE INDEX IF NOT EXISTS idx_opportunity_interactions_owner ON opportunity_interactions(student_id, occurred_at DESC);
                CREATE TABLE IF NOT EXISTS opportunity_plan_actions (
                  id TEXT PRIMARY KEY, student_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
                  idempotency_key TEXT NOT NULL, title TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
                  created_at TEXT NOT NULL, UNIQUE(student_id, idempotency_key)
                );
                """
            )
            self._ensure_column(db, "opportunities", "canonical_url", "TEXT")
            self._ensure_column(db, "opportunities", "application_steps_json", "TEXT NOT NULL DEFAULT '[]'")
            self._ensure_column(db, "opportunities", "requirement_version", "TEXT NOT NULL DEFAULT 'legacy'")
            self._ensure_column(db, "opportunities", "source_expires_at", "TEXT")
            db.executescript(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_opportunity_canonical_url
                  ON opportunities(canonical_url) WHERE canonical_url IS NOT NULL;

                CREATE TABLE IF NOT EXISTS opportunity_requirements (
                  id TEXT PRIMARY KEY,
                  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
                  requirement_version TEXT NOT NULL,
                  requirement_key TEXT NOT NULL,
                  kind TEXT NOT NULL,
                  label TEXT NOT NULL,
                  operator TEXT NOT NULL,
                  expected_json TEXT NOT NULL,
                  required INTEGER NOT NULL DEFAULT 1,
                  source_text TEXT NOT NULL,
                  source_reference TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  UNIQUE(opportunity_id, requirement_version, requirement_key)
                );
                CREATE INDEX IF NOT EXISTS idx_opportunity_requirements_lookup
                  ON opportunity_requirements(opportunity_id, requirement_version, requirement_key);

                CREATE TABLE IF NOT EXISTS source_validation_history (
                  id TEXT PRIMARY KEY,
                  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
                  scope TEXT NOT NULL,
                  student_id TEXT,
                  status TEXT NOT NULL,
                  source_url TEXT NOT NULL,
                  trust_status TEXT NOT NULL,
                  checked_at TEXT NOT NULL,
                  freshness_expires_at TEXT NOT NULL,
                  opportunity_expires_on TEXT,
                  requirement_version TEXT NOT NULL,
                  detail TEXT NOT NULL,
                  fingerprint TEXT NOT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS idx_source_validation_fingerprint
                  ON source_validation_history(opportunity_id, scope, IFNULL(student_id,''), fingerprint);
                CREATE INDEX IF NOT EXISTS idx_source_validation_latest
                  ON source_validation_history(opportunity_id, scope, checked_at DESC);
                CREATE INDEX IF NOT EXISTS idx_source_validation_student
                  ON source_validation_history(student_id, opportunity_id, checked_at DESC);

                CREATE TABLE IF NOT EXISTS eligibility_evaluations (
                  id TEXT PRIMARY KEY,
                  student_id TEXT NOT NULL,
                  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
                  requirement_version TEXT NOT NULL,
                  engine_version TEXT NOT NULL,
                  source_validation_id TEXT NOT NULL,
                  pathway_id TEXT,
                  pathway_version INTEGER,
                  overall_status TEXT NOT NULL,
                  result_json TEXT NOT NULL,
                  evidence_summary_json TEXT NOT NULL,
                  evaluated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_eligibility_eval_owner
                  ON eligibility_evaluations(student_id, opportunity_id, evaluated_at DESC);

                CREATE TABLE IF NOT EXISTS preparation_plans (
                  id TEXT PRIMARY KEY,
                  student_id TEXT NOT NULL,
                  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
                  eligibility_evaluation_id TEXT NOT NULL REFERENCES eligibility_evaluations(id),
                  source_validation_id TEXT NOT NULL,
                  requirement_version TEXT NOT NULL,
                  proposal_version TEXT NOT NULL,
                  status TEXT NOT NULL,
                  deadline TEXT,
                  timezone TEXT NOT NULL,
                  warnings_json TEXT NOT NULL,
                  generated_at TEXT NOT NULL,
                  approved_at TEXT,
                  invalidated_at TEXT,
                  invalidation_reason TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_preparation_plan_owner
                  ON preparation_plans(student_id, opportunity_id, generated_at DESC);

                CREATE TABLE IF NOT EXISTS preparation_plan_items (
                  id TEXT PRIMARY KEY,
                  plan_id TEXT NOT NULL REFERENCES preparation_plans(id) ON DELETE CASCADE,
                  requirement_id TEXT,
                  kind TEXT NOT NULL,
                  title TEXT NOT NULL,
                  rationale TEXT NOT NULL,
                  estimated_minutes INTEGER NOT NULL,
                  suggested_start_at TEXT,
                  suggested_end_at TEXT,
                  approved_action_id TEXT,
                  created_at TEXT NOT NULL,
                  UNIQUE(plan_id, id)
                );
                CREATE INDEX IF NOT EXISTS idx_preparation_items_plan ON preparation_plan_items(plan_id, created_at);

                CREATE TABLE IF NOT EXISTS application_tracking (
                  id TEXT PRIMARY KEY,
                  student_id TEXT NOT NULL,
                  opportunity_id TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
                  status TEXT NOT NULL,
                  result TEXT,
                  follow_up_at TEXT,
                  source_validation_id TEXT,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  UNIQUE(student_id, opportunity_id)
                );
                CREATE INDEX IF NOT EXISTS idx_application_tracking_owner
                  ON application_tracking(student_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS application_tracking_events (
                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                  tracking_id TEXT NOT NULL REFERENCES application_tracking(id) ON DELETE CASCADE,
                  student_id TEXT NOT NULL,
                  opportunity_id TEXT NOT NULL,
                  from_status TEXT,
                  to_status TEXT NOT NULL,
                  result TEXT,
                  follow_up_at TEXT,
                  source_validation_id TEXT,
                  occurred_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_application_tracking_events
                  ON application_tracking_events(student_id, opportunity_id, occurred_at DESC);
                """
            )
            db.commit()

    def seed(self, rows: list[dict[str, Any]], requirements: dict[str, list[dict[str, Any]]]) -> None:
        with self._lock, self._connect() as db:
            for row in rows:
                canonical = row.get("canonical_url")
                if canonical:
                    duplicate = db.execute("SELECT id FROM opportunities WHERE canonical_url=? AND id<>?", (canonical, row["id"])).fetchone()
                    if duplicate:
                        continue
                db.execute(
                    """INSERT INTO opportunities(
                    id,catalogue_version,category,title,provider,summary,starts_on,closes_on,location_mode,location,
                    cost_type,cost_amount,currency,target_roles_json,required_skills_json,useful_skills_json,minimum_readiness,
                    eligibility_json,source_url,canonical_url,source_name,source_checked_at,source_expires_at,trust_status,
                    application_steps_json,requirement_version,sponsored,sponsor_name,updated_at)
                    VALUES (:id,:catalogue_version,:category,:title,:provider,:summary,:starts_on,:closes_on,:location_mode,:location,
                    :cost_type,:cost_amount,:currency,:target_roles_json,:required_skills_json,:useful_skills_json,:minimum_readiness,
                    :eligibility_json,:source_url,:canonical_url,:source_name,:source_checked_at,:source_expires_at,:trust_status,
                    :application_steps_json,:requirement_version,:sponsored,:sponsor_name,:updated_at)
                    ON CONFLICT(id) DO UPDATE SET
                    catalogue_version=excluded.catalogue_version,category=excluded.category,title=excluded.title,provider=excluded.provider,
                    summary=excluded.summary,starts_on=excluded.starts_on,closes_on=excluded.closes_on,location_mode=excluded.location_mode,
                    location=excluded.location,cost_type=excluded.cost_type,cost_amount=excluded.cost_amount,currency=excluded.currency,
                    target_roles_json=excluded.target_roles_json,required_skills_json=excluded.required_skills_json,useful_skills_json=excluded.useful_skills_json,
                    minimum_readiness=excluded.minimum_readiness,eligibility_json=excluded.eligibility_json,source_url=excluded.source_url,
                    canonical_url=excluded.canonical_url,source_name=excluded.source_name,source_checked_at=excluded.source_checked_at,
                    source_expires_at=excluded.source_expires_at,trust_status=excluded.trust_status,application_steps_json=excluded.application_steps_json,
                    requirement_version=excluded.requirement_version,sponsored=excluded.sponsored,sponsor_name=excluded.sponsor_name,updated_at=excluded.updated_at""",
                    row,
                )
                db.execute("DELETE FROM opportunity_skills WHERE opportunity_id=?", (row["id"],))
                for skill in json.loads(row["required_skills_json"]):
                    db.execute("INSERT INTO opportunity_skills VALUES (?,?,?)", (row["id"], skill, "required"))
                for skill in json.loads(row["useful_skills_json"]):
                    db.execute("INSERT INTO opportunity_skills VALUES (?,?,?)", (row["id"], skill, "useful"))
                for req in requirements.get(row["id"], []):
                    db.execute(
                        """INSERT INTO opportunity_requirements(id,opportunity_id,requirement_version,requirement_key,kind,label,operator,expected_json,required,source_text,source_reference,created_at)
                        VALUES (:id,:opportunity_id,:requirement_version,:requirement_key,:kind,:label,:operator,:expected_json,:required,:source_text,:source_reference,:created_at)
                        ON CONFLICT(opportunity_id,requirement_version,requirement_key) DO UPDATE SET
                        kind=excluded.kind,label=excluded.label,operator=excluded.operator,expected_json=excluded.expected_json,
                        required=excluded.required,source_text=excluded.source_text,source_reference=excluded.source_reference""",
                        req,
                    )
            db.commit()

    def list_opportunities(self) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM opportunities ORDER BY closes_on, title").fetchall()

    def get(self, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM opportunities WHERE id=?", (opportunity_id,)).fetchone()

    def requirements(self, opportunity_id: str, version: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM opportunity_requirements WHERE opportunity_id=? AND requirement_version=? ORDER BY kind, requirement_key",
                (opportunity_id, version),
            ).fetchall()

    def interactions(self, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM opportunity_interactions WHERE student_id=? ORDER BY occurred_at", (student_id,)).fetchall()

    def record_interaction(self, student_id: str, opportunity_id: str, action: str, reason: str | None, occurred_at: str) -> None:
        with self._lock, self._connect() as db:
            if action == "unsave":
                db.execute("DELETE FROM opportunity_interactions WHERE student_id=? AND opportunity_id=? AND action='save'", (student_id, opportunity_id))
            else:
                db.execute(
                    """INSERT INTO opportunity_interactions(student_id,opportunity_id,action,reason,occurred_at) VALUES (?,?,?,?,?)
                    ON CONFLICT(student_id,opportunity_id,action) DO UPDATE SET reason=excluded.reason,occurred_at=excluded.occurred_at""",
                    (student_id, opportunity_id, action, reason, occurred_at),
                )
                if action == "save":
                    db.execute("DELETE FROM opportunity_interactions WHERE student_id=? AND opportunity_id=? AND action='dismiss'", (student_id, opportunity_id))
            db.commit()

    def save_snapshot(self, values: dict[str, Any]) -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO recommendation_snapshots(id,student_id,created_at,personalized,catalogue_version,result_json,context_summary_json) VALUES (:id,:student_id,:created_at,:personalized,:catalogue_version,:result_json,:context_summary_json)",
                values,
            )
            db.commit()

    def save_plan_action(self, values: dict[str, Any]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT * FROM opportunity_plan_actions WHERE student_id=? AND idempotency_key=?", (values["student_id"], values["idempotency_key"])).fetchone()
            if existing:
                return existing
            db.execute(
                "INSERT INTO opportunity_plan_actions(id,student_id,opportunity_id,idempotency_key,title,start_at,end_at,created_at) VALUES (:id,:student_id,:opportunity_id,:idempotency_key,:title,:start_at,:end_at,:created_at)",
                values,
            )
            db.commit()
            return db.execute("SELECT * FROM opportunity_plan_actions WHERE id=?", (values["id"],)).fetchone()

    def record_source_validation(self, values: dict[str, Any]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            existing = db.execute(
                "SELECT * FROM source_validation_history WHERE opportunity_id=? AND scope=? AND COALESCE(student_id,'')=COALESCE(?, '') AND fingerprint=?",
                (values["opportunity_id"], values["scope"], values.get("student_id"), values["fingerprint"]),
            ).fetchone()
            if existing:
                return existing
            db.execute(
                """INSERT INTO source_validation_history(id,opportunity_id,scope,student_id,status,source_url,trust_status,checked_at,freshness_expires_at,opportunity_expires_on,requirement_version,detail,fingerprint)
                VALUES (:id,:opportunity_id,:scope,:student_id,:status,:source_url,:trust_status,:checked_at,:freshness_expires_at,:opportunity_expires_on,:requirement_version,:detail,:fingerprint)""",
                values,
            )
            db.commit()
            return db.execute("SELECT * FROM source_validation_history WHERE id=?", (values["id"],)).fetchone()

    def latest_catalogue_validation(self, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM source_validation_history WHERE opportunity_id=? AND scope='catalogue' ORDER BY checked_at DESC, rowid DESC LIMIT 1",
                (opportunity_id,),
            ).fetchone()

    def latest_student_report(self, student_id: str, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM source_validation_history WHERE opportunity_id=? AND scope='student_report' AND student_id=? ORDER BY checked_at DESC, rowid DESC LIMIT 1",
                (opportunity_id, student_id),
            ).fetchone()

    def latest_report(self, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM source_validation_history WHERE opportunity_id=? AND scope='student_report' ORDER BY checked_at DESC, rowid DESC LIMIT 1",
                (opportunity_id,),
            ).fetchone()

    def save_evaluation(self, values: dict[str, Any]) -> sqlite3.Row:
        with self._connect() as db:
            db.execute(
                """INSERT INTO eligibility_evaluations(id,student_id,opportunity_id,requirement_version,engine_version,source_validation_id,pathway_id,pathway_version,overall_status,result_json,evidence_summary_json,evaluated_at)
                VALUES (:id,:student_id,:opportunity_id,:requirement_version,:engine_version,:source_validation_id,:pathway_id,:pathway_version,:overall_status,:result_json,:evidence_summary_json,:evaluated_at)""",
                values,
            )
            db.commit()
            return db.execute("SELECT * FROM eligibility_evaluations WHERE id=?", (values["id"],)).fetchone()

    def evaluation_for_owner(self, evaluation_id: str, student_id: str, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM eligibility_evaluations WHERE id=? AND student_id=? AND opportunity_id=?",
                (evaluation_id, student_id, opportunity_id),
            ).fetchone()

    def create_preparation_plan(self, plan: dict[str, Any], items: list[dict[str, Any]]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO preparation_plans(id,student_id,opportunity_id,eligibility_evaluation_id,source_validation_id,requirement_version,proposal_version,status,deadline,timezone,warnings_json,generated_at,approved_at,invalidated_at,invalidation_reason)
                VALUES (:id,:student_id,:opportunity_id,:eligibility_evaluation_id,:source_validation_id,:requirement_version,:proposal_version,:status,:deadline,:timezone,:warnings_json,:generated_at,:approved_at,:invalidated_at,:invalidation_reason)""",
                plan,
            )
            db.executemany(
                """INSERT INTO preparation_plan_items(id,plan_id,requirement_id,kind,title,rationale,estimated_minutes,suggested_start_at,suggested_end_at,approved_action_id,created_at)
                VALUES (:id,:plan_id,:requirement_id,:kind,:title,:rationale,:estimated_minutes,:suggested_start_at,:suggested_end_at,:approved_action_id,:created_at)""",
                items,
            )
            db.commit()
            return db.execute("SELECT * FROM preparation_plans WHERE id=?", (plan["id"],)).fetchone()

    def preparation_plan_for_owner(self, plan_id: str, student_id: str, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM preparation_plans WHERE id=? AND student_id=? AND opportunity_id=?",
                (plan_id, student_id, opportunity_id),
            ).fetchone()

    def preparation_items(self, plan_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM preparation_plan_items WHERE plan_id=? ORDER BY created_at,id", (plan_id,)).fetchall()

    def update_preparation_plan(self, plan_id: str, **fields: Any) -> None:
        if not fields:
            return
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            db.execute(f"UPDATE preparation_plans SET {sets} WHERE id=?", (*fields.values(), plan_id))
            db.commit()

    def mark_preparation_item_action(self, item_id: str, action_id: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE preparation_plan_items SET approved_action_id=? WHERE id=?", (action_id, item_id))
            db.commit()

    def tracking(self, student_id: str, opportunity_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM application_tracking WHERE student_id=? AND opportunity_id=?",
                (student_id, opportunity_id),
            ).fetchone()

    def upsert_tracking(self, values: dict[str, Any]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            current = db.execute(
                "SELECT * FROM application_tracking WHERE student_id=? AND opportunity_id=?",
                (values["student_id"], values["opportunity_id"]),
            ).fetchone()
            if current:
                db.execute(
                    """UPDATE application_tracking SET status=:status,result=:result,follow_up_at=:follow_up_at,source_validation_id=:source_validation_id,updated_at=:updated_at
                    WHERE student_id=:student_id AND opportunity_id=:opportunity_id""",
                    values,
                )
                tracking_id = current["id"]
                from_status = current["status"]
            else:
                db.execute(
                    """INSERT INTO application_tracking(id,student_id,opportunity_id,status,result,follow_up_at,source_validation_id,created_at,updated_at)
                    VALUES (:id,:student_id,:opportunity_id,:status,:result,:follow_up_at,:source_validation_id,:created_at,:updated_at)""",
                    values,
                )
                tracking_id = values["id"]
                from_status = None
            db.execute(
                """INSERT INTO application_tracking_events(tracking_id,student_id,opportunity_id,from_status,to_status,result,follow_up_at,source_validation_id,occurred_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (tracking_id, values["student_id"], values["opportunity_id"], from_status, values["status"], values.get("result"), values.get("follow_up_at"), values.get("source_validation_id"), values["updated_at"]),
            )
            db.commit()
            return db.execute("SELECT * FROM application_tracking WHERE id=?", (tracking_id,)).fetchone()

    def update_source(self, opportunity_id: str, *, closes_on: str | None = None, source_checked_at: str | None = None, trust_status: str | None = None, source_expires_at: str | None = None) -> None:
        fields: dict[str, Any] = {}
        if closes_on is not None:
            fields["closes_on"] = closes_on
        if source_checked_at is not None:
            fields["source_checked_at"] = source_checked_at
        if trust_status is not None:
            fields["trust_status"] = trust_status
        if source_expires_at is not None:
            fields["source_expires_at"] = source_expires_at
        if not fields:
            return
        with self._lock, self._connect() as db:
            sets = ",".join(f"{key}=?" for key in fields)
            db.execute(f"UPDATE opportunities SET {sets} WHERE id=?", (*fields.values(), opportunity_id))
            db.commit()

    def query(self, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(sql, args).fetchall()
