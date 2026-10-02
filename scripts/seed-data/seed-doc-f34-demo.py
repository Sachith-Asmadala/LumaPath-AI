"""Seed clearly synthetic DOC-F34 market-taxonomy review data.

This script performs no web scraping and must never be described as live labour-market
research. It inserts synthetic aggregate observations through the real governed
DOC-F34 service so the competition workflow can be demonstrated safely.

It deliberately leaves the INTERNATIONAL proposal in human review. It may publish one
synthetic Sri Lanka REGIONAL profile through the real reviewer path so students can
exercise regional-vs-international comparison. Neither action modifies an existing
student's active roadmap.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app.core.config import settings
from apps.api.app.core.security import TaxonomyCuratorPrincipal
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.market_taxonomy.repository import MarketTaxonomyRepository
from apps.api.app.modules.market_taxonomy.schemas import (
    MarketSourceUpsertRequest,
    ObservationIngestRequest,
    ObservationInput,
    ProposalCreateRequest,
    ProposalDecisionRequest,
    SignalComputeRequest,
)
from apps.api.app.modules.market_taxonomy.service import MarketTaxonomyService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.service import PathwayService

CURATOR = TaxonomyCuratorPrincipal("doc-f34-demo-curator", "taxonomy_curator", ("international", "lk"))
REVIEWER = TaxonomyCuratorPrincipal("doc-f34-demo-reviewer", "taxonomy_reviewer", ("international", "lk", "all"))


def source(source_id: str, name: str, source_type: str, trust: int) -> MarketSourceUpsertRequest:
    return MarketSourceUpsertRequest(
        id=source_id,
        name=f"[Demo fixture] {name}",
        source_type=source_type,
        canonical_url=f"https://example.org/lumapath-demo/{source_id}",
        licensing_policy="Synthetic aggregate fixture metadata may be retained for LumaPath demonstration and automated testing only.",
        trust_score=trust,
        status="approved",
        bias_review_status="approved",
        regions=["international", "lk"],
        retention_days=365,
        max_age_days=180,
    )


def observation(
    source_id: str,
    share: float,
    *,
    period_start: date,
    observed_at: datetime,
    scope: str,
    region: str | None,
    sample: int,
) -> ObservationInput:
    slug = f"{scope}-{region or 'global'}-{period_start.isoformat()}"
    return ObservationInput(
        source_id=source_id,
        role_id="devops-engineer",
        skill_id="docker",
        profile_scope=scope,
        region_code=region,
        period_start=period_start,
        period_end=period_start + timedelta(days=27),
        observed_at=observed_at,
        sample_size=sample,
        skill_share=share,
        methodology="[Demo fixture] Synthetic aggregate role-skill occurrence share; no individual vacancy or student data is represented.",
        provenance_url=f"https://example.org/lumapath-demo/{source_id}/methodology/{slug}",
    )


def proposal_for_scope(repo: MarketTaxonomyRepository, scope: str, region: str | None):
    return next(
        (
            row
            for row in repo.proposals()
            if row["created_by"] == CURATOR.curator_id
            and row["profile_scope"] == scope
            and row["region_code"] == region
            and row["role_id"] == "devops-engineer"
            and row["skill_id"] == "docker"
        ),
        None,
    )


def main() -> None:
    if settings.environment not in {"development", "demo", "test"}:
        raise SystemExit("Synthetic seed actions are disabled outside development/demo/test.")
    now = datetime.now(timezone.utc).replace(microsecond=0)
    career_repo = CareerRepository(settings.database_path)
    career = CareerService(career_repo)
    pathways = PathwayRepository(settings.database_path)
    pathway_service = PathwayService(pathways, career_service=career)
    repo = MarketTaxonomyRepository(settings.database_path)
    service = MarketTaxonomyService(repo, career, pathways, pathway_service)

    demo_sources = [
        source("demo-job-aggregate", "governed job aggregate", "job_aggregate", 91),
        source("demo-cert-objectives", "official-objective aggregate", "certification_objectives", 96),
        source("demo-technology-source", "trusted technology aggregate", "technology_source", 93),
    ]
    for item in demo_sources:
        service.upsert_source(CURATOR, item)

    prior_start = (now - timedelta(days=82)).date()
    recent_start = (now - timedelta(days=26)).date()
    international_items = [
        observation("demo-job-aggregate", .28, period_start=prior_start, observed_at=now-timedelta(days=55), scope="international", region=None, sample=220),
        observation("demo-cert-objectives", .30, period_start=prior_start+timedelta(days=1), observed_at=now-timedelta(days=54), scope="international", region=None, sample=160),
        observation("demo-technology-source", .29, period_start=prior_start+timedelta(days=2), observed_at=now-timedelta(days=53), scope="international", region=None, sample=140),
        observation("demo-job-aggregate", .49, period_start=recent_start, observed_at=now-timedelta(days=6), scope="international", region=None, sample=260),
        observation("demo-cert-objectives", .47, period_start=recent_start+timedelta(days=1), observed_at=now-timedelta(days=5), scope="international", region=None, sample=180),
        observation("demo-technology-source", .50, period_start=recent_start+timedelta(days=2), observed_at=now-timedelta(days=4), scope="international", region=None, sample=170),
    ]
    regional_items = [
        observation("demo-job-aggregate", .22, period_start=prior_start, observed_at=now-timedelta(days=55), scope="regional", region="lk", sample=130),
        observation("demo-technology-source", .24, period_start=prior_start+timedelta(days=2), observed_at=now-timedelta(days=53), scope="regional", region="lk", sample=110),
        observation("demo-job-aggregate", .42, period_start=recent_start, observed_at=now-timedelta(days=6), scope="regional", region="lk", sample=150),
        observation("demo-technology-source", .44, period_start=recent_start+timedelta(days=2), observed_at=now-timedelta(days=4), scope="regional", region="lk", sample=120),
    ]
    accepted = service.ingest(CURATOR, ObservationIngestRequest(items=international_items + regional_items))

    international_signal = service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id="docker"))
    regional_signal = service.compute_signal(CURATOR, SignalComputeRequest(role_id="devops-engineer", skill_id="docker", profile_scope="regional", region_code="lk"))

    international_proposal = proposal_for_scope(repo, "international", None)
    if international_proposal is None:
        proposal = service.create_proposal(CURATOR, ProposalCreateRequest(
            signal_id=international_signal.id,
            rationale="[Demo fixture] Synthetic governed aggregates show a reviewable increase in Docker priority. Human publication review is still required.",
        ))
        international_proposal = service.submit(CURATOR, proposal.id).model_dump(mode="json")

    regional_proposal = proposal_for_scope(repo, "regional", "lk")
    if regional_proposal is None:
        proposal = service.create_proposal(CURATOR, ProposalCreateRequest(
            signal_id=regional_signal.id,
            rationale="[Demo fixture] Synthetic Sri Lanka aggregate profile used only to demonstrate regional comparison and review controls.",
        ))
        proposal = service.submit(CURATOR, proposal.id)
        regional_proposal = service.decide(
            REVIEWER,
            proposal.id,
            ProposalDecisionRequest(
                decision="approve",
                rationale="[Demo fixture] Reviewer approval for the synthetic regional comparison profile only; this is not live market evidence.",
            ),
        ).model_dump(mode="json")

    regional_version = repo.active_version("regional", "lk")
    print({
        "synthetic_fixture": True,
        "accepted_new_observations": len(accepted),
        "international_signal": {"label": international_signal.label, "confidence": international_signal.confidence, "sample": international_signal.sample_size},
        "international_proposal_status": international_proposal["status"],
        "regional_signal": {"label": regional_signal.label, "confidence": regional_signal.confidence, "sample": regional_signal.sample_size},
        "regional_profile_version": regional_version["version"] if regional_version else None,
        "warning": "Synthetic aggregate demonstration only. No web scraping occurred and these values are not live labour-market claims.",
    })


if __name__ == "__main__":
    main()
