from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.modules.notifications.adapters import AdapterResult
from apps.api.app.modules.notifications.repository import NotificationRepository
from apps.api.app.modules.notifications.schemas import CandidateInput, CandidateSyncRequest, NotificationPreferencesRequest
from apps.api.app.modules.notifications.service import NotificationService
from apps.api.app.modules.internships.repository import InternshipRepository
from apps.api.app.modules.internships.schemas import CreateApplicationRequest, ReminderRequest
from apps.api.app.modules.internships.service import InternshipService


class Clock:
    def __init__(self, at: datetime): self.at = at
    def now(self): return self.at
    def advance(self, **kwargs): self.at += timedelta(**kwargs)


class FlakyAdapter:
    available = True
    def __init__(self): self.calls = 0; self.ids: list[str] = []
    def send(self, *, delivery_id: str, title: str, body: str):
        self.calls += 1; self.ids.append(delivery_id)
        if self.calls == 1: return AdapterResult(False, error_code="temporary_provider_failure")
        return AdapterResult(True, provider_message_id=f"provider:{delivery_id}")


def svc(tmp_path: Path, at=datetime(2026, 10, 20, 4, 0, tzinfo=timezone.utc), **kwargs):
    clock = Clock(at); repo = NotificationRepository(str(tmp_path / "notifications.db")); return NotificationService(repo, now=clock.now, **kwargs), repo, clock


def candidate(key="task-deadline-001", **overrides):
    data = dict(notification_type="deadline", source_type="task", source_id="task-1", display_label="Database assignment",
        reason="Due within 24 hours. Review the remaining work.", action_href="/tasks?task=task-1", urgency="high",
        occurred_at=datetime(2026, 10, 20, 4, 0, tzinfo=timezone.utc), deliver_after=datetime(2026, 10, 20, 4, 0, tzinfo=timezone.utc),
        expires_at=datetime(2026, 10, 21, 4, 0, tzinfo=timezone.utc), sensitive=True, idempotency_key=key)
    data.update(overrides); return CandidateInput(**data)


def test_ac1_supported_trigger_delivers_once_with_reason_and_action(tmp_path):
    service, _, _ = svc(tmp_path)
    result = service.sync("student-a", CandidateSyncRequest(items=[candidate()]))
    assert result.accepted == 1 and result.delivered == 1
    replay = service.sync("student-a", CandidateSyncRequest(items=[candidate()]))
    assert replay.deduplicated == 1
    inbox = service.inbox("student-a")
    assert len(inbox.items) == 1
    assert inbox.items[0].reason.startswith("Due within 24")
    assert inbox.items[0].action_href == "/tasks?task=task-1"


def test_ac2_quiet_hours_defer_until_local_end(tmp_path):
    # 18:30 UTC = 00:00 Asia/Colombo, within default quiet hours.
    service, repo, clock = svc(tmp_path, datetime(2026, 10, 20, 18, 30, tzinfo=timezone.utc))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(occurred_at=clock.now(), deliver_after=clock.now())]))
    assert service.inbox("student-a").items == []
    row = repo._connect().execute("SELECT state,deliver_after,suppression_reason FROM notification_candidates").fetchone()
    assert row["state"] == "deferred" and row["suppression_reason"] == "quiet_hours"
    # 07:01 local next day.
    clock.advance(hours=7, minutes=1)
    assert len(service.inbox("student-a").items) == 1


def test_ac2_frequency_caps_are_enforced_for_noncritical_but_not_critical(tmp_path):
    service, _, clock = svc(tmp_path)
    service.set_preferences("student-a", NotificationPreferencesRequest(quiet_hours_enabled=False, max_non_critical_per_hour=1, max_non_critical_per_day=2))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="cap-0001")]))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="cap-0002", source_id="task-2")]))
    assert len(service.inbox("student-a").items) == 1
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="cap-0003", source_id="task-3", urgency="critical")]))
    assert len(service.inbox("student-a").items) == 2


def test_ac3_category_preferences_and_mute_noncritical(tmp_path):
    service, repo, _ = svc(tmp_path)
    prefs = NotificationPreferencesRequest(quiet_hours_enabled=False, mute_non_critical=True, categories={"deadline": True, "risk": False})
    service.set_preferences("student-a", prefs)
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="mute-0001", urgency="normal")]))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="mute-0002", source_id="risk", notification_type="risk", urgency="critical")]))
    states = [tuple(r) for r in repo._connect().execute("SELECT state,suppression_reason FROM notification_candidates ORDER BY id").fetchall()]
    assert ("suppressed", "non_critical_muted") in states
    assert ("suppressed", "category_disabled") in states


def test_ac4_expired_and_resolved_events_do_not_remain_current(tmp_path):
    service, _, clock = svc(tmp_path)
    expired = candidate(key="expired-01", expires_at=clock.now() - timedelta(seconds=1))
    result = service.sync("student-a", CandidateSyncRequest(items=[expired]))
    assert result.expired == 1
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="resolved-01")]))
    assert len(service.inbox("student-a").items) == 1
    resolved = candidate(key="resolve-event-01", source_state="resolved")
    service.sync("student-a", CandidateSyncRequest(items=[resolved]))
    assert service.inbox("student-a").items == []


def test_ac5_external_delivery_retry_is_idempotent(tmp_path):
    adapter = FlakyAdapter(); service, repo, _ = svc(tmp_path, push_adapter=adapter)
    service.set_preferences("student-a", NotificationPreferencesRequest(quiet_hours_enabled=False, push_enabled=True, push_permission_granted=True))
    first = service.sync("student-a", CandidateSyncRequest(items=[candidate(key="retry-0001")]))
    assert first.delivered == 1  # in-app succeeds
    failed = repo._connect().execute("SELECT * FROM notification_deliveries WHERE channel='push'").fetchone()
    assert failed["status"] == "failed" and failed["attempt_count"] == 1
    retried = service.retry_failed("student-a")
    assert retried.attempted == 1 and retried.delivered == 1
    delivered = repo._connect().execute("SELECT * FROM notification_deliveries WHERE channel='push'").fetchone()
    assert delivered["status"] == "delivered" and delivered["attempt_count"] == 2
    assert adapter.ids[0] == adapter.ids[1]  # same delivery id is retried, not duplicated


def test_ac6_external_preview_never_contains_sensitive_source_content(tmp_path):
    adapter = FlakyAdapter(); adapter.calls = 1  # next call succeeds
    service, repo, _ = svc(tmp_path, push_adapter=adapter)
    service.set_preferences("student-a", NotificationPreferencesRequest(quiet_hours_enabled=False, push_enabled=True, push_permission_granted=True))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="privacy-001", display_label="Private CV interview at SecretCo", reason="Mentor note: disclose salary concern")]))
    row = repo._connect().execute("SELECT title,body FROM notification_deliveries WHERE channel='push'").fetchone()
    assert row["title"] == "LumaPath reminder"
    assert "SecretCo" not in row["body"] and "salary" not in row["body"]


def test_delivery_open_dismiss_act_and_owner_enforcement(tmp_path):
    service, _, _ = svc(tmp_path)
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="actions-001")]))
    delivery = service.inbox("student-a").items[0]
    with pytest.raises(HTTPException) as exc: service.mark("student-b", delivery.delivery_id, "opened")
    assert exc.value.status_code == 403
    service.mark("student-a", delivery.delivery_id, "opened")
    assert service.inbox("student-a").items[0].opened_at is not None
    service.mark("student-a", delivery.delivery_id, "acted")
    assert service.inbox("student-a").items[0].acted_at is not None
    service.mark("student-a", delivery.delivery_id, "dismissed")
    assert service.inbox("student-a").items == []
    assert len(service.inbox("student-a", include_dismissed=True).items) == 1


def test_dst_timezone_boundary_uses_zoneinfo(tmp_path):
    # America/New_York DST ends Nov 1 2026; quiet end should still be local 07:00 with correct offset.
    service, repo, _ = svc(tmp_path, datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc))  # 01:30 local before fallback
    service.set_preferences("student-a", NotificationPreferencesRequest(timezone="America/New_York", quiet_hours_enabled=True, quiet_hours_start="22:00", quiet_hours_end="07:00"))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="dst-0001", occurred_at=datetime(2026,11,1,5,30,tzinfo=timezone.utc), deliver_after=datetime(2026,11,1,5,30,tzinfo=timezone.utc), expires_at=datetime(2026,11,2,5,30,tzinfo=timezone.utc))]))
    row = repo._connect().execute("SELECT deliver_after FROM notification_candidates").fetchone()
    # After fallback, 07:00 New York is 12:00 UTC.
    assert datetime.fromisoformat(row["deliver_after"]).hour == 12


def test_application_reminder_is_ingested_without_client_private_notes(tmp_path):
    db = str(tmp_path / "notifications.db")
    clock = Clock(datetime(2026,10,20,10,0,tzinfo=timezone.utc))
    internships = InternshipService(InternshipRepository(db), now=clock.now)
    app = internships.create("student-a", CreateApplicationRequest(company="Acme", role="DevOps Intern", application_deadline_confirmed=False, timezone="UTC", requirements=[], idempotency_key="app-notify-001"))
    internships.create_reminder("student-a", app.id, ReminderRequest(kind="custom", title="Review interview examples", remind_at=clock.now(), timezone="UTC", quiet_hours_start=None, quiet_hours_end=None, idempotency_key="app-reminder-001"))
    service = NotificationService(NotificationRepository(db), now=clock.now)
    inbox = service.inbox("student-a")
    assert len(inbox.items) == 1 and inbox.items[0].source_type == "internship"
    assert "Private" not in inbox.items[0].description


def test_invalid_timezone_and_external_href_are_rejected(tmp_path):
    service, _, _ = svc(tmp_path)
    with pytest.raises(HTTPException) as exc: service.set_preferences("student-a", NotificationPreferencesRequest(timezone="Mars/Olympus"))
    assert exc.value.status_code == 422
    with pytest.raises(ValueError): candidate(action_href="https://evil.example")


def test_http_notification_contract(tmp_path, monkeypatch):
    import apps.api.app.modules.notifications.router as router
    repo = NotificationRepository(str(tmp_path / "http.db")); router.repository = repo; router.service = NotificationService(repo, now=lambda: datetime(2026,10,20,10,0,tzinfo=timezone.utc))
    from apps.api.app.main import app
    client = TestClient(app); headers={"X-Luma-Student-Id":"student-a"}
    prefs = client.get("/v1/notifications/preferences", headers=headers); assert prefs.status_code == 200
    sync = client.post("/v1/notifications/candidates/sync", headers=headers, json={"items":[candidate(key="http-notice-001").model_dump(mode="json")]})
    assert sync.status_code == 200
    inbox = client.get("/v1/notifications/inbox", headers=headers); assert inbox.status_code == 200 and inbox.json()["unread_count"] == 1
    delivery_id = inbox.json()["items"][0]["delivery_id"]
    opened = client.post(f"/v1/notifications/deliveries/{delivery_id}/opened", headers=headers); assert opened.status_code == 200
    forbidden = client.post(f"/v1/notifications/deliveries/{delivery_id}/dismissed", headers={"X-Luma-Student-Id":"student-b"}); assert forbidden.status_code == 403

def test_preferences_persist_across_repository_reopen(tmp_path):
    path = str(tmp_path / "persist.db")
    first = NotificationService(NotificationRepository(path), now=lambda: datetime(2026,10,20,10,0,tzinfo=timezone.utc))
    first.set_preferences("student-a", NotificationPreferencesRequest(timezone="Asia/Tokyo", quiet_hours_start="23:00", quiet_hours_end="06:30", mute_non_critical=True, categories={"study_session": False}))
    reopened = NotificationService(NotificationRepository(path), now=lambda: datetime(2026,10,20,10,0,tzinfo=timezone.utc))
    prefs = reopened.get_preferences("student-a")
    assert prefs.timezone == "Asia/Tokyo" and prefs.mute_non_critical is True and prefs.categories["study_session"] is False


def test_disabled_internship_reminder_resolves_existing_inbox_item(tmp_path):
    db = str(tmp_path / "resolve-reminder.db"); clock=Clock(datetime(2026,10,20,10,0,tzinfo=timezone.utc))
    internships=InternshipService(InternshipRepository(db),now=clock.now)
    app=internships.create("student-a",CreateApplicationRequest(company="Acme",role="Intern",timezone="UTC",requirements=[],idempotency_key="resolve-app-001"))
    reminder=internships.create_reminder("student-a",app.id,ReminderRequest(kind="custom",title="Follow up",remind_at=clock.now(),timezone="UTC",quiet_hours_start=None,quiet_hours_end=None,idempotency_key="resolve-reminder-001"))
    service=NotificationService(NotificationRepository(db),now=clock.now)
    assert len(service.inbox("student-a").items)==1
    internships.update_reminder("student-a",app.id,reminder.id,ReminderRequest(kind="custom",title="Follow up",remind_at=clock.now(),timezone="UTC",enabled=False,quiet_hours_start=None,quiet_hours_end=None,idempotency_key="resolve-reminder-update-001"))
    assert service.inbox("student-a").items==[]

def test_new_source_version_supersedes_old_current_alert(tmp_path):
    service, _, _ = svc(tmp_path)
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="risk-v1-0001", notification_type="risk", source_id="task-x", reason="Risk 70%")]))
    service.sync("student-a", CandidateSyncRequest(items=[candidate(key="risk-v2-0001", notification_type="risk", source_id="task-x", reason="Risk 90%", urgency="critical")]))
    inbox=service.inbox("student-a")
    assert len(inbox.items)==1
    assert inbox.items[0].reason=="Risk 90%"

def test_external_channel_preferences_require_explicit_permission_and_consent():
    from pydantic import ValidationError
    with pytest.raises(ValidationError):
        NotificationPreferencesRequest(push_enabled=True, push_permission_granted=False)
    with pytest.raises(ValidationError):
        NotificationPreferencesRequest(email_enabled=True, email_consent=False)
    with pytest.raises(ValidationError):
        NotificationPreferencesRequest(quiet_hours_enabled=True, quiet_hours_start="22:00", quiet_hours_end="22:00")
