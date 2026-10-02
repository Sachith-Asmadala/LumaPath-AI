"""Seed clearly labelled synthetic DOC-F30 competition metadata.

These records exercise the real ingestion/ranking pipeline but are NOT live publisher claims.
Every title is prefixed with '[Demo fixture]' so the UI cannot confuse synthetic dates with a live update.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app.core.config import settings
from apps.api.app.modules.intelligence.repository import IntelligenceRepository
from apps.api.app.modules.intelligence.schemas import ContentSkillInput, IngestionCandidate
from apps.api.app.modules.intelligence.service import IntelligenceService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import PathwayContextRequest, PathwayDecisionRequest, ResourcePreferences, SkillContext
from apps.api.app.modules.pathways.service import PathwayService

STUDENT = "student-sachith"


def main() -> None:
    now = datetime.now(timezone.utc).replace(microsecond=0)
    repo = IntelligenceRepository(settings.database_path)
    pathways = PathwayRepository(settings.database_path)
    pathway_service = PathwayService(pathways)
    if pathways.current_active(STUDENT) is None:
        draft = pathway_service.generate(STUDENT, PathwayContextRequest(
            target_role="DevOps Engineer", goal="Prepare for a DevOps internship", pace="balanced", timezone="Asia/Colombo",
            planning_start=date.today(), weekly_learning_minutes=360, daily_available_minutes=240,
            skills=[
                SkillContext(skill_id="linux", status="verified", proficiency=82),
                SkillContext(skill_id="git", status="completed", proficiency=76),
                SkillContext(skill_id="networking", status="completed", proficiency=68),
                SkillContext(skill_id="docker", status="in-progress", proficiency=52),
            ], academic_tasks=[], planner_blocks=[], resource_preferences=ResourcePreferences(language="English", budget="free only", formats=["hands-on"]),
        ))
        pathway_service.decide(STUDENT, draft.id, PathwayDecisionRequest(decision="approve"))

    service = IntelligenceService(repo, pathways)
    fixtures = [
        ("docker-official", "learning_article", "https://docs.docker.com/get-started/", "[Demo fixture] Review Docker getting-started guidance", "docker"),
        ("github-changelog", "official_release", "https://github.blog/changelog/", "[Demo fixture] Review an official release update", "cicd"),
        ("cisa-security", "security_update", "https://www.cisa.gov/news-events/cybersecurity-advisories", "[Demo fixture] Review a security advisory source", "cloud"),
        ("cncf-official", "industry_news", "https://www.cncf.io/blog/", "[Demo fixture] Review a cloud-native industry update", "kubernetes"),
        ("linux-foundation-training", "certification_change", "https://training.linuxfoundation.org/certification/", "[Demo fixture] Review certification programme metadata", "linux"),
    ]
    for index, (source, category, url, title, skill) in enumerate(fixtures):
        candidate = IngestionCandidate(
            source_id=source, category=category, title=title,
            excerpt="Synthetic competition fixture routed through the real DOC-F30 governance pipeline; not a live publication claim.",
            canonical_url=url, published_at=now - timedelta(hours=3 + index), topics=["devops", skill],
            skills=[ContentSkillInput(skill_id=skill, relationship="primary")], target_roles=["DevOps Engineer"],
            difficulty="intermediate", reading_minutes=15 + index * 2,
        )
        print(service.ingest_candidates(source, [candidate]).model_dump(mode="json"))

    feed = service.feed(STUDENT)
    print({"state": feed.state, "items": len(feed.items), "feed_date": feed.feed_date})


if __name__ == "__main__":
    main()
