from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.pathways.definitions import PathwaySkillDefinition, topological_order
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import (
    AcademicTaskContext, MilestoneUpdateRequest, PathwayContextRequest, PathwayDecisionRequest, PlannerApprovalRequest,
    PlannerBlockContext, RecalculateRequest, ResourceDecisionRequest, ResourcePreferences, SkillContext,
)
from apps.api.app.modules.pathways.service import PathwayService


NOW = datetime(2026, 10, 31, 4, 0, tzinfo=timezone.utc)
START = date(2026, 11, 2)  # Monday


def service(tmp_path: Path):
    repo = PathwayRepository(str(tmp_path / "pathways.db"))
    return PathwayService(repo, now=lambda: NOW), repo


def request(**overrides):
    payload = dict(
        target_role="DevOps Engineer",
        goal="Become internship-ready for DevOps",
        pace="balanced",
        timezone="Asia/Colombo",
        planning_start=START,
        weekly_learning_minutes=360,
        daily_available_minutes=240,
        skills=[
            SkillContext(skill_id="linux", status="verified", proficiency=82, evidence_refs=["evidence:linux"]),
            SkillContext(skill_id="git", status="completed", proficiency=76, evidence_refs=["assessment:git"]),
            SkillContext(skill_id="networking", status="completed", proficiency=68, evidence_refs=["assessment:networking"]),
            SkillContext(skill_id="docker", status="in-progress", proficiency=52, evidence_refs=[]),
        ],
        academic_tasks=[],
        planner_blocks=[],
        resource_preferences=ResourcePreferences(language="English", budget="free only", formats=["hands-on", "projects"]),
    )
    payload.update(overrides)
    return PathwayContextRequest(**payload)


def approve(svc: PathwayService, student: str, draft_id: str):
    return svc.decide(student, draft_id, PathwayDecisionRequest(decision="approve"))


def test_ac1_prerequisites_are_topologically_ordered_and_cycle_is_rejected(tmp_path):
    svc, _ = service(tmp_path)
    draft = svc.generate("student-a", request())
    positions = {step.skill_id: step.order for step in draft.steps}
    assert positions["linux"] < positions["networking"] < positions["docker"] < positions["kubernetes"] < positions["monitoring"]
    assert positions["git"] < positions["cicd"]
    with pytest.raises(ValueError, match="cycle"):
        topological_order([
            PathwaySkillDefinition("a", "A", ("b",), 60, ("a",)),
            PathwaySkillDefinition("b", "B", ("a",), 60, ("b",)),
        ])


def test_ac2_weekly_actions_respect_capacity_and_protect_urgent_academics(tmp_path):
    svc, _ = service(tmp_path)
    due = datetime(2026, 11, 3, 18, 29, tzinfo=timezone.utc)  # 23:59 Asia/Colombo Tuesday
    req = request(academic_tasks=[AcademicTaskContext(id="db", title="DB assignment", due_at=due, remaining_minutes=180, risk_score=92, status="in-progress")])
    draft = svc.generate("student-a", req)
    assert draft.weekly_actions
    local_dates = [action.start_at.astimezone(ZoneInfo("Asia/Colombo")).date() for action in draft.weekly_actions]
    assert date(2026, 11, 2) not in local_dates
    assert date(2026, 11, 3) not in local_dates
    assert all(action.planned_minutes <= 90 for action in draft.weekly_actions)
    by_week = {}
    for action in draft.weekly_actions:
        by_week[action.week_start] = by_week.get(action.week_start, 0) + action.planned_minutes
    assert all(minutes <= 270 for minutes in by_week.values())  # balanced = 75% of 360
    assert any("academic" in warning.lower() for warning in draft.warnings)


def test_zero_capacity_returns_honest_unscheduled_roadmap(tmp_path):
    svc, _ = service(tmp_path)
    draft = svc.generate("student-a", request(weekly_learning_minutes=0, daily_available_minutes=0))
    assert draft.weekly_actions == []
    assert any("zero" in warning.lower() for warning in draft.warnings)
    assert draft.steps  # milestones remain visible rather than fabricated plan blocks


def test_ac3_milestone_completion_unlocks_downstream_without_claiming_verified_evidence(tmp_path):
    svc, _ = service(tmp_path)
    draft = svc.generate("student-a", request(skills=[]))
    active = approve(svc, "student-a", draft.id)
    linux = next(step for step in active.steps if step.skill_id == "linux")
    updated = svc.update_milestone("student-a", active.id, linux.id, MilestoneUpdateRequest(state="completed", note="Finished the learning milestone."))
    linux_after = next(step for step in updated.steps if step.skill_id == "linux")
    networking = next(step for step in updated.steps if step.skill_id == "networking")
    assert linux_after.state == "completed" and linux_after.completion_source == "student_confirmed"
    assert networking.state == "available"


def test_resource_accept_defer_replace_records_reason_and_metadata(tmp_path):
    svc, _ = service(tmp_path)
    draft = svc.generate("student-a", request(skills=[]))
    active = approve(svc, "student-a", draft.id)
    linux = next(step for step in active.steps if step.skill_id == "linux")
    assert linux.selected_resource is not None
    assert linux.selected_resource.cost_type == "free"
    assert linux.selected_resource.language == "English"
    assert linux.selected_resource.format is not None
    assert linux.selected_resource.source
    assert linux.alternative_resources
    deferred = svc.update_resource("student-a", active.id, linux.id, ResourceDecisionRequest(action="defer", reason="I need a project-first option this week."))
    linux_deferred = next(step for step in deferred.steps if step.id == linux.id)
    assert linux_deferred.resource_decision == "deferred"
    assert all(action.status == "deferred" for action in deferred.weekly_actions if action.step_id == linux.id)
    replacement_id = linux.alternative_resources[0].id
    replaced = svc.update_resource("student-a", active.id, linux.id, ResourceDecisionRequest(action="replace", resource_id=replacement_id, reason="The alternative better matches hands-on practice."))
    linux_replaced = next(step for step in replaced.steps if step.id == linux.id)
    assert linux_replaced.selected_resource.id == replacement_id
    assert linux_replaced.resource_decision == "replaced"


def test_missing_resource_metadata_is_not_guessed(tmp_path):
    svc, _ = service(tmp_path)
    selected, alternatives, warning = svc._rank_resources("unknown-skill", request(), None)
    assert selected is None and alternatives == []
    assert "will not guess" in warning


def test_ac4_recalculation_is_draft_with_explanations_and_does_not_replace_active_until_approved(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request()).id)
    recalc_req = RecalculateRequest(**request(pace="light", weekly_learning_minutes=240).model_dump(), reasons=["Weekly learning capacity changed from 360 to 240 minutes."])
    draft = svc.recalculate("student-a", active.id, recalc_req)
    current = svc.current("student-a")
    assert current.active.id == active.id
    assert current.pending_draft.id == draft.id
    assert draft.version == active.version + 1
    assert draft.change_summary is not None
    assert draft.change_summary.explanations[0].startswith("Weekly learning capacity changed")
    rejected = svc.decide("student-a", draft.id, PathwayDecisionRequest(decision="reject"))
    assert rejected.status == "rejected"
    assert svc.current("student-a").active.id == active.id


def test_ac5_goal_switch_preserves_completed_transferable_skills(tmp_path):
    svc, _ = service(tmp_path)
    initial = request(skills=[
        SkillContext(skill_id="cloud", status="verified", proficiency=80, evidence_refs=["evidence:cloud"]),
        SkillContext(skill_id="networking", status="completed", proficiency=75, evidence_refs=["assessment:networking"]),
    ])
    active = approve(svc, "student-a", svc.generate("student-a", initial).id)
    new_context = request(target_role="Cloud Engineer", goal="Prepare for a cloud engineering internship", skills=[])
    recalc = RecalculateRequest(**new_context.model_dump(), reasons=["Career goal changed from DevOps Engineer to Cloud Engineer."])
    draft = svc.recalculate("student-a", active.id, recalc)
    cloud = next(step for step in draft.steps if step.skill_id == "cloud")
    networking = next(step for step in draft.steps if step.skill_id == "networking")
    assert cloud.state in {"credited", "completed"} and cloud.transferable_credit is True
    assert networking.state in {"credited", "completed"} and networking.transferable_credit is True
    assert {"Cloud services", "Cloud networking"}.issubset(set(draft.change_summary.preserved_completed_skills))


def test_ac6_recalculated_draft_only_replaces_active_after_approval(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request()).id)
    draft = svc.recalculate("student-a", active.id, RecalculateRequest(**request(pace="ambitious").model_dump(), reasons=["Student selected an ambitious pace."]))
    assert svc.current("student-a").active.id == active.id
    approved = svc.decide("student-a", draft.id, PathwayDecisionRequest(decision="approve"))
    assert approved.status == "active"
    assert svc.current("student-a").active.id == draft.id
    assert svc.get("student-a", active.id).status == "superseded"


def test_planner_approval_revalidates_overlap_and_capacity(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request()).id)
    action = next(item for item in active.weekly_actions if item.prerequisite_ready)
    overlapping = PlannerBlockContext(id="new-conflict", start_at=action.start_at, end_at=action.end_at, category="Academic", is_fixed=True)
    with pytest.raises(HTTPException) as exc:
        svc.approve_weekly_actions("student-a", active.id, PlannerApprovalRequest(action_ids=[action.id], planner_blocks=[overlapping], daily_available_minutes=240))
    assert exc.value.status_code == 409 and "overlaps" in exc.value.detail
    result = svc.approve_weekly_actions("student-a", active.id, PlannerApprovalRequest(action_ids=[action.id], planner_blocks=[], daily_available_minutes=240))
    assert result.approved_count == 1
    assert result.actions[0].source_label.startswith("Roadmap · v")


def test_locked_future_commitment_cannot_be_added_to_planner(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request(skills=[])).id)
    locked_step_ids = {step.id for step in active.steps if step.state == "locked"}
    locked_action = next(item for item in active.weekly_actions if item.step_id in locked_step_ids)
    with pytest.raises(HTTPException) as exc:
        svc.approve_weekly_actions("student-a", active.id, PlannerApprovalRequest(action_ids=[locked_action.id], planner_blocks=[], daily_available_minutes=240))
    assert exc.value.status_code == 409 and "locked" in exc.value.detail


def test_cross_student_ownership_is_enforced(tmp_path):
    svc, _ = service(tmp_path)
    draft = svc.generate("student-a", request())
    with pytest.raises(HTTPException) as exc:
        svc.get("student-b", draft.id)
    assert exc.value.status_code == 403
    step = draft.steps[0]
    with pytest.raises(HTTPException) as exc:
        svc.update_resource("student-b", draft.id, step.id, ResourceDecisionRequest(action="accept"))
    assert exc.value.status_code == 403


def test_http_generate_current_approve_and_owner_denial(monkeypatch, tmp_path):
    import apps.api.app.modules.pathways.router as pathways_router
    repo = PathwayRepository(str(tmp_path / "http.db"))
    svc = PathwayService(repo, now=lambda: NOW)
    monkeypatch.setattr(pathways_router, "repository", repo)
    monkeypatch.setattr(pathways_router, "service", svc)
    client = TestClient(app)
    payload = request().model_dump(mode="json")
    created = client.post("/v1/pathways/generate", headers={"X-Luma-Student-Id":"student-a"}, json=payload)
    assert created.status_code == 201
    pathway_id = created.json()["id"]
    current = client.get("/v1/pathways/current", headers={"X-Luma-Student-Id":"student-a"})
    assert current.status_code == 200 and current.json()["pending_draft"]["id"] == pathway_id
    approved = client.post(f"/v1/pathways/{pathway_id}/decision", headers={"X-Luma-Student-Id":"student-a"}, json={"decision":"approve"})
    assert approved.status_code == 200 and approved.json()["status"] == "active"
    denied = client.get(f"/v1/pathways/{pathway_id}", headers={"X-Luma-Student-Id":"student-b"})
    assert denied.status_code == 403


def test_deferred_resource_reason_changes_next_recommendation(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request(skills=[])).id)
    linux = next(step for step in active.steps if step.skill_id == "linux")
    original_id = linux.selected_resource.id
    svc.update_resource(
        "student-a",
        active.id,
        linux.id,
        ResourceDecisionRequest(action="defer", reason="Prefer a different learning format next time."),
    )
    draft = svc.recalculate(
        "student-a",
        active.id,
        RecalculateRequest(**request(skills=[]).model_dump(), reasons=["Resource preference feedback was recorded."]),
    )
    linux_next = next(step for step in draft.steps if step.skill_id == "linux")
    assert linux_next.selected_resource is not None
    assert linux_next.selected_resource.id != original_id
    original_after_defer = next(step for step in svc.get("student-a", active.id).steps if step.skill_id == "linux")
    assert original_after_defer.resource_reason == "Prefer a different learning format next time."


def test_replacing_a_deferred_resource_reactivates_uncommitted_weekly_actions(tmp_path):
    svc, _ = service(tmp_path)
    active = approve(svc, "student-a", svc.generate("student-a", request(skills=[])).id)
    linux = next(step for step in active.steps if step.skill_id == "linux")
    deferred = svc.update_resource(
        "student-a", active.id, linux.id,
        ResourceDecisionRequest(action="defer", reason="Switch to the project option."),
    )
    assert all(item.status == "deferred" for item in deferred.weekly_actions if item.step_id == linux.id)
    replacement_id = linux.alternative_resources[0].id
    replaced = svc.update_resource(
        "student-a", active.id, linux.id,
        ResourceDecisionRequest(action="replace", resource_id=replacement_id, reason="This format fits my plan."),
    )
    assert all(item.status == "draft" for item in replaced.weekly_actions if item.step_id == linux.id)
