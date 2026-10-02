# DOC-F30 — Daily learning & market intelligence API

## Purpose

DOC-F30 gives a student a small daily set of fresh, approved-source updates relevant to the **currently approved DOC-F29 Career Path**. Ranking is deterministic and auditable; the explanation is generated from stored pathway/source/ranking factors rather than an ungrounded LLM answer.

## Student endpoints

All endpoints require the existing prototype `X-Luma-Student-Id` identity boundary. Production must replace this trusted development header with the verified account session/JWT.

### `GET /v1/intelligence/feed?view=today|saved|planned`

Returns one of:

- `ready` — fresh items or a valid saved/planned collection;
- `no_pathway` — no approved DOC-F29 pathway exists;
- `no_fresh_content` — ingestion is healthy but no eligible fresh content exists;
- `ingestion_failure` — latest approved-source ingestion is degraded and no fresh eligible content exists.

Today's feed never substitutes expired saved content for missing fresh content.

Each item includes source, publisher URL, publication/expiry time, related skills, difficulty, relevance score, grounded explanation, `ranking_version` and `explanation_version`.

### `POST /v1/intelligence/feed/{article_id}/interactions`

Body: `{ "action": "save|unsave|dismiss|report", "reason": "..." }`.

- Save/unsave changes the saved collection and preference signal.
- Dismiss removes the item and reduces similar category/source/topic affinity.
- Report requires a reason and globally quarantines the article for review.

The interaction stores the recommendation/ranking/explanation versions that were visible when the student acted.

### `POST /v1/intelligence/feed/{article_id}/add-to-plan`

Server-validates that the article is still fresh/approved and that it came from the student's auditable feed. It returns an idempotent planner handoff contract with a conflict-free suggested block. The current LumaPath Planner is still client-owned, so the frontend applies this returned contract to the existing planner state. When the planner becomes server-owned, this handoff can be consumed directly by that module without changing the feed contract.

## Ingestion contract

`IntelligenceService.ingest_candidates(source_id, candidates)` is the only ingestion write path. It enforces:

- source allow-list and category allow-list;
- deterministic fallback enrichment of known DevOps topics/skills from permitted title/excerpt metadata when a provider omits those tags;
- HTTPS canonical URL + exact/subdomain allow-list;
- tracking-query removal and canonical deduplication;
- source trust score/status;
- stricter authority rules for security and certification claims;
- publisher excerpt-storage policy and maximum excerpt length;
- stale/future-date quarantine;
- suspicious script/instruction metadata quarantine;
- source-specific expiry.

No full article body is stored.

## Ranking v1

`2026-10-doc-f30-rank-v1` combines:

- current DOC-F29 pathway-step/skill alignment;
- target-role alignment;
- difficulty fit derived from current step proficiency;
- freshness within the source-specific expiry window;
- approved-source trust;
- prior save/dismiss/report/plan interaction affinity.

Selection then applies configurable diversity/frequency caps:

- `CONTENT_FEED_DAILY_LIMIT` (default 8)
- `CONTENT_FEED_PER_SOURCE_LIMIT` (default 2)
- `CONTENT_FEED_PER_CATEGORY_LIMIT` (default 3)

Daily feed generations are append-only. An interaction invalidates the active generation and the next `today` request appends a reranked generation, preserving the earlier recommendation for auditability.

## Copyright and publisher governance

LumaPath stores only metadata and a permitted bounded excerpt where the source policy allows it. The UI links to the canonical publisher URL for the full item. A production provider adapter must be reviewed against publisher/API terms before enablement.
