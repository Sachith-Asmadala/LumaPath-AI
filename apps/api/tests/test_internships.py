from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.internships.repository import InternshipRepository
from apps.api.app.modules.internships.schemas import (
    ArchiveRequest, CreateApplicationRequest, PlannerActionRequest, ReminderRequest, RequirementInput,
    StatusTransitionRequest, UpdateApplicationRequest,
)
from apps.api.app.modules.internships.service import InternshipService
from apps.api.app.modules.portfolio.repository import PortfolioRepository
from apps.api.app.modules.portfolio.schemas import CreatePortfolioProjectRequest, ProjectFacts
from apps.api.app.modules.portfolio.service import PortfolioService

NOW = datetime(2026, 10, 20, 10, 0, tzinfo=timezone.utc)


def service(tmp_path: Path, now=lambda: NOW) -> InternshipService:
    return InternshipService(InternshipRepository(str(tmp_path / "internships.db")), now=now)


def create_request(**overrides) -> CreateApplicationRequest:
    payload = dict(
        company="Acme Cloud", role="DevOps Intern", source_type="manual", source_reference=None,
        source_url="https://example.com/jobs/devops", application_deadline=date(2026, 10, 28), application_deadline_confirmed=True,
        contact_name="Recruiting Team", contact_email="careers@example.com", interview_at=None, interview_at_confirmed=False,
        follow_up_at=None, follow_up_at_confirmed=False, notes="Private tracking note", next_action="Tailor CV and review Docker evidence",
        timezone="Asia/Colombo", requirements=[RequirementInput(skill_name="Docker", detail="Container fundamentals"), RequirementInput(skill_name="Terraform", detail="IaC basics")],
        idempotency_key="create-acme-001",
    )
    payload.update(overrides)
    return CreateApplicationRequest(**payload)


def test_create_edit_and_missing_or_past_deadline_states(tmp_path: Path):
    svc = service(tmp_path)
    created = svc.create("student-a", create_request())
    assert created.company == "Acme Cloud"
    assert created.deadline_state == "upcoming"
    assert len(created.requirements) == 2
    updated = svc.update("student-a", created.id, UpdateApplicationRequest(
        company="Acme Cloud", role="Platform Intern", source_url="https://example.com/jobs/platform",
        application_deadline=None, application_deadline_confirmed=False, contact_name="Recruiting Team", contact_email="careers@example.com",
        notes="Updated", next_action="Review role", timezone="Asia/Colombo", requirements=[RequirementInput(skill_name="Docker")], idempotency_key="update-acme-001",
    ))
    assert updated.role == "Platform Intern"
    assert updated.deadline_state == "missing"


def test_status_transition_history_and_invalid_transition(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request())
    preparing = svc.transition("student-a", app_row.id, StatusTransitionRequest(status="preparing", note="Preparing CV", idempotency_key="status-prepare-001"))
    applied = svc.transition("student-a", app_row.id, StatusTransitionRequest(status="applied", note="Submitted manually outside LumaPath", idempotency_key="status-applied-001"))
    waiting = svc.transition("student-a", app_row.id, StatusTransitionRequest(status="awaiting_response", note="Waiting", idempotency_key="status-wait-001"))
    assert [e.to_status.value if e.to_status else None for e in waiting.history if e.event_type == "status_changed"] == ["preparing", "applied", "awaiting_response"]
    with pytest.raises(HTTPException) as exc:
        svc.transition("student-a", app_row.id, StatusTransitionRequest(status="interested", note="", idempotency_key="invalid-back-001"))
    assert exc.value.status_code == 409


def test_idempotent_create_and_recommendation_duplicate(tmp_path: Path):
    svc = service(tmp_path)
    first = svc.create("student-a", create_request())
    second = svc.create("student-a", create_request(company="Changed but same key"))
    assert second.id == first.id
    rec = create_request(source_type="recommendation", source_reference="opp-123", idempotency_key="recommendation-001")
    imported = svc.create("student-a", rec)
    duplicate = svc.create("student-a", create_request(source_type="recommendation", source_reference="opp-123", company="Different title", idempotency_key="recommendation-002"))
    assert duplicate.id == imported.id


def test_interview_and_followup_reminders_respect_quiet_hours_and_can_be_disabled(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(interview_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc), interview_at_confirmed=True))
    # 23:30 Sri Lanka is within 22:00-07:00 quiet hours; it should move to 07:00 next morning.
    request = ReminderRequest(kind="interview", title="Interview reminder", remind_at=datetime(2026, 10, 24, 23, 30, tzinfo=timezone(timedelta(hours=5, minutes=30))), timezone="Asia/Colombo", enabled=True, notifications_enabled=True, quiet_hours_start="22:00", quiet_hours_end="07:00", idempotency_key="reminder-interview-001")
    reminder = svc.create_reminder("student-a", app_row.id, request)
    assert reminder.effective_notification_at.hour == 7
    assert reminder.effective_notification_at.day == 25
    disabled = svc.update_reminder("student-a", app_row.id, reminder.id, ReminderRequest(**{**request.model_dump(), "enabled": False, "idempotency_key": "reminder-edit-001"}))
    assert disabled.enabled is False
    assert disabled.effective_notification_at is None


def test_notification_preference_off_keeps_reminder_without_external_notification(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(follow_up_at=datetime(2026, 10, 25, 12, 0, tzinfo=timezone.utc), follow_up_at_confirmed=True))
    reminder = svc.create_reminder("student-a", app_row.id, ReminderRequest(kind="follow_up", title="Follow up", remind_at=datetime(2026, 10, 25, 10, 0), timezone="Asia/Colombo", notifications_enabled=False, idempotency_key="reminder-followup-001"))
    assert reminder.enabled is True
    assert reminder.notifications_enabled is False
    assert reminder.effective_notification_at is None


def test_planner_action_requires_confirmed_timing_and_date(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(interview_at=datetime(2026, 10, 26, 10, 0, tzinfo=timezone.utc), interview_at_confirmed=True))
    with pytest.raises(HTTPException) as exc:
        svc.planner_action("student-a", app_row.id, PlannerActionRequest(kind="interview_prep", title="Prepare examples", start_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc), duration_minutes=45, confirmed=False, idempotency_key="planner-001"))
    assert exc.value.status_code == 422
    action = svc.planner_action("student-a", app_row.id, PlannerActionRequest(kind="interview_prep", title="Prepare examples", start_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc), duration_minutes=45, confirmed=True, idempotency_key="planner-002"))
    assert action.category == "Internship"
    replay = svc.planner_action("student-a", app_row.id, PlannerActionRequest(kind="interview_prep", title="Changed title", start_at=datetime(2026, 10, 25, 9, 0, tzinfo=timezone.utc), duration_minutes=60, confirmed=True, idempotency_key="planner-002"))
    assert replay.id == action.id
    assert replay.idempotent_replay is True


def test_planner_deadline_action_requires_confirmed_deadline(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(application_deadline_confirmed=False))
    with pytest.raises(HTTPException) as exc:
        svc.planner_action("student-a", app_row.id, PlannerActionRequest(kind="deadline_prep", title="Finish application", start_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc), duration_minutes=60, confirmed=True, idempotency_key="planner-deadline-001"))
    assert exc.value.status_code == 409


def test_readiness_actions_use_real_portfolio_evidence(tmp_path: Path):
    db = str(tmp_path / "internships.db")
    portfolio = PortfolioService(PortfolioRepository(db), now=lambda: NOW)
    project = portfolio.create("student-a", CreatePortfolioProjectRequest(
        title="Container Lab", description="A reproducible Docker project with clear setup instructions and automated tests for a small API service.", target_role="DevOps Engineer",
        project_url="https://example.com/project", facts=ProjectFacts(technologies=["Docker"], languages=["Python"], has_readme=True, has_tests=True, has_docker=True),
    ))
    portfolio.analyze("student-a", project.id)
    svc = InternshipService(InternshipRepository(db), now=lambda: NOW)
    application = svc.create("student-a", create_request())
    docker = next(item for item in application.readiness_actions if item.skill_name == "Docker")
    terraform = next(item for item in application.readiness_actions if item.skill_name == "Terraform")
    assert docker.status == "evidence_available"
    assert docker.evidence_refs
    assert terraform.status == "evidence_gap"
    assert "not a claim" in terraform.rationale


def test_archived_closed_application_retains_private_outcome_notes(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request())
    svc.transition("student-a", app_row.id, StatusTransitionRequest(status="withdrawn", note="Chose another role", idempotency_key="status-withdraw-001"))
    archived = svc.archive("student-a", app_row.id, ArchiveRequest(archived=True, outcome_notes="Role location changed; keep for private learning.", idempotency_key="archive-001"))
    assert archived.archived is True
    assert "private learning" in archived.outcome_notes
    assert svc.list("student-a").items == []
    assert svc.list("student-a", include_archived=True).items[0].id == app_row.id


def test_open_application_cannot_be_archived(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request())
    with pytest.raises(HTTPException) as exc:
        svc.archive("student-a", app_row.id, ArchiveRequest(archived=True, outcome_notes="", idempotency_key="archive-open-001"))
    assert exc.value.status_code == 409


def test_cross_student_private_fields_are_denied(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(notes="Private note", contact_email="private@example.com"))
    with pytest.raises(HTTPException) as exc:
        svc.get("student-b", app_row.id)
    assert exc.value.status_code == 403


def test_delete_removes_application_and_derived_rows(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request())
    svc.create_reminder("student-a", app_row.id, ReminderRequest(kind="deadline", title="Deadline", remind_at=datetime(2026, 10, 25, 10, 0), idempotency_key="reminder-delete-001"))
    svc.delete("student-a", app_row.id)
    with pytest.raises(HTTPException) as exc:
        svc.get("student-a", app_row.id)
    assert exc.value.status_code == 404



def test_existing_reminder_can_be_disabled_after_source_date_is_removed(tmp_path: Path):
    svc = service(tmp_path)
    app_row = svc.create("student-a", create_request(interview_at=datetime(2026, 10, 25, 10, 0, tzinfo=timezone.utc), interview_at_confirmed=True))
    req = ReminderRequest(kind="interview", title="Interview", remind_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc), timezone="Asia/Colombo", idempotency_key="rem-disable-date-001")
    reminder = svc.create_reminder("student-a", app_row.id, req)
    current = svc.get("student-a", app_row.id)
    svc.update("student-a", app_row.id, UpdateApplicationRequest(company=current.company, role=current.role, source_url=current.source_url, application_deadline=current.application_deadline, application_deadline_confirmed=current.application_deadline_confirmed, contact_name=current.contact_name, contact_email=current.contact_email, interview_at=None, interview_at_confirmed=False, follow_up_at=current.follow_up_at, follow_up_at_confirmed=current.follow_up_at_confirmed, notes=current.notes, next_action=current.next_action, timezone=current.timezone, requirements=[RequirementInput(skill_name=r.skill_name, detail=r.detail, required=r.required) for r in current.requirements], idempotency_key="remove-interview-date-001"))
    disabled = svc.update_reminder("student-a", app_row.id, reminder.id, ReminderRequest(kind="interview", title="Interview", remind_at=datetime(2026, 10, 24, 10, 0, tzinfo=timezone.utc), timezone="Asia/Colombo", enabled=False, idempotency_key="disable-after-remove-001"))
    assert disabled.enabled is False

def test_http_crud_transition_owner_and_planner_contract(monkeypatch, tmp_path: Path):
    import apps.api.app.modules.internships.router as internship_router
    svc = service(tmp_path)
    monkeypatch.setattr(internship_router, "service", svc)
    client = TestClient(app)
    headers = {"X-Luma-Student-Id": "student-http"}
    payload = create_request(idempotency_key="http-create-001").model_dump(mode="json")
    response = client.post("/v1/internships/applications", json=payload, headers=headers)
    assert response.status_code == 201
    application_id = response.json()["id"]
    assert client.get(f"/v1/internships/applications/{application_id}", headers={"X-Luma-Student-Id": "other"}).status_code == 403
    transition = client.post(f"/v1/internships/applications/{application_id}/status", json={"status":"preparing","note":"prepare","idempotency_key":"http-status-001"}, headers=headers)
    assert transition.status_code == 200
    action = client.post(f"/v1/internships/applications/{application_id}/planner-actions", json={"kind":"deadline_prep","title":"Prepare application","start_at":"2026-10-25T10:00:00+00:00","duration_minutes":60,"confirmed":True,"idempotency_key":"http-plan-001"}, headers=headers)
    assert action.status_code == 201
    assert action.json()["category"] == "Internship"
