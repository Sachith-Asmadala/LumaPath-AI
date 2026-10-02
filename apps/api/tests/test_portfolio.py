from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.portfolio.repository import PortfolioRepository
from apps.api.app.modules.portfolio.schemas import (
    CreatePortfolioProjectRequest, ProjectFacts, RecommendationDecisionRequest, RepositorySnapshotInput,
)
from apps.api.app.modules.portfolio.scoring import completeness, map_skills
from apps.api.app.modules.portfolio.service import PortfolioService

NOW = datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc)


def service(tmp_path: Path, limit: int = 10) -> PortfolioService:
    return PortfolioService(PortfolioRepository(str(tmp_path / "portfolio.db")), now=lambda: NOW, analyses_per_minute=limit)


def manual_request(**overrides):
    payload = dict(
        title="Deployment Lab",
        description="A reproducible student project that packages a small API and documents how to run and verify it locally for portfolio review.",
        target_role="DevOps Engineer",
        project_url="https://example.com/deployment-lab",
        live_demo_url=None,
        facts=ProjectFacts(
            technologies=["Docker", "GitHub Actions"], languages=["Python", "Shell"], topics=["containers", "ci/cd"],
            has_readme=True, has_tests=True, has_documentation=False, has_ci=True, has_docker=True,
            last_activity_at=NOW - timedelta(days=1),
        ),
    )
    payload.update(overrides)
    return CreatePortfolioProjectRequest(**payload)


def repo_snapshot(*, collected_at=NOW, full_name="student/deployment-lab", facts=None):
    return RepositorySnapshotInput(
        provider="github", external_repository_id="repo-123", full_name=full_name,
        repository_url="https://github.com/student/deployment-lab", visibility="private", explicitly_selected=True,
        authorization_reference="future-authz-ref-123", authorization_scope="read_selected_repository_metadata",
        collected_at=collected_at,
        facts=facts or ProjectFacts(
            languages=["Python", "Shell"], topics=["docker", "github actions", "terraform"],
            has_readme=True, has_tests=True, has_documentation=True, has_ci=True, has_docker=True, has_iac=True,
            last_activity_at=collected_at,
        ),
    )


def test_manual_project_analysis_requires_no_external_connection(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    result = svc.analyze("student-a", project.id)
    assert result.source_kind == "manual"
    assert result.completeness_score >= 60
    assert any(skill.skill_name == "Docker" and skill.status.value == "self_reported" for skill in result.demonstrated_skills)
    assert all("ability" not in skill.evidence[0].lower() for skill in result.not_demonstrated_skills)


def test_transparent_completeness_formula():
    score, indicators = completeness(
        "x" * 90, "https://example.com", None,
        ProjectFacts(has_readme=True, has_tests=False, has_documentation=False, topics=["api"], languages=["Python"]),
    )
    assert score == 50  # description 15 + link 5 + README 20 + topics 5 + technology 5
    assert {item.key: item.points for item in indicators}["tests"] == 0


def test_repository_snapshot_is_observed_and_timestamped(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot())
    result = svc.analyze("student-a", project.id, imported.id)
    assert result.source_kind == "repository"
    assert result.source_timestamp == NOW
    assert any(skill.status.value == "observed" for skill in result.demonstrated_skills)
    assert any(item.key == "tests" and item.satisfied for item in result.indicators)
    stored = svc.repository.get_repository(imported.id)
    assert stored["authorization_reference"] == "future-authz-ref-123"


def test_readme_test_and_documentation_gaps_have_evidence(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request(facts=ProjectFacts(languages=["Python"])))
    result = svc.analyze("student-a", project.id)
    rec_titles = {item.title for item in result.recommendations}
    assert "Add a runnable README" in rec_titles
    assert "Add visible automated tests" in rec_titles
    assert "Document architecture and decisions" in rec_titles
    assert all(rec.evidence_refs for rec in result.recommendations)


def test_role_skills_distinguish_demonstrated_from_not_demonstrated():
    demonstrated, missing = map_skills(
        "DevOps Engineer",
        ProjectFacts(technologies=["Docker"], topics=["Prometheus"], has_docker=True, has_monitoring=True),
        "manual_project", NOW,
    )
    assert {item.skill_name for item in demonstrated} >= {"Docker", "Monitoring"}
    assert "Kubernetes" in {item.skill_name for item in missing}
    assert all(item.status.value == "not_demonstrated" for item in missing)


def test_factual_description_is_editable_and_does_not_invent_results(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    analysis = svc.analyze("student-a", project.id)
    description = next(item for item in analysis.recommendations if item.kind == "description")
    assert "Recorded technology evidence" in description.editable_text
    assert "increased" not in description.editable_text.lower()
    updated = svc.decide_recommendation(
        "student-a", project.id, description.id,
        RecommendationDecisionRequest(decision="accepted", edited_text="Built a small API packaging project with Docker and documented local verification."),
    )
    assert updated.status.value == "accepted"
    assert updated.editable_text.startswith("Built a small API")


def test_revocation_blocks_refresh_and_imported_data_can_be_deleted(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot())
    svc.analyze("student-a", project.id, imported.id)
    revoked = svc.revoke_repository("student-a", project.id, imported.id)
    assert revoked.refresh_allowed is False
    with pytest.raises(HTTPException) as exc:
        svc.refresh_repository_snapshot("student-a", project.id, imported.id, repo_snapshot(full_name="student/renamed"))
    assert exc.value.status_code == 409
    deleted = svc.delete_repository_data("student-a", project.id, imported.id)
    assert deleted.deleted is True
    assert svc.get("student-a", project.id).repositories == []
    assert svc.get("student-a", project.id).id == project.id


def test_repository_rename_refreshes_same_reference_when_access_active(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot())
    refreshed = svc.refresh_repository_snapshot("student-a", project.id, imported.id, repo_snapshot(full_name="student/deployment-lab-renamed"))
    assert refreshed.id == imported.id
    assert refreshed.full_name.endswith("renamed")


def test_stale_repository_snapshot_is_disclosed(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot(collected_at=NOW - timedelta(days=10)))
    analysis = svc.analyze("student-a", project.id, imported.id)
    assert analysis.stale is True
    assert any("Refresh" in rec.title for rec in analysis.recommendations)


def test_empty_repository_does_not_fabricate_skills(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request(facts=ProjectFacts()))
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot(facts=ProjectFacts()))
    analysis = svc.analyze("student-a", project.id, imported.id)
    assert analysis.demonstrated_skills == []
    assert analysis.not_demonstrated_skills
    assert analysis.completeness_score <= 20


def test_cross_student_ownership_is_enforced(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    with pytest.raises(HTTPException) as exc:
        svc.get("student-b", project.id)
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException) as exc:
        svc.analyze("student-b", project.id)
    assert exc.value.status_code == 403


def test_analysis_rate_limit_is_enforced(tmp_path: Path):
    svc = service(tmp_path, limit=1)
    project = svc.create("student-a", manual_request())
    svc.analyze("student-a", project.id)
    with pytest.raises(HTTPException) as exc:
        svc.analyze("student-a", project.id)
    assert exc.value.status_code == 429


def test_repository_table_contains_no_connection_token_column(tmp_path: Path):
    repo = PortfolioRepository(str(tmp_path / "schema.db"))
    import sqlite3
    with sqlite3.connect(repo.database_path) as db:
        columns = {row[1] for row in db.execute("PRAGMA table_info(external_repositories)").fetchall()}
    assert "token" not in columns
    assert "access_token" not in columns
    assert "authorization_reference" in columns


def test_http_manual_project_and_owner_denial(monkeypatch, tmp_path: Path):
    import apps.api.app.modules.portfolio.router as portfolio_router
    repo = PortfolioRepository(str(tmp_path / "http.db"))
    svc = PortfolioService(repo, now=lambda: NOW)
    monkeypatch.setattr(portfolio_router, "repository", repo)
    monkeypatch.setattr(portfolio_router, "service", svc)
    client = TestClient(app)
    payload = manual_request().model_dump(mode="json")
    created = client.post("/v1/portfolio/projects", headers={"X-Luma-Student-Id": "student-a"}, json=payload)
    assert created.status_code == 201
    project_id = created.json()["id"]
    analyzed = client.post(f"/v1/portfolio/projects/{project_id}/analysis", headers={"X-Luma-Student-Id": "student-a"})
    assert analyzed.status_code == 200
    denied = client.get(f"/v1/portfolio/projects/{project_id}", headers={"X-Luma-Student-Id": "student-b"})
    assert denied.status_code == 403


def test_revoking_repository_marks_existing_analysis_stale(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request())
    imported = svc.import_repository_snapshot("student-a", project.id, repo_snapshot())
    initial = svc.analyze("student-a", project.id, imported.id)
    assert initial.stale is False
    svc.revoke_repository("student-a", project.id, imported.id)
    assert svc.get("student-a", project.id).latest_analysis.stale is True


def test_manual_project_rejects_non_http_links():
    with pytest.raises(Exception):
        manual_request(project_url="javascript:alert(1)")


def test_repository_ingestion_http_is_disabled_without_future_integration_key(monkeypatch, tmp_path: Path):
    import apps.api.app.modules.portfolio.router as portfolio_router
    repo = PortfolioRepository(str(tmp_path / "disabled-ingest.db"))
    svc = PortfolioService(repo, now=lambda: NOW)
    monkeypatch.setattr(portfolio_router, "repository", repo)
    monkeypatch.setattr(portfolio_router, "service", svc)
    client = TestClient(app)
    created = client.post(
        "/v1/portfolio/projects",
        headers={"X-Luma-Student-Id": "student-a"},
        json=manual_request().model_dump(mode="json"),
    )
    project_id = created.json()["id"]
    response = client.post(
        f"/v1/portfolio/projects/{project_id}/repositories/import-snapshot",
        headers={"X-Luma-Student-Id": "student-a"},
        json=repo_snapshot().model_dump(mode="json"),
    )
    assert response.status_code == 503
    assert "future authorised integration" in response.json()["detail"]


def test_repository_live_demo_is_normalized_and_counts_toward_completeness(tmp_path: Path):
    svc = service(tmp_path)
    project = svc.create("student-a", manual_request(live_demo_url=None))
    snapshot = repo_snapshot()
    snapshot.live_demo_url = "https://demo.example.com"
    imported = svc.import_repository_snapshot("student-a", project.id, snapshot)
    analysis = svc.analyze("student-a", project.id, imported.id)
    assert imported.live_demo_url == "https://demo.example.com"
    live_demo = next(item for item in analysis.indicators if item.key == "live_demo")
    assert live_demo.satisfied is True and live_demo.points == 10
