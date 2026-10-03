from types import SimpleNamespace
from datetime import timedelta

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from apps.api.app.modules.competition_demo import content
from apps.api.app.modules.competition_demo.clock import SCENARIO_NOW
from apps.api.app.modules.calendar import router as calendar_router
from apps.api.app.modules.calendar.repository import CalendarRepository
from apps.api.app.modules.cv.repository import CvRepository
from apps.api.app.modules.cv.schemas import CreatePastedCvRequest
from apps.api.app.modules.cv.service import CvService
from apps.api.app.modules.documents.repository import SqliteDocumentRepository
from apps.api.app.modules.documents.storage import LocalPrivateObjectStorage
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.evidence_passport.service import EvidencePassportService
from apps.api.app.modules.portfolio.repository import PortfolioRepository
from apps.api.app.modules.portfolio.service import PortfolioService
from apps.api.app.core.quiz_responses import KNOWLEDGE_RESPONSES


def test_sample_content_is_analyzed_idempotent_and_owner_scoped(tmp_path, monkeypatch):
    monkeypatch.setattr(content, "settings", SimpleNamespace(environment="test"))
    path = str(tmp_path / "demo.db")
    options = {"document_storage": str(tmp_path / "documents"), "cv_storage": str(tmp_path / "cvs")}
    cv_repo = CvRepository(path)
    foreign_cv = CvService(cv_repo, LocalPrivateObjectStorage(options["cv_storage"]), PortfolioRepository(path), now=lambda: SCENARIO_NOW-timedelta(days=365)).create_paste(
        "another-student", CreatePastedCvRequest(title="Personal CV", target_role="DevOps Engineer", retention_days=7, source_text="Personal CV source that the demo seeder must preserve."))
    first = content.seed_demo_content(path, "student-sachith", **options)
    second = content.seed_demo_content(path, "student-sachith", **options)
    assert [row["id"] for row in cv_repo.list_documents("another-student")] == [foreign_cv.id]
    assert [first[key] for key in ("portfolio_projects", "cvs", "documents")] == [3, 2, 3]
    assert {a["internal_record_id"] for a in first["calendar_actions"]} == {a["internal_record_id"] for a in second["calendar_actions"]}
    assert len(list((tmp_path / "documents").iterdir())) == 3
    assert len(list((tmp_path / "cvs").iterdir())) == 2
    portfolio_repo = PortfolioRepository(path)
    portfolio = PortfolioService(portfolio_repo, now=lambda: SCENARIO_NOW)
    projects = portfolio.list("student-sachith").items
    assert all(project.latest_analysis and project.latest_analysis.recommendations for project in projects)
    assert len({project.latest_analysis.completeness_score for project in projects}) > 1
    assert portfolio.list("another-student").items == []
    cvs = CvService(CvRepository(path), LocalPrivateObjectStorage(options["cv_storage"]), portfolio_repo, now=lambda: SCENARIO_NOW)
    documents = cvs.list("student-sachith").items
    assert len(documents) == 2
    assert all(doc.sections_confirmed and doc.latest_analysis and doc.latest_analysis.suggestions for doc in documents)
    assert all(any(section.key == "education" for section in doc.sections) for doc in documents)
    evidence = EvidencePassportService(EvidencePassportRepository(path), now=lambda: SCENARIO_NOW)
    passport = evidence.dashboard("student-sachith")
    certificates = [item for skill in passport.skills for item in skill.evidence if item.evidence_type == "certificate"]
    assert len(certificates) == 2
    assert all(item.verification_status == "self_declared" for item in certificates)
    assert not any(item.skill_id in {"terraform", "kubernetes", "monitoring"} for skill in passport.skills for item in skill.evidence)
    docs = SqliteDocumentRepository(path)
    for row in docs.list_rows("student-sachith"):
        assert row["status"] == "ready"
        analysis = docs.load_analysis(row["id"], "student-sachith")
        assert analysis is not None
        assert analysis.summary and analysis.learning_outcomes and analysis.flashcards and analysis.quiz
        for question in analysis.quiz:
            assert question.choices[-2:] == list(KNOWLEDGE_RESPONSES)
    calendar = CalendarRepository(path)
    history = calendar.list_sync_history("student-sachith")
    assert len(history) == 2
    assert all(row["status"] == "committed" for row in history)
    monkeypatch.setattr(calendar_router, "repository", calendar)
    app = FastAPI()
    app.include_router(calendar_router.router)
    client = TestClient(app)
    own = client.get("/v1/calendar/sync-history", headers={"X-Luma-Student-Id": "student-sachith"})
    assert own.status_code == 200
    rows = own.json()["items"]
    assert rows[0]["skipped"] == 3 and rows[1]["imported"] == 3
    other = client.get("/v1/calendar/sync-history", headers={"X-Luma-Student-Id": "another-student"})
    assert other.json()["items"] == []
    assert client.get("/v1/calendar/sync-history").status_code == 401


def test_sample_content_refuses_real_owners_and_production(tmp_path, monkeypatch):
    monkeypatch.setattr(content, "settings", SimpleNamespace(environment="test"))
    with pytest.raises(HTTPException) as exc:
        content.seed_demo_content(str(tmp_path / "demo.db"), "another-student")
    assert exc.value.status_code == 404
    monkeypatch.setattr(content, "settings", SimpleNamespace(environment="production"))
    with pytest.raises(HTTPException) as exc:
        content.seed_demo_content(str(tmp_path / "demo.db"), "student-sachith")
    assert exc.value.status_code == 404
