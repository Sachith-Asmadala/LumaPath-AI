"""DOC-F30 governed content-ingestion worker boundary.

This runner intentionally does not scrape the open web. Provider adapters must return
normalised metadata from a source already present in the approved content_sources catalogue.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from apps.api.app.core.config import settings
from apps.api.app.modules.intelligence.repository import IntelligenceRepository
from apps.api.app.modules.intelligence.schemas import IngestionCandidate
from apps.api.app.modules.intelligence.service import IntelligenceService
from apps.api.app.modules.pathways.repository import PathwayRepository


def service() -> IntelligenceService:
    repository = IntelligenceRepository(settings.database_path)
    pathways = PathwayRepository(settings.database_path)
    return IntelligenceService(
        repository,
        pathways,
        daily_limit=settings.content_feed_daily_limit,
        per_source_limit=settings.content_feed_per_source_limit,
        per_category_limit=settings.content_feed_per_category_limit,
    )


def ingest_normalized_batch(source_id: str, items: list[dict[str, Any]]) -> dict[str, Any]:
    """Ingest one provider batch after the provider adapter has fetched permitted metadata."""
    svc = service()
    try:
        candidates = [IngestionCandidate.model_validate({**item, "source_id": source_id}) for item in items]
    except ValidationError as exc:
        result = svc.record_ingestion_failure(source_id, "provider_schema_invalid", "Provider metadata failed the DOC-F30 schema contract.")
        return result.model_dump(mode="json") | {"validation_errors": len(exc.errors())}
    result = svc.ingest_candidates(source_id, candidates)
    return result.model_dump(mode="json")


def ingest_fixture(path: str | Path) -> list[dict[str, Any]]:
    """Development/test helper for a governed JSON fixture, never a production scraper."""
    payload = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(payload, list):
        raise ValueError("Fixture root must be a list of source batches.")
    results: list[dict[str, Any]] = []
    for batch in payload:
        if not isinstance(batch, dict) or not isinstance(batch.get("source_id"), str) or not isinstance(batch.get("items"), list):
            raise ValueError("Each fixture batch requires source_id and items.")
        results.append(ingest_normalized_batch(batch["source_id"], batch["items"]))
    return results


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Ingest a governed DOC-F30 metadata fixture.")
    parser.add_argument("fixture", help="Path to a JSON fixture containing approved-source metadata.")
    args = parser.parse_args()
    print(json.dumps(ingest_fixture(args.fixture), indent=2, default=str))
