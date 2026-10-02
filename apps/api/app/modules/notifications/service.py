from __future__ import annotations

import json
from datetime import datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from .adapters import DeliveryAdapter, DisabledExternalAdapter, InAppAdapter
from .repository import NotificationRepository
from .schemas import (
    Channel, CandidateInput, CandidateSyncRequest, DEFAULT_CATEGORIES, InboxItemResponse, InboxResponse,
    NotificationPreferencesRequest, NotificationPreferencesResponse, NotificationType, RetryResponse, SyncResultResponse, Urgency,
)


TITLES = {
    NotificationType.DEADLINE: "Deadline approaching",
    NotificationType.RISK: "Plan risk needs attention",
    NotificationType.TOP_PRIORITY: "Your next priority is ready",
    NotificationType.MISSED_WORK: "Review missed work",
    NotificationType.STUDY_SESSION: "Study session reminder",
    NotificationType.APPLICATION_DATE: "Application reminder",
    NotificationType.ROADMAP_MILESTONE: "Roadmap milestone",
    NotificationType.CALENDAR_EVENT: "Calendar reminder",
}


class NotificationService:
    def __init__(self, repository: NotificationRepository, now=lambda: datetime.now(timezone.utc), *, push_adapter: DeliveryAdapter | None = None, email_adapter: DeliveryAdapter | None = None, max_attempts: int = 3):
        self.repository = repository
        self.now = now
        self.adapters: dict[str, DeliveryAdapter] = {
            Channel.IN_APP.value: InAppAdapter(),
            Channel.PUSH.value: push_adapter or DisabledExternalAdapter("push"),
            Channel.EMAIL.value: email_adapter or DisabledExternalAdapter("email"),
        }
        self.max_attempts = max_attempts

    def get_preferences(self, student_id: str) -> NotificationPreferencesResponse:
        row = self.repository.get_preferences(student_id)
        if not row:
            return self.set_preferences(student_id, NotificationPreferencesRequest())
        return self._preferences(row)

    def set_preferences(self, student_id: str, request: NotificationPreferencesRequest) -> NotificationPreferencesResponse:
        self._timezone(request.timezone)
        now = self._now().isoformat()
        row = self.repository.upsert_preferences({
            "student_id": student_id, "timezone": request.timezone, "quiet_hours_enabled": int(request.quiet_hours_enabled),
            "quiet_hours_start": request.quiet_hours_start, "quiet_hours_end": request.quiet_hours_end, "mute_non_critical": int(request.mute_non_critical),
            "max_non_critical_per_day": request.max_non_critical_per_day, "max_non_critical_per_hour": request.max_non_critical_per_hour,
            "in_app_enabled": int(request.in_app_enabled), "push_enabled": int(request.push_enabled), "push_permission_granted": int(request.push_permission_granted),
            "email_enabled": int(request.email_enabled), "email_consent": int(request.email_consent), "categories_json": json.dumps(request.categories, sort_keys=True), "updated_at": now,
        })
        return self._preferences(row)

    def sync(self, student_id: str, request: CandidateSyncRequest) -> SyncResultResponse:
        stats = {"accepted": 0, "deduplicated": 0, "resolved": 0, "expired": 0, "delivered": 0, "suppressed": 0, "failed": 0}
        now = self._now()
        prefs = self.get_preferences(student_id)
        for item in request.items:
            if item.source_state == "resolved":
                stats["resolved"] += self.repository.resolve_source(student_id, item.notification_type.value, item.source_type, item.source_id, now.isoformat())
                continue
            expires = self._normalized(item.expires_at, prefs.timezone) if item.expires_at else None
            if expires and expires <= now.astimezone(expires.tzinfo):
                stats["expired"] += 1
                continue
            occurred = self._normalized(item.occurred_at, prefs.timezone)
            deliver_after = self._normalized(item.deliver_after or item.occurred_at, prefs.timezone)
            row, replay = self.repository.insert_candidate({
                "id": f"notice_{uuid4().hex}", "student_id": student_id, "notification_type": item.notification_type.value,
                "source_type": item.source_type, "source_id": item.source_id, "display_label": item.display_label.strip(), "reason": item.reason.strip(),
                "action_href": item.action_href, "urgency": item.urgency.value, "sensitive": int(item.sensitive), "occurred_at": occurred.isoformat(),
                "deliver_after": deliver_after.isoformat(), "expires_at": expires.isoformat() if expires else None, "state": "pending", "suppression_reason": None,
                "idempotency_key": item.idempotency_key, "created_at": now.isoformat(), "updated_at": now.isoformat(),
            })
            if replay: stats["deduplicated"] += 1
            else: stats["accepted"] += 1
        self._ingest_internship_reminders(student_id, prefs)
        processed = self.process_due(student_id)
        for key in ("delivered", "suppressed", "failed", "expired"):
            stats[key] += processed[key]
        return SyncResultResponse(**stats)

    def process_due(self, student_id: str) -> dict[str, int]:
        now = self._now()
        prefs = self.get_preferences(student_id)
        stats = {"delivered": 0, "suppressed": 0, "failed": 0, "expired": 0}
        for candidate in self.repository.due_candidates(student_id, now.isoformat()):
            if candidate["expires_at"] and datetime.fromisoformat(candidate["expires_at"]) <= now:
                self.repository.update_candidate(candidate["id"], "expired", now.isoformat(), "expired")
                stats["expired"] += 1
                continue
            decision, reason, next_at = self._policy(candidate, prefs, now)
            if decision == "suppress":
                self.repository.update_candidate(candidate["id"], "suppressed", now.isoformat(), reason)
                stats["suppressed"] += 1
                continue
            if decision == "defer":
                self.repository.update_candidate(candidate["id"], "deferred", now.isoformat(), reason, next_at.astimezone(timezone.utc).isoformat() if next_at else None)
                continue
            delivered_any = False
            for channel in self._channels(prefs):
                outcome = self._deliver(candidate, channel, now)
                if outcome == "delivered": delivered_any = True; stats["delivered"] += 1
                elif outcome == "failed": stats["failed"] += 1
            self.repository.update_candidate(candidate["id"], "delivered" if delivered_any else "suppressed", now.isoformat(), None if delivered_any else "no_enabled_channel")
        return stats

    def retry_failed(self, student_id: str) -> RetryResponse:
        now = self._now(); attempted = delivered = failed = 0
        for row in self.repository.failed_deliveries(student_id, self.max_attempts):
            attempted += 1
            candidate = self.repository.get_candidate(row["candidate_id"])
            if not candidate or candidate["state"] in {"resolved", "expired"}:
                continue
            result = self.adapters[row["channel"]].send(delivery_id=row["id"], title=row["title"], body=row["body"])
            count = int(row["attempt_count"]) + 1
            if result.delivered:
                self.repository.update_delivery_attempt(row["id"], status="delivered", attempt_count=count, now=now.isoformat(), provider_message_id=result.provider_message_id, delivered_at=now.isoformat())
                delivered += 1
            else:
                self.repository.update_delivery_attempt(row["id"], status="failed", attempt_count=count, now=now.isoformat(), error_code=result.error_code)
                failed += 1
        return RetryResponse(attempted=attempted, delivered=delivered, failed=failed)

    def process_server_sources(self, student_id: str) -> dict[str, int]:
        """Ingest server-owned sources then apply delivery policy once.

        Current Task/Planner candidates arrive through the privacy-minimized client
        sync bridge until those modules become server authoritative.
        """
        prefs = self.get_preferences(student_id)
        self._ingest_internship_reminders(student_id, prefs)
        self._ingest_calendar_items(student_id, prefs)
        return self.process_due(student_id)

    def inbox(self, student_id: str, include_dismissed: bool = False) -> InboxResponse:
        self.process_server_sources(student_id)
        now = self._now()
        items: list[InboxItemResponse] = []
        for row in self.repository.inbox(student_id, include_dismissed):
            if row["expires_at"] and datetime.fromisoformat(row["expires_at"]) <= now:
                continue
            if row["candidate_state"] in {"resolved", "expired"}:
                continue
            items.append(InboxItemResponse(
                id=row["candidate_id"], delivery_id=row["id"], notification_type=row["notification_type"], urgency=row["urgency"], title=row["title"],
                description=row["body"], reason=row["reason"], action_href=row["action_href"], source_type=row["source_type"], source_id=row["source_id"],
                created_at=datetime.fromisoformat(row["candidate_created_at"]), delivered_at=datetime.fromisoformat(row["delivered_at"]),
                expires_at=datetime.fromisoformat(row["expires_at"]) if row["expires_at"] else None, opened_at=datetime.fromisoformat(row["opened_at"]) if row["opened_at"] else None,
                dismissed_at=datetime.fromisoformat(row["dismissed_at"]) if row["dismissed_at"] else None, acted_at=datetime.fromisoformat(row["acted_at"]) if row["acted_at"] else None,
            ))
        return InboxResponse(items=items, unread_count=sum(1 for i in items if i.opened_at is None), generated_at=now, partial=True, calendar_integration_available=self.repository.has_active_calendar_connection(student_id))

    def mark(self, student_id: str, delivery_id: str, action: str) -> None:
        row = self.repository.get_delivery_owned(delivery_id)
        if not row: raise HTTPException(status_code=404, detail="Notification delivery was not found.")
        if row["student_id"] != student_id: raise HTTPException(status_code=403, detail="This notification belongs to another student.")
        mapping = {"opened": ("opened_at", "opened"), "dismissed": ("dismissed_at", "dismissed"), "acted": ("acted_at", "acted")}
        if action not in mapping: raise HTTPException(status_code=422, detail="Unsupported notification action.")
        field, status = mapping[action]
        now = self._now().isoformat()
        self.repository.mark_delivery(delivery_id, field, status, now)
        if action == "acted" and not row["opened_at"]:
            self.repository.mark_delivery(delivery_id, "opened_at", "acted", now)

    def _policy(self, c, p: NotificationPreferencesResponse, now: datetime):
        if not p.categories.get(c["notification_type"], True): return "suppress", "category_disabled", None
        critical = c["urgency"] == Urgency.CRITICAL.value
        if p.mute_non_critical and not critical: return "suppress", "non_critical_muted", None
        local_now = now.astimezone(self._timezone(p.timezone))
        if p.quiet_hours_enabled and self._in_quiet(local_now.timetz().replace(tzinfo=None), p.quiet_hours_start, p.quiet_hours_end):
            return "defer", "quiet_hours", self._quiet_end(local_now, p.quiet_hours_start, p.quiet_hours_end)
        if not critical:
            if self.repository.count_recent_noncritical(p.student_id, (now - timedelta(hours=1)).isoformat()) >= p.max_non_critical_per_hour:
                return "defer", "hourly_frequency_cap", now + timedelta(hours=1)
            local_start = datetime.combine(local_now.date(), time(0, 0), tzinfo=local_now.tzinfo).astimezone(timezone.utc)
            if self.repository.count_recent_noncritical(p.student_id, local_start.isoformat()) >= p.max_non_critical_per_day:
                next_day = datetime.combine(local_now.date() + timedelta(days=1), time(0, 1), tzinfo=local_now.tzinfo)
                return "defer", "daily_frequency_cap", next_day
        return "deliver", None, None

    def _channels(self, p: NotificationPreferencesResponse) -> list[str]:
        result: list[str] = []
        if p.in_app_enabled: result.append(Channel.IN_APP.value)
        if p.push_enabled and p.push_permission_granted and self.adapters[Channel.PUSH.value].available: result.append(Channel.PUSH.value)
        if p.email_enabled and p.email_consent and self.adapters[Channel.EMAIL.value].available: result.append(Channel.EMAIL.value)
        return result

    def _deliver(self, c, channel: str, now: datetime) -> str:
        existing = self.repository.get_delivery(c["id"], channel)
        if existing and existing["status"] in {"delivered", "opened", "acted", "dismissed"}: return "duplicate"
        title, body = self._message(c, channel)
        if not existing:
            existing = self.repository.create_delivery({"id": f"delivery_{uuid4().hex}", "candidate_id": c["id"], "student_id": c["student_id"], "channel": channel,
                "title": title, "body": body, "status": "pending", "attempt_count": 0, "provider_message_id": None, "error_code": None,
                "delivered_at": None, "opened_at": None, "dismissed_at": None, "acted_at": None, "created_at": now.isoformat(), "updated_at": now.isoformat()})
        result = self.adapters[channel].send(delivery_id=existing["id"], title=title, body=body)
        count = int(existing["attempt_count"]) + 1
        if result.delivered:
            self.repository.update_delivery_attempt(existing["id"], status="delivered", attempt_count=count, now=now.isoformat(), provider_message_id=result.provider_message_id, delivered_at=now.isoformat())
            return "delivered"
        self.repository.update_delivery_attempt(existing["id"], status="failed", attempt_count=count, now=now.isoformat(), error_code=result.error_code)
        return "failed"

    def _message(self, c, channel: str) -> tuple[str, str]:
        # External/lock-screen previews deliberately never include source labels or sensitive student content.
        if channel != Channel.IN_APP.value:
            return "LumaPath reminder", "Open LumaPath to review the next action."
        title = TITLES[NotificationType(c["notification_type"])]
        label = c["display_label"].strip()
        body = c["reason"] if not label else f"{label} · {c['reason']}"
        return title, body

    def _ingest_calendar_items(self, student_id: str, prefs: NotificationPreferencesResponse) -> None:
        now = self._now(); horizon = now + timedelta(hours=24); lookback = now - timedelta(hours=2)
        active_source_ids: set[str] = set()
        for row in self.repository.calendar_items(student_id):
            source_id = row["id"]
            if row["connection_status"] != "active":
                self.repository.resolve_source(student_id, NotificationType.CALENDAR_EVENT.value, "calendar", source_id, now.isoformat())
                continue
            # Assignment deadlines are already represented by the Task Manager bridge once imported; avoid duplicate deadline alerts.
            if row["item_kind"] == "deadline":
                self.repository.resolve_source(student_id, NotificationType.CALENDAR_EVENT.value, "calendar", source_id, now.isoformat())
                continue
            start = datetime.fromisoformat(row["start_at"]).astimezone(timezone.utc)
            if start < lookback or start > horizon:
                continue
            active_source_ids.add(source_id)
            if row["item_kind"] == "exam":
                deliver_after = max(now, start - timedelta(hours=24)); urgency = Urgency.HIGH.value; reason = "An imported exam is approaching. Review your preparation plan."
            else:
                deliver_after = max(now, start - timedelta(minutes=60)); urgency = Urgency.NORMAL.value; reason = "An imported academic calendar item is approaching."
            expires = (datetime.fromisoformat(row["end_at"]).astimezone(timezone.utc) if row["end_at"] else start + timedelta(hours=3))
            self.repository.insert_candidate({
                "id": f"notice_{uuid4().hex}", "student_id": student_id, "notification_type": NotificationType.CALENDAR_EVENT.value,
                "source_type": "calendar", "source_id": source_id, "display_label": row["title"], "reason": reason, "action_href": f"/calendar-sync?item={source_id}",
                "urgency": urgency, "sensitive": 1, "occurred_at": now.isoformat(), "deliver_after": deliver_after.isoformat(), "expires_at": expires.isoformat(),
                "state": "pending", "suppression_reason": None, "idempotency_key": f"calendar:{source_id}:{row['source_hash']}:{deliver_after.isoformat()}",
                "created_at": now.isoformat(), "updated_at": now.isoformat(),
            })
        # Resolve calendar alerts whose source was deleted/revoked/updated out of the active window.
        for delivery in self.repository.inbox(student_id, include_dismissed=True):
            if delivery["source_type"] == "calendar" and delivery["source_id"] not in active_source_ids:
                self.repository.resolve_source(student_id, NotificationType.CALENDAR_EVENT.value, "calendar", delivery["source_id"], now.isoformat())

    def _ingest_internship_reminders(self, student_id: str, prefs: NotificationPreferencesResponse) -> None:
        now = self._now(); horizon = now + timedelta(minutes=5); lookback = now - timedelta(hours=24)
        for row in self.repository.internship_reminders(student_id):
            source_id = row["id"]
            closed = row["application_status"] in {"offer", "rejected", "withdrawn"} or bool(row["archived"])
            enabled = bool(row["enabled"]) and bool(row["notifications_enabled"]) and row["effective_notification_at"] is not None
            if closed or not enabled:
                self.repository.resolve_source(student_id, NotificationType.APPLICATION_DATE.value, "internship", source_id, now.isoformat())
                continue
            at = datetime.fromisoformat(row["effective_notification_at"]).astimezone(timezone.utc)
            if at < lookback or at > horizon:
                continue
            expires = at + timedelta(hours=24)
            self.repository.resolve_source(student_id, NotificationType.APPLICATION_DATE.value, "internship", source_id, now.isoformat())
            self.repository.insert_candidate({
                "id": f"notice_{uuid4().hex}", "student_id": student_id, "notification_type": NotificationType.APPLICATION_DATE.value,
                "source_type": "internship", "source_id": source_id, "display_label": f"{row['company']} · {row['role']}",
                "reason": row["title"], "action_href": f"/internships?application={row['application_id']}", "urgency": Urgency.HIGH.value,
                "sensitive": 1, "occurred_at": at.isoformat(), "deliver_after": at.isoformat(), "expires_at": expires.isoformat(), "state": "pending",
                "suppression_reason": None, "idempotency_key": f"internship-reminder:{row['id']}:{row['updated_at']}", "created_at": now.isoformat(), "updated_at": now.isoformat(),
            })

    def _preferences(self, row) -> NotificationPreferencesResponse:
        try: cats = json.loads(row["categories_json"])
        except Exception: cats = {}
        return NotificationPreferencesResponse(student_id=row["student_id"], timezone=row["timezone"], quiet_hours_enabled=bool(row["quiet_hours_enabled"]),
            quiet_hours_start=row["quiet_hours_start"], quiet_hours_end=row["quiet_hours_end"], mute_non_critical=bool(row["mute_non_critical"]),
            max_non_critical_per_day=row["max_non_critical_per_day"], max_non_critical_per_hour=row["max_non_critical_per_hour"], in_app_enabled=bool(row["in_app_enabled"]),
            push_enabled=bool(row["push_enabled"]), push_permission_granted=bool(row["push_permission_granted"]), email_enabled=bool(row["email_enabled"]), email_consent=bool(row["email_consent"]),
            categories={**DEFAULT_CATEGORIES, **cats}, updated_at=datetime.fromisoformat(row["updated_at"]), push_provider_available=self.adapters[Channel.PUSH.value].available,
            email_provider_available=self.adapters[Channel.EMAIL.value].available)

    def _now(self):
        value = self.now(); return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _timezone(name: str):
        try: return ZoneInfo(name)
        except ZoneInfoNotFoundError as exc: raise HTTPException(status_code=422, detail="Timezone must be a valid IANA timezone.") from exc

    @classmethod
    def _normalized(cls, value: datetime, timezone_name: str):
        if value.tzinfo is None: value = value.replace(tzinfo=cls._timezone(timezone_name))
        return value.astimezone(timezone.utc)

    @staticmethod
    def _in_quiet(value: time, start_s: str, end_s: str):
        start = time.fromisoformat(start_s); end = time.fromisoformat(end_s)
        return (start < end and start <= value < end) or (start >= end and (value >= start or value < end))

    @staticmethod
    def _quiet_end(local_now: datetime, start_s: str, end_s: str):
        start = time.fromisoformat(start_s); end = time.fromisoformat(end_s); target = local_now.date()
        if start >= end and local_now.timetz().replace(tzinfo=None) >= start: target += timedelta(days=1)
        return datetime.combine(target, end, tzinfo=local_now.tzinfo)
