from __future__ import annotations

import json
import tempfile
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.app.core.security import TaxonomyCuratorPrincipal
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.schemas import SkillAssessmentRequest
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.market_taxonomy import router as router_module
from apps.api.app.modules.market_taxonomy.repository import MarketTaxonomyRepository
from apps.api.app.modules.market_taxonomy.schemas import (
    MarketSourceUpsertRequest,
    ObservationIngestRequest,
    ObservationInput,
    ProposalCreateRequest,
    ProposalDecisionRequest,
    SignalComputeRequest,
    StudentUpdateDecisionRequest,
    TaxonomyRollbackRequest,
)
from apps.api.app.modules.market_taxonomy.service import MarketTaxonomyService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.schemas import PathwayContextRequest, PathwayDecisionRequest
from apps.api.app.modules.pathways.service import PathwayService

NOW = datetime(2026, 11, 20, 10, 0, tzinfo=timezone.utc)
CURATOR = TaxonomyCuratorPrincipal("curator-1", "taxonomy_curator", ("international", "lk"))
REVIEWER = TaxonomyCuratorPrincipal("reviewer-1", "taxonomy_reviewer", ("international", "lk", "all"))


def build_service():
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    career_repo = CareerRepository(tmp.name)
    career = CareerService(career_repo, now=lambda: NOW)
    pathways = PathwayRepository(tmp.name)
    pathway_service = PathwayService(pathways, now=lambda: NOW, career_service=career)
    repo = MarketTaxonomyRepository(tmp.name)
    return MarketTaxonomyService(repo, career, pathways, pathway_service, now=lambda: NOW), career, pathways, pathway_service, tmp.name


def source(source_id: str, *, trust=90, status="approved", bias="approved", regions=None, max_age=180):
    return MarketSourceUpsertRequest(
        id=source_id,
        name=f"Trusted {source_id}",
        source_type="job_aggregate",
        canonical_url=f"https://example.org/{source_id}",
        licensing_policy="Aggregate metadata and counts may be retained for taxonomy research.",
        trust_score=trust,
        status=status,
        bias_review_status=bias,
        regions=regions or ["international", "lk"],
        retention_days=365,
        max_age_days=max_age,
    )


def observation(source_id: str, skill_share: float, *, period_offset: int, sample=120, scope="international", region=None, role="devops-engineer", skill="docker", observed=None):
    start = date(2026, 8, 1) + timedelta(days=period_offset)
    return ObservationInput(
        source_id=source_id,
        role_id=role,
        skill_id=skill,
        profile_scope=scope,
        region_code=region,
        period_start=start,
        period_end=start + timedelta(days=27),
        observed_at=observed or NOW - timedelta(days=max(1, 50 - period_offset // 2)),
        sample_size=sample,
        skill_share=skill_share,
        methodology="Aggregated role-skill occurrence share from governed source data.",
        provenance_url=f"https://example.org/{source_id}/methodology/{period_offset}",
    )


def seed_emerging(service: MarketTaxonomyService, *, scope="international", region=None, skill="docker"):
    service.upsert_source(CURATOR, source("jobs-a", regions=["international", "lk"]))
    service.upsert_source(CURATOR, source("jobs-b", regions=["international", "lk"]))
    rows = [
        observation("jobs-a", .30, period_offset=0, scope=scope, region=region, skill=skill),
        observation("jobs-b", .32, period_offset=2, scope=scope, region=region, skill=skill),
        observation("jobs-a", .50, period_offset=30, scope=scope, region=region, skill=skill),
        observation("jobs-b", .52, period_offset=32, scope=scope, region=region, skill=skill),
    ]
    service.ingest(CURATOR, ObservationIngestRequest(items=rows))
    return service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id=skill, profile_scope=scope, region_code=region))


def active_pathway(career: CareerService, pathways: PathwayRepository, pathway_service: PathwayService, student="student-a"):
    career.assess(student, SkillAssessmentRequest(target_role="DevOps Engineer", self_assessments=[], quiz_evidence=[], certificate_evidence=[]))
    draft = pathway_service.generate(student, PathwayContextRequest(
        target_role="DevOps Engineer", goal="Become a DevOps engineer", pace="balanced", timezone="Asia/Colombo",
        planning_start=date(2026, 11, 20), target_date=date(2027, 5, 1), weekly_learning_minutes=300,
        daily_available_minutes=90, skills=[], academic_tasks=[], planner_blocks=[],
    ))
    pathway_service.decide(student, draft.id, PathwayDecisionRequest(decision="approve"))
    return pathways.current_active(student)


def test_ac1_baseline_taxonomy_is_versioned_and_snapshot_is_immutable():
    service, _, _, _, db = build_service()
    versions = service.repository.list_versions("international")
    assert len(versions) == 1 and versions[0]["status"] == "approved" and versions[0]["is_default"] == 1
    with pytest.raises(Exception):
        with service.repository._connect() as conn:
            conn.execute("UPDATE taxonomy_versions SET snapshot_json='{}' WHERE version=?", (versions[0]["version"],))


def test_governance_blocks_low_trust_bias_pending_and_stale_observations():
    service, *_ = build_service()
    service.upsert_source(CURATOR, source("low", trust=60))
    with pytest.raises(Exception) as exc:
        service.ingest(CURATOR, ObservationIngestRequest(items=[observation("low", .4, period_offset=0)]))
    assert getattr(exc.value, "status_code", None) == 409

    service.upsert_source(CURATOR, source("biased", bias="pending"))
    with pytest.raises(Exception):
        service.ingest(CURATOR, ObservationIngestRequest(items=[observation("biased", .4, period_offset=0)]))

    service.upsert_source(CURATOR, source("stale", max_age=30))
    with pytest.raises(Exception) as stale:
        service.ingest(CURATOR, ObservationIngestRequest(items=[observation("stale", .4, period_offset=0, observed=NOW-timedelta(days=45))]))
    assert "stale" in str(stale.value.detail).lower()


def test_ac2_signal_retains_provenance_region_sample_confidence_recency_and_methodology():
    service, *_ = build_service()
    signal = seed_emerging(service)
    assert signal.label == "emerging"
    assert signal.delta >= .15
    assert signal.sample_size == 480
    assert signal.source_count == 2
    assert signal.confidence >= .62
    assert signal.publication_eligible is True
    assert set(signal.source_ids) == {"jobs-a", "jobs-b"}
    assert signal.methodology_version == "doc-f34-signal-v1"
    assert signal.recency_days >= 0


def test_conflicting_sources_reduce_confidence_and_are_disclosed():
    service, *_ = build_service()
    service.upsert_source(CURATOR, source("jobs-a")); service.upsert_source(CURATOR, source("jobs-b"))
    rows = [
        observation("jobs-a", .30, period_offset=0), observation("jobs-b", .30, period_offset=2),
        observation("jobs-a", .60, period_offset=30), observation("jobs-b", .20, period_offset=32),
    ]
    service.ingest(CURATOR, ObservationIngestRequest(items=rows))
    signal = service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id="docker"))
    assert any("disagree" in item.lower() for item in signal.limitations)


def test_ac3_stable_or_under_threshold_signal_cannot_silently_become_taxonomy_change():
    service, *_ = build_service()
    service.upsert_source(CURATOR, source("jobs-a")); service.upsert_source(CURATOR, source("jobs-b"))
    rows = [
        observation("jobs-a", .30, period_offset=0), observation("jobs-b", .31, period_offset=2),
        observation("jobs-a", .32, period_offset=30), observation("jobs-b", .31, period_offset=32),
    ]
    service.ingest(CURATOR, ObservationIngestRequest(items=rows))
    signal = service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id="docker"))
    assert signal.label == "stable" and signal.publication_eligible is False
    with pytest.raises(Exception) as exc:
        service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Do not publish a stable observation automatically."))
    assert getattr(exc.value, "status_code", None) == 409


def test_ac1_ac3_human_review_creates_new_immutable_version_and_approval_history():
    service, career, *_ = build_service()
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Docker demand increased across governed sources."))
    assert proposal.status == "draft" and proposal.resulting_version is None and proposal.candidate_version
    draft_version = service.repository.version(proposal.candidate_version)
    assert draft_version["status"] == "draft" and draft_version["parent_version"] == proposal.base_version
    submitted = service.submit(CURATOR, proposal.id)
    assert submitted.status == "review"
    assert service.repository.version(proposal.candidate_version)["status"] == "review"
    with pytest.raises(Exception) as forbidden:
        service.decide(CURATOR, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Curator cannot self-publish."))
    assert getattr(forbidden.value, "status_code", None) == 403
    approved = service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Reviewed provenance, sample, bias controls and methodology."))
    assert approved.status == "approved" and approved.resulting_version == proposal.candidate_version
    assert service.repository.version(proposal.candidate_version)["status"] == "approved"
    history = service.approvals(REVIEWER, proposal.id)
    assert len(history) == 1 and history[0].decision == "approve"
    assert career.current_taxonomy_version() == approved.resulting_version
    assert career.role_detail("devops-engineer").version == approved.resulting_version
    baseline = service.repository.version(proposal.base_version)
    assert baseline["status"] == "retired" and baseline["is_default"] == 0


def test_rejected_proposal_never_changes_active_taxonomy():
    service, career, *_ = build_service()
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Candidate change for review."))
    service.submit(CURATOR, proposal.id)
    base = career.current_taxonomy_version()
    rejected = service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="reject", rationale="Evidence is directionally useful but not strong enough for publication."))
    assert rejected.status == "rejected" and rejected.resulting_version is None
    assert service.repository.version(proposal.candidate_version)["status"] == "retired"
    assert career.current_taxonomy_version() == base


def test_ac4_ac5_approved_change_notifies_affected_student_and_keeps_active_pathway_unchanged_until_confirmation():
    service, career, pathways, path_service, _ = build_service()
    active = active_pathway(career, pathways, path_service)
    baseline_id, baseline_version = active["id"], active["definition_version"]
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Reviewed market shift should raise Docker priority."))
    service.submit(CURATOR, proposal.id)
    approved = service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Approved after human review."))
    updates = service.student_updates("student-a")
    assert len(updates) == 1 and updates[0].status == "pending"
    assert updates[0].from_version == baseline_version and updates[0].to_version == approved.resulting_version
    still_active = pathways.current_active("student-a")
    assert still_active["id"] == baseline_id and still_active["definition_version"] == baseline_version

    with pytest.raises(Exception):
        StudentUpdateDecisionRequest(decision="recalculate", confirmed=False)
    decided = service.decide_student_update("student-a", updates[0].id, StudentUpdateDecisionRequest(decision="recalculate", confirmed=True))
    assert decided.status == "recalculation_drafted" and decided.draft_pathway_id
    active_after = pathways.current_active("student-a")
    assert active_after["id"] == baseline_id
    draft = pathways.current_draft("student-a")
    assert draft and draft["definition_version"] == approved.resulting_version
    old_docker = next(r for r in pathways.steps(baseline_id) if r["skill_id"] == "docker")
    new_docker = next(r for r in pathways.steps(draft["id"]) if r["skill_id"] == "docker")
    assert old_docker["state"] in {"locked", "available", "in_progress", "credited", "completed"}
    assert new_docker["estimated_minutes"] == old_docker["estimated_minutes"]


def test_keep_current_decision_preserves_legacy_pathway_and_does_not_create_draft():
    service, career, pathways, path_service, _ = build_service()
    active = active_pathway(career, pathways, path_service)
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Market change for review."))
    service.submit(CURATOR, proposal.id); service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Approved after review."))
    update = service.student_updates("student-a")[0]
    kept = service.decide_student_update("student-a", update.id, StudentUpdateDecisionRequest(decision="keep_current"))
    assert kept.status == "kept_current"
    assert pathways.current_active("student-a")["id"] == active["id"]
    assert pathways.current_draft("student-a") is None


def test_ac6_regional_profile_is_distinguishable_and_curator_scope_is_enforced():
    service, *_ = build_service()
    signal = seed_emerging(service, scope="regional", region="lk")
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Sri Lanka aggregate evidence suggests higher Docker priority."))
    service.submit(CURATOR, proposal.id); approved = service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Regional evidence and bias review passed."))
    assert approved.resulting_version
    comparison = service.compare_profiles("student-a", "devops-engineer", "lk")
    assert comparison.international.profile_scope == "international"
    assert comparison.regional and comparison.regional.profile_scope == "regional" and comparison.regional.region_code == "lk"
    assert comparison.regional.version != comparison.international.version
    restricted = TaxonomyCuratorPrincipal("curator-eu", "taxonomy_curator", ("eu",))
    with pytest.raises(Exception) as exc:
        service.signals(restricted, "regional", "lk")
    assert getattr(exc.value, "status_code", None) == 403


def test_human_rollback_creates_new_version_instead_of_mutating_history():
    service, career, *_ = build_service()
    baseline = career.current_taxonomy_version()
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Publish a reversible reviewed change."))
    service.submit(CURATOR, proposal.id); approved = service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Approved for rollback test."))
    changed = career.current_taxonomy_version()
    assert changed == approved.resulting_version and changed != baseline
    rollback = service.rollback(REVIEWER, TaxonomyRollbackRequest(target_version=baseline, rationale="Post-publication review found the earlier snapshot better supported."))
    assert rollback.restored_from_version == baseline
    assert rollback.previous_default_version == changed
    assert rollback.new_version not in {baseline, changed}
    assert career.current_taxonomy_version() == rollback.new_version
    restored = career.role_detail("devops-engineer")
    docker = next(s for s in restored.skills if s.skill_id == "docker")
    assert docker.required_proficiency == 70


def test_http_curator_and_student_boundaries(monkeypatch):
    service, *_ = build_service()
    monkeypatch.setattr(router_module, "_service", service)
    app = FastAPI(); app.include_router(router_module.router)
    from apps.api.tests.entitlement_helpers import grant_test_plan
    grant_test_plan(app, monkeypatch, service.repository.database_path, "student-http", "institution")
    client = TestClient(app)
    curator_headers = {"X-Luma-Student-Id":"student-http","X-Luma-Curator-Id":"curator-http","X-Luma-Curator-Role":"taxonomy_curator","X-Luma-Region-Scope":"international,lk"}
    student_headers = {"X-Luma-Student-Id":"student-http"}
    assert client.get("/v1/market-taxonomy/governance").status_code == 401
    assert client.get("/v1/market-taxonomy/governance", headers=curator_headers).status_code == 200
    assert client.get("/v1/market-taxonomy/student/profile-comparison/devops-engineer?region_code=lk", headers=student_headers).status_code == 200
    assert client.get("/v1/market-taxonomy/student/updates", headers={key:value for key,value in curator_headers.items() if key != "X-Luma-Student-Id"}).status_code == 401


def test_governed_certification_and_technology_sources_are_retained_in_signal_provenance():
    service, *_ = build_service()
    certification = MarketSourceUpsertRequest(
        id="cert-objectives", name="Trusted certification objectives", source_type="certification_objectives",
        canonical_url="https://example.org/cert-objectives", licensing_policy="Objective metadata and aggregate mappings may be retained.",
        trust_score=95, status="approved", bias_review_status="approved", regions=["international"], retention_days=365, max_age_days=180,
    )
    technology = MarketSourceUpsertRequest(
        id="technology-source", name="Trusted technology source", source_type="technology_source",
        canonical_url="https://example.org/technology-source", licensing_policy="Release metadata and aggregate skill mappings may be retained.",
        trust_score=92, status="approved", bias_review_status="approved", regions=["international"], retention_days=365, max_age_days=180,
    )
    service.upsert_source(CURATOR, certification); service.upsert_source(CURATOR, technology)
    service.ingest(CURATOR, ObservationIngestRequest(items=[
        observation("cert-objectives", .28, period_offset=0), observation("technology-source", .30, period_offset=2),
        observation("cert-objectives", .48, period_offset=30), observation("technology-source", .51, period_offset=32),
    ]))
    signal = service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id="docker"))
    assert {item.source_type for item in signal.observations} == {"certification_objectives", "technology_source"}
    assert signal.publication_eligible is True


def test_ac4_approved_taxonomy_change_enters_existing_notification_inbox_without_auto_migration():
    from apps.api.app.modules.notifications.repository import NotificationRepository
    from apps.api.app.modules.notifications.service import NotificationService

    service, career, pathways, path_service, db = build_service()
    service.notification_service = NotificationService(NotificationRepository(db), now=lambda: NOW)
    active = active_pathway(career, pathways, path_service, student="student-notified")
    original_id, original_version = active["id"], active["definition_version"]
    signal = seed_emerging(service)
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Reviewed governed signal for notification integration."))
    service.submit(CURATOR, proposal.id)
    service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Human review confirms the aggregate evidence and publication controls."))

    inbox = service.notification_service.inbox("student-notified", include_dismissed=False)
    assert any(item.action_href == "/market-signals" and item.source_type == "roadmap" for item in inbox.items)
    still_active = pathways.current_active("student-notified")
    assert still_active["id"] == original_id and still_active["definition_version"] == original_version


def test_publication_rechecks_source_governance_after_signal_and_during_human_review():
    service, *_ = build_service()
    signal = seed_emerging(service)
    # Source governance can change after a signal was calculated; publication must fail closed.
    service.upsert_source(CURATOR, source("jobs-a", status="blocked"))
    with pytest.raises(Exception) as blocked_create:
        service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="This should be blocked after source governance changed."))
    assert getattr(blocked_create.value, "status_code", None) == 409

    # Restore, create a reviewed candidate, then revoke another source before approval.
    service.upsert_source(CURATOR, source("jobs-a"))
    proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=signal.id, rationale="Candidate created while all governed sources are approved."))
    service.submit(CURATOR, proposal.id)
    service.upsert_source(CURATOR, source("jobs-b", bias="pending"))
    with pytest.raises(Exception) as blocked_approval:
        service.decide(REVIEWER, proposal.id, ProposalDecisionRequest(decision="approve", rationale="Human reviewer cannot override failed source governance."))
    assert getattr(blocked_approval.value, "status_code", None) == 409
    assert service.repository.version(proposal.candidate_version)["status"] == "review"


def test_ac6_unfiltered_curator_reads_do_not_leak_other_profile_scopes():
    service, *_ = build_service()
    # Produce both international and LK regional evidence/proposals. A regional curator must
    # not recover international records simply by omitting query filters.
    international_signal = seed_emerging(service, scope="international")
    regional_signal = seed_emerging(service, scope="regional", region="lk")
    service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=international_signal.id, rationale="International proposal must remain outside LK-only scope."))
    regional_proposal = service.create_proposal(CURATOR, ProposalCreateRequest(signal_id=regional_signal.id, rationale="LK proposal remains visible to the authorised regional curator."))
    service.submit(CURATOR, regional_proposal.id)
    service.decide(REVIEWER, regional_proposal.id, ProposalDecisionRequest(decision="approve", rationale="Regional publication used to verify scoped version listing."))

    lk_only = TaxonomyCuratorPrincipal("curator-lk", "taxonomy_curator", ("lk",))
    rows = service.signals(lk_only)
    assert rows and all(row.profile_scope == "regional" and row.region_code == "lk" for row in rows)

    proposals = service.proposals(lk_only)
    assert proposals and all(row.profile_scope == "regional" and row.region_code == "lk" for row in proposals)

    versions = service.versions(lk_only)
    assert versions and all(row.profile_scope == "regional" and row.region_code == "lk" for row in versions)

    with pytest.raises(Exception) as international_denied:
        service.signals(lk_only, "international", None)
    assert getattr(international_denied.value, "status_code", None) == 403


def test_ac6_source_administration_cannot_expand_or_modify_outside_curator_region_scope():
    service, *_ = build_service()
    global_source = source("global-source", regions=["international", "lk"])
    service.upsert_source(CURATOR, global_source)

    lk_only = TaxonomyCuratorPrincipal("curator-lk", "taxonomy_curator", ("lk",))
    with pytest.raises(Exception) as modify_global:
        service.upsert_source(lk_only, source("global-source", regions=["lk"]))
    assert getattr(modify_global.value, "status_code", None) == 403

    with pytest.raises(Exception) as expand_scope:
        service.upsert_source(lk_only, source("lk-source", regions=["lk", "eu"]))
    assert getattr(expand_scope.value, "status_code", None) == 403

    saved = service.upsert_source(lk_only, source("lk-source", regions=["LK", "lk"]))
    assert saved.regions == ["lk"]


def test_ac6_region_scoped_curator_cannot_ingest_or_compute_international_market_data():
    service, *_ = build_service()
    service.upsert_source(CURATOR, source("jobs-intl", regions=["international"]))
    lk_only = TaxonomyCuratorPrincipal("curator-lk", "taxonomy_curator", ("lk",))

    with pytest.raises(Exception) as denied_ingest:
        service.ingest(lk_only, ObservationIngestRequest(items=[observation("jobs-intl", .4, period_offset=0)]))
    assert getattr(denied_ingest.value, "status_code", None) == 403

    with pytest.raises(Exception) as denied_compute:
        service.compute_signal(lk_only, SignalComputeRequest(role_id="devops-engineer", skill_id="docker"))
    assert getattr(denied_compute.value, "status_code", None) == 403
