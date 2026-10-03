"""Competition-only orchestrator. Call through the CLI in a separate process.

No scraping or real-student mutations. Existing services own pathway generation,
evidence contracts, governed ingestion, opportunity evaluation, and entitlements.
"""
from datetime import datetime, timedelta
from pathlib import Path
from contextlib import contextmanager
from uuid import uuid5, NAMESPACE_URL
import importlib
import importlib.util
import json
import sqlite3

from fastapi import HTTPException
from ...core.config import settings
from .clock import DEMO_ENVIRONMENTS, STUDENT_ID, SCENARIO_NOW
from ..careers.repository import CareerRepository
from ..careers.service import CareerService
from ..careers.schemas import SkillAssessmentRequest, SelfAssessmentInput, QuizEvidenceInput
from ..pathways.repository import PathwayRepository
from ..pathways.service import PathwayService
from ..pathways.schemas import PathwayContextRequest, PathwayDecisionRequest, ResourcePreferences, SkillContext
from ..evidence_passport.repository import EvidencePassportRepository
from ..opportunities.repository import OpportunityRepository
from ..opportunities.service import OpportunityService
from ..opportunities.schemas import BrowseRequest, RecommendationContext
from ..intelligence.repository import IntelligenceRepository
from ..intelligence.service import IntelligenceService
from ..intelligence.schemas import IngestionCandidate, ContentSkillInput
from ..subscriptions.repository import SubscriptionRepository
from ..subscriptions.service import EntitlementService
from ..notifications.repository import NotificationRepository
from ..notifications.service import NotificationService
from ..notifications.schemas import CandidateInput, CandidateSyncRequest

ROOT = Path(__file__).resolve().parents[5]
MANIFEST_PATH = ROOT / "src/data/demo/competition-scenario.json"


@contextmanager
def stable_seed_identifiers():
    # This CLI runs outside the API process, so ordinary requests are unaffected.
    modules = [importlib.import_module(f"apps.api.app.modules.{name}") for name in [
        "market_taxonomy.service", "careers.service", "pathways.service", "opportunities.service", "subscriptions.service",
    ]]
    originals = [(module, getattr(module, "uuid4", None)) for module in modules]
    def factory(name):
        count = 0
        def next_id():
            nonlocal count
            count += 1
            return uuid5(NAMESPACE_URL, f"lumapath-competition-v1:{name}:{count}")
        return next_id
    try:
        for module, original in originals:
            if original is not None:
                module.uuid4 = factory(module.__name__)
        yield
    finally:
        for module, original in originals:
            if original is not None:
                module.uuid4 = original


def clear_student(database_path):
    """Delete only the dedicated student's records and their pathway children."""
    with sqlite3.connect(database_path, timeout=20) as db:
        db.execute("BEGIN IMMEDIATE")
        tables = [row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        if "preparation_plans" in tables and "preparation_plan_items" in tables:
            db.execute("DELETE FROM preparation_plan_items WHERE plan_id IN (SELECT id FROM preparation_plans WHERE student_id=?)", (STUDENT_ID,))
        if "pathways" in tables:
            ids = [row[0] for row in db.execute("SELECT id FROM pathways WHERE student_id=?", (STUDENT_ID,))]
            for table in ["pathway_steps", "pathway_plan_items", "pathway_audit"]:
                if table in tables and ids:
                    db.execute(f'DELETE FROM "{table}" WHERE pathway_id IN ({",".join("?" for _ in ids)})', ids)
        if "taxonomy_audit" in tables:
            db.execute("DELETE FROM taxonomy_audit WHERE actor_id=?", ("competition-curator",))
        for table in tables:
            quoted = '"' + table.replace('"', '""') + '"'
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({quoted})")}
            for identity in ("student_id", "subject_id"):
                if identity in columns:
                    db.execute(f"DELETE FROM {quoted} WHERE {identity}=?", (STUDENT_ID,))


def seed_intelligence(database_path, pathways, manifest):
    repo = IntelligenceRepository(database_path)
    now = SCENARIO_NOW
    source_id = "competition-learning"
    # Same governed source contract as the existing DOC-F30 seeder; all links are synthetic.
    with sqlite3.connect(database_path) as db:
        db.execute("""INSERT INTO content_sources
            (id,name,base_url,allowed_domains_json,categories_json,source_type,trust_score,trust_status,
             storage_policy,max_excerpt_chars,max_age_days,terms_url,created_at,updated_at)
            VALUES (?,?,?,?,?, 'official_documentation',90,'approved','metadata_excerpt',500,30,?,?,?)
            ON CONFLICT(id) DO UPDATE SET name=excluded.name,trust_status='approved',updated_at=excluded.updated_at""",
            (source_id, "Luma Learning Library (demo)", "https://example.org/lumapath-competition", json.dumps(["example.org"]), json.dumps(["learning_article"]), "https://example.org/lumapath-competition/terms", now.isoformat(), now.isoformat()))
    service = IntelligenceService(repo, pathways, now=lambda: now)
    # Article IDs are derived from URLs; ingestion-run IDs remain unique across repairs.
    candidates = [IngestionCandidate(source_id=source_id, category="learning_article", title=item["title"],
        excerpt=f"Demo learning scenario: {item['excerpt']}",
        canonical_url=f"https://example.org/lumapath-competition/{item['id']}", published_at=item["publishedAt"],
        topics=["devops",item["skillId"]], skills=[ContentSkillInput(skill_id=item["skillId"], relationship="primary")],
        target_roles=["DevOps Engineer"], difficulty="beginner", reading_minutes=item["readingMinutes"])
        for item in manifest["intelligence"]]
    pending = []
    with sqlite3.connect(database_path) as db:
        for candidate in candidates:
            existing = db.execute("SELECT id FROM articles WHERE source_id=? AND canonical_url=?", (source_id, candidate.canonical_url)).fetchone()
            if existing:
                # Refresh fixture text while preserving saved references and moderation state.
                db.execute("UPDATE articles SET excerpt=?,reading_minutes=?,updated_at=? WHERE id=?",
                    (candidate.excerpt, candidate.reading_minutes, now.isoformat(), existing[0]))
            else:
                pending.append(candidate)
    if pending:
        service.ingest_candidates(source_id,pending)


def seed_market(database_path, career, pathways, pathway_service):
    # Reuse DOC-F34's source/observation builders and the existing curator governance service.
    from ...core.security import TaxonomyCuratorPrincipal
    from ..market_taxonomy.repository import MarketTaxonomyRepository
    from ..market_taxonomy.service import MarketTaxonomyService
    from ..market_taxonomy.schemas import ObservationIngestRequest
    spec = importlib.util.spec_from_file_location("competition_market_seed", ROOT / "scripts/seed-data/seed-doc-f34-demo.py")
    helpers = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helpers)
    repo = MarketTaxonomyRepository(database_path)
    service = MarketTaxonomyService(repo,career,pathways,pathway_service,now=lambda:SCENARIO_NOW)
    curator = TaxonomyCuratorPrincipal("competition-curator","taxonomy_curator",("international",))
    source_id="competition-market"
    source = helpers.source(source_id,"University platform skills","technology_source",90)
    source = source.model_copy(update={"name":"Luma University platform skills","regions":["international"]})
    service.upsert_source(curator,source)
    # Only synthetic-source observations are replaced; active taxonomy versions are untouched.
    with sqlite3.connect(database_path) as db:
        db.execute("DELETE FROM market_observations WHERE source_id=?",(source_id,))
    observation=helpers.observation(source_id,0.55,period_start=SCENARIO_NOW.date()-timedelta(days=35),observed_at=SCENARIO_NOW-timedelta(days=2),scope="international",region=None,sample=120)
    service.ingest(curator,ObservationIngestRequest(items=[observation]))


def seed_notifications(database_path, manifest):
    """Use the in-app policy pipeline to give the synthetic student an inbox history."""
    repo = NotificationRepository(database_path)
    types = {"risk": "risk", "plan": "study_session", "opportunity": "application_date", "evidence": "roadmap_milestone"}
    for notice in sorted(manifest["notifications"], key=lambda item: item["createdAt"]):
        occurred = datetime.fromisoformat(notice["createdAt"])
        service = NotificationService(repo, now=lambda: occurred)
        service.sync(STUDENT_ID, CandidateSyncRequest(items=[CandidateInput(
            notification_type=types[notice["kind"]], source_type="system", source_id=notice["id"],
            display_label=notice["title"], reason=notice["description"], action_href=notice["href"],
            urgency="high" if notice["kind"] == "risk" else "normal", occurred_at=occurred,
            expires_at=SCENARIO_NOW+timedelta(days=14), sensitive=True,
            idempotency_key=f"{manifest['version']}:{notice['id']}",
        )]))
        if notice["read"]:
            for delivery in repo.inbox(STUDENT_ID, include_dismissed=False):
                if delivery["source_id"] == notice["id"]:
                    service.mark(STUDENT_ID, delivery["id"], "opened")


def reset_competition_demo(database_path):
    if settings.environment not in DEMO_ENVIRONMENTS:
        raise HTTPException(404, "Competition demo is unavailable in production.")
    manifest = json.loads(MANIFEST_PATH.read_text())
    Path(database_path).parent.mkdir(parents=True, exist_ok=True)
    career = CareerService(CareerRepository(database_path), now=lambda: SCENARIO_NOW)
    pathways = PathwayRepository(database_path)
    evidence = EvidencePassportRepository(database_path)
    opportunities = OpportunityRepository(database_path)
    subscriptions = SubscriptionRepository(database_path)
    service = OpportunityService(opportunities, now=lambda: SCENARIO_NOW, pathway_repository=pathways, evidence_repository=evidence)
    with stable_seed_identifiers():
        clear_student(database_path)
        career.assess(STUDENT_ID, SkillAssessmentRequest(target_role="DevOps Engineer",
            self_assessments=[SelfAssessmentInput(skill_id=skill["id"],proficiency=skill["proficiency"]) for skill in manifest["skills"]],
            quiz_evidence=[QuizEvidenceInput(skill_id=skill["id"],score=skill["proficiency"],quiz_id=f"competition-baseline-{skill["id"]}") for skill in manifest["skills"]]))
        pathway_service = PathwayService(pathways, career_service=career, now=lambda: SCENARIO_NOW)
        draft = pathway_service.generate(STUDENT_ID, PathwayContextRequest(
            target_role="DevOps Engineer", goal="Prepare for a Junior DevOps Internship", pace="balanced", timezone="Asia/Colombo",
            planning_start=SCENARIO_NOW.date(), weekly_learning_minutes=360, daily_available_minutes=90,
            skills=[SkillContext(skill_id=s["id"], proficiency=s["proficiency"], status=s["status"]) for s in manifest["skills"]],
            academic_tasks=[{"id":t["id"],"title":t["title"],"due_at":t["dueAt"],"remaining_minutes":t["estimatedMinutes"],"risk_score":t["riskScore"],"status":t["status"]} for t in manifest["tasks"] if t["category"]=="Academic"],planner_blocks=[],resource_preferences=ResourcePreferences(language="English",budget="free only",formats=["hands-on"])))
        pathway_service.decide(STUDENT_ID,draft.id,PathwayDecisionRequest(decision="approve"))
        for skill in manifest["skills"]:
            identifier=f"competition-evidence-{skill['id']}"
            evidence.upsert_evidence(dict(id=identifier,student_id=STUDENT_ID,skill_id=skill["id"],skill_name=skill["name"],
                evidence_type="project" if skill["id"]=="git" else "assessment",title=skill["title"],source_origin="competition-synthetic",
                source_ref=identifier,source_url="https://example.org/lumapath-competition/git-project" if skill["id"]=="git" else None,
                issuer=None,acquired_at=SCENARIO_NOW.isoformat(),expires_at=None,observed_at=SCENARIO_NOW.isoformat(),last_reviewed_at=SCENARIO_NOW.isoformat(),
                reference_hash=uuid5(NAMESPACE_URL,identifier).hex,verification_status="verified" if skill["verification"]=="verified" else "self-reported",confidence=0.9 if skill["verification"]=="verified" else 0.65,
                proficiency=skill["proficiency"],correction_note="",owner_disputed=0,source_missing=0,active=1,
                metadata_json=json.dumps({"synthetic_fixture":True}),created_at=SCENARIO_NOW.isoformat(),updated_at=SCENARIO_NOW.isoformat()))
        # Clone the established opportunity/requirement contracts rather than a second engine.
        original = dict(opportunities.get("devops-intern-2026"))
        original_version=original["requirement_version"]
        oid=manifest["opportunityId"]
        original.update(id=oid,title="Junior DevOps Internship",provider="Northstar Labs",summary="Sample 12-week internship with a Colombo platform team: maintain GitHub Actions checks, containerize a small API, and help investigate deployment failures with a mentor. Hybrid, three days on campus or in the office; practical Git evidence required, Docker practice expected, and AWS fundamentals reviewed during the interview.",
            source_url=f"https://example.org/lumapath-competition/{oid}",canonical_url=f"https://example.org/lumapath-competition/{oid}",source_name="Northstar Labs synthetic catalogue",requirement_version="competition-v1",
            starts_on="2026-11-02",closes_on="2026-10-14",location_mode="hybrid",location="Colombo, Sri Lanka",required_skills_json=json.dumps(["git","docker","aws"]),application_steps_json=json.dumps(["Prepare a one-page CV and link the release automation project.", "Add reproducible setup, test commands, and networking notes to the container project README.", "Write 150 words explaining a failed build you diagnosed and how you fixed it."]),source_checked_at=SCENARIO_NOW.isoformat(),source_expires_at=(SCENARIO_NOW+timedelta(days=30)).isoformat())
        requirements=[]
        baseline=[dict(row) for row in opportunities.requirements("devops-intern-2026",original_version)]
        for skill,label in [("git","Git"),("docker","Docker"),("aws","AWS fundamentals")]:
            row=dict(next(r for r in baseline if r["kind"]=="skill"))
            row.update(id=f"competition-requirement-{skill}",opportunity_id=oid,requirement_version="competition-v1",requirement_key=f"skill:{skill}",expected_json=json.dumps({"skill_id":skill}),label=label,source_text=f"Demonstrate practical {label} knowledge through a project or verified assessment.",source_reference=original["source_url"])
            requirements.append(row)
        opportunities.seed([original],{oid:requirements})
        seed_intelligence(database_path,pathways,manifest)
        seed_market(database_path,career,pathways,pathway_service)
        seed_notifications(database_path,manifest)
        EntitlementService(subscriptions,now=lambda: SCENARIO_NOW).set_demo_plan(STUDENT_ID,"pro")
        feed=service.browse(STUDENT_ID,BrowseRequest(context=RecommendationContext(target_role="DevOps Engineer")))
        opportunity=next(item for item in feed.items if item.id==oid)
    return {"version":manifest["version"],"student_id":STUDENT_ID,"scenario_date":manifest["date"],"synthetic":True,
        "opportunity":opportunity.model_dump(mode="json"),"plan":"pro",
        "comparison_roles":[role.model_dump(mode="json") for role in career.list_roles() if role.id in manifest["comparisonRoles"]]}
