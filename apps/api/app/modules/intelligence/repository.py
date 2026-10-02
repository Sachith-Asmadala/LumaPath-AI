from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock
from typing import Any

from .definitions import APPROVED_SOURCES


class IntelligenceRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()
        self.seed_approved_sources()

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
                CREATE TABLE IF NOT EXISTS content_sources (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    base_url TEXT NOT NULL,
                    allowed_domains_json TEXT NOT NULL,
                    categories_json TEXT NOT NULL,
                    source_type TEXT NOT NULL,
                    trust_score INTEGER NOT NULL CHECK(trust_score BETWEEN 0 AND 100),
                    trust_status TEXT NOT NULL CHECK(trust_status IN ('approved','review','blocked')),
                    storage_policy TEXT NOT NULL CHECK(storage_policy IN ('metadata_only','metadata_excerpt')),
                    max_excerpt_chars INTEGER NOT NULL,
                    max_age_days INTEGER NOT NULL,
                    terms_url TEXT NOT NULL,
                    last_success_at TEXT,
                    last_attempt_at TEXT,
                    last_error_code TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS content_ingestion_runs (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES content_sources(id),
                    ingestion_version TEXT NOT NULL,
                    started_at TEXT NOT NULL,
                    completed_at TEXT,
                    status TEXT NOT NULL CHECK(status IN ('running','succeeded','failed')),
                    candidate_count INTEGER NOT NULL DEFAULT 0,
                    accepted_count INTEGER NOT NULL DEFAULT 0,
                    quarantined_count INTEGER NOT NULL DEFAULT 0,
                    duplicate_count INTEGER NOT NULL DEFAULT 0,
                    rejected_count INTEGER NOT NULL DEFAULT 0,
                    error_code TEXT,
                    error_message TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_content_runs_source ON content_ingestion_runs(source_id, started_at DESC);

                CREATE TABLE IF NOT EXISTS articles (
                    id TEXT PRIMARY KEY,
                    source_id TEXT NOT NULL REFERENCES content_sources(id),
                    category TEXT NOT NULL,
                    title TEXT NOT NULL,
                    excerpt TEXT NOT NULL DEFAULT '',
                    canonical_url TEXT NOT NULL UNIQUE,
                    published_at TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    topics_json TEXT NOT NULL DEFAULT '[]',
                    target_roles_json TEXT NOT NULL DEFAULT '[]',
                    difficulty TEXT NOT NULL,
                    reading_minutes INTEGER NOT NULL,
                    content_hash TEXT NOT NULL,
                    trust_status TEXT NOT NULL CHECK(trust_status IN ('active','quarantined','expired')),
                    quarantine_reason TEXT,
                    ingestion_run_id TEXT REFERENCES content_ingestion_runs(id),
                    ingested_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_articles_feed ON articles(trust_status, expires_at, published_at DESC);
                CREATE INDEX IF NOT EXISTS idx_articles_source ON articles(source_id, published_at DESC);
                CREATE INDEX IF NOT EXISTS idx_articles_hash ON articles(content_hash);

                CREATE TABLE IF NOT EXISTS article_skills (
                    article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
                    skill_id TEXT NOT NULL,
                    relationship TEXT NOT NULL CHECK(relationship IN ('primary','related')),
                    PRIMARY KEY(article_id, skill_id)
                );
                CREATE INDEX IF NOT EXISTS idx_article_skills_skill ON article_skills(skill_id, article_id);

                CREATE TABLE IF NOT EXISTS feed_recommendations (
                    id TEXT PRIMARY KEY,
                    student_id TEXT NOT NULL,
                    article_id TEXT NOT NULL REFERENCES articles(id),
                    feed_date TEXT NOT NULL,
                    generation_id TEXT NOT NULL,
                    rank_position INTEGER NOT NULL,
                    score REAL NOT NULL,
                    active_pathway_id TEXT NOT NULL,
                    pathway_version INTEGER NOT NULL,
                    target_role TEXT NOT NULL,
                    active_step_id TEXT,
                    active_skill_id TEXT,
                    ranking_version TEXT NOT NULL,
                    explanation_version TEXT NOT NULL,
                    explanation TEXT NOT NULL,
                    factors_json TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    invalidated_at TEXT,
                    UNIQUE(student_id, feed_date, generation_id, article_id)
                );
                CREATE INDEX IF NOT EXISTS idx_feed_owner_day ON feed_recommendations(student_id, feed_date, rank_position);

                CREATE TABLE IF NOT EXISTS article_interactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    article_id TEXT NOT NULL REFERENCES articles(id),
                    action TEXT NOT NULL CHECK(action IN ('save','unsave','dismiss','report','add_to_plan')),
                    reason TEXT,
                    recommendation_id TEXT,
                    ranking_version TEXT,
                    explanation_version TEXT,
                    idempotency_key TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    occurred_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_article_interactions_owner ON article_interactions(student_id, occurred_at DESC);
                CREATE INDEX IF NOT EXISTS idx_article_interactions_article ON article_interactions(article_id, occurred_at DESC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_article_plan_idempotency
                    ON article_interactions(student_id, idempotency_key)
                    WHERE action='add_to_plan' AND idempotency_key IS NOT NULL;
                """
            )
            columns = {row[1] for row in db.execute("PRAGMA table_info(feed_recommendations)").fetchall()}
            if "invalidated_at" not in columns:
                db.execute("ALTER TABLE feed_recommendations ADD COLUMN invalidated_at TEXT")
            if "generation_id" not in columns:
                db.execute("ALTER TABLE feed_recommendations ADD COLUMN generation_id TEXT NOT NULL DEFAULT 'legacy'")

    def seed_approved_sources(self) -> None:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        with self._lock, self._connect() as db:
            for source in APPROVED_SOURCES:
                db.execute(
                    """INSERT INTO content_sources
                    (id,name,base_url,allowed_domains_json,categories_json,source_type,trust_score,trust_status,storage_policy,max_excerpt_chars,max_age_days,terms_url,created_at,updated_at)
                    VALUES (?,?,?,?,?,?,?,'approved',?,?,?,?,?,?)
                    ON CONFLICT(id) DO UPDATE SET
                      name=excluded.name,base_url=excluded.base_url,allowed_domains_json=excluded.allowed_domains_json,
                      categories_json=excluded.categories_json,source_type=excluded.source_type,trust_score=excluded.trust_score,
                      storage_policy=excluded.storage_policy,max_excerpt_chars=excluded.max_excerpt_chars,
                      max_age_days=excluded.max_age_days,terms_url=excluded.terms_url,updated_at=excluded.updated_at""",
                    (
                        source.id, source.name, source.base_url, json.dumps(source.allowed_domains), json.dumps(source.categories),
                        source.source_type, source.trust_score, source.storage_policy, source.max_excerpt_chars,
                        source.max_age_days, source.terms_url, now, now,
                    ),
                )
            db.commit()

    def source(self, source_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute("SELECT * FROM content_sources WHERE id=?", (source_id,)).fetchone()

    def sources(self) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM content_sources ORDER BY name").fetchall()

    def update_source_status(self, source_id: str, trust_status: str, updated_at: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE content_sources SET trust_status=?,updated_at=? WHERE id=?", (trust_status, updated_at, source_id))
            db.commit()

    def start_ingestion_run(self, values: dict[str, Any]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                "INSERT INTO content_ingestion_runs(id,source_id,ingestion_version,started_at,status,candidate_count) VALUES(:id,:source_id,:ingestion_version,:started_at,'running',:candidate_count)",
                values,
            )
            db.execute("UPDATE content_sources SET last_attempt_at=?,updated_at=? WHERE id=?", (values["started_at"], values["started_at"], values["source_id"]))
            db.commit()

    def finish_ingestion_run(self, run_id: str, source_id: str, values: dict[str, Any]) -> None:
        with self._lock, self._connect() as db:
            db.execute(
                """UPDATE content_ingestion_runs SET completed_at=:completed_at,status=:status,accepted_count=:accepted_count,
                   quarantined_count=:quarantined_count,duplicate_count=:duplicate_count,rejected_count=:rejected_count,
                   error_code=:error_code,error_message=:error_message WHERE id=:run_id""",
                {**values, "run_id": run_id},
            )
            if values["status"] == "succeeded":
                db.execute("UPDATE content_sources SET last_success_at=?,last_error_code=NULL,updated_at=? WHERE id=?", (values["completed_at"], values["completed_at"], source_id))
            else:
                db.execute("UPDATE content_sources SET last_error_code=?,updated_at=? WHERE id=?", (values["error_code"], values["completed_at"], source_id))
            db.commit()

    def latest_ingestion_runs(self) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                """SELECT r.* FROM content_ingestion_runs r
                JOIN (SELECT source_id,MAX(started_at) AS started_at FROM content_ingestion_runs GROUP BY source_id) latest
                  ON latest.source_id=r.source_id AND latest.started_at=r.started_at
                ORDER BY r.started_at DESC"""
            ).fetchall()

    def duplicate_article(self, canonical_url: str, content_hash: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM articles WHERE canonical_url=? OR content_hash=? ORDER BY ingested_at DESC LIMIT 1",
                (canonical_url, content_hash),
            ).fetchone()

    def insert_article(self, values: dict[str, Any], skills: list[tuple[str, str]]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO articles
                (id,source_id,category,title,excerpt,canonical_url,published_at,expires_at,topics_json,target_roles_json,difficulty,
                 reading_minutes,content_hash,trust_status,quarantine_reason,ingestion_run_id,ingested_at,updated_at)
                VALUES (:id,:source_id,:category,:title,:excerpt,:canonical_url,:published_at,:expires_at,:topics_json,:target_roles_json,:difficulty,
                 :reading_minutes,:content_hash,:trust_status,:quarantine_reason,:ingestion_run_id,:ingested_at,:updated_at)""",
                values,
            )
            db.executemany(
                "INSERT INTO article_skills(article_id,skill_id,relationship) VALUES (?,?,?)",
                [(values["id"], skill_id, relationship) for skill_id, relationship in skills],
            )
            db.commit()
            return db.execute("SELECT * FROM articles WHERE id=?", (values["id"],)).fetchone()

    def article(self, article_id: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                """SELECT a.*,s.name AS source_name,s.source_type,s.trust_score,s.trust_status AS source_trust_status,
                          s.terms_url,s.allowed_domains_json,s.categories_json,s.max_age_days,s.storage_policy,s.max_excerpt_chars
                   FROM articles a JOIN content_sources s ON s.id=a.source_id WHERE a.id=?""",
                (article_id,),
            ).fetchone()

    def article_skills(self, article_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute("SELECT * FROM article_skills WHERE article_id=? ORDER BY relationship,skill_id", (article_id,)).fetchall()

    def eligible_articles(self, now_iso: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                """SELECT a.*,s.name AS source_name,s.source_type,s.trust_score,s.terms_url
                   FROM articles a JOIN content_sources s ON s.id=a.source_id
                   WHERE a.trust_status='active' AND s.trust_status='approved'
                     AND a.published_at<=? AND a.expires_at>?
                   ORDER BY a.published_at DESC,a.id""",
                (now_iso, now_iso),
            ).fetchall()

    def saved_or_planned_articles(self, student_id: str, *, planned: bool, now_iso: str) -> list[sqlite3.Row]:
        action = "add_to_plan" if planned else "save"
        opposite = None if planned else "unsave"
        with self._connect() as db:
            sql = """SELECT a.*,s.name AS source_name,s.source_type,s.trust_score,s.trust_status AS source_trust_status,s.terms_url
                     FROM articles a JOIN content_sources s ON s.id=a.source_id
                     WHERE a.trust_status='active' AND s.trust_status='approved'
                       AND EXISTS(SELECT 1 FROM article_interactions i WHERE i.student_id=? AND i.article_id=a.id AND i.action=?)"""
            args: list[Any] = [student_id, action]
            if opposite:
                sql += " AND (SELECT action FROM article_interactions latest WHERE latest.student_id=? AND latest.article_id=a.id AND latest.action IN ('save','unsave') ORDER BY latest.occurred_at DESC,latest.id DESC LIMIT 1)='save'"
                args.append(student_id)
            sql += " ORDER BY a.published_at DESC,a.id"
            return db.execute(sql, tuple(args)).fetchall()

    def interaction_rows(self, student_id: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            return db.execute(
                """SELECT i.*,a.category,a.source_id,a.topics_json FROM article_interactions i
                   JOIN articles a ON a.id=i.article_id WHERE i.student_id=? ORDER BY i.occurred_at,i.id""",
                (student_id,),
            ).fetchall()

    def latest_interaction_state(self, student_id: str, article_id: str) -> dict[str, bool]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT action FROM article_interactions WHERE student_id=? AND article_id=? ORDER BY occurred_at,id",
                (student_id, article_id),
            ).fetchall()
        saved = False
        dismissed = False
        reported = False
        planned = False
        for row in rows:
            if row["action"] == "save": saved = True
            elif row["action"] == "unsave": saved = False
            elif row["action"] == "dismiss": dismissed = True
            elif row["action"] == "report": reported = True
            elif row["action"] == "add_to_plan": planned = True
        return {"saved": saved, "dismissed": dismissed, "reported": reported, "planned": planned}

    def record_interaction(self, values: dict[str, Any]) -> sqlite3.Row:
        with self._lock, self._connect() as db:
            db.execute(
                """INSERT INTO article_interactions
                (student_id,article_id,action,reason,recommendation_id,ranking_version,explanation_version,idempotency_key,metadata_json,occurred_at)
                VALUES (:student_id,:article_id,:action,:reason,:recommendation_id,:ranking_version,:explanation_version,:idempotency_key,:metadata_json,:occurred_at)""",
                values,
            )
            db.commit()
            return db.execute("SELECT * FROM article_interactions WHERE id=last_insert_rowid()").fetchone()

    def planned_interaction_by_key(self, student_id: str, idempotency_key: str) -> sqlite3.Row | None:
        with self._connect() as db:
            return db.execute(
                "SELECT * FROM article_interactions WHERE student_id=? AND action='add_to_plan' AND idempotency_key=? LIMIT 1",
                (student_id, idempotency_key),
            ).fetchone()

    def quarantine_article(self, article_id: str, reason: str, updated_at: str) -> None:
        with self._lock, self._connect() as db:
            db.execute("UPDATE articles SET trust_status='quarantined',quarantine_reason=?,updated_at=? WHERE id=?", (reason[:300], updated_at, article_id))
            db.commit()

    def recommendation(self, student_id: str, article_id: str, feed_date: str | None = None) -> sqlite3.Row | None:
        with self._connect() as db:
            if feed_date:
                return db.execute(
                    "SELECT * FROM feed_recommendations WHERE student_id=? AND article_id=? AND feed_date=? LIMIT 1",
                    (student_id, article_id, feed_date),
                ).fetchone()
            return db.execute(
                "SELECT * FROM feed_recommendations WHERE student_id=? AND article_id=? ORDER BY feed_date DESC,rank_position LIMIT 1",
                (student_id, article_id),
            ).fetchone()

    def recommendations(self, student_id: str, feed_date: str) -> list[sqlite3.Row]:
        with self._connect() as db:
            generation = db.execute(
                "SELECT generation_id FROM feed_recommendations WHERE student_id=? AND feed_date=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
                (student_id, feed_date),
            ).fetchone()
            if generation is None:
                return []
            return db.execute(
                "SELECT * FROM feed_recommendations WHERE student_id=? AND feed_date=? AND generation_id=? ORDER BY rank_position",
                (student_id, feed_date, generation["generation_id"]),
            ).fetchall()

    def append_recommendations(self, rows: list[dict[str, Any]]) -> None:
        if not rows:
            return
        with self._lock, self._connect() as db:
            db.executemany(
                """INSERT INTO feed_recommendations
                (id,student_id,article_id,feed_date,generation_id,rank_position,score,active_pathway_id,pathway_version,target_role,active_step_id,
                 active_skill_id,ranking_version,explanation_version,explanation,factors_json,created_at)
                VALUES (:id,:student_id,:article_id,:feed_date,:generation_id,:rank_position,:score,:active_pathway_id,:pathway_version,:target_role,:active_step_id,
                 :active_skill_id,:ranking_version,:explanation_version,:explanation,:factors_json,:created_at)""",
                rows,
            )
            db.commit()

    def invalidate_recommendations(self, student_id: str, feed_date: str, invalidated_at: str | None = None) -> None:
        with self._lock, self._connect() as db:
            generation = db.execute(
                "SELECT generation_id FROM feed_recommendations WHERE student_id=? AND feed_date=? ORDER BY created_at DESC,rowid DESC LIMIT 1",
                (student_id, feed_date),
            ).fetchone()
            if generation is None:
                return
            db.execute(
                "UPDATE feed_recommendations SET invalidated_at=COALESCE(invalidated_at,?) WHERE student_id=? AND feed_date=? AND generation_id=?",
                (invalidated_at or "invalidated", student_id, feed_date, generation["generation_id"]),
            )
            db.commit()

    def count_rows(self, table: str) -> int:
        allowed = {"content_sources", "articles", "article_skills", "feed_recommendations", "article_interactions", "content_ingestion_runs"}
        if table not in allowed:
            raise ValueError("Unsupported table")
        with self._connect() as db:
            return int(db.execute(f"SELECT COUNT(*) AS n FROM {table}").fetchone()["n"])
