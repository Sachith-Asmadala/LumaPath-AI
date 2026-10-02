from __future__ import annotations

import json
import sqlite3
import tempfile
from datetime import date, datetime, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.app.modules.career_scenarios import router as router_module
from apps.api.app.modules.career_scenarios.repository import CareerScenarioRepository
from apps.api.app.modules.career_scenarios.schemas import ScenarioCreateRequest, ScenarioRecomputeRequest, ScenarioSwitchRequest
from apps.api.app.modules.career_scenarios.service import CareerScenarioService
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.service import PathwayService

NOW = datetime(2026, 10, 2, 10, 0, tzinfo=timezone.utc)


def build_service():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    career_repo = CareerRepository(tmp.name)
    career = CareerService(career_repo, now=lambda: NOW)
    pathway_repo = PathwayRepository(tmp.name)
    service = CareerScenarioService(
        CareerScenarioRepository(tmp.name), career, EvidencePassportRepository(tmp.name), pathway_repo,
        PathwayService(pathway_repo, now=lambda: NOW, career_service=career), now=lambda: NOW,
    )
    return service, tmp.name


def add_evidence(db_path: str, student_id: str, skill_id: str, proficiency: int, confidence: float = 0.9):
    with sqlite3.connect(db_path) as db:
        db.execute(
            """INSERT INTO skill_evidence
            (id,student_id,skill_id,skill_name,evidence_type,title,source_origin,source_ref,source_url,issuer,acquired_at,expires_at,
             observed_at,last_reviewed_at,reference_hash,verification_status,confidence,proficiency,correction_note,owner_disputed,source_missing,active,metadata_json,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                f"ev-{student_id}-{skill_id}", student_id, skill_id, skill_id.title(), "assessment", f"Evidence {skill_id}", "test",
                f"test:{student_id}:{skill_id}", None, None, None, None, NOW.isoformat(), NOW.isoformat(), f"hash-{skill_id}", "verified",
                confidence, proficiency, "", 0, 0, 1, "{}", NOW.isoformat(), NOW.isoformat(),
            ),
        )
        db.commit()


def create_default(service: CareerScenarioService, student="student-a", weekly=300):
    return service.create(student, ScenarioCreateRequest(
        role_ids=["devops-engineer", "cloud-engineer", "cybersecurity-engineer"],
        weekly_learning_minutes=weekly, target_date=date(2027, 3, 1),
    ))


def test_shared_unique_and_remaining_skills_use_versioned_role_graph():
    service, _ = build_service()
    view = create_default(service)
    result = view.latest_result
    assert {"networking"} <= set(result.shared_skill_ids)
    devops = next(role for role in result.roles if role.role_id == "devops-engineer")
    assert "terraform" in devops.unique_skill_ids
    assert devops.role_version == result.inputs.taxonomy_version
    assert devops.remaining_skill_ids
    docker = next(skill for skill in devops.skills if skill.skill_id == "docker")
    assert docker.prerequisites == ["linux", "networking"]


def test_current_verified_evidence_reduces_effort_and_is_reusable():
    service, db = build_service()
    without = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=300))
    add_evidence(db, "s2", "networking", 85)
    add_evidence(db, "s2", "cloud", 85)
    with_evidence = service.create("s2", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=300))
    base = next(role for role in without.latest_result.roles if role.role_id == "cloud-engineer")
    credited = next(role for role in with_evidence.latest_result.roles if role.role_id == "cloud-engineer")
    assert credited.effort_hours_max < base.effort_hours_max
    assert {"networking", "cloud"} <= set(credited.transferable_skill_ids)
    assert any(item.skill_id == "cloud" and item.credited for item in credited.reusable_evidence)


def test_all_cost_routes_are_explicit_and_unknown_certificate_prices_are_not_guessed():
    service, _ = build_service()
    role = next(item for item in create_default(service).latest_result.roles if item.role_id == "devops-engineer")
    routes = {route.route_type: route for route in role.routes}
    assert set(routes) == {"free", "low_cost", "certification_focused"}
    assert routes["free"].known_cost_min_usd == routes["free"].known_cost_max_usd == 0
    assert routes["low_cost"].planning_budget_max_usd == 150
    assert routes["certification_focused"].unknown_price_count >= 1
    assert routes["certification_focused"].known_cost_max_usd is None


def test_recompute_reuses_immutable_evidence_snapshot_and_capacity_changes_predictably():
    service, db = build_service()
    add_evidence(db, "s1", "networking", 80)
    first = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=300))
    first_result = first.latest_result
    updated = service.recompute("s1", first.id, ScenarioRecomputeRequest(weekly_learning_minutes=600, target_date=None))
    second = updated.latest_result
    before = next(role for role in first_result.roles if role.role_id == "cloud-engineer").duration
    after = next(role for role in second.roles if role.role_id == "cloud-engineer").duration
    assert after.weeks_max == pytest.approx(before.weeks_max / 2, abs=0.1)
    assert second.inputs.context_refreshed is False
    # Original immutable result remains unchanged and cannot be updated at storage level.
    row = service.repository.result(first_result.id)
    assert json.loads(row["result_json"])["inputs"]["weekly_learning_minutes"] == 300
    with pytest.raises(sqlite3.IntegrityError):
        with sqlite3.connect(db) as conn:
            conn.execute("UPDATE scenario_results SET taxonomy_version='changed' WHERE id=?", (first_result.id,))


def test_zero_capacity_is_honest_and_non_fabricated():
    service, _ = build_service()
    view = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "backend-engineer"], weekly_learning_minutes=0))
    for role in view.latest_result.roles:
        assert role.duration.weeks_min is None and role.duration.weeks_max is None
        assert role.duration.target_fit == "not_computable"


def test_missing_target_date_does_not_claim_target_fit():
    service, _ = build_service()
    view = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "backend-engineer"], weekly_learning_minutes=300, target_date=None))
    assert all(role.duration.target_fit == "not_computable" for role in view.latest_result.roles)


def test_switch_requires_explicit_confirmation_and_preserves_active_state_until_roadmap_approval():
    service, db = build_service()
    add_evidence(db, "s1", "cloud", 85)
    scenario = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=300))
    with pytest.raises(Exception):
        ScenarioSwitchRequest(result_id=scenario.latest_result.id, role_id="cloud-engineer", confirmed=False)
    response = service.switch_draft("s1", scenario.id, ScenarioSwitchRequest(
        result_id=scenario.latest_result.id, role_id="cloud-engineer", confirmed=True, goal="Explore cloud engineering",
    ))
    assert response.draft_status == "draft" and response.approval_required
    assert response.active_pathway_id is None and response.active_pathway_unchanged
    draft = service.pathway_repository.current_draft("s1")
    assert draft and draft["id"] == response.draft_pathway_id
    assert service.pathway_repository.current_active("s1") is None
    assert "cloud" in response.transferable_skill_ids
    cloud_step = next(row for row in service.pathway_repository.steps(draft["id"]) if row["skill_id"] == "cloud")
    assert cloud_step["state"] == "credited"


def test_saved_scenarios_and_student_boundaries():
    service, _ = build_service()
    view = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], save=True))
    assert [item.id for item in service.list_saved("s1")] == [view.id]
    with pytest.raises(Exception) as exc:
        service.get("s2", view.id)
    assert getattr(exc.value, "status_code", None) == 403


def test_http_primary_flow(monkeypatch):
    service, db = build_service()
    monkeypatch.setattr(router_module, "_service", service)
    app = FastAPI(); app.include_router(router_module.router)
    from apps.api.tests.entitlement_helpers import grant_test_plan
    grant_test_plan(app, monkeypatch, db, "student-http", "pro")
    client = TestClient(app); headers = {"X-Luma-Student-Id": "student-http"}
    assert client.get("/v1/career-scenarios/roles").status_code == 401
    roles = client.get("/v1/career-scenarios/roles", headers=headers)
    assert roles.status_code == 200 and len(roles.json()) >= 2
    created = client.post("/v1/career-scenarios", headers=headers, json={"role_ids": ["devops-engineer", "cloud-engineer"], "weekly_learning_minutes": 300})
    assert created.status_code == 201
    body = created.json(); scenario_id = body["id"]
    recomputed = client.post(f"/v1/career-scenarios/{scenario_id}/recompute", headers=headers, json={"weekly_learning_minutes": 450, "target_date": "2027-04-01"})
    assert recomputed.status_code == 201 and recomputed.json()["latest_result"]["inputs"]["weekly_learning_minutes"] == 450
    saved = client.put(f"/v1/career-scenarios/{scenario_id}/saved", headers=headers, json={"saved": True})
    assert saved.status_code == 200 and saved.json()["status"] == "saved"


def test_snapshot_does_not_store_private_evidence_titles_or_content():
    service, db = build_service()
    add_evidence(db, "s1", "networking", 80)
    view = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"]))
    row = service.repository.result(view.latest_result.id)
    snapshot = row["input_snapshot_json"]
    assert "Evidence networking" not in snapshot
    assert "test:s1:networking" in snapshot  # reusable reference only


def test_switch_from_existing_active_path_creates_pending_draft_without_superseding_active():
    from apps.api.app.modules.careers.schemas import SkillAssessmentRequest
    from apps.api.app.modules.pathways.schemas import PathwayContextRequest, PathwayDecisionRequest
    service, db = build_service()
    add_evidence(db, "s1", "linux", 85)
    add_evidence(db, "s1", "networking", 85)
    service.career_service.assess("s1", SkillAssessmentRequest(target_role="DevOps Engineer"))
    active_draft = service.pathway_service.generate("s1", PathwayContextRequest(
        target_role="DevOps Engineer", goal="Current DevOps plan", pace="balanced", timezone="Asia/Colombo",
        weekly_learning_minutes=300, daily_available_minutes=90,
    ))
    active = service.pathway_service.decide("s1", active_draft.id, PathwayDecisionRequest(decision="approve"))
    scenario = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=420))
    switched = service.switch_draft("s1", scenario.id, ScenarioSwitchRequest(
        result_id=scenario.latest_result.id, role_id="cloud-engineer", confirmed=True, goal="Explore Cloud Engineering",
    ))
    still_active = service.pathway_repository.current_active("s1")
    pending = service.pathway_repository.current_draft("s1")
    assert still_active and still_active["id"] == active.id
    assert pending and pending["id"] == switched.draft_pathway_id and pending["target_role"] == "Cloud Engineer"
    assert switched.active_pathway_unchanged is True
    assert "networking" in switched.transferable_skill_ids


def test_stale_taxonomy_result_cannot_create_switch_draft():
    service, _ = build_service()
    view = service.create("s1", ScenarioCreateRequest(role_ids=["devops-engineer", "cloud-engineer"], weekly_learning_minutes=300))
    original = service.repository.result(view.latest_result.id)
    stale_id = "result-stale-taxonomy"
    service.repository.create_result({
        "id": stale_id,
        "scenario_id": view.id,
        "student_id": "s1",
        "taxonomy_version": "2026-01-old",
        "pathway_version": None,
        "input_snapshot_json": original["input_snapshot_json"],
        "result_json": original["result_json"],
        "created_at": NOW.isoformat(),
    })
    with pytest.raises(Exception) as exc:
        service.switch_draft("s1", view.id, ScenarioSwitchRequest(result_id=stale_id, role_id="cloud-engineer", confirmed=True))
    assert getattr(exc.value, "status_code", None) == 409
