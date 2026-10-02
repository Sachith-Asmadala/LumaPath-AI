from __future__ import annotations

from contextlib import contextmanager
from pathlib import Path
import sqlite3

from .definitions import PLAN_NAMES, PLAN_RULES


class SubscriptionRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, name TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS subscriptions (
                    subject_id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES plans(id),
                    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
                    source TEXT NOT NULL, updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS plan_entitlements (
                    plan_id TEXT NOT NULL REFERENCES plans(id), feature TEXT NOT NULL,
                    quota_limit INTEGER, period TEXT NOT NULL,
                    PRIMARY KEY(plan_id, feature)
                );
                CREATE TABLE IF NOT EXISTS usage_counters (
                    subject_id TEXT NOT NULL, feature TEXT NOT NULL, period_key TEXT NOT NULL,
                    used INTEGER NOT NULL DEFAULT 0 CHECK(used >= 0),
                    PRIMARY KEY(subject_id, feature, period_key)
                );
                CREATE TABLE IF NOT EXISTS subscription_events (
                    id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, kind TEXT NOT NULL,
                    feature TEXT, period_key TEXT, amount INTEGER NOT NULL DEFAULT 0,
                    plan_id TEXT NOT NULL, occurred_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS subscription_events_subject ON subscription_events(subject_id, occurred_at);
                CREATE TABLE IF NOT EXISTS subscription_resources (
                    subject_id TEXT NOT NULL, feature TEXT NOT NULL, period_key TEXT NOT NULL,
                    resource_id TEXT NOT NULL, PRIMARY KEY(subject_id, feature, period_key, resource_id)
                );
            """)
            for plan, name in PLAN_NAMES.items():
                db.execute("INSERT INTO plans(id,name) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name", (plan, name))
                for feature, (limit, period) in PLAN_RULES[plan].items():
                    db.execute("INSERT INTO plan_entitlements VALUES (?,?,?,?) ON CONFLICT(plan_id,feature) DO UPDATE SET quota_limit=excluded.quota_limit,period=excluded.period", (plan, feature, limit, period))

            # Preserve existing saved scenarios during migration; no quota reset on upgrade.
            if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='simulation_scenarios'").fetchone():
                db.execute("INSERT OR IGNORE INTO subscription_resources SELECT student_id,'saved_scenarios','lifetime',id FROM simulation_scenarios WHERE status='saved'")

    @contextmanager
    def connect(self, *, write=False):
        db = sqlite3.connect(self.database_path, timeout=15, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys=ON")
        try:
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()

