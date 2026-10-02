# DOC-F30 verification checklist

Backlog: **DOC-F30 — trustworthy daily learning and market updates**

## Acceptance criteria mapping

- **AC1:** tests ingest and surface learning article, official release, security update, industry news and certification change categories.
- **AC2:** ranking reads the active DOC-F29 target role/current step and exposes a grounded relevance explanation plus version identifiers.
- **AC3:** UI/API expose source, trust, publication time and expiry/freshness.
- **AC4:** save, unsave, dismiss, report and add-to-plan are persisted; interactions invalidate/rerank the daily generation; planner handoff is idempotent and conflict checked.
- **AC5:** canonical duplicates, stale content, quarantined content and blocked/low-trust sources are excluded.
- **AC6:** no-pathway, no-fresh-content and ingestion-failure states return no fabricated items.

## Security/privacy/governance checks

- Student ownership is server-scoped by the existing identity dependency.
- No private document/mentor content is read by DOC-F30 ranking.
- Reported content is quarantined globally for review.
- Security/certification claims require authoritative source types and high trust thresholds.
- Metadata that looks like executable/script/prompt-injection content is quarantined and never executed.
- Planner handoff revalidates source/article freshness and overlap before approval.
- No open-web scraper is shipped.
- Full copyrighted articles are not persisted.

## Automated tests

`apps/api/tests/test_intelligence_feed.py` covers normalisation, canonical deduplication, all categories, ranking, interaction influence, source blocking, stale/low-trust quarantine, malicious metadata, no-pathway, upstream failure, planner conflict/idempotency and API identity boundaries.

`tests/e2e/daily-intelligence.spec.ts` covers the primary student UI flow with deterministic API fixtures.

## Verification executed in this delivery

- FastAPI regression: **318 passed**.
- Local frontend import contract: **974 imports resolved**.
- i18n contract: **1812 keys × 3 locales**, placeholders aligned.
- Pseudo-localization: **1812 messages passed**.
- TypeScript syntax transpile: **10 changed TS/TSX files passed**.
- Synthetic DOC-F30 seeder: real ingestion + ranking pipeline produced a ready five-category feed against a temporary database.

### Frontend build limitation

The uploaded baseline contains neither `node_modules` nor `package-lock.json`. `npm install --package-lock-only` was attempted for this delivery but dependency resolution timed out in the execution environment. Therefore this verification does **not** claim a successful dependency-backed `npm run typecheck`, `npm run build`, or Playwright execution. The E2E spec is included and the changed TypeScript/TSX files were syntax-parsed with the available TypeScript compiler. Before release/CI, generate and commit the lockfile in a network-enabled environment, run `npm ci`, then run `npm run verify:full`.
