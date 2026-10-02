from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
import tempfile

import pytest
from fastapi import HTTPException

from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.opportunities.repository import OpportunityRepository
from apps.api.app.modules.opportunities.schemas import (
    BrowseRequest,
    InteractionRequest,
    EligibilityProfile,
    ExistingPlanBlock,
    PreparationApprovalItem,
    PreparationApproveRequest,
    PreparationProposalRequest,
    RecommendationContext,
    SkillContext,
    TrackingUpdateRequest,
)
from apps.api.app.modules.opportunities.service import OpportunityService
from apps.api.app.modules.pathways.repository import PathwayRepository

NOW = datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc)


def integrated_service():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    opportunity_repository = OpportunityRepository(tmp.name)
    pathway_repository = PathwayRepository(tmp.name)
    evidence_repository = EvidencePassportRepository(tmp.name)
    service = OpportunityService(
        opportunity_repository,
        now=lambda: NOW,
        pathway_repository=pathway_repository,
        evidence_repository=evidence_repository,
    )
    return service, pathway_repository, evidence_repository


def context(*, docker_demonstrated=False, eligibility=True):
    return RecommendationContext(
        target_role="DevOps Engineer",
        readiness_score=58,
        skills=[
            SkillContext(skill_id="git", level=80, demonstrated=True),
            SkillContext(skill_id="docker", level=55, demonstrated=docker_demonstrated),
        ],
        eligibility=EligibilityProfile(student_status="undergraduate", country="Sri Lanka") if eligibility else EligibilityProfile(),
    )


def seed_pathway(repository: PathwayRepository, *, docker_state="in_progress"):
    at = NOW.isoformat()
    pathway_id = "pathway-s1-v1"
    repository.create_pathway(
        {
            "id": pathway_id,
            "student_id": "s1",
            "version": 1,
            "status": "active",
            "target_role": "DevOps Engineer",
            "goal": "Become internship ready",
            "pace": "balanced",
            "definition_version": "test-v1",
            "parent_pathway_id": None,
            "recalculation_reason_json": "[]",
            "weekly_learning_minutes": 300,
            "daily_available_minutes": 90,
            "timezone": "Asia/Colombo",
            "context_json": "{}",
            "warnings_json": "[]",
            "change_summary_json": None,
            "created_at": at,
            "approved_at": at,
            "rejected_at": None,
        },
        [
            {
                "id": "step-git",
                "pathway_id": pathway_id,
                "student_id": "s1",
                "skill_id": "git",
                "name": "Git",
                "step_order": 1,
                "prerequisites_json": "[]",
                "state": "completed",
                "proficiency": 80,
                "estimated_minutes": 120,
                "target_evidence_json": "[]",
                "evidence_refs_json": '["e-git"]',
                "transferable_credit": 0,
                "completion_source": "assessment",
                "selected_resource_id": None,
                "selected_resource_json": None,
                "alternative_resources_json": "[]",
                "resource_decision": "recommended",
                "resource_reason": None,
                "created_at": at,
                "updated_at": at,
            },
            {
                "id": "step-docker",
                "pathway_id": pathway_id,
                "student_id": "s1",
                "skill_id": "docker",
                "name": "Docker",
                "step_order": 2,
                "prerequisites_json": '["git"]',
                "state": docker_state,
                "proficiency": 45,
                "estimated_minutes": 240,
                "target_evidence_json": "[]",
                "evidence_refs_json": "[]",
                "transferable_credit": 0,
                "completion_source": None,
                "selected_resource_id": None,
                "selected_resource_json": None,
                "alternative_resources_json": "[]",
                "resource_decision": "recommended",
                "resource_reason": None,
                "created_at": at,
                "updated_at": at,
            },
        ],
        [],
    )


def seed_evidence(repository: EvidencePassportRepository, skill="docker", status="observed"):
    at = NOW.isoformat()
    repository.upsert_evidence(
        {
            "id": f"evidence-{skill}-{status}",
            "student_id": "s1",
            "skill_id": skill,
            "skill_name": skill.title(),
            "evidence_type": "assessment",
            "title": "Assessment evidence",
            "source_origin": "assessment",
            "source_ref": f"assessment:{skill}",
            "source_url": None,
            "issuer": None,
            "acquired_at": None,
            "expires_at": None,
            "observed_at": at,
            "last_reviewed_at": at,
            "reference_hash": f"hash-{skill}",
            "verification_status": status,
            "confidence": 0.8,
            "proficiency": 70,
            "correction_note": "",
            "owner_disputed": 0,
            "source_missing": 0,
            "active": 1,
            "metadata_json": "{}",
            "created_at": at,
            "updated_at": at,
        }
    )


def opportunity(service: OpportunityService, ctx=None):
    result = service.browse("s1", BrowseRequest(context=ctx))
    return next(item for item in result.items if item.id == "devops-intern-2026")


def proposal(service: OpportunityService, item, daily=90, blocks=None):
    return service.propose_preparation(
        "s1",
        item.id,
        PreparationProposalRequest(
            eligibility_evaluation_id=item.eligibility_evaluation_id,
            timezone="Asia/Colombo",
            daily_available_minutes=daily,
            existing_blocks=blocks or [],
        ),
    )


def approval_request(plan):
    items = []
    fallback = NOW + timedelta(days=1)
    for index, item in enumerate(plan.items):
        start = item.suggested_start_at or fallback + timedelta(hours=index * 2)
        items.append(PreparationApprovalItem(item_id=item.id, include=True, title=item.title, duration_minutes=item.estimated_minutes, start_at=start))
    return PreparationApproveRequest(confirmed=True, items=items, existing_blocks=[])


def test_requirements_are_versioned_and_preserve_original_source_reference():
    service, _, _ = integrated_service()
    row = service.repository.get("devops-intern-2026")
    reqs = service.repository.requirements(row["id"], row["requirement_version"])
    assert {r["requirement_key"] for r in reqs} == {"skill:git", "skill:docker", "profile:student_status"}
    assert all(r["source_reference"] == row["source_url"] for r in reqs)
    assert all(r["requirement_version"] == "2026-11-v1" for r in reqs)


def test_unpersonalized_browse_does_not_silently_use_private_pathway_or_evidence():
    service, pathways, evidence = integrated_service()
    seed_pathway(pathways, docker_state="completed")
    seed_evidence(evidence, "docker", "observed")
    item = opportunity(service, None)
    skill_checks = {c.key: c for c in item.eligibility_checks if c.kind == "skill"}
    assert skill_checks["skill:git"].status == "unknown"
    assert skill_checks["skill:docker"].status == "unknown"


def test_active_pathway_classifies_completed_as_met_and_in_progress_as_unmet():
    service, pathways, _ = integrated_service()
    seed_pathway(pathways)
    item = opportunity(service, context(eligibility=True))
    checks = {c.key: c for c in item.eligibility_checks}
    assert checks["skill:git"].status == "met"
    assert checks["skill:docker"].status == "unmet"
    assert any(e.source_type == "pathway" for e in checks["skill:docker"].evidence)


def test_trusted_evidence_can_satisfy_skill_requirement_without_claiming_guaranteed_eligibility():
    service, pathways, evidence = integrated_service()
    seed_pathway(pathways)
    seed_evidence(evidence, "docker", "observed")
    item = opportunity(service, context(eligibility=True))
    docker = next(c for c in item.eligibility_checks if c.key == "skill:docker")
    assert docker.status == "met"
    assert any(e.source_type == "evidence_passport" for e in docker.evidence)
    assert "provider" in docker.explanation.lower() or "source" in docker.explanation.lower()


def test_stale_or_self_declared_evidence_does_not_become_certain_eligibility():
    service, _, evidence = integrated_service()
    seed_evidence(evidence, "cloud", "stale")
    result = service.browse("s1", BrowseRequest(context=RecommendationContext(target_role="Cloud Engineer")))
    cloud = next(item for item in result.items if item.id == "cloud-build-competition")
    check = next(c for c in cloud.eligibility_checks if c.key == "skill:cloud")
    assert check.status == "unknown"
    assert check.evidence and check.evidence[0].verification == "stale"


def test_preparation_proposal_turns_unmet_and_unknown_requirements_into_editable_work():
    service, pathways, _ = integrated_service()
    seed_pathway(pathways)
    item = opportunity(service, context(eligibility=False))
    plan = proposal(service, item)
    assert plan.status == "draft"
    assert any(i.kind == "gap" and "Docker" in i.title for i in plan.items)
    assert any(i.kind == "verification" and "Student status" in i.title for i in plan.items)
    assert any(i.kind == "application_step" for i in plan.items)
    assert all(i.editable for i in plan.items)
    assert all((i.suggested_end_at is None or i.suggested_end_at.date() < item.closes_on) for i in plan.items)


def test_backward_scheduler_respects_zero_capacity_and_does_not_fabricate_slots():
    service, _, _ = integrated_service()
    item = opportunity(service, context(docker_demonstrated=False))
    plan = proposal(service, item, daily=0)
    assert all(not i.scheduled for i in plan.items)
    assert any("capacity" in warning.lower() for warning in plan.warnings)


def test_backward_scheduler_avoids_existing_planner_block():
    service, _, _ = integrated_service()
    item = opportunity(service, context(docker_demonstrated=False))
    blocking = ExistingPlanBlock(id="busy", start_at=datetime(2026, 11, 27, 18, 0, tzinfo=timezone.utc), end_at=datetime(2026, 11, 27, 22, 0, tzinfo=timezone.utc))
    plan = proposal(service, item, daily=90, blocks=[blocking])
    for task in [x for x in plan.items if x.scheduled]:
        assert not (task.suggested_start_at < blocking.end_at and task.suggested_end_at > blocking.start_at)


def test_preparation_requires_explicit_approval_and_is_idempotent():
    service, _, _ = integrated_service()
    item = opportunity(service, context(docker_demonstrated=False))
    plan = proposal(service, item)
    request = approval_request(plan)
    with pytest.raises(HTTPException) as exc:
        service.approve_preparation("s1", item.id, plan.id, request.model_copy(update={"confirmed": False}))
    assert exc.value.status_code == 422
    first = service.approve_preparation("s1", item.id, plan.id, request)
    second = service.approve_preparation("s1", item.id, plan.id, request)
    assert first.newly_approved is True and second.newly_approved is False
    assert {a.action_id for a in first.actions} == {a.action_id for a in second.actions}
    tracking = service.get_tracking("s1", item.id)
    assert tracking and tracking.status == "preparing"


def test_deadline_change_invalidates_unapproved_preparation_plan():
    service, _, _ = integrated_service()
    item = opportunity(service, context(docker_demonstrated=False))
    plan = proposal(service, item)
    service.repository.update_source(item.id, closes_on="2026-11-20")
    with pytest.raises(HTTPException) as exc:
        service.approve_preparation("s1", item.id, plan.id, approval_request(plan))
    assert exc.value.status_code == 409
    stored = service.repository.preparation_plan_for_owner(plan.id, "s1", item.id)
    assert stored["status"] == "invalidated"


def test_canonical_source_duplicate_is_not_inserted_twice():
    service, _, _ = integrated_service()
    original = dict(service.repository.get("devops-intern-2026"))
    duplicate = {**original, "id": "duplicate-devops-intern"}
    service.repository.seed([duplicate], {"duplicate-devops-intern": []})
    assert service.repository.get("duplicate-devops-intern") is None


def test_report_quarantines_active_recommendations_globally_until_governed_revalidation():
    service, _, _ = integrated_service()
    service.interact("s1", "devops-intern-2026", InteractionRequest(action="report", reason="Deadline looks incorrect"))
    assert "devops-intern-2026" not in {item.id for item in service.browse("s1", BrowseRequest()).items}
    assert "devops-intern-2026" not in {item.id for item in service.browse("s2", BrowseRequest()).items}
    rows = service.repository.query("SELECT * FROM source_validation_history WHERE scope='student_report' AND student_id='s1'")
    assert rows and rows[0]["status"] == "reported"

    # A later governed source verification resolves the quarantine without deleting the report audit trail.
    refreshed_at = NOW + timedelta(seconds=1)
    service.repository.update_source(
        "devops-intern-2026",
        source_checked_at=refreshed_at.isoformat(),
        source_expires_at=(refreshed_at + timedelta(days=30)).isoformat(),
    )
    refreshed_s1 = service.browse("s1", BrowseRequest())
    refreshed_s2 = service.browse("s2", BrowseRequest())
    assert "devops-intern-2026" in {item.id for item in refreshed_s1.items}
    assert "devops-intern-2026" in {item.id for item in refreshed_s2.items}
    assert next(item for item in refreshed_s1.items if item.id == "devops-intern-2026").reported is False
    assert service.repository.query("SELECT * FROM source_validation_history WHERE scope='student_report' AND student_id='s1'")



def test_report_after_proposal_invalidates_preparation_before_planner_write():
    service, _, _ = integrated_service()
    item = opportunity(service, context(docker_demonstrated=False))
    plan = proposal(service, item)
    service.interact("s1", item.id, InteractionRequest(action="report", reason="The source requirements look incorrect"))
    with pytest.raises(HTTPException) as exc:
        service.approve_preparation("s1", item.id, plan.id, approval_request(plan))
    assert exc.value.status_code == 410
    stored = service.repository.preparation_plan_for_owner(plan.id, "s1", item.id)
    assert stored["status"] == "invalidated"
    assert not service.repository.query("SELECT * FROM opportunity_plan_actions WHERE student_id='s1' AND opportunity_id=?", (item.id,))

def test_application_tracking_covers_full_lifecycle_and_keeps_history():
    service, _, _ = integrated_service()
    for status in ["interested", "preparing", "applied", "follow_up"]:
        result = service.update_tracking("s1", "devops-intern-2026", TrackingUpdateRequest(status=status, follow_up_at=(NOW + timedelta(days=3)) if status in {"applied", "follow_up"} else None))
        assert result.status == status
    final = service.update_tracking("s1", "devops-intern-2026", TrackingUpdateRequest(status="result", result="Not selected"))
    assert final.status == "result" and final.result == "Not selected"
    history = service.repository.query("SELECT to_status FROM application_tracking_events WHERE student_id='s1' AND opportunity_id='devops-intern-2026' ORDER BY id")
    assert [row["to_status"] for row in history][-5:] == ["interested", "preparing", "applied", "follow_up", "result"]


def test_expired_source_disables_active_alerts_but_existing_application_can_record_result():
    service, _, _ = integrated_service()
    service.update_tracking("s1", "devops-intern-2026", TrackingUpdateRequest(status="applied", follow_up_at=NOW + timedelta(days=2)))
    service.repository.update_source("devops-intern-2026", closes_on="2026-10-01")
    tracking = service.get_tracking("s1", "devops-intern-2026")
    assert tracking and tracking.source_status == "expired" and tracking.active_deadline_alerts_allowed is False
    result = service.update_tracking("s1", "devops-intern-2026", TrackingUpdateRequest(status="result", result="Withdrawn"))
    assert result.status == "result"
    with pytest.raises(HTTPException) as exc:
        service.update_tracking("s2", "devops-intern-2026", TrackingUpdateRequest(status="interested"))
    assert exc.value.status_code == 410


def test_eligibility_evaluation_persists_only_structured_evidence_references_not_private_titles():
    service, _, evidence = integrated_service()
    seed_evidence(evidence, "docker", "observed")
    item = opportunity(service, context())
    row = service.repository.evaluation_for_owner(item.eligibility_evaluation_id, "s1", item.id)
    summary = json.loads(row["evidence_summary_json"])
    assert summary["count"] >= 1
    assert "Assessment evidence" not in row["evidence_summary_json"]


def test_http_readiness_flow_exposes_source_reference_and_requires_approved_planner_handoff(monkeypatch):
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from apps.api.app.modules.opportunities import router as router_module

    service, pathways, _ = integrated_service()
    seed_pathway(pathways)
    monkeypatch.setattr(router_module, "_service", service)
    app = FastAPI()
    app.include_router(router_module.router)
    client = TestClient(app)
    headers = {"X-Luma-Student-Id": "s1"}

    browse = client.post("/v1/opportunities/browse", json={"context": context(eligibility=False).model_dump(mode="json")}, headers=headers)
    assert browse.status_code == 200
    item = next(row for row in browse.json()["items"] if row["id"] == "devops-intern-2026")
    assert item["eligibility_checks"]
    assert all(check["source_reference"] == item["source_url"] for check in item["eligibility_checks"])

    proposed = client.post(
        f"/v1/opportunities/{item['id']}/preparation-plans",
        json={
            "eligibility_evaluation_id": item["eligibility_evaluation_id"],
            "timezone": "Asia/Colombo",
            "daily_available_minutes": 90,
            "existing_blocks": [],
        },
        headers=headers,
    )
    assert proposed.status_code == 201
    plan = proposed.json()
    selected = [row for row in plan["items"] if row["suggested_start_at"]][:2]
    assert selected

    approval = client.post(
        f"/v1/opportunities/{item['id']}/preparation-plans/{plan['id']}/approve",
        json={
            "confirmed": True,
            "items": [
                {
                    "item_id": row["id"],
                    "include": True,
                    "title": row["title"],
                    "duration_minutes": row["estimated_minutes"],
                    "start_at": row["suggested_start_at"],
                }
                for row in selected
            ],
            "existing_blocks": [],
        },
        headers=headers,
    )
    assert approval.status_code == 200
    assert approval.json()["newly_approved"] is True
    assert len(approval.json()["actions"]) == len(selected)

    tracking = client.put(
        f"/v1/opportunities/{item['id']}/tracking",
        json={"status": "applied", "follow_up_at": "2026-10-10T10:00:00Z"},
        headers=headers,
    )
    assert tracking.status_code == 200
    assert tracking.json()["status"] == "applied"
