from __future__ import annotations

from datetime import date, datetime, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.careers.catalog import PathwaySkillDefinition, topological_order
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.schemas import (
    CertificateEvidenceInput, QuizEvidenceInput, ResourcePreferencesInput, SelfAssessmentInput, SkillAssessmentRequest,
)
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import PathwayContextRequest, PathwayDecisionRequest, RecalculateRequest, ResourcePreferences
from apps.api.app.modules.pathways.service import PathwayService

NOW = datetime(2026, 10, 31, 5, 0, tzinfo=timezone.utc)


def services(tmp_path: Path):
    db = str(tmp_path / "career.db")
    career_repo = CareerRepository(db)
    career = CareerService(career_repo, now=lambda: NOW)
    pathway = PathwayService(PathwayRepository(db), now=lambda: NOW, career_service=career)
    return career, pathway, career_repo


def assess_request(role="DevOps Engineer", **kwargs):
    payload = dict(
        target_role=role,
        self_assessments=[
            SelfAssessmentInput(skill_id="linux", proficiency=80),
            SelfAssessmentInput(skill_id="git", proficiency=75),
            SelfAssessmentInput(skill_id="networking", proficiency=60),
            SelfAssessmentInput(skill_id="docker", proficiency=45),
        ] if role == "DevOps Engineer" else [],
        quiz_evidence=[QuizEvidenceInput(skill_id="linux", score=88, quiz_id="linux-baseline")] if role == "DevOps Engineer" else [],
        certificate_evidence=[],
        include_portfolio_evidence=True,
        include_cv_evidence=True,
    )
    payload.update(kwargs)
    return SkillAssessmentRequest(**payload)


def pathway_request(role="DevOps Engineer", weekly=360, target=date(2026, 12, 31)):
    return PathwayContextRequest(
        target_role=role,
        goal=f"Prepare for {role}",
        pace="balanced",
        timezone="Asia/Colombo",
        planning_start=date(2026, 11, 2),
        target_date=target,
        weekly_learning_minutes=weekly,
        daily_available_minutes=240,
        skills=[],  # production service must use the server-owned F29 assessment instead
        academic_tasks=[],
        planner_blocks=[],
        resource_preferences=ResourcePreferences(language="English", budget="free only", formats=["hands-on", "project"]),
    )


def test_ac1_catalog_exposes_versioned_requirements(tmp_path):
    career, _, _ = services(tmp_path)
    roles = career.list_roles()
    assert {r.name for r in roles} >= {"DevOps Engineer", "Backend Engineer", "AI Engineer", "Cloud Engineer", "Cybersecurity Engineer"}
    devops = career.role_detail("devops-engineer")
    assert devops.version == "2026-10-v2"
    docker = next(skill for skill in devops.skills if skill.skill_id == "docker")
    assert docker.required_proficiency == 70
    assert set(docker.prerequisites) == {"linux", "networking"}
    assert docker.recommended_evidence


def test_graph_cycle_is_rejected_before_publication():
    with pytest.raises(ValueError, match="cycle"):
        topological_order([
            PathwaySkillDefinition("a", "A", ("b",), 60, ("evidence",)),
            PathwaySkillDefinition("b", "B", ("a",), 60, ("evidence",)),
        ])


def test_ac2_assessment_combines_declared_and_evidenced_sources(tmp_path):
    career, _, _ = services(tmp_path)
    result = career.assess("student-a", assess_request(certificate_evidence=[
        CertificateEvidenceInput(skill_id="docker", title="Container Fundamentals", issuer="Example Academy")
    ]))
    linux = next(skill for skill in result.skills if skill.skill_id == "linux")
    docker = next(skill for skill in result.skills if skill.skill_id == "docker")
    assert {e.source_type for e in linux.evidence} >= {"self_assessment", "quiz"}
    assert linux.confidence > 0.5
    cert = next(e for e in docker.evidence if e.source_type == "certificate")
    assert cert.verification_status == "self_reported"
    assert "planning" in result.disclaimer.lower()


def test_conflicting_evidence_is_retained_and_confidence_reduced(tmp_path):
    career, _, _ = services(tmp_path)
    req = assess_request(
        self_assessments=[SelfAssessmentInput(skill_id="linux", proficiency=95, confidence=0.5)],
        quiz_evidence=[QuizEvidenceInput(skill_id="linux", score=35, quiz_id="conflict")],
    )
    result = career.assess("student-a", req)
    linux = next(skill for skill in result.skills if skill.skill_id == "linux")
    assert "linux" in result.conflicting_skills
    assert linux.uncertainty and "disagree" in linux.uncertainty.lower()
    assert len(linux.evidence) == 2


def test_client_cannot_assess_skill_outside_approved_role_taxonomy(tmp_path):
    career, _, _ = services(tmp_path)
    req = assess_request(self_assessments=[SelfAssessmentInput(skill_id="invented-ai-skill", proficiency=100)])
    with pytest.raises(HTTPException) as exc:
        career.assess("student-a", req)
    assert exc.value.status_code == 422
    assert "approved" in exc.value.detail


def test_ac3_gap_order_respects_prerequisites(tmp_path):
    career, _, _ = services(tmp_path)
    result = career.assess("student-a", SkillAssessmentRequest(target_role="DevOps Engineer"))
    positions = {skill: i for i, skill in enumerate(result.gap_order)}
    assert positions["linux"] < positions["networking"] < positions["docker"] < positions["kubernetes"] < positions["monitoring"]
    assert positions["git"] < positions["cicd"]


def test_ac4_resources_support_required_types_and_preference_factors(tmp_path):
    career, _, _ = services(tmp_path)
    docker = career.ranked_resources("docker", ResourcePreferencesInput(languages=["English"], formats=["hands-on", "project"], max_price_usd=0))
    assert {item.resource_type for item in docker.resources} >= {"course", "project"}
    cloud = career.ranked_resources("cloud", ResourcePreferencesInput(languages=["English"], max_price_usd=500, resource_types=["certificate", "course", "tutorial", "project"]))
    assert "certificate" in {item.resource_type for item in cloud.resources}
    assert all(item.ranking_factors for item in cloud.resources)
    certificate = next(item for item in cloud.resources if item.resource_type == "certificate")
    assert certificate.price_usd is None  # unknown provider fee is not guessed


def test_unknown_skill_has_no_invented_resources(tmp_path):
    career, _, _ = services(tmp_path)
    with pytest.raises(HTTPException) as exc:
        career.ranked_resources("invented", ResourcePreferencesInput())
    assert exc.value.status_code == 404


def test_pathway_uses_server_assessment_not_client_skill_claims(tmp_path):
    career, pathway, _ = services(tmp_path)
    assessment = career.assess("student-a", assess_request())
    linux_assessed = next(skill for skill in assessment.skills if skill.skill_id == "linux")
    draft = pathway.generate("student-a", pathway_request())
    linux = next(step for step in draft.steps if step.skill_id == "linux")
    assert linux.proficiency == linux_assessed.proficiency
    assert linux.evidence_refs  # refs came from F29 assessment, not empty request.skills
    assert draft.definition_version == "2026-10-v2"


def test_ac5_feasibility_flags_zero_or_insufficient_capacity(tmp_path):
    career, _, _ = services(tmp_path)
    career.assess("student-a", SkillAssessmentRequest(target_role="DevOps Engineer"))
    effort = career.gap_effort_minutes("student-a", "DevOps Engineer")
    zero = career.feasibility(effort, 0, date(2026, 11, 2), date(2026, 12, 1))
    assert zero["feasible"] is False and "zero" in zero["explanation"].lower()
    short = career.feasibility(effort, 60, date(2026, 11, 2), date(2026, 11, 15))
    assert short["feasible"] is False
    open_ended = career.feasibility(effort, 360, date(2026, 11, 2), None)
    assert open_ended["feasible"] is None


def test_ac6_role_switch_preserves_transferable_completion(tmp_path):
    career, pathway, _ = services(tmp_path)
    # Cloud/networking evidence is assessed for the first role.
    career.assess("student-a", SkillAssessmentRequest(
        target_role="DevOps Engineer",
        self_assessments=[SelfAssessmentInput(skill_id="cloud", proficiency=80, confidence=0.5), SelfAssessmentInput(skill_id="networking", proficiency=80, confidence=0.5)],
        quiz_evidence=[QuizEvidenceInput(skill_id="cloud", score=85, quiz_id="cloud-q"), QuizEvidenceInput(skill_id="networking", score=82, quiz_id="network-q")],
    ))
    active = pathway.generate("student-a", pathway_request())
    active = pathway.decide("student-a", active.id, PathwayDecisionRequest(decision="approve"))
    # F29 assessment for the new role can be empty; DOC-F13 must retain completed transferable work from the active version.
    career.assess("student-a", SkillAssessmentRequest(target_role="Cloud Engineer"))
    req = pathway_request("Cloud Engineer")
    recalc = pathway.recalculate("student-a", active.id, RecalculateRequest(**req.model_dump(), reasons=["Career target changed to Cloud Engineer."]))
    cloud = next(step for step in recalc.steps if step.skill_id == "cloud")
    networking = next(step for step in recalc.steps if step.skill_id == "networking")
    assert cloud.transferable_credit is True and cloud.state in {"credited", "completed"}
    assert networking.transferable_credit is True and networking.state in {"credited", "completed"}
    assert recalc.change_summary and recalc.change_summary.preserved_completed_skills


def test_current_assessment_is_owner_scoped(tmp_path):
    career, _, _ = services(tmp_path)
    career.assess("student-a", assess_request())
    with pytest.raises(HTTPException) as exc:
        career.current_assessment("student-b", "DevOps Engineer")
    assert exc.value.status_code == 404


def test_http_catalog_assessment_and_resource_contract(monkeypatch, tmp_path):
    import apps.api.app.modules.careers.router as career_router
    repo = CareerRepository(str(tmp_path / "http.db"))
    svc = CareerService(repo, now=lambda: NOW)
    monkeypatch.setattr(career_router, "repository", repo)
    monkeypatch.setattr(career_router, "service", svc)
    client = TestClient(app)
    headers = {"X-Luma-Student-Id": "student-a"}
    roles = client.get("/v1/careers/roles", headers=headers)
    assert roles.status_code == 200 and len(roles.json()) >= 5
    detail = client.get("/v1/careers/roles/devops-engineer", headers=headers)
    assert detail.status_code == 200 and detail.json()["version"] == "2026-10-v2"
    assessed = client.post("/v1/careers/assessments", headers=headers, json={
        "target_role": "DevOps Engineer",
        "self_assessments": [{"skill_id":"linux","proficiency":70}],
        "quiz_evidence": [{"skill_id":"linux","score":80,"quiz_id":"q1"}],
    })
    assert assessed.status_code == 201
    current = client.get("/v1/careers/assessments/current?target_role=DevOps%20Engineer", headers=headers)
    assert current.status_code == 200 and current.json()["target_role"] == "DevOps Engineer"
    ranked = client.post("/v1/careers/skills/cloud/resources/rank", headers=headers, json={"languages":["English"],"max_price_usd":500,"resource_types":["certificate","course","tutorial","project"]})
    assert ranked.status_code == 200 and any(item["resource_type"] == "certificate" for item in ranked.json()["resources"])


def test_unauthorised_career_access_is_denied():
    client = TestClient(app)
    assert client.get("/v1/careers/roles").status_code == 401

def test_pathway_target_date_surfaces_infeasibility_warning(tmp_path):
    career, pathway, _ = services(tmp_path)
    career.assess("student-a", SkillAssessmentRequest(target_role="DevOps Engineer"))
    draft = pathway.generate("student-a", pathway_request(weekly=60, target=date(2026, 11, 15)))
    assert any("exceeds" in warning.lower() or "zero" in warning.lower() for warning in draft.warnings)
    assert draft.target_date == date(2026, 11, 15)


def test_server_assessment_change_adds_recalculation_reason(tmp_path):
    career, pathway, _ = services(tmp_path)
    career.assess("student-a", SkillAssessmentRequest(target_role="DevOps Engineer"))
    active = pathway.generate("student-a", pathway_request())
    active = pathway.decide("student-a", active.id, PathwayDecisionRequest(decision="approve"))
    career.assess("student-a", SkillAssessmentRequest(
        target_role="DevOps Engineer",
        self_assessments=[SelfAssessmentInput(skill_id="linux", proficiency=95, confidence=0.5)],
        quiz_evidence=[QuizEvidenceInput(skill_id="linux", score=95, quiz_id="new-linux")],
    ))
    req = pathway_request()
    draft = pathway.recalculate("student-a", active.id, RecalculateRequest(**req.model_dump(), reasons=["Roadmap context refreshed."]))
    assert any("DOC-F29 skill assessment evidence changed" in reason for reason in draft.recalculation_reason)


def test_career_pathway_alias_requires_assessment_and_reuses_pathway_store(monkeypatch, tmp_path):
    import apps.api.app.modules.careers.router as career_router
    import apps.api.app.modules.pathways.router as pathway_router
    db = str(tmp_path / "aliases.db")
    career_repo = CareerRepository(db)
    career = CareerService(career_repo, now=lambda: NOW)
    pathway = PathwayService(PathwayRepository(db), now=lambda: NOW, career_service=career)
    monkeypatch.setattr(career_router, "repository", career_repo)
    monkeypatch.setattr(career_router, "service", career)
    monkeypatch.setattr(pathway_router, "service", pathway)
    client = TestClient(app)
    headers = {"X-Luma-Student-Id":"student-a"}
    payload = pathway_request().model_dump(mode="json")
    blocked = client.post("/v1/careers/pathways/generate", headers=headers, json=payload)
    assert blocked.status_code == 409  # F29 alias requires current assessment before delegating
    client.post("/v1/careers/assessments", headers=headers, json={"target_role":"DevOps Engineer"})
    created = client.post("/v1/careers/pathways/generate", headers=headers, json=payload)
    assert created.status_code == 201 and created.json()["definition_version"] == "2026-10-v2"
    current = client.get("/v1/careers/pathways/current", headers=headers)
    assert current.status_code == 200 and current.json()["pending_draft"]["id"] == created.json()["id"]
