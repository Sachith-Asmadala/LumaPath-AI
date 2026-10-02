from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.teams.repository import TeamRepository
from apps.api.app.modules.teams.schemas import (
    ActivityCorrectionRequest, CommentCreateRequest, InvitationAcceptRequest, InvitationCreateRequest,
    LeaveTeamRequest, MeetingNoteCreateRequest, MemberRemovalRequest, MemberRoleUpdateRequest,
    MemberSharingUpdateRequest, MilestoneCreateRequest, ProjectCreateRequest, ProjectUpdateRequest,
    TaskAssignmentRequest, TaskCreateRequest, TaskStatusRequest, TaskUpdateRequest, TeamCreateRequest,
)
from apps.api.app.modules.teams.service import TeamService

NOW = datetime(2026, 11, 15, 4, 0, tzinfo=timezone.utc)


def service(tmp_path: Path, now=lambda: NOW):
    db = str(tmp_path / "teams.db")
    repo = TeamRepository(db)
    careers = CareerService(CareerRepository(db), now=now)
    return TeamService(repo, career_service=careers, now=now), repo


def create_team(svc: TeamService, student="student-a"):
    return svc.create_team(student, TeamCreateRequest(name="SE Group 26", description="Shared final project workspace", owner_display_name="Asha"))


def join_member(svc: TeamService, team_id: str, owner="student-a", member="student-b", display="Nima", role="member"):
    invite = svc.create_invitation(owner, team_id, InvitationCreateRequest(invite_label=display, role=role, expires_at=NOW + timedelta(days=2)))
    detail = svc.accept_invitation(member, InvitationAcceptRequest(invitation_token=invite.invitation_token, display_name=display))
    membership = next(item for item in detail.members if item.is_self)
    return membership, invite


def make_project(svc: TeamService, team_id: str, student="student-a"):
    return svc.create_project(student, team_id, ProjectCreateRequest(name="ResearchTrack Sprint", description="Team sprint"))


def test_ac1_team_invite_accept_and_authorised_members_create_shared_records(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    project = svc.create_project("student-b", team.id, ProjectCreateRequest(name="Sprint 1", description="Shared sprint"))
    milestone = svc.create_milestone("student-b", team.id, project.id, MilestoneCreateRequest(title="Demo ready"))
    task = svc.create_task("student-b", team.id, project.id, TaskCreateRequest(title="Prepare demo", milestone_id=milestone.id, estimated_minutes=90))
    note = svc.create_meeting_note("student-b", team.id, project.id, MeetingNoteCreateRequest(title="Sprint sync", occurred_at=NOW, summary="Agreed demo scope."))
    assert member.role == "member"
    assert task.milestone_id == milestone.id
    assert note.title == "Sprint sync"


def test_invitation_is_one_time_and_expiry_is_enforced(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    invitation = svc.create_invitation("student-a", team.id, InvitationCreateRequest(invite_label="Member", expires_at=NOW + timedelta(hours=1)))
    svc.accept_invitation("student-b", InvitationAcceptRequest(invitation_token=invitation.invitation_token, display_name="Member B"))
    with pytest.raises(HTTPException) as exc:
        svc.accept_invitation("student-c", InvitationAcceptRequest(invitation_token=invitation.invitation_token, display_name="Member C"))
    assert exc.value.status_code == 404

    expired_svc, _ = service(tmp_path / "expired", now=lambda: NOW + timedelta(days=2))
    team2 = expired_svc.create_team("owner", TeamCreateRequest(name="Another team", owner_display_name="Owner")).team
    # create using a clock before expiry, then advance it
    base = NOW
    clock = {"now": base}
    dynamic_svc, _ = service(tmp_path / "dynamic", now=lambda: clock["now"])
    t = dynamic_svc.create_team("owner", TeamCreateRequest(name="Expiry team", owner_display_name="Owner")).team
    inv = dynamic_svc.create_invitation("owner", t.id, InvitationCreateRequest(invite_label="Late member", expires_at=base + timedelta(hours=1)))
    clock["now"] = base + timedelta(hours=2)
    with pytest.raises(HTTPException) as exc2:
        dynamic_svc.accept_invitation("late", InvitationAcceptRequest(invitation_token=inv.invitation_token, display_name="Late"))
    assert exc2.value.status_code == 403


def test_ac2_assignment_and_status_history_record_actor_and_timestamp(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Write API tests", estimated_minutes=120))
    task = svc.assign_task("student-a", team.id, project.id, task.id, TaskAssignmentRequest(assignee_membership_id=member.id, expected_version=task.version, confirmed=True, rationale_note="Member accepted this task."))
    task = svc.update_task_status("student-b", team.id, project.id, task.id, TaskStatusRequest(status="in_progress", expected_version=task.version))
    task = svc.update_task_status("student-b", team.id, project.id, task.id, TaskStatusRequest(status="done", expected_version=task.version))
    events = svc.activity("student-a", team.id, project.id)
    assert any(e.event_type == "task_assigned" and e.actor_display_name == "Asha" for e in events)
    assert any(e.event_type == "task_completed" and e.actor_display_name == "Nima" for e in events)
    assert all(e.occurred_at.tzinfo is not None for e in events)


def test_task_dependencies_block_work_and_cycles_are_rejected(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    project = make_project(svc, team.id)
    first = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Design schema"))
    second = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Implement API", dependency_task_ids=[first.id]))
    with pytest.raises(HTTPException) as exc:
        svc.update_task_status("student-a", team.id, project.id, second.id, TaskStatusRequest(status="in_progress", expected_version=second.version))
    assert exc.value.status_code == 409
    with pytest.raises(HTTPException) as cycle:
        svc.update_task("student-a", team.id, project.id, first.id, TaskUpdateRequest(expected_version=first.version, dependency_task_ids=[second.id]))
    assert cycle.value.status_code == 422


def test_ac3_allocation_uses_only_explicitly_shared_skill_and_availability_data(tmp_path):
    svc, repo = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    detail = svc.team_detail("student-a", team.id)
    owner_membership = next(m for m in detail.members if m.is_self)
    svc.update_sharing("student-a", team.id, MemberSharingUpdateRequest(share_availability=True, availability_minutes_per_week=300, share_skills=True, target_role="DevOps Engineer", skill_ids=["docker"]))
    # member B shares nothing
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Containerize service", estimated_minutes=90, required_skill_ids=["docker"]))
    suggestions = svc.allocation_suggestions("student-a", team.id, project.id)
    by_member = {c.membership_id: c for c in suggestions.suggestions[0].candidates}
    assert by_member[owner_membership.id].fit_band == "strong"
    assert by_member[owner_membership.id].declared_weekly_minutes == 300
    assert by_member[member.id].fit_band == "limited_data"
    schema = " ".join(row[1] for row in repo.all("PRAGMA table_info(team_member_sharing)"))
    assert "grade" not in schema.lower() and "checkin" not in schema.lower() and "personal_note" not in schema.lower()


def test_allocation_suggestion_never_auto_assigns_and_human_confirmation_is_required(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Write docs"))
    svc.allocation_suggestions("student-a", team.id, project.id)
    assert svc.project_workspace("student-a", team.id, project.id).tasks[0].assignee_membership_id is None
    with pytest.raises(HTTPException) as exc:
        svc.assign_task("student-a", team.id, project.id, task.id, TaskAssignmentRequest(assignee_membership_id=member.id, expected_version=task.version, confirmed=False))
    assert exc.value.status_code == 422


def test_ac4_contribution_history_is_factual_correctable_and_not_ranked(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Test feature"))
    task = svc.assign_task("student-a", team.id, project.id, task.id, TaskAssignmentRequest(assignee_membership_id=member.id, expected_version=task.version, confirmed=True))
    task = svc.update_task_status("student-b", team.id, project.id, task.id, TaskStatusRequest(status="done", expected_version=task.version))
    complete_event = next(e for e in svc.activity("student-a", team.id) if e.event_type == "task_completed")
    before = svc.contribution_history("student-a", team.id)
    member_before = next(m for m in before.members if m.membership_id == member.id)
    assert member_before.task_completed == 1 and before.no_ranking is True
    correction = svc.correct_activity("student-b", team.id, complete_event.id, ActivityCorrectionRequest(reason="Marked done accidentally; work was still under review."))
    assert correction.correction_of_event_id == complete_event.id
    after = svc.contribution_history("student-a", team.id)
    member_after = next(m for m in after.members if m.membership_id == member.id)
    assert member_after.task_completed == 0
    assert "leaderboard" in after.explanation.lower()


def test_meeting_notes_and_comments_are_shared_but_personal_data_is_not_derived(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    join_member(svc, team.id)
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Prepare slides"))
    comment = svc.add_comment("student-b", team.id, project.id, task.id, CommentCreateRequest(body="I can review the architecture slide."))
    note = svc.create_meeting_note("student-b", team.id, project.id, MeetingNoteCreateRequest(title="Weekly meeting", occurred_at=NOW, summary="Reviewed project scope.", decisions="Use API contract v2.", action_items=["Update architecture diagram"]))
    workspace = svc.project_workspace("student-a", team.id, project.id)
    assert comment.author_display_name == "Nima"
    assert workspace.meeting_notes[0].decisions == "Use API contract v2."
    assert "capacity" not in str(workspace.model_dump()).lower()


def test_concurrent_task_edit_returns_conflict(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    project = make_project(svc, team.id)
    task = svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Original"))
    updated = svc.update_task("student-a", team.id, project.id, task.id, TaskUpdateRequest(expected_version=task.version, title="Edited once"))
    assert updated.version == 2
    with pytest.raises(HTTPException) as exc:
        svc.update_task("student-a", team.id, project.id, task.id, TaskUpdateRequest(expected_version=task.version, title="Stale edit"))
    assert exc.value.status_code == 409


def test_non_member_access_is_denied(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    with pytest.raises(HTTPException) as exc:
        svc.team_detail("outsider", team.id)
    assert exc.value.status_code == 403


def test_ac6_member_removal_revokes_access_immediately_but_history_remains(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id)
    project = svc.create_project("student-b", team.id, ProjectCreateRequest(name="Member project"))
    svc.create_task("student-b", team.id, project.id, TaskCreateRequest(title="Member-created task"))
    removed = svc.remove_member("student-a", team.id, member.id, MemberRemovalRequest(reason="Project handoff complete", expected_version=member.version))
    assert removed.status == "removed"
    with pytest.raises(HTTPException) as exc:
        svc.team_detail("student-b", team.id)
    assert exc.value.status_code == 403
    history = svc.activity("student-a", team.id)
    assert any(e.actor_display_name == "Nima" and e.event_type == "task_created" for e in history)


def test_sharing_can_be_revoked_without_erasing_project_history(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    svc.update_sharing("student-a", team.id, MemberSharingUpdateRequest(share_availability=True, availability_minutes_per_week=240, share_skills=False))
    project = make_project(svc, team.id)
    svc.create_task("student-a", team.id, project.id, TaskCreateRequest(title="Shared work"))
    sharing = svc.update_sharing("student-a", team.id, MemberSharingUpdateRequest(share_availability=False, share_skills=False))
    assert sharing.availability_shared is False and sharing.skills_shared is False
    assert len(svc.project_workspace("student-a", team.id, project.id).tasks) == 1


def test_owner_transfer_allows_previous_owner_to_leave(tmp_path):
    svc, _ = service(tmp_path)
    team = create_team(svc).team
    member, _ = join_member(svc, team.id, role="coordinator")
    owner = next(m for m in svc.team_detail("student-a", team.id).members if m.is_self)
    promoted = svc.update_member_role("student-a", team.id, member.id, MemberRoleUpdateRequest(role="owner", expected_version=member.version))
    assert promoted.role == "owner"
    result = svc.leave_team("student-a", team.id, LeaveTeamRequest(reason="Transferred ownership"))
    assert result["status"] == "left"
    assert svc.team_detail("student-b", team.id).team.my_role == "owner"


def test_http_role_matrix_and_access_denial(tmp_path, monkeypatch):
    # Router singletons need an isolated repository/service for this test.
    from apps.api.app.modules import teams as teams_pkg
    from apps.api.app.modules.teams import router as teams_router
    isolated_repo = TeamRepository(str(tmp_path / "http.db"))
    isolated_career = CareerService(CareerRepository(str(tmp_path / "http.db")), now=lambda: NOW)
    isolated_service = TeamService(isolated_repo, career_service=isolated_career, now=lambda: NOW)
    monkeypatch.setattr(teams_router, "service", isolated_service)
    client = TestClient(app)
    a = {"X-Luma-Student-Id": "student-a"}; b={"X-Luma-Student-Id":"student-b"}; outsider={"X-Luma-Student-Id":"outsider"}
    created = client.post("/v1/teams", headers=a, json={"name":"HTTP team","description":"","owner_display_name":"Asha"})
    assert created.status_code == 201
    team_id = created.json()["team"]["id"]
    invite = client.post(f"/v1/teams/{team_id}/invitations", headers=a, json={"invite_label":"Nima","role":"member","expires_at":(NOW+timedelta(days=1)).isoformat()})
    assert invite.status_code == 201
    joined = client.post("/v1/team-invitations/accept", headers=b, json={"invitation_token":invite.json()["invitation_token"],"display_name":"Nima"})
    assert joined.status_code == 200
    project = client.post(f"/v1/teams/{team_id}/projects", headers=b, json={"name":"Shared HTTP project"})
    assert project.status_code == 201
    denied = client.get(f"/v1/teams/{team_id}", headers=outsider)
    assert denied.status_code == 403
