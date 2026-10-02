from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from .catalog import ROLE_METADATA, ROLE_PATHWAYS, RESOURCE_CATALOG, TAXONOMY_VERSION, resource_quality, resource_type, role_requirement


class CareerRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()
        self._seed_catalogue()

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
                CREATE TABLE IF NOT EXISTS career_roles (
                    id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    name TEXT NOT NULL,
                    level TEXT NOT NULL,
                    description TEXT NOT NULL,
                    quality_status TEXT NOT NULL,
                    published_at TEXT NOT NULL,
                    PRIMARY KEY(id, version)
                );
                CREATE TABLE IF NOT EXISTS skills (
                    id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    PRIMARY KEY(id, version)
                );
                CREATE TABLE IF NOT EXISTS role_skills (
                    role_id TEXT NOT NULL,
                    role_version TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    skill_version TEXT NOT NULL,
                    required_proficiency INTEGER NOT NULL,
                    estimated_minutes INTEGER NOT NULL,
                    evidence_json TEXT NOT NULL,
                    skill_order INTEGER NOT NULL,
                    PRIMARY KEY(role_id, role_version, skill_id)
                );
                CREATE TABLE IF NOT EXISTS skill_dependencies (
                    role_id TEXT NOT NULL,
                    role_version TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    prerequisite_skill_id TEXT NOT NULL,
                    PRIMARY KEY(role_id, role_version, skill_id, prerequisite_skill_id)
                );
                CREATE TABLE IF NOT EXISTS learning_resources (
                    id TEXT NOT NULL,
                    version TEXT NOT NULL,
                    title TEXT NOT NULL,
                    source TEXT NOT NULL,
                    source_url TEXT,
                    resource_type TEXT NOT NULL,
                    quality_score INTEGER NOT NULL,
                    cost_type TEXT,
                    price_usd REAL,
                    language TEXT,
                    format TEXT,
                    estimated_minutes INTEGER,
                    active INTEGER NOT NULL DEFAULT 1,
                    PRIMARY KEY(id, version)
                );
                CREATE TABLE IF NOT EXISTS resource_skills (
                    resource_id TEXT NOT NULL,
                    resource_version TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    PRIMARY KEY(resource_id, resource_version, skill_id)
                );
                CREATE TABLE IF NOT EXISTS skill_assessments (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    target_role TEXT NOT NULL,
                    taxonomy_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    conflicting_skills_json TEXT NOT NULL DEFAULT '[]',
                    disclaimer TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_skill_assessment_owner ON skill_assessments(student_id, created_at DESC);
                CREATE TABLE IF NOT EXISTS student_skills (
                    student_id TEXT NOT NULL,
                    assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
                    target_role TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    skill_name TEXT NOT NULL,
                    proficiency INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    required_proficiency INTEGER NOT NULL,
                    gap INTEGER NOT NULL,
                    meets_requirement INTEGER NOT NULL,
                    uncertainty TEXT,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY(assessment_id, skill_id)
                );
                CREATE INDEX IF NOT EXISTS idx_student_skills_current ON student_skills(student_id, target_role, updated_at DESC);
                CREATE TABLE IF NOT EXISTS student_skill_evidence (
                    id TEXT PRIMARY KEY,
                    assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
                    student_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    verification_status TEXT NOT NULL,
                    proficiency INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    source_ref TEXT NOT NULL,
                    source_label TEXT NOT NULL,
                    observed_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_student_skill_evidence ON student_skill_evidence(student_id, skill_id, observed_at DESC);
                CREATE TABLE IF NOT EXISTS career_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    occurred_at TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT ''
                );
                """
            )

    def _seed_catalogue(self) -> None:
        published_at = "2026-10-31T00:00:00+00:00"
        with self._lock, self._connect() as db:
            for role_name, definitions in ROLE_PATHWAYS.items():
                meta = ROLE_METADATA[role_name]
                db.execute(
                    """INSERT OR REPLACE INTO career_roles(id,version,name,level,description,quality_status,published_at)
                    VALUES (?,?,?,?,?,?,?)""",
                    (meta["id"], TAXONOMY_VERSION, role_name, meta["level"], meta["description"], meta["quality_status"], published_at),
                )
                for order, skill in enumerate(definitions, start=1):
                    db.execute(
                        "INSERT OR REPLACE INTO skills(id,version,name,description) VALUES (?,?,?,?)",
                        (skill.skill_id, TAXONOMY_VERSION, skill.name, f"Approved {role_name} skill requirement."),
                    )
                    db.execute(
                        """INSERT OR REPLACE INTO role_skills
                        (role_id,role_version,skill_id,skill_version,required_proficiency,estimated_minutes,evidence_json,skill_order)
                        VALUES (?,?,?,?,?,?,?,?)""",
                        (meta["id"], TAXONOMY_VERSION, skill.skill_id, TAXONOMY_VERSION, role_requirement(role_name, skill.skill_id), skill.estimated_minutes, json.dumps(list(skill.target_evidence)), order),
                    )
                    db.execute("DELETE FROM skill_dependencies WHERE role_id=? AND role_version=? AND skill_id=?", (meta["id"], TAXONOMY_VERSION, skill.skill_id))
                    for prereq in skill.prerequisites:
                        db.execute(
                            "INSERT OR REPLACE INTO skill_dependencies(role_id,role_version,skill_id,prerequisite_skill_id) VALUES (?,?,?,?)",
                            (meta["id"], TAXONOMY_VERSION, skill.skill_id, prereq),
                        )
            for resource in RESOURCE_CATALOG:
                db.execute(
                    """INSERT OR REPLACE INTO learning_resources
                    (id,version,title,source,source_url,resource_type,quality_score,cost_type,price_usd,language,format,estimated_minutes,active)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                    (resource.id, TAXONOMY_VERSION, resource.title, resource.source, resource.source_url, resource_type(resource), resource_quality(resource), resource.cost_type, resource.price_usd, resource.language, resource.format, resource.estimated_minutes),
                )
                db.execute(
                    "INSERT OR REPLACE INTO resource_skills(resource_id,resource_version,skill_id) VALUES (?,?,?)",
                    (resource.id, TAXONOMY_VERSION, resource.skill_id),
                )
            db.commit()

    def active_taxonomy_version(self) -> str:
        with self._connect() as db:
            try:
                row = db.execute("SELECT version FROM taxonomy_versions WHERE profile_scope='international' AND status='approved' AND is_default=1 LIMIT 1").fetchone()
                if row:
                    return str(row["version"])
            except sqlite3.OperationalError:
                pass
        return TAXONOMY_VERSION

    def list_roles(self) -> list[sqlite3.Row]:
        with self._connect() as db:
            version = self.active_taxonomy_version()
            return db.execute("SELECT * FROM career_roles WHERE version=? AND quality_status='approved' ORDER BY name", (version,)).fetchall()

    def role_by_name(self, role_name: str) -> sqlite3.Row | None:
        with self._connect() as db:
            version = self.active_taxonomy_version()
            return db.execute("SELECT * FROM career_roles WHERE version=? AND name=? AND quality_status='approved'", (version, role_name)).fetchone()

    def role_by_id(self, role_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            version = self.active_taxonomy_version()
            return db.execute("SELECT * FROM career_roles WHERE version=? AND id=? AND quality_status='approved'", (version, role_id)).fetchone()

    def role_skill_rows(self, role_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                """SELECT rs.*, s.name FROM role_skills rs JOIN skills s ON s.id=rs.skill_id AND s.version=rs.skill_version
                WHERE rs.role_id=? AND rs.role_version=? ORDER BY rs.skill_order""",
                (role_id, self.active_taxonomy_version()),
            ).fetchall()

    def dependencies(self, role_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM skill_dependencies WHERE role_id=? AND role_version=?", (role_id, self.active_taxonomy_version())).fetchall()

    def resources_for_skill(self, skill_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                """SELECT r.* FROM learning_resources r JOIN resource_skills rs ON rs.resource_id=r.id AND rs.resource_version=r.version
                WHERE rs.skill_id=? AND r.version=? AND r.active=1 ORDER BY r.quality_score DESC, r.id""",
                (skill_id, self.active_taxonomy_version()),
            ).fetchall()

    def create_assessment(self, assessment: dict, skill_rows: list[dict], evidence_rows: list[dict]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO skill_assessments(id,student_id,target_role,taxonomy_version,created_at,conflicting_skills_json,disclaimer)
                VALUES (:id,:student_id,:target_role,:taxonomy_version,:created_at,:conflicting_skills_json,:disclaimer)""",
                assessment,
            )
            db.executemany(
                """INSERT INTO student_skills(student_id,assessment_id,target_role,skill_id,skill_name,proficiency,confidence,required_proficiency,gap,meets_requirement,uncertainty,updated_at)
                VALUES (:student_id,:assessment_id,:target_role,:skill_id,:skill_name,:proficiency,:confidence,:required_proficiency,:gap,:meets_requirement,:uncertainty,:updated_at)""",
                skill_rows,
            )
            db.executemany(
                """INSERT INTO student_skill_evidence(id,assessment_id,student_id,skill_id,source_type,verification_status,proficiency,confidence,source_ref,source_label,observed_at)
                VALUES (:id,:assessment_id,:student_id,:skill_id,:source_type,:verification_status,:proficiency,:confidence,:source_ref,:source_label,:observed_at)""",
                evidence_rows,
            )
            db.commit()

    def latest_assessment(self, student_id: str, target_role: str | None = None) -> sqlite3.Row | None:
        with self._connect() as db:
            if target_role:
                return db.execute("SELECT * FROM skill_assessments WHERE student_id=? AND target_role=? ORDER BY created_at DESC, rowid DESC LIMIT 1", (student_id, target_role)).fetchone()
            return db.execute("SELECT * FROM skill_assessments WHERE student_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1", (student_id,)).fetchone()

    def student_skills(self, assessment_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM student_skills WHERE assessment_id=? ORDER BY skill_id", (assessment_id,)).fetchall()

    def skill_evidence(self, assessment_id: str, skill_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM student_skill_evidence WHERE assessment_id=? AND skill_id=? ORDER BY confidence DESC, observed_at DESC", (assessment_id, skill_id)).fetchall()


    def passport_evidence(self, student_id: str, skill_id: str) -> list[sqlite3.Row]:
        """Return current DOC-F31 evidence for readiness/skill assessment.

        Evidence Passport keeps richer verification states; the career engine consumes
        only active owner-scoped evidence and lets confidence/status affect readiness.
        """
        with self._connect() as db:
            tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "skill_evidence" not in tables:
                return []
            return db.execute(
                """SELECT * FROM skill_evidence
                WHERE student_id=? AND skill_id=? AND active=1
                ORDER BY updated_at DESC, id DESC LIMIT 20""",
                (student_id, skill_id),
            ).fetchall()

    def latest_portfolio_evidence(self, student_id: str, skill_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "portfolio_skill_evidence" not in tables:
                return []
            return db.execute(
                """SELECT pse.*, pas.analyzed_at, pas.stale AS snapshot_stale,
                          pas.source_kind, pas.source_repository_id,
                          er.access_status AS repository_access_status, er.revoked_at AS repository_revoked_at
                FROM portfolio_skill_evidence pse
                JOIN portfolio_analysis_snapshots pas ON pas.id=pse.snapshot_id
                LEFT JOIN external_repositories er ON er.id=pas.source_repository_id AND er.student_id=pse.student_id
                WHERE pse.student_id=? AND pse.skill_id=? AND pse.status!='not_demonstrated'
                ORDER BY pas.analyzed_at DESC LIMIT 5""",
                (student_id, skill_id),
            ).fetchall()

    def latest_cv_role_skills(self, student_id: str, target_role: str) -> list[dict]:
        with self._connect() as db:
            tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "cv_analysis_snapshots" not in tables:
                return []
            row = db.execute(
                "SELECT role_skills_json, analyzed_at, id FROM cv_analysis_snapshots WHERE student_id=? AND target_role=? ORDER BY analyzed_at DESC LIMIT 1",
                (student_id, target_role),
            ).fetchone()
            if not row:
                return []
            values = json.loads(row["role_skills_json"] or "[]")
            return [{**item, "analysis_id": row["id"], "analyzed_at": row["analyzed_at"]} for item in values]

    def latest_pathway_completion(self, student_id: str, skill_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
            if "pathway_steps" not in tables:
                return []
            return db.execute(
                """SELECT ps.*, p.version AS pathway_version FROM pathway_steps ps JOIN pathways p ON p.id=ps.pathway_id
                WHERE ps.student_id=? AND ps.skill_id=? AND ps.state IN ('credited','completed') ORDER BY ps.updated_at DESC LIMIT 3""",
                (student_id, skill_id),
            ).fetchall()

    def audit(self, student_id: str, event_type: str, detail: str = "") -> None:
        with self._connect() as db:
            db.execute(
                "INSERT INTO career_audit(student_id,event_type,occurred_at,detail) VALUES (?,?,?,?)",
                (student_id, event_type, datetime.now(timezone.utc).isoformat(), detail[:500]),
            )
            db.commit()
