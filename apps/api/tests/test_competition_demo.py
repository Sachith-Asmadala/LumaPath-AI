"""Only reset integrity, student isolation, fixed-clock scope and production lockout."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.app.modules.competition_demo import clock, router
from apps.api.app.modules.opportunities.repository import OpportunityRepository
from apps.api.app.modules.opportunities.schemas import PreparationProposalRequest
from apps.api.app.modules.opportunities.service import OpportunityService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.subscriptions.repository import SubscriptionRepository
from apps.api.app.modules.subscriptions.service import EntitlementService

ROOT = Path(__file__).resolve().parents[3]


def seed(path):
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts/seed-data/seed-competition-demo.py"), "--database", str(path)],
        cwd=ROOT, env={**os.environ, "LUMAPATH_ENV": "test"}, capture_output=True, text=True, timeout=35,
    )
    assert result.returncode == 0, result.stderr
    return json.loads(result.stdout)


def test_reset_restores_missing_records_clears_preparation_and_preserves_other_students(tmp_path):
    path = tmp_path / "demo.db"
    first = seed(path)
    assert {check["label"]: check["status"] for check in first["opportunity"]["eligibility_checks"]} == {"Git": "met", "Docker": "unmet", "AWS fundamentals": "unknown"}
    service = OpportunityService(OpportunityRepository(str(path)), now=lambda: clock.SCENARIO_NOW, pathway_repository=PathwayRepository(str(path)), evidence_repository=EvidencePassportRepository(str(path)))
    proposal = service.propose_preparation(clock.STUDENT_ID, first["opportunity"]["id"], PreparationProposalRequest(
        eligibility_evaluation_id=first["opportunity"]["eligibility_evaluation_id"], daily_available_minutes=90,
    ))
    assert proposal.items
    ent = EntitlementService(SubscriptionRepository(str(path)))
    with ent.meter("another-student", "career_comparisons"):
        pass
    with ent.meter(clock.STUDENT_ID, "career_comparisons"):
        pass
    with sqlite3.connect(path) as db:
        db.execute("DELETE FROM skill_evidence WHERE student_id=?", (clock.STUDENT_ID,))
    second = seed(path)
    third = seed(path)
    assert first == second == third
    with sqlite3.connect(path) as db:
        assert db.execute("SELECT COUNT(*) FROM skill_evidence WHERE student_id=?", (clock.STUDENT_ID,)).fetchone()[0] == 5
        assert db.execute("SELECT COUNT(*) FROM pathways WHERE student_id=?", (clock.STUDENT_ID,)).fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM preparation_plan_items").fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM usage_counters WHERE subject_id=?", (clock.STUDENT_ID,)).fetchone()[0] == 0
        assert db.execute("SELECT COUNT(*) FROM usage_counters WHERE subject_id='another-student'").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM opportunities WHERE id='competition-junior-devops'").fetchone()[0] == 1
        assert db.execute("SELECT COUNT(*) FROM opportunity_requirements WHERE opportunity_id='competition-junior-devops'").fetchone()[0] == 3
        assert db.execute("SELECT COUNT(*) FROM articles WHERE source_id='competition-learning'").fetchone()[0] == 2


def test_production_reset_is_unavailable_and_clock_is_scoped(monkeypatch):
    monkeypatch.setattr(router, "settings", SimpleNamespace(environment="production"))
    app = FastAPI()
    app.include_router(router.router)
    client = TestClient(app)
    assert client.get("/v1/competition-demo/status").status_code == 404
    assert client.post("/v1/competition-demo/reset", headers={"X-Luma-Student-Id": clock.STUDENT_ID}).status_code == 404
    real_clock = object()
    original = SimpleNamespace(now=lambda: real_clock)
    monkeypatch.setattr(clock, "settings", SimpleNamespace(environment="test"))
    assert clock.competition_service(original, "another-student") is original
    assert clock.competition_service(original, clock.STUDENT_ID).now() == clock.SCENARIO_NOW
    assert original.now() is real_clock
    monkeypatch.setattr(clock, "settings", SimpleNamespace(environment="production"))
    assert clock.competition_service(original, clock.STUDENT_ID) is original
