from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sqlite3

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.mentors.repository import MentorRepository
from apps.api.app.modules.mentors.schemas import (
    AcceptInvitationRequest, AcademicDeadlineSummary, AcademicSummaryInput, CareerGoalInput, CareerReadinessInput,
    ConsentPreviewRequest, CreateRelationshipRequest, GuidanceRequestCreate, MentorPlanActionRequest, PlannerBlockInput,
    ReadinessMetricInput, RecommendationCreate, RecommendationDecisionRequest, RevokeRelationshipRequest,
    StudentShareSnapshotInput, UpdateConsentRequest,
)
from apps.api.app.modules.mentors.service import MentorService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import PathwayContextRequest, PathwayDecisionRequest, ResourcePreferences
from apps.api.app.modules.pathways.service import PathwayService

NOW = datetime(2026, 11, 1, 4, 0, tzinfo=timezone.utc)


def snapshot():
    return StudentShareSnapshotInput(
        academic_summary=AcademicSummaryInput(
            university="Luma University", degree="BSc Computer Science", academic_year="Year 3", semester="Semester 1",
            current_modules=["Software Engineering", "Cloud Computing"], open_academic_tasks=3, completed_academic_tasks=11,
            upcoming_deadlines=[AcademicDeadlineSummary(title="SE report", module="Software Engineering", due_at=NOW + timedelta(days=4))],
        ),
        career_goal=CareerGoalInput(target_role="DevOps Engineer", career_goal="internship", learning_goal="Build deployment evidence"),
        career_readiness=CareerReadinessInput(score=72, weekly_delta=3, breakdown=[ReadinessMetricInput(label="Technical", value=70), ReadinessMetricInput(label="Evidence", value=62)]),
    )


def create_request(**overrides):
    values = dict(
        mentor_label="Dr. Mentor", purpose="Review my DevOps roadmap and help me choose the next evidence milestone.",
        categories=["academic_summary", "career_goal", "career_readiness", "roadmap"], expires_at=NOW + timedelta(days=30), snapshot=snapshot(),
    )
    values.update(overrides)
    return CreateRelationshipRequest(**values)


def svc(tmp_path: Path, now=lambda: NOW):
    db = str(tmp_path / "mentors.db")
    repo = MentorRepository(db)
    pathways = PathwayRepository(db)
    return MentorService(repo, pathways, now=now), repo, pathways


def make_active_pathway(pathways: PathwayRepository):
    ps = PathwayService(pathways, now=lambda: NOW)
    request = PathwayContextRequest(
        target_role="DevOps Engineer", goal="Become internship-ready", pace="balanced", timezone="Asia/Colombo", planning_start=date(2026, 11, 2),
        weekly_learning_minutes=180, daily_available_minutes=180, skills=[], academic_tasks=[], planner_blocks=[],
        resource_preferences=ResourcePreferences(language="English", budget="free only", formats=["hands-on"]),
    )
    draft = ps.generate("student-a", request)
    return ps.decide("student-a", draft.id, PathwayDecisionRequest(decision="approve"))


def activate(service: MentorService, student="student-a"):
    created = service.create_relationship(student, create_request())
    accepted = service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Dr. A. Mentor"))
    return created.relationship, accepted.mentor_access_token


def test_ac1_student_can_preview_invite_scope_expiry_and_revoke(tmp_path):
    service, _, pathways = svc(tmp_path)
    make_active_pathway(pathways)
    preview = service.consent_preview("student-a", ConsentPreviewRequest(purpose="Roadmap review", categories=["career_goal", "roadmap"], snapshot=snapshot()))
    assert preview.shared.career_goal.target_role == "DevOps Engineer"
    assert preview.shared.academic_summary is None
    assert preview.shared.roadmap is not None
    created = service.create_relationship("student-a", create_request(categories=["career_goal", "roadmap"]))
    assert created.relationship.status == "pending"
    accepted = service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Mentor One"))
    assert accepted.relationship.status == "active"
    revoked = service.revoke("student-a", created.relationship.id, "No longer needed")
    assert revoked.status == "revoked"
    with pytest.raises(HTTPException) as exc:
        service.mentor_view(created.relationship.id, accepted.mentor_access_token)
    assert exc.value.status_code == 403


def test_ac2_mentor_sees_only_consented_fields_and_requests(tmp_path):
    service, _, _ = svc(tmp_path)
    created = service.create_relationship("student-a", create_request(categories=["career_goal"]))
    service.create_guidance_request("student-a", created.relationship.id, GuidanceRequestCreate(title="Roadmap question", question="Which skill should I evidence next?", context_note="Please focus on internship readiness."))
    accepted = service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Mentor"))
    view = service.mentor_view(created.relationship.id, accepted.mentor_access_token)
    assert view.shared.career_goal is not None
    assert view.shared.academic_summary is None
    assert view.shared.career_readiness is None
    assert view.shared.roadmap is None
    assert view.guidance_requests[0].question.startswith("Which skill")
    shared_payload = view.shared.model_dump(mode="json")
    serialized = str(shared_payload).lower()
    assert "lifeloadnote" not in serialized and "cv document" not in serialized and "recording_url" not in serialized
    assert any("CV" in item for item in view.never_shared_by_default)


def test_student_can_expand_scope_but_mentor_cannot_change_it(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    updated = service.update_consent("student-a", relationship.id, UpdateConsentRequest(categories=["career_goal", "career_readiness"], expires_at=NOW + timedelta(days=60), snapshot=snapshot()))
    assert set(updated.categories) == {"career_goal", "career_readiness"}
    view = service.mentor_view(relationship.id, token)
    assert view.shared.career_readiness.score == 72
    assert view.shared.academic_summary is None


def test_ac3_recommendation_requires_student_acceptance_before_plan_action(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    req = service.create_guidance_request("student-a", relationship.id, GuidanceRequestCreate(title="Practice", question="What should I practice this week?"))
    rec = service.mentor_recommend(relationship.id, token, RecommendationCreate(guidance_request_id=req.id, kind="recommendation", title="Docker evidence", rationale="Your roadmap shows Docker as an unfinished evidence area.", suggested_action="Build and document a Docker deployment", suggested_minutes=60))
    with pytest.raises(HTTPException) as exc:
        service.approve_plan_action("student-a", relationship.id, rec.id, MentorPlanActionRequest(start_at=NOW + timedelta(days=1), duration_minutes=60, planner_blocks=[], confirmed=True, idempotency_key="mentor-plan-001"))
    assert exc.value.status_code == 409
    accepted = service.decide_recommendation("student-a", relationship.id, rec.id, RecommendationDecisionRequest(decision="accept", note="Useful next step"))
    assert accepted.status == "accepted"
    action = service.approve_plan_action("student-a", relationship.id, rec.id, MentorPlanActionRequest(start_at=NOW + timedelta(days=1), duration_minutes=60, planner_blocks=[], confirmed=True, idempotency_key="mentor-plan-001"))
    assert action.source_label.startswith("Mentor guidance")
    again = service.approve_plan_action("student-a", relationship.id, rec.id, MentorPlanActionRequest(start_at=NOW + timedelta(days=2), duration_minutes=90, planner_blocks=[], confirmed=True, idempotency_key="mentor-plan-001"))
    assert again == action


def test_comments_cannot_be_converted_to_plan_actions(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    comment = service.mentor_recommend(relationship.id, token, RecommendationCreate(kind="comment", title="Nice evidence", rationale="The project description is clear and specific."))
    service.decide_recommendation("student-a", relationship.id, comment.id, RecommendationDecisionRequest(decision="accept"))
    with pytest.raises(HTTPException) as exc:
        service.approve_plan_action("student-a", relationship.id, comment.id, MentorPlanActionRequest(start_at=NOW + timedelta(days=1), duration_minutes=30, planner_blocks=[], confirmed=True, idempotency_key="comment-plan-001"))
    assert exc.value.status_code == 409


def test_plan_action_revalidates_overlap(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    rec = service.mentor_recommend(relationship.id, token, RecommendationCreate(title="Review Git", rationale="Practice explaining your Git workflow.", suggested_action="Prepare a Git workflow explanation", suggested_minutes=45))
    service.decide_recommendation("student-a", relationship.id, rec.id, RecommendationDecisionRequest(decision="accept"))
    start = NOW + timedelta(days=1)
    with pytest.raises(HTTPException) as exc:
        service.approve_plan_action("student-a", relationship.id, rec.id, MentorPlanActionRequest(start_at=start, duration_minutes=45, planner_blocks=[PlannerBlockInput(id="busy", start_at=start, end_at=start + timedelta(hours=1))], confirmed=True, idempotency_key="overlap-plan-001"))
    assert exc.value.status_code == 409


def test_ac4_private_checkins_and_raw_personal_content_are_absent_from_storage_schema(tmp_path):
    service, repo, _ = svc(tmp_path)
    service.create_relationship("student-a", create_request())
    with sqlite3.connect(repo.database_path) as db:
        columns = set()
        for table in ["mentor_relationships", "mentor_shared_snapshots", "guidance_requests", "mentor_recommendations"]:
            columns |= {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
    forbidden = {"life_load_note", "capacity_checkin", "cv_document", "cv_text", "interview_recording", "interview_audio", "private_task_note"}
    assert not forbidden & columns


def test_ac5_access_history_records_meaningful_mentor_reads_and_writes(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    service.mentor_view(relationship.id, token)
    service.mentor_recommend(relationship.id, token, RecommendationCreate(title="Next step", rationale="Focus on one concrete roadmap milestone.", suggested_action="Complete one milestone", suggested_minutes=30))
    history = service.access_history("student-a", relationship.id)
    event_types = {item.event_type for item in history}
    assert "shared_summary_viewed" in event_types
    assert "recommendation_added" in event_types
    viewed = next(item for item in history if item.event_type == "shared_summary_viewed")
    assert "career_goal" in viewed.categories


def test_ac6_expiry_denies_mentor_immediately(tmp_path):
    clock = {"now": NOW}
    service, _, _ = svc(tmp_path, now=lambda: clock["now"])
    created = service.create_relationship("student-a", create_request(expires_at=NOW + timedelta(hours=1)))
    accepted = service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Mentor"))
    assert service.mentor_view(created.relationship.id, accepted.mentor_access_token).relationship.status == "active"
    clock["now"] = NOW + timedelta(hours=2)
    with pytest.raises(HTTPException) as exc:
        service.mentor_view(created.relationship.id, accepted.mentor_access_token)
    assert exc.value.status_code == 403
    assert service.get_relationship("student-a", created.relationship.id).status == "expired"


def test_invitation_is_one_time_and_has_shorter_acceptance_expiry(tmp_path):
    service, _, _ = svc(tmp_path)
    created = service.create_relationship("student-a", create_request(expires_at=NOW + timedelta(days=30)))
    accepted = service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Mentor"))
    assert accepted.mentor_access_token != created.invitation_token
    with pytest.raises(HTTPException):
        service.accept_invitation(AcceptInvitationRequest(invitation_token=created.invitation_token, mentor_name="Other"))


def test_cross_student_relationship_notes_and_recommendations_are_denied(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    service.mentor_recommend(relationship.id, token, RecommendationCreate(title="Private rec", rationale="Private mentor rationale."))
    with pytest.raises(HTTPException) as exc:
        service.recommendations("student-b", relationship.id)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc2:
        service.access_history("student-b", relationship.id)
    assert exc2.value.status_code == 403


def test_http_role_and_consent_matrix(monkeypatch, tmp_path):
    import apps.api.app.modules.mentors.router as mentor_router
    service, repo, pathways = svc(tmp_path)
    monkeypatch.setattr(mentor_router, "repository", repo)
    monkeypatch.setattr(mentor_router, "pathway_repository", pathways)
    monkeypatch.setattr(mentor_router, "service", service)
    client = TestClient(app)
    student = {"X-Luma-Student-Id": "student-http"}
    payload = create_request(categories=["career_goal"]).model_dump(mode="json")
    created = client.post("/v1/mentors/relationships", headers=student, json=payload)
    assert created.status_code == 201
    relationship_id = created.json()["relationship"]["id"]
    token = created.json()["invitation_token"]
    accepted = client.post("/v1/mentor-access/invitations/accept", json={"invitation_token": token, "mentor_name": "HTTP Mentor"})
    assert accepted.status_code == 200
    access = accepted.json()["mentor_access_token"]
    view = client.get(f"/v1/mentor-access/relationships/{relationship_id}", headers={"X-Luma-Mentor-Token": access})
    assert view.status_code == 200 and view.json()["shared"]["career_goal"]["target_role"] == "DevOps Engineer"
    assert client.get(f"/v1/mentors/relationships/{relationship_id}", headers={"X-Luma-Student-Id": "other"}).status_code == 403
    revoked = client.post(f"/v1/mentors/relationships/{relationship_id}/revoke", headers=student, json={"reason":"Done"})
    assert revoked.status_code == 200
    assert client.get(f"/v1/mentor-access/relationships/{relationship_id}", headers={"X-Luma-Mentor-Token": access}).status_code == 403

def test_mentor_token_is_bound_to_one_relationship(tmp_path):
    service, _, _ = svc(tmp_path)
    first, first_token = activate(service, "student-a")
    second_created = service.create_relationship("student-a", create_request(mentor_label="Second mentor"))
    second = service.accept_invitation(AcceptInvitationRequest(invitation_token=second_created.invitation_token, mentor_name="Second")).relationship
    with pytest.raises(HTTPException) as exc:
        service.mentor_view(second.id, first_token)
    assert exc.value.status_code == 403


def test_revoked_token_attempt_is_auditable_without_restoring_access(tmp_path):
    service, _, _ = svc(tmp_path)
    relationship, token = activate(service)
    service.revoke("student-a", relationship.id, "Immediate privacy test")
    with pytest.raises(HTTPException) as exc:
        service.mentor_view(relationship.id, token)
    assert exc.value.status_code == 403
    history = service.access_history("student-a", relationship.id)
    assert any(item.event_type == "access_denied" for item in history)
    assert service.get_relationship("student-a", relationship.id).status == "revoked"
