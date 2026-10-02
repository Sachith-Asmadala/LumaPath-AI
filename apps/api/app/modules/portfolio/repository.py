from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock


class PortfolioRepository:
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
            db.executescript(
                """
                CREATE TABLE IF NOT EXISTS portfolio_projects (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL,
                    target_role TEXT NOT NULL,
                    project_url TEXT,
                    live_demo_url TEXT,
                    facts_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_portfolio_projects_owner ON portfolio_projects(student_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS external_repositories (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    provider TEXT NOT NULL,
                    external_repository_id TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    repository_url TEXT NOT NULL,
                    live_demo_url TEXT,
                    visibility TEXT NOT NULL,
                    access_status TEXT NOT NULL,
                    authorization_reference TEXT NOT NULL,
                    authorization_scope TEXT NOT NULL,
                    collected_at TEXT NOT NULL,
                    imported_at TEXT NOT NULL,
                    revoked_at TEXT,
                    facts_json TEXT NOT NULL,
                    UNIQUE(student_id, provider, external_repository_id)
                );
                CREATE INDEX IF NOT EXISTS idx_external_repo_project ON external_repositories(student_id, project_id, imported_at DESC);

                CREATE TABLE IF NOT EXISTS portfolio_analysis_snapshots (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    source_kind TEXT NOT NULL,
                    source_repository_id TEXT,
                    target_role TEXT NOT NULL,
                    source_timestamp TEXT NOT NULL,
                    analyzed_at TEXT NOT NULL,
                    completeness_score INTEGER NOT NULL,
                    indicators_json TEXT NOT NULL,
                    factual_description TEXT NOT NULL,
                    stale INTEGER NOT NULL DEFAULT 0,
                    disclaimer TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_portfolio_analysis_project ON portfolio_analysis_snapshots(student_id, project_id, analyzed_at DESC);

                CREATE TABLE IF NOT EXISTS portfolio_skill_evidence (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    snapshot_id TEXT NOT NULL REFERENCES portfolio_analysis_snapshots(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    skill_name TEXT NOT NULL,
                    status TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    evidence_json TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    source_timestamp TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_portfolio_skill_snapshot ON portfolio_skill_evidence(snapshot_id, status);

                CREATE TABLE IF NOT EXISTS portfolio_recommendations (
                    id TEXT PRIMARY KEY,
                    snapshot_id TEXT NOT NULL REFERENCES portfolio_analysis_snapshots(id) ON DELETE CASCADE,
                    project_id TEXT NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    kind TEXT NOT NULL,
                    priority TEXT NOT NULL,
                    title TEXT NOT NULL,
                    rationale TEXT NOT NULL,
                    evidence_refs_json TEXT NOT NULL,
                    editable_text TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    decided_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_portfolio_recommendation_project ON portfolio_recommendations(student_id, project_id, created_at DESC);

                CREATE TABLE IF NOT EXISTS portfolio_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    project_id TEXT NOT NULL,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def create_project(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO portfolio_projects
                (id, student_id, title, description, target_role, project_url, live_demo_url, facts_json, created_at, updated_at)
                VALUES (:id, :student_id, :title, :description, :target_role, :project_url, :live_demo_url, :facts_json, :created_at, :updated_at)""",
                values,
            )
            db.commit()
        return self.get_project(values["id"])

    def get_project(self, project_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM portfolio_projects WHERE id = ?", (project_id,)).fetchone()

    def list_projects(self, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM portfolio_projects WHERE student_id = ? ORDER BY updated_at DESC", (student_id,)).fetchall()

    def update_project(self, project_id: str, student_id: str, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """UPDATE portfolio_projects SET title=:title, description=:description, target_role=:target_role,
                project_url=:project_url, live_demo_url=:live_demo_url, facts_json=:facts_json, updated_at=:updated_at
                WHERE id=:id AND student_id=:student_id""",
                {**values, "id": project_id, "student_id": student_id},
            )
            db.commit()
        return self.get_project(project_id)

    def delete_project(self, project_id: str, student_id: str) -> bool:
        with self._lock, self._connect() as db:
            cur = db.execute("DELETE FROM portfolio_projects WHERE id = ? AND student_id = ?", (project_id, student_id))
            db.commit()
            return cur.rowcount > 0

    def upsert_repository(self, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            existing = db.execute(
                "SELECT id FROM external_repositories WHERE student_id=? AND provider=? AND external_repository_id=?",
                (values["student_id"], values["provider"], values["external_repository_id"]),
            ).fetchone()
            if existing:
                values = {**values, "id": existing["id"]}
                db.execute(
                    """UPDATE external_repositories SET project_id=:project_id, full_name=:full_name, repository_url=:repository_url,
                    live_demo_url=:live_demo_url, visibility=:visibility, access_status='active', authorization_reference=:authorization_reference,
                    authorization_scope=:authorization_scope, collected_at=:collected_at, revoked_at=NULL, facts_json=:facts_json
                    WHERE id=:id AND student_id=:student_id""",
                    values,
                )
                repo_id = existing["id"]
            else:
                db.execute(
                    """INSERT INTO external_repositories
                    (id, project_id, student_id, provider, external_repository_id, full_name, repository_url, live_demo_url, visibility,
                     access_status, authorization_reference, authorization_scope, collected_at, imported_at, revoked_at, facts_json)
                    VALUES (:id,:project_id,:student_id,:provider,:external_repository_id,:full_name,:repository_url,:live_demo_url,:visibility,
                     :access_status,:authorization_reference,:authorization_scope,:collected_at,:imported_at,:revoked_at,:facts_json)""",
                    values,
                )
                repo_id = values["id"]
            db.commit()
        return self.get_repository(repo_id)

    def get_repository(self, repository_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM external_repositories WHERE id = ?", (repository_id,)).fetchone()

    def list_repositories(self, project_id: str, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM external_repositories WHERE project_id=? AND student_id=? ORDER BY imported_at DESC",
                (project_id, student_id),
            ).fetchall()

    def refresh_repository(self, repository_id: str, student_id: str, values: dict) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """UPDATE external_repositories SET full_name=:full_name, repository_url=:repository_url, live_demo_url=:live_demo_url, visibility=:visibility,
                collected_at=:collected_at, facts_json=:facts_json WHERE id=:id AND student_id=:student_id AND access_status='active'""",
                {**values, "id": repository_id, "student_id": student_id},
            )
            db.commit()
        return self.get_repository(repository_id)

    def revoke_repository(self, repository_id: str, student_id: str, at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE external_repositories SET access_status='revoked', revoked_at=? WHERE id=? AND student_id=?",
                (at, repository_id, student_id),
            )
            db.commit()
        return self.get_repository(repository_id) if cur.rowcount else None

    def delete_repository_and_imported_data(self, repository_id: str, student_id: str) -> bool:
        with self._lock, self._connect() as db:
            snapshot_ids = [r["id"] for r in db.execute(
                "SELECT id FROM portfolio_analysis_snapshots WHERE source_repository_id=? AND student_id=?", (repository_id, student_id)
            ).fetchall()]
            for snapshot_id in snapshot_ids:
                db.execute("DELETE FROM portfolio_skill_evidence WHERE snapshot_id=?", (snapshot_id,))
                db.execute("DELETE FROM portfolio_recommendations WHERE snapshot_id=?", (snapshot_id,))
            db.execute("DELETE FROM portfolio_analysis_snapshots WHERE source_repository_id=? AND student_id=?", (repository_id, student_id))
            cur = db.execute("DELETE FROM external_repositories WHERE id=? AND student_id=?", (repository_id, student_id))
            db.commit()
            return cur.rowcount > 0

    def save_analysis(self, snapshot: dict, skills: list[dict], recommendations: list[dict]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO portfolio_analysis_snapshots
                (id, project_id, student_id, source_kind, source_repository_id, target_role, source_timestamp, analyzed_at,
                 completeness_score, indicators_json, factual_description, stale, disclaimer)
                VALUES (:id,:project_id,:student_id,:source_kind,:source_repository_id,:target_role,:source_timestamp,:analyzed_at,
                 :completeness_score,:indicators_json,:factual_description,:stale,:disclaimer)""",
                snapshot,
            )
            for skill in skills:
                db.execute(
                    """INSERT INTO portfolio_skill_evidence
                    (snapshot_id,student_id,skill_id,skill_name,status,confidence,evidence_json,source_type,source_timestamp)
                    VALUES (:snapshot_id,:student_id,:skill_id,:skill_name,:status,:confidence,:evidence_json,:source_type,:source_timestamp)""",
                    skill,
                )
            for rec in recommendations:
                db.execute(
                    """INSERT INTO portfolio_recommendations
                    (id,snapshot_id,project_id,student_id,kind,priority,title,rationale,evidence_refs_json,editable_text,status,created_at,decided_at)
                    VALUES (:id,:snapshot_id,:project_id,:student_id,:kind,:priority,:title,:rationale,:evidence_refs_json,:editable_text,:status,:created_at,NULL)""",
                    rec,
                )
            db.commit()

    def latest_analysis(self, project_id: str, student_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM portfolio_analysis_snapshots WHERE project_id=? AND student_id=? ORDER BY analyzed_at DESC LIMIT 1",
                (project_id, student_id),
            ).fetchone()

    def skills_for_snapshot(self, snapshot_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM portfolio_skill_evidence WHERE snapshot_id=? ORDER BY skill_name", (snapshot_id,)).fetchall()

    def recommendations_for_snapshot(self, snapshot_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM portfolio_recommendations WHERE snapshot_id=? ORDER BY created_at, id", (snapshot_id,)).fetchall()

    def get_recommendation(self, recommendation_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM portfolio_recommendations WHERE id=?", (recommendation_id,)).fetchone()

    def decide_recommendation(self, recommendation_id: str, student_id: str, status: str, edited_text: str | None, at: str) -> sqlite3.Row | None:
        with self._lock, self._connect() as db:
            cur = db.execute(
                "UPDATE portfolio_recommendations SET status=?, editable_text=COALESCE(?, editable_text), decided_at=? WHERE id=? AND student_id=?",
                (status, edited_text, at, recommendation_id, student_id),
            )
            db.commit()
        return self.get_recommendation(recommendation_id) if cur.rowcount else None

    def analysis_count_since(self, student_id: str, since_iso: str) -> int:
        with self._connect() as db:
            row = db.execute(
                "SELECT COUNT(*) AS n FROM portfolio_analysis_snapshots WHERE student_id=? AND analyzed_at>=?", (student_id, since_iso)
            ).fetchone()
        return int(row["n"])

    def audit(self, project_id: str, student_id: str, event_type: str, detail: str = "") -> None:
        at = datetime.now(timezone.utc).isoformat()
        with self._connect() as db:
            db.execute(
                "INSERT INTO portfolio_audit(project_id,student_id,event_type,occurred_at,detail) VALUES (?,?,?,?,?)",
                (project_id, student_id, event_type, at, detail[:500]),
            )
            db.commit()
