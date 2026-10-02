"""DOC-F34 governed market-observation ingestion boundary.

No open-web scraping lives here. Provider adapters may submit aggregate observations only
for sources that a curator has already approved in ``market_sources``.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from apps.api.app.core.config import settings
from apps.api.app.core.security import TaxonomyCuratorPrincipal
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.market_taxonomy.repository import MarketTaxonomyRepository
from apps.api.app.modules.market_taxonomy.schemas import ObservationIngestRequest
from apps.api.app.modules.market_taxonomy.service import MarketTaxonomyService
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.service import PathwayService


def service() -> MarketTaxonomyService:
    career_repo = CareerRepository(settings.database_path)
    career = CareerService(career_repo)
    pathways = PathwayRepository(settings.database_path)
    return MarketTaxonomyService(
        MarketTaxonomyRepository(settings.database_path), career, pathways,
        PathwayService(pathways, career_service=career),
    )


def ingest_normalized_batch(items: list[dict[str, Any]], *, worker_id: str = "market-worker") -> list[dict[str, Any]]:
    """Validate and ingest an already-aggregated governed provider batch.

    The worker principal is intentionally constrained to curator rights. Publication still
    requires a separate human reviewer action through the review API.
    """
    try:
        request = ObservationIngestRequest.model_validate({"items": items})
    except ValidationError as exc:
        return [{"accepted": False, "error": "provider_schema_invalid", "validation_errors": len(exc.errors())}]
    principal = TaxonomyCuratorPrincipal(worker_id, "taxonomy_curator", ("all", "international"))
    rows = service().ingest(principal, request)
    return [row.model_dump(mode="json") for row in rows]


def ingest_fixture(path: str | Path) -> list[dict[str, Any]]:
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Fixture root must be a list of normalized aggregate observations.")
    return ingest_normalized_batch(payload)


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Ingest a governed DOC-F34 aggregate-observation fixture.")
    parser.add_argument("fixture")
    args = parser.parse_args()
    print(json.dumps(ingest_fixture(args.fixture), indent=2, default=str))
