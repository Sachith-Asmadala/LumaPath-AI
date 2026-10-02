"""Prepare clearly synthetic DOC-F32 competition state.

This script does NOT fetch or verify live opportunities. It refreshes the validation
clock only for the repository's deterministic example.org fixtures and creates
synthetic DOC-F29/Evidence Passport context so the eligibility/readiness workflow can
be demonstrated through the real backend. Never present these fixtures as live jobs.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app.core.config import settings
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.opportunities.repository import OpportunityRepository
from apps.api.app.modules.opportunities.service import OpportunityService
from apps.api.app.modules.opportunities.schemas import BrowseRequest, RecommendationContext
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import (
    PathwayContextRequest,
    PathwayDecisionRequest,
    ResourcePreferences,
    SkillContext,
)
from apps.api.app.modules.pathways.service import PathwayService

STUDENTS = ("student-sachith", "student-onboarded")
GUARD_FIXTURES = {"stale-internship", "expired-workshop", "quarantined-event"}


def ensure_pathway(student_id: str, pathways: PathwayRepository) -> None:
    if pathways.current_active(student_id) is not None:
        return
    service = PathwayService(pathways)
    draft = service.generate(
        student_id,
        PathwayContextRequest(
            target_role="DevOps Engineer",
            goal="Prepare for a DevOps internship",
            pace="balanced",
            timezone="Asia/Colombo",
            planning_start=date.today(),
            weekly_learning_minutes=360,
            daily_available_minutes=180,
            skills=[
                SkillContext(skill_id="linux", status="verified", proficiency=82),
                SkillContext(skill_id="git", status="completed", proficiency=78),
                SkillContext(skill_id="networking", status="completed", proficiency=68),
                SkillContext(skill_id="docker", status="in-progress", proficiency=52),
            ],
            academic_tasks=[],
            planner_blocks=[],
            resource_preferences=ResourcePreferences(language="English", budget="free only", formats=["hands-on"]),
        ),
    )
    service.decide(student_id, draft.id, PathwayDecisionRequest(decision="approve"))


def ensure_git_evidence(student_id: str, evidence: EvidencePassportRepository, now: datetime) -> None:
    source_ref = f"doc-f32-demo:{student_id}:git"
    evidence.upsert_evidence(
        {
            "id": f"evidence-{hashlib.sha256(source_ref.encode()).hexdigest()[:20]}",
            "student_id": student_id,
            "skill_id": "git",
            "skill_name": "Git",
            "evidence_type": "assessment",
            "title": "[Demo fixture] Git baseline evidence",
            "source_origin": "doc-f32-demo",
            "source_ref": source_ref,
            "source_url": None,
            "issuer": None,
            "acquired_at": None,
            "expires_at": None,
            "observed_at": now.isoformat(),
            "last_reviewed_at": now.isoformat(),
            "reference_hash": hashlib.sha256(f"{student_id}|git|demo".encode()).hexdigest(),
            "verification_status": "observed",
            "confidence": 0.8,
            "proficiency": 78,
            "correction_note": "",
            "owner_disputed": 0,
            "source_missing": 0,
            "active": 1,
            "metadata_json": json.dumps({"synthetic_fixture": True, "story": "DOC-F32"}),
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
        }
    )


def main() -> None:
    if settings.environment not in {"development", "demo", "test"}:
        raise SystemExit("Synthetic seed actions are disabled outside development/demo/test.")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    opportunities = OpportunityRepository(settings.database_path)
    pathways = PathwayRepository(settings.database_path)
    evidence = EvidencePassportRepository(settings.database_path)

    # Initializes/migrates the real DOC-F32 catalogue contract. No web request occurs.
    service = OpportunityService(
        opportunities,
        pathway_repository=pathways,
        evidence_repository=evidence,
        freshness_days=settings.opportunity_source_freshness_days,
    )

    refreshed = []
    for row in opportunities.list_opportunities():
        if row["id"] in GUARD_FIXTURES or row["trust_status"] not in {"curated", "verified"}:
            continue
        deadline = date.fromisoformat(row["closes_on"]) if row["closes_on"] else None
        if deadline and deadline < now.date():
            continue
        opportunities.update_source(
            row["id"],
            source_checked_at=now.isoformat(),
            source_expires_at=(now + timedelta(days=settings.opportunity_source_freshness_days)).isoformat(),
        )
        refreshed.append(row["id"])

    for student_id in STUDENTS:
        ensure_pathway(student_id, pathways)
        ensure_git_evidence(student_id, evidence, now)
        feed = service.browse(student_id, BrowseRequest(context=RecommendationContext(target_role="DevOps Engineer")))
        print({"student": student_id, "active_opportunities": len(feed.items), "personalized": feed.personalized})

    print({
        "synthetic_fixture": True,
        "refreshed_fixture_validations": refreshed,
        "warning": "These are deterministic demonstration records, not live or independently verified opportunities.",
    })


if __name__ == "__main__":
    main()
