from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.modules.focus.repository import FocusSessionRepository
from apps.api.app.modules.focus.schemas import FinishFocusSessionRequest, StartFocusSessionRequest
from apps.api.app.modules.focus.service import FocusSessionService


class Clock:
    def __init__(self, value: datetime):
        self.value = value

    def now(self):
        return self.value

    def advance(self, **kwargs):
        self.value += timedelta(**kwargs)


def service_at(tmp_path, at=datetime(2026, 10, 1, 12, 0, tzinfo=timezone.utc)):
    clock = Clock(at)
    repo = FocusSessionRepository(str(tmp_path / "focus.db"))
    return FocusSessionService(repo, now=clock.now), repo, clock



def run_active(service, clock, student_id: str, session_id: str, *, seconds: int):
    remaining = seconds
    while remaining > 0:
        step = min(30, remaining)
        clock.advance(seconds=step)
        service.heartbeat(student_id, session_id)
        remaining -= step


def start_payload(**overrides):
    payload = {
        "task_id": "task-db",
        "task_title": "Database assignment",
        "objective": "Finish the indexing comparison section",
        "planned_work_minutes": 25,
        "planned_break_minutes": 5,
        "task_estimated_minutes": 120,
        "task_progress_before": 40,
        "timezone": "Asia/Colombo",
    }
    payload.update(overrides)
    return StartFocusSessionRequest.model_validate(payload)


def completed_payload(**overrides):
    payload = {
        "result": "completed",
        "task_progress_after": 55,
        "notes": "Index examples are drafted.",
        "next_step": "Add query-plan screenshots.",
        "estimate_feedback": "about_right",
    }
    payload.update(overrides)
    return FinishFocusSessionRequest.model_validate(payload)


def test_ac1_session_links_task_and_visible_objective(tmp_path):
    service, _, _ = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    assert session.task_id == "task-db"
    assert session.task_title == "Database assignment"
    assert session.objective == "Finish the indexing comparison section"
    assert session.status.value == "running"


def test_ac2_pause_resume_and_reload_recovery_use_timestamps(tmp_path):
    service, repo, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    run_active(service, clock, "student-a", session.id, seconds=10 * 60)
    paused = service.pause("student-a", session.id)
    assert paused.elapsed_work_seconds == 600
    clock.advance(minutes=30)
    # A refresh/re-open while paused must not count wall-clock sleep time.
    reopened = FocusSessionService(FocusSessionRepository(repo.database_path), now=clock.now)
    recovered = reopened.get("student-a", session.id)
    assert recovered.elapsed_work_seconds == 600
    resumed = reopened.resume("student-a", session.id)
    assert resumed.status.value == "running"
    run_active(reopened, clock, "student-a", session.id, seconds=5 * 60)
    recovered = reopened.get("student-a", session.id)
    assert recovered.elapsed_work_seconds == 900


def test_ac2_break_due_survives_refresh(tmp_path):
    service, repo, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload(planned_work_minutes=20, planned_break_minutes=7))
    run_active(service, clock, "student-a", session.id, seconds=21 * 60)
    reopened = FocusSessionService(FocusSessionRepository(repo.database_path), now=clock.now)
    recovered = reopened.get("student-a", session.id)
    assert recovered.break_due is True
    assert recovered.status.value == "break_due"
    assert recovered.planned_break_minutes == 7
    assert recovered.remaining_work_seconds == 0


def test_ac4_completed_session_keeps_progress_notes_and_next_step(tmp_path):
    service, _, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    run_active(service, clock, "student-a", session.id, seconds=20 * 60)
    ended = service.finish("student-a", session.id, completed_payload(task_progress_after=62))
    assert ended.status.value == "completed"
    assert ended.task_progress_after == 62
    assert ended.notes == "Index examples are drafted."
    assert ended.next_step == "Add query-plan screenshots."
    assert ended.productive_minutes == 20


def test_ac5_estimate_feedback_is_transparent_and_manual_correction_wins(tmp_path):
    service, _, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload(task_estimated_minutes=100, task_progress_before=25))
    run_active(service, clock, "student-a", session.id, seconds=30 * 60)
    ended = service.finish("student-a", session.id, completed_payload(task_progress_after=50, estimate_feedback="slightly_more"))
    assert ended.suggested_estimated_minutes is not None
    assert "30 measured focus minutes" in ended.estimate_explanation
    assert "25% task progress" in ended.estimate_explanation

    service2, _, clock2 = service_at(tmp_path / "manual", datetime(2026, 10, 1, 13, 0, tzinfo=timezone.utc))
    session2 = service2.start("student-a", start_payload())
    run_active(service2, clock2, "student-a", session2.id, seconds=10 * 60)
    manual = service2.finish("student-a", session2.id, completed_payload(manual_estimated_minutes=95))
    assert manual.suggested_estimated_minutes == 95
    assert "Manual correction" in manual.estimate_explanation


def test_ac6_interrupted_and_abandoned_sessions_do_not_count_productive_time(tmp_path):
    for result in ("interrupted", "abandoned"):
        service, _, clock = service_at(tmp_path / result)
        session = service.start("student-a", start_payload())
        run_active(service, clock, "student-a", session.id, seconds=12 * 60)
        ended = service.finish("student-a", session.id, FinishFocusSessionRequest.model_validate({
            "result": result,
            "task_progress_after": 40,
            "notes": "Had to leave.",
            "next_step": "Resume later.",
        }))
        assert ended.productive_minutes == 0
        assert ended.suggested_estimated_minutes is None
        assert "do not change" in ended.estimate_explanation


def test_progress_cannot_move_backwards(tmp_path):
    service, _, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload(task_progress_before=60))
    run_active(service, clock, "student-a", session.id, seconds=5 * 60)
    with pytest.raises(HTTPException) as exc:
        service.finish("student-a", session.id, completed_payload(task_progress_after=50))
    assert exc.value.status_code == 422


def test_only_one_active_session_per_student(tmp_path):
    service, _, _ = service_at(tmp_path)
    service.start("student-a", start_payload())
    with pytest.raises(HTTPException) as exc:
        service.start("student-a", start_payload(task_id="task-2", task_title="Second task"))
    assert exc.value.status_code == 409
    # Another student remains isolated and can focus independently.
    assert service.start("student-b", start_payload(task_id="task-2", task_title="Second task")).task_id == "task-2"


def test_student_cannot_access_or_mutate_another_students_session(tmp_path):
    service, _, _ = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    for operation in (service.get, service.pause):
        with pytest.raises(HTTPException) as exc:
            operation("student-b", session.id)
        assert exc.value.status_code == 403


def test_paused_session_does_not_accumulate_sleep_or_offline_gap(tmp_path):
    service, _, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    run_active(service, clock, "student-a", session.id, seconds=3 * 60)
    service.pause("student-a", session.id)
    clock.advance(hours=8)
    recovered = service.active("student-a")
    assert recovered is not None
    assert recovered.elapsed_work_seconds == 180
    assert recovered.status.value == "paused"


def test_running_session_auto_pauses_after_sleep_gap_without_counting_the_gap(tmp_path):
    service, _, clock = service_at(tmp_path)
    session = service.start("student-a", start_payload())
    run_active(service, clock, "student-a", session.id, seconds=3 * 60)
    before_sleep = service.get("student-a", session.id)
    assert before_sleep.elapsed_work_seconds == 180
    clock.advance(hours=8)
    recovered = service.heartbeat("student-a", session.id)
    assert recovered.status.value == "paused"
    assert recovered.elapsed_work_seconds == 210  # bounded 30-second heartbeat grace, not 8 hours


def test_recent_history_is_owner_scoped(tmp_path):
    service, _, clock = service_at(tmp_path)
    own = service.start("student-a", start_payload())
    run_active(service, clock, "student-a", own.id, seconds=5 * 60)
    service.finish("student-a", own.id, completed_payload())
    other = service.start("student-b", start_payload(task_id="other", task_title="Other"))
    assert [item.id for item in service.recent("student-a")] == [own.id]
    assert [item.id for item in service.recent("student-b")] == [other.id]


def test_http_focus_contract_and_ownership(tmp_path, monkeypatch):
    # Rebind router globals to an isolated database before creating the client.
    import apps.api.app.modules.focus.router as focus_router
    repo = FocusSessionRepository(str(tmp_path / "http.db"))
    focus_router._repository = repo
    focus_router._service = FocusSessionService(repo)
    from apps.api.app.main import app
    client = TestClient(app)
    headers = {"X-Luma-Student-Id": "student-http"}
    response = client.post("/v1/focus-sessions", headers=headers, json=start_payload().model_dump(mode="json"))
    assert response.status_code == 201
    session_id = response.json()["id"]
    assert client.get(f"/v1/focus-sessions/{session_id}", headers=headers).status_code == 200
    assert client.get(f"/v1/focus-sessions/{session_id}", headers={"X-Luma-Student-Id": "student-other"}).status_code == 403
    assert client.post(f"/v1/focus-sessions/{session_id}/pause", headers=headers).status_code == 200
    assert client.post(f"/v1/focus-sessions/{session_id}/resume", headers=headers).status_code == 200
