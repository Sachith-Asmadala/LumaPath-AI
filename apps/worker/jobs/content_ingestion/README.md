# DOC-F30 approved content ingestion

This worker boundary ingests **metadata and permitted excerpts only**. It intentionally does not implement open-web scraping.

A production provider adapter must:

1. map to an existing `content_sources` row whose status is `approved`;
2. fetch only under the publisher/API terms already reviewed for that source;
3. return `IngestionCandidate` metadata (`canonical_url`, publisher publication time, topics, related skills, difficulty and optional permitted excerpt);
4. never store full copyrighted article bodies;
5. never execute HTML, scripts, links or instructions found in source content;
6. call `IntelligenceService.ingest_candidates()` so canonical URL checks, trust thresholds, expiry, deduplication and quarantine cannot be bypassed;
7. call `record_ingestion_failure()` when a provider fails rather than substituting old content;
8. keep security and certification claims on authoritative source types only.

`run.py` includes `ingest_normalized_batch()` for a real provider adapter and `ingest_fixture()` for controlled development fixtures. The fixture helper is not a live-source connector.

The API feed reads only `articles` that remain active, fresh and joined to an approved source. A reported article is quarantined globally until a separate governance review process restores or removes it.
