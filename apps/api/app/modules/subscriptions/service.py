from __future__ import annotations

from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from uuid import uuid4

from fastapi import HTTPException

from ...core.config import settings
from .definitions import INSTITUTION_FEATURES, PLAN_NAMES, PLAN_RULES
from .repository import SubscriptionRepository


class EntitlementService:
    def __init__(self, repository: SubscriptionRepository, *, now=lambda: datetime.now(timezone.utc)):
        self.repository, self.now = repository, now

    def _plan(self, db, subject):
        row = db.execute("SELECT plan_id,status FROM subscriptions WHERE subject_id=?", (subject,)).fetchone()
        return row["plan_id"] if row and row["status"] == "active" else "free"

    def _rule(self, db, subject, feature):
        plan = self._plan(db, subject)
        row = db.execute("SELECT quota_limit,period FROM plan_entitlements WHERE plan_id=? AND feature=?", (plan, feature)).fetchone()
        if row is None:
            raise HTTPException(403, {"code": "UNKNOWN_ENTITLEMENT", "feature": feature, "upgrade_required": False})
        return plan, row["quota_limit"], row["period"]

    def _window(self, period):
        now = self.now().astimezone(timezone.utc)
        if period == "day":
            return now.strftime("%Y-%m-%d"), (now.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)).isoformat()
        if period == "month":
            next_month = (now.replace(day=28) + timedelta(days=4)).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
            return now.strftime("%Y-%m"), next_month.isoformat()
        return "lifetime", None

    @staticmethod
    def _blocked(feature, plan, limit, used, *, exhausted=False):
        raise HTTPException(403 if not exhausted else 429, {
            "code": "PLAN_LIMIT_REACHED" if exhausted else "PLAN_FEATURE_REQUIRED",
            "feature": feature, "plan": plan, "limit": limit, "used": used,
            "upgrade_required": plan == "free" or (feature in INSTITUTION_FEATURES and plan != "institution"),
            "required_plan": "institution" if feature in INSTITUTION_FEATURES else "pro",
        })

    def require(self, subject, feature, *, amount=None):
        with self.repository.connect() as db:
            plan, limit, _ = self._rule(db, subject, feature)
            if limit == 0:
                self._blocked(feature, plan, limit, 0)
            if amount is not None and limit is not None and amount > limit:
                self._blocked(feature, plan, limit, amount, exhausted=True)

    def _event(self, db, subject, kind, feature, key, amount, plan, event_id=None):
        db.execute("INSERT INTO subscription_events VALUES (?,?,?,?,?,?,?,?)", (event_id or uuid4().hex, subject, kind, feature, key, amount, plan, self.now().isoformat()))

    @contextmanager
    def meter(self, subject, feature):
        """Reserve atomically before work; failed synchronous requests are refunded.

        No transaction is held while a domain service writes to the same SQLite DB.
        Accepted asynchronous document work counts once, including its free retries.
        """
        with self.repository.connect(write=True) as db:
            plan, limit, period = self._rule(db, subject, feature)
            key, _ = self._window(period)
            row = db.execute("SELECT used FROM usage_counters WHERE subject_id=? AND feature=? AND period_key=?", (subject, feature, key)).fetchone()
            used = row["used"] if row else 0
            if limit is not None and used >= limit:
                self._blocked(feature, plan, limit, used, exhausted=True)
            db.execute("INSERT INTO usage_counters VALUES (?,?,?,1) ON CONFLICT(subject_id,feature,period_key) DO UPDATE SET used=used+1", (subject, feature, key))
            self._event(db, subject, "usage_reserved", feature, key, 1, plan)
        try:
            yield
        except BaseException:
            with self.repository.connect(write=True) as db:
                db.execute("UPDATE usage_counters SET used=MAX(0,used-1) WHERE subject_id=? AND feature=? AND period_key=?", (subject, feature, key))
                self._event(db, subject, "usage_refunded", feature, key, -1, plan)
            raise

    @contextmanager
    def resource(self, subject, feature, resource_id, *, period="stock"):
        """Idempotent atomic stock allocation; repeated saves never consume extra slots."""
        added = False
        key, _ = self._window(period)
        with self.repository.connect(write=True) as db:
            plan, limit, _ = self._rule(db, subject, feature)
            if limit == 0:
                self._blocked(feature, plan, 0, 0)
            existing = db.execute("SELECT 1 FROM subscription_resources WHERE subject_id=? AND feature=? AND period_key=? AND resource_id=?", (subject, feature, key, resource_id)).fetchone()
            if not existing:
                used = db.execute("SELECT COUNT(*) FROM subscription_resources WHERE subject_id=? AND feature=? AND period_key=?", (subject, feature, key)).fetchone()[0]
                if limit is not None and used >= limit:
                    self._blocked(feature, plan, limit, used, exhausted=True)
                db.execute("INSERT INTO subscription_resources VALUES (?,?,?,?)", (subject, feature, key, resource_id))
                added = True
                self._event(db, subject, "resource_reserved", feature, key, 1, plan)
        try:
            yield
        except BaseException:
            if added:
                self.release_resource(subject, feature, resource_id, key=key)
            raise

    def release_resource(self, subject, feature, resource_id, *, key="lifetime"):
        with self.repository.connect(write=True) as db:
            removed = db.execute("DELETE FROM subscription_resources WHERE subject_id=? AND feature=? AND period_key=? AND resource_id=?", (subject, feature, key, resource_id)).rowcount
            if removed:
                self._event(db, subject, "resource_released", feature, key, -1, self._plan(db, subject))

    def rename_resource(self, subject, feature, old_id, new_id):
        with self.repository.connect(write=True) as db:
            db.execute("UPDATE subscription_resources SET resource_id=? WHERE subject_id=? AND feature=? AND resource_id=?", (new_id, subject, feature, old_id))

    def feed_items(self, subject, items):
        """Stable daily grants prevent refresh/dismiss from revealing more free items."""
        admitted = []
        for item in items:
            try:
                with self.resource(subject, "intelligence_items", item.article_id, period="day"):
                    admitted.append(item)
            except HTTPException as exc:
                if not isinstance(exc.detail, dict) or exc.detail.get("code") != "PLAN_LIMIT_REACHED":
                    raise
        return admitted

    def set_demo_plan(self, subject, plan):
        if settings.environment not in {"development", "demo", "test"}:
            raise HTTPException(404, "Demo plan switching is unavailable.")
        with self.repository.connect(write=True) as db:
            db.execute("INSERT INTO subscriptions VALUES (?,?,'active','competition_demo',?) ON CONFLICT(subject_id) DO UPDATE SET plan_id=excluded.plan_id,status='active',source=excluded.source,updated_at=excluded.updated_at", (subject, plan, self.now().isoformat()))
            self._event(db, subject, "demo_plan_changed", None, None, 0, plan)
        return self.snapshot(subject)

    def snapshot(self, subject):
        with self.repository.connect() as db:
            plan = self._plan(db, subject)
            entitlements = {}
            for feature in PLAN_RULES[plan]:
                _, limit, period = self._rule(db, subject, feature)
                key, reset = self._window(period)
                if feature == "active_pathways" and db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pathways'").fetchone():
                    used = db.execute("SELECT COUNT(*) FROM pathways WHERE student_id=? AND status='active'", (subject,)).fetchone()[0]
                elif period == "stock" or feature == "intelligence_items":
                    used = db.execute("SELECT COUNT(*) FROM subscription_resources WHERE subject_id=? AND feature=? AND period_key=?", (subject, feature, key)).fetchone()[0]
                else:
                    row = db.execute("SELECT used FROM usage_counters WHERE subject_id=? AND feature=? AND period_key=?", (subject, feature, key)).fetchone()
                    used = row[0] if row else 0
                entitlements[feature] = {"limit": limit, "period": period, "used": used, "remaining": None if limit is None else max(0, limit-used), "enabled": limit != 0, "resets_at": reset}
            return {"plan": plan, "name": PLAN_NAMES[plan], "subject_id": subject, "entitlements": entitlements, "demo_switch_enabled": settings.environment in {"development", "demo", "test"}, "billing_connected": False, "period_timezone": "UTC"}


@lru_cache(maxsize=1)
def get_entitlements():
    return EntitlementService(SubscriptionRepository(settings.database_path))
