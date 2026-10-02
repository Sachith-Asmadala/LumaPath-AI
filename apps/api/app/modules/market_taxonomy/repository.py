from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from threading import RLock

from ..careers.catalog import TAXONOMY_VERSION


class MarketTaxonomyRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()
        self._bootstrap_baseline()

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
                CREATE TABLE IF NOT EXISTS taxonomy_versions (
                    version TEXT PRIMARY KEY,
                    status TEXT NOT NULL CHECK(status IN ('draft','review','approved','retired')),
                    profile_scope TEXT NOT NULL CHECK(profile_scope IN ('international','regional')),
                    region_code TEXT,
                    parent_version TEXT,
                    snapshot_json TEXT NOT NULL,
                    methodology_version TEXT NOT NULL,
                    change_summary TEXT NOT NULL DEFAULT '',
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    approved_by TEXT,
                    approved_at TEXT,
                    retired_at TEXT,
                    is_default INTEGER NOT NULL DEFAULT 0,
                    CHECK ((profile_scope='regional' AND region_code IS NOT NULL) OR (profile_scope='international' AND region_code IS NULL))
                );
                CREATE INDEX IF NOT EXISTS idx_taxonomy_versions_profile ON taxonomy_versions(profile_scope,region_code,status,approved_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_taxonomy_default_international ON taxonomy_versions(is_default) WHERE is_default=1 AND profile_scope='international' AND status='approved';
                CREATE TRIGGER IF NOT EXISTS trg_taxonomy_snapshot_immutable
                BEFORE UPDATE OF snapshot_json,parent_version,profile_scope,region_code,methodology_version ON taxonomy_versions
                BEGIN SELECT RAISE(ABORT, 'taxonomy version snapshots are immutable'); END;

                CREATE TABLE IF NOT EXISTS market_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source_type TEXT NOT NULL CHECK(source_type IN ('job_aggregate','certification_objectives','technology_source')),
                    canonical_url TEXT NOT NULL,
                    licensing_policy TEXT NOT NULL,
                    trust_score INTEGER NOT NULL CHECK(trust_score BETWEEN 0 AND 100),
                    status TEXT NOT NULL CHECK(status IN ('approved','review','blocked')),
                    bias_review_status TEXT NOT NULL CHECK(bias_review_status IN ('approved','pending','rejected')),
                    regions_json TEXT NOT NULL,
                    retention_days INTEGER NOT NULL,
                    max_age_days INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS market_observations (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES market_sources(id),
                    role_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    profile_scope TEXT NOT NULL CHECK(profile_scope IN ('international','regional')),
                    region_code TEXT,
                    period_start TEXT NOT NULL,
                    period_end TEXT NOT NULL,
                    observed_at TEXT NOT NULL,
                    sample_size INTEGER NOT NULL CHECK(sample_size>0),
                    skill_share REAL NOT NULL CHECK(skill_share BETWEEN 0 AND 1),
                    methodology TEXT NOT NULL,
                    provenance_url TEXT NOT NULL,
                    content_hash TEXT NOT NULL UNIQUE,
                    expires_at TEXT NOT NULL,
                    retained_until TEXT NOT NULL,
                    ingested_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_market_observations_signal ON market_observations(role_id,skill_id,profile_scope,region_code,period_end DESC);

                CREATE TABLE IF NOT EXISTS skill_signals (
                    id TEXT PRIMARY KEY,
                    role_id TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    profile_scope TEXT NOT NULL,
                    region_code TEXT,
                    label TEXT NOT NULL CHECK(label IN ('emerging','stable','declining')),
                    delta REAL NOT NULL,
                    recent_share REAL NOT NULL,
                    prior_share REAL NOT NULL,
                    sample_size INTEGER NOT NULL,
                    source_count INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    recency_days REAL NOT NULL,
                    methodology_version TEXT NOT NULL,
                    methodology TEXT NOT NULL,
                    source_ids_json TEXT NOT NULL,
                    observation_ids_json TEXT NOT NULL,
                    publication_eligible INTEGER NOT NULL,
                    limitations_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_skill_signals_lookup ON skill_signals(role_id,skill_id,profile_scope,region_code,created_at DESC);

                CREATE TABLE IF NOT EXISTS change_proposals (
                    id TEXT PRIMARY KEY,
                    signal_id TEXT NOT NULL REFERENCES skill_signals(id),
                    base_version TEXT NOT NULL REFERENCES taxonomy_versions(version),
                    candidate_version TEXT REFERENCES taxonomy_versions(version),
                    role_id TEXT NOT NULL,
                    role_name TEXT NOT NULL,
                    skill_id TEXT NOT NULL,
                    skill_name TEXT NOT NULL,
                    profile_scope TEXT NOT NULL,
                    region_code TEXT,
                    change_type TEXT NOT NULL CHECK(change_type IN ('increase_priority','decrease_priority','add_requirement','retire_requirement')),
                    current_required_proficiency INTEGER,
                    proposed_required_proficiency INTEGER,
                    impact_level TEXT NOT NULL CHECK(impact_level IN ('low','high')),
                    status TEXT NOT NULL CHECK(status IN ('draft','review','approved','rejected')),
                    observed_signal TEXT NOT NULL,
                    signal_confidence REAL NOT NULL,
                    rationale TEXT NOT NULL,
                    created_by TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    decided_at TEXT,
                    decision_rationale TEXT,
                    resulting_version TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_change_proposals_status ON change_proposals(status,created_at DESC);

                CREATE TABLE IF NOT EXISTS taxonomy_approvals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    proposal_id TEXT NOT NULL REFERENCES change_proposals(id),
                    actor_id TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
                    rationale TEXT NOT NULL,
                    decided_at TEXT NOT NULL,
                    resulting_version TEXT
                );

                CREATE TABLE IF NOT EXISTS taxonomy_impact_notifications (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    pathway_id TEXT NOT NULL,
                    target_role TEXT NOT NULL,
                    from_version TEXT NOT NULL,
                    to_version TEXT NOT NULL,
                    proposal_id TEXT NOT NULL,
                    explanation TEXT NOT NULL,
                    preview_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('pending','kept_current','recalculation_drafted','dismissed')),
                    created_at TEXT NOT NULL,
                    decided_at TEXT,
                    draft_pathway_id TEXT,
                    UNIQUE(student_id,pathway_id,to_version)
                );
                CREATE INDEX IF NOT EXISTS idx_taxonomy_impact_owner ON taxonomy_impact_notifications(student_id,status,created_at DESC);

                CREATE TABLE IF NOT EXISTS taxonomy_audit (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    actor_id TEXT NOT NULL,
                    actor_role TEXT NOT NULL,
                    action TEXT NOT NULL,
                    subject_id TEXT NOT NULL,
                    detail TEXT NOT NULL DEFAULT '',
                    occurred_at TEXT NOT NULL
                );
                """
            )
            columns = {row[1] for row in db.execute("PRAGMA table_info(change_proposals)").fetchall()}
            if "candidate_version" not in columns:
                db.execute("ALTER TABLE change_proposals ADD COLUMN candidate_version TEXT REFERENCES taxonomy_versions(version)")
            db.commit()

    def _snapshot_from_career_tables(self, db: sqlite3.Connection, version: str) -> dict:
        roles = []
        for role in db.execute("SELECT * FROM career_roles WHERE version=? ORDER BY name", (version,)).fetchall():
            deps: dict[str, list[str]] = {}
            for dep in db.execute("SELECT * FROM skill_dependencies WHERE role_id=? AND role_version=?", (role["id"], version)).fetchall():
                deps.setdefault(dep["skill_id"], []).append(dep["prerequisite_skill_id"])
            skills = []
            for row in db.execute(
                """SELECT rs.*,s.name FROM role_skills rs JOIN skills s ON s.id=rs.skill_id AND s.version=rs.skill_version
                WHERE rs.role_id=? AND rs.role_version=? ORDER BY rs.skill_order""", (role["id"], version)
            ).fetchall():
                skills.append({
                    "skill_id": row["skill_id"], "name": row["name"], "required_proficiency": int(row["required_proficiency"]),
                    "estimated_minutes": int(row["estimated_minutes"]), "prerequisites": sorted(deps.get(row["skill_id"], [])),
                    "recommended_evidence": json.loads(row["evidence_json"]), "skill_order": int(row["skill_order"]),
                })
            roles.append({
                "id": role["id"], "name": role["name"], "level": role["level"], "description": role["description"],
                "quality_status": role["quality_status"], "skills": skills,
            })
        return {"version": version, "roles": roles}

    def _bootstrap_baseline(self) -> None:
        with self._lock, self._connect() as db:
            existing = db.execute("SELECT 1 FROM taxonomy_versions WHERE version=?", (TAXONOMY_VERSION,)).fetchone()
            if existing:
                return
            table_exists = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='career_roles'").fetchone()
            if not table_exists:
                return
            roles_exist = db.execute("SELECT 1 FROM career_roles WHERE version=? LIMIT 1", (TAXONOMY_VERSION,)).fetchone()
            if not roles_exist:
                return
            now = datetime.now(timezone.utc).isoformat()
            snapshot = self._snapshot_from_career_tables(db, TAXONOMY_VERSION)
            db.execute(
                """INSERT INTO taxonomy_versions(version,status,profile_scope,region_code,parent_version,snapshot_json,methodology_version,change_summary,created_by,created_at,approved_by,approved_at,is_default)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)""",
                (TAXONOMY_VERSION,"approved","international",None,None,json.dumps(snapshot,sort_keys=True),"doc-f34-signal-v1","Baseline DOC-F29 approved taxonomy.","system",now,"system",now),
            )
            db.commit()

    def active_version(self, profile_scope: str = "international", region_code: str | None = None):
        with self._connect() as db:
            if profile_scope == "international":
                return db.execute("SELECT * FROM taxonomy_versions WHERE profile_scope='international' AND status='approved' AND is_default=1 LIMIT 1").fetchone()
            return db.execute("SELECT * FROM taxonomy_versions WHERE profile_scope='regional' AND region_code=? AND status='approved' ORDER BY approved_at DESC LIMIT 1", (region_code,)).fetchone()

    def version(self, version: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM taxonomy_versions WHERE version=?", (version,)).fetchone()

    def list_versions(self, profile_scope: str | None = None, region_code: str | None = None):
        with self._connect() as db:
            clauses, params = [], []
            if profile_scope:
                clauses.append("profile_scope=?"); params.append(profile_scope)
            if region_code:
                clauses.append("region_code=?"); params.append(region_code)
            where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
            return db.execute(f"SELECT * FROM taxonomy_versions {where} ORDER BY created_at DESC", tuple(params)).fetchall()

    def upsert_source(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO market_sources(id,name,source_type,canonical_url,licensing_policy,trust_score,status,bias_review_status,regions_json,retention_days,max_age_days,created_at,updated_at)
                VALUES (:id,:name,:source_type,:canonical_url,:licensing_policy,:trust_score,:status,:bias_review_status,:regions_json,:retention_days,:max_age_days,:created_at,:updated_at)
                ON CONFLICT(id) DO UPDATE SET name=excluded.name,source_type=excluded.source_type,canonical_url=excluded.canonical_url,licensing_policy=excluded.licensing_policy,trust_score=excluded.trust_score,status=excluded.status,bias_review_status=excluded.bias_review_status,regions_json=excluded.regions_json,retention_days=excluded.retention_days,max_age_days=excluded.max_age_days,updated_at=excluded.updated_at""",
                values,
            ); db.commit()
        return self.source(values["id"])

    def source(self, source_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM market_sources WHERE id=?", (source_id,)).fetchone()

    def sources(self):
        with self._connect() as db:
            return db.execute("SELECT * FROM market_sources ORDER BY name").fetchall()

    def purge_expired_observations(self, now_iso: str) -> int:
        with self._lock, self._connect() as db:
            cur = db.execute("DELETE FROM market_observations WHERE retained_until<=?", (now_iso,))
            db.commit()
            return cur.rowcount

    def insert_observation(self, values: dict) -> bool:
        with self._lock, self._connect() as db:
            try:
                db.execute("""INSERT INTO market_observations(id,source_id,role_id,skill_id,profile_scope,region_code,period_start,period_end,observed_at,sample_size,skill_share,methodology,provenance_url,content_hash,expires_at,retained_until,ingested_at)
                    VALUES (:id,:source_id,:role_id,:skill_id,:profile_scope,:region_code,:period_start,:period_end,:observed_at,:sample_size,:skill_share,:methodology,:provenance_url,:content_hash,:expires_at,:retained_until,:ingested_at)""", values)
                db.commit(); return True
            except sqlite3.IntegrityError as exc:
                if "content_hash" in str(exc) or "UNIQUE constraint" in str(exc): return False
                raise

    def observations(self, role_id: str, skill_id: str, profile_scope: str, region_code: str | None, now_iso: str):
        with self._connect() as db:
            if profile_scope == "international":
                return db.execute("""SELECT o.*,s.trust_score,s.name AS source_name,s.status AS source_status,s.bias_review_status
                    FROM market_observations o JOIN market_sources s ON s.id=o.source_id
                    WHERE o.role_id=? AND o.skill_id=? AND o.profile_scope='international' AND o.region_code IS NULL AND o.expires_at>? ORDER BY o.period_end""", (role_id,skill_id,now_iso)).fetchall()
            return db.execute("""SELECT o.*,s.trust_score,s.name AS source_name,s.status AS source_status,s.bias_review_status
                FROM market_observations o JOIN market_sources s ON s.id=o.source_id
                WHERE o.role_id=? AND o.skill_id=? AND o.profile_scope='regional' AND o.region_code=? AND o.expires_at>? ORDER BY o.period_end""", (role_id,skill_id,region_code,now_iso)).fetchall()

    def observation_rows_by_ids(self, observation_ids: list[str]):
        if not observation_ids:
            return []
        placeholders = ",".join("?" for _ in observation_ids)
        with self._connect() as db:
            return db.execute(f"SELECT o.*,s.name AS source_name,s.source_type AS source_type FROM market_observations o JOIN market_sources s ON s.id=o.source_id WHERE o.id IN ({placeholders}) ORDER BY o.period_end,o.source_id", tuple(observation_ids)).fetchall()

    def create_signal(self, values: dict):
        with self._connect() as db:
            db.execute("""INSERT INTO skill_signals(id,role_id,skill_id,profile_scope,region_code,label,delta,recent_share,prior_share,sample_size,source_count,confidence,recency_days,methodology_version,methodology,source_ids_json,observation_ids_json,publication_eligible,limitations_json,created_at,expires_at)
                VALUES (:id,:role_id,:skill_id,:profile_scope,:region_code,:label,:delta,:recent_share,:prior_share,:sample_size,:source_count,:confidence,:recency_days,:methodology_version,:methodology,:source_ids_json,:observation_ids_json,:publication_eligible,:limitations_json,:created_at,:expires_at)""", values); db.commit()
        return self.signal(values["id"])

    def signal(self, signal_id: str):
        with self._connect() as db: return db.execute("SELECT * FROM skill_signals WHERE id=?", (signal_id,)).fetchone()

    def list_signals(self, profile_scope: str | None = None, region_code: str | None = None):
        with self._connect() as db:
            if profile_scope == "regional":
                return db.execute("SELECT * FROM skill_signals WHERE profile_scope='regional' AND region_code=? ORDER BY created_at DESC", (region_code,)).fetchall()
            if profile_scope == "international":
                return db.execute("SELECT * FROM skill_signals WHERE profile_scope='international' ORDER BY created_at DESC").fetchall()
            return db.execute("SELECT * FROM skill_signals ORDER BY created_at DESC").fetchall()

    def create_proposal_with_candidate(self, values: dict, candidate: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO taxonomy_versions(version,status,profile_scope,region_code,parent_version,snapshot_json,methodology_version,change_summary,created_by,created_at,approved_by,approved_at,retired_at,is_default)
            VALUES (:version,:status,:profile_scope,:region_code,:parent_version,:snapshot_json,:methodology_version,:change_summary,:created_by,:created_at,:approved_by,:approved_at,:retired_at,:is_default)""", candidate)
            db.execute("""INSERT INTO change_proposals(id,signal_id,base_version,candidate_version,role_id,role_name,skill_id,skill_name,profile_scope,region_code,change_type,current_required_proficiency,proposed_required_proficiency,impact_level,status,observed_signal,signal_confidence,rationale,created_by,created_at,decided_at,decision_rationale,resulting_version)
            VALUES (:id,:signal_id,:base_version,:candidate_version,:role_id,:role_name,:skill_id,:skill_name,:profile_scope,:region_code,:change_type,:current_required_proficiency,:proposed_required_proficiency,:impact_level,:status,:observed_signal,:signal_confidence,:rationale,:created_by,:created_at,:decided_at,:decision_rationale,:resulting_version)""", values)
            db.commit()
        return self.proposal(values["id"])

    def create_proposal(self, values: dict):
        # Backward-compatible repository helper for migrations/tests. New service flows use
        # create_proposal_with_candidate so proposal + immutable draft snapshot are atomic.
        with self._connect() as db:
            db.execute("""INSERT INTO change_proposals(id,signal_id,base_version,candidate_version,role_id,role_name,skill_id,skill_name,profile_scope,region_code,change_type,current_required_proficiency,proposed_required_proficiency,impact_level,status,observed_signal,signal_confidence,rationale,created_by,created_at,decided_at,decision_rationale,resulting_version)
            VALUES (:id,:signal_id,:base_version,:candidate_version,:role_id,:role_name,:skill_id,:skill_name,:profile_scope,:region_code,:change_type,:current_required_proficiency,:proposed_required_proficiency,:impact_level,:status,:observed_signal,:signal_confidence,:rationale,:created_by,:created_at,:decided_at,:decision_rationale,:resulting_version)""", values); db.commit()
        return self.proposal(values["id"])

    def proposal(self, proposal_id: str):
        with self._connect() as db: return db.execute("SELECT * FROM change_proposals WHERE id=?", (proposal_id,)).fetchone()

    def proposals(self, status: str | None = None):
        with self._connect() as db:
            return db.execute("SELECT * FROM change_proposals" + (" WHERE status=?" if status else "") + " ORDER BY created_at DESC", (status,) if status else ()).fetchall()

    def submit_proposal(self, proposal_id: str):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT candidate_version FROM change_proposals WHERE id=? AND status='draft'", (proposal_id,)).fetchone()
            if row:
                db.execute("UPDATE change_proposals SET status='review' WHERE id=? AND status='draft'", (proposal_id,))
                if row["candidate_version"]:
                    db.execute("UPDATE taxonomy_versions SET status='review' WHERE version=? AND status='draft'", (row["candidate_version"],))
            db.commit()
        return self.proposal(proposal_id)

    def record_decision(self, proposal_id: str, actor_id: str, actor_role: str, decision: str, rationale: str, at: str, resulting_version: str | None):
        status = "approved" if decision == "approve" else "rejected"
        with self._lock, self._connect() as db:
            db.execute("UPDATE change_proposals SET status=?,decided_at=?,decision_rationale=?,resulting_version=? WHERE id=?", (status,at,rationale,resulting_version,proposal_id))
            db.execute("INSERT INTO taxonomy_approvals(proposal_id,actor_id,actor_role,decision,rationale,decided_at,resulting_version) VALUES (?,?,?,?,?,?,?)", (proposal_id,actor_id,actor_role,decision,rationale,at,resulting_version))
            db.commit()
        return self.proposal(proposal_id)

    def approvals(self, proposal_id: str):
        with self._connect() as db: return db.execute("SELECT * FROM taxonomy_approvals WHERE proposal_id=? ORDER BY decided_at", (proposal_id,)).fetchall()

    def finalize_candidate_version(self, candidate_version: str, *, decision: str, reviewer_id: str, at: str, retire_version: str | None = None, is_default: bool = False) -> None:
        with self._lock, self._connect() as db:
            candidate = db.execute("SELECT status FROM taxonomy_versions WHERE version=?", (candidate_version,)).fetchone()
            if candidate is None or candidate["status"] != "review":
                raise sqlite3.IntegrityError("taxonomy candidate is not in review")
            if decision == "approve":
                if retire_version:
                    db.execute("UPDATE taxonomy_versions SET status='retired',is_default=0,retired_at=COALESCE(retired_at,?) WHERE version=? AND status='approved'", (at, retire_version))
                if is_default:
                    db.execute("UPDATE taxonomy_versions SET is_default=0 WHERE profile_scope='international' AND is_default=1")
                db.execute("UPDATE taxonomy_versions SET status='approved',approved_by=?,approved_at=?,retired_at=NULL,is_default=? WHERE version=? AND status='review'", (reviewer_id, at, int(is_default), candidate_version))
            else:
                db.execute("UPDATE taxonomy_versions SET status='retired',is_default=0,retired_at=? WHERE version=? AND status='review'", (at, candidate_version))
            db.commit()

    def retire_version(self, version: str, at: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE taxonomy_versions SET status='retired',is_default=0,retired_at=COALESCE(retired_at,?) WHERE version=? AND status='approved'", (at, version))
            db.commit()

    def create_taxonomy_version(self, values: dict):
        with self._lock, self._connect() as db:
            if values.get("is_default"):
                db.execute("UPDATE taxonomy_versions SET is_default=0 WHERE profile_scope='international' AND is_default=1")
            db.execute("""INSERT INTO taxonomy_versions(version,status,profile_scope,region_code,parent_version,snapshot_json,methodology_version,change_summary,created_by,created_at,approved_by,approved_at,retired_at,is_default)
            VALUES (:version,:status,:profile_scope,:region_code,:parent_version,:snapshot_json,:methodology_version,:change_summary,:created_by,:created_at,:approved_by,:approved_at,:retired_at,:is_default)""", values)
            db.commit()
        return self.version(values["version"])

    def publish_snapshot_to_career_tables(self, version: str, snapshot: dict, parent_version: str, published_at: str):
        with self._lock, self._connect() as db:
            for role in snapshot["roles"]:
                db.execute("INSERT OR REPLACE INTO career_roles(id,version,name,level,description,quality_status,published_at) VALUES (?,?,?,?,?,'approved',?)", (role["id"],version,role["name"],role["level"],role["description"],published_at))
                for order, skill in enumerate(role["skills"], start=1):
                    db.execute("INSERT OR REPLACE INTO skills(id,version,name,description) VALUES (?,?,?,?)", (skill["skill_id"],version,skill["name"],f"Approved {role['name']} skill requirement."))
                    db.execute("""INSERT OR REPLACE INTO role_skills(role_id,role_version,skill_id,skill_version,required_proficiency,estimated_minutes,evidence_json,skill_order)
                        VALUES (?,?,?,?,?,?,?,?)""", (role["id"],version,skill["skill_id"],version,skill["required_proficiency"],skill["estimated_minutes"],json.dumps(skill.get("recommended_evidence",[])),order))
                    for prereq in skill.get("prerequisites",[]):
                        db.execute("INSERT OR REPLACE INTO skill_dependencies(role_id,role_version,skill_id,prerequisite_skill_id) VALUES (?,?,?,?)", (role["id"],version,skill["skill_id"],prereq))
            for resource in db.execute("SELECT * FROM learning_resources WHERE version=?", (parent_version,)).fetchall():
                db.execute("""INSERT OR REPLACE INTO learning_resources(id,version,title,source,source_url,resource_type,quality_score,cost_type,price_usd,language,format,estimated_minutes,active)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (resource["id"],version,resource["title"],resource["source"],resource["source_url"],resource["resource_type"],resource["quality_score"],resource["cost_type"],resource["price_usd"],resource["language"],resource["format"],resource["estimated_minutes"],resource["active"]))
            for rel in db.execute("SELECT * FROM resource_skills WHERE resource_version=?", (parent_version,)).fetchall():
                db.execute("INSERT OR REPLACE INTO resource_skills(resource_id,resource_version,skill_id) VALUES (?,?,?)", (rel["resource_id"],version,rel["skill_id"]))
            db.commit()

    def active_pathways_for_role(self, role_name: str, source_version: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM pathways WHERE status='active' AND target_role=? AND definition_version=?", (role_name,source_version)).fetchall()

    def insert_impact(self, values: dict):
        with self._connect() as db:
            db.execute("""INSERT OR IGNORE INTO taxonomy_impact_notifications(id,student_id,pathway_id,target_role,from_version,to_version,proposal_id,explanation,preview_json,status,created_at,decided_at,draft_pathway_id)
                VALUES (:id,:student_id,:pathway_id,:target_role,:from_version,:to_version,:proposal_id,:explanation,:preview_json,:status,:created_at,:decided_at,:draft_pathway_id)""", values); db.commit()

    def impacts(self, student_id: str):
        with self._connect() as db: return db.execute("SELECT * FROM taxonomy_impact_notifications WHERE student_id=? ORDER BY created_at DESC", (student_id,)).fetchall()

    def impact(self, impact_id: str):
        with self._connect() as db: return db.execute("SELECT * FROM taxonomy_impact_notifications WHERE id=?", (impact_id,)).fetchone()

    def decide_impact(self, impact_id: str, student_id: str, status: str, at: str, draft_pathway_id: str | None):
        with self._connect() as db:
            cur=db.execute("UPDATE taxonomy_impact_notifications SET status=?,decided_at=?,draft_pathway_id=? WHERE id=? AND student_id=? AND status='pending'", (status,at,draft_pathway_id,impact_id,student_id)); db.commit()
            return cur.rowcount

    def audit(self, actor_id: str, actor_role: str, action: str, subject_id: str, detail: str, at: str):
        with self._connect() as db:
            db.execute("INSERT INTO taxonomy_audit(actor_id,actor_role,action,subject_id,detail,occurred_at) VALUES (?,?,?,?,?,?)", (actor_id,actor_role,action,subject_id,detail[:1200],at)); db.commit()
