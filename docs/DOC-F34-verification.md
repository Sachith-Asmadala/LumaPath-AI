# DOC-F34 Verification Notes

## Acceptance criteria mapping

- **AC1 — immutable versions + approval history:** approved changes publish a new immutable `taxonomy_versions` snapshot; the previous same-scope version is retired; `taxonomy_approvals` preserves the human decision. Rollback publishes another new version rather than mutating history.
- **AC2 — provenance:** every signal exposes governed sources/observations, source type, dates, profile/region, aggregate sample size, confidence, recency, methodology/version and provenance URLs.
- **AC3 — proposal boundary:** emerging/declining signals remain observations until a curator creates a proposal and a human reviewer approves it. Stable/low-confidence/limited signals cannot create a publishable proposal.
- **AC4 — affected users notified:** approved international changes create owner-scoped impact notices plus an existing Notifications-inbox roadmap notice linking to `/market-signals`.
- **AC5 — non-destructive migration:** existing pathways retain their original `definition_version` and remain usable. Explicit student confirmation creates only a recalculated draft; active-pathway approval remains a separate Roadmap action.
- **AC6 — profile distinction/access:** international and regional versions are separately versioned. A regional publication cannot retire the international default. Curator scope is enforced server-side on writes and filtered/unfiltered reads, so omitting query filters cannot reveal or administer another market profile.

## Automated risk coverage

`apps/api/tests/test_market_taxonomy.py` covers:

- taxonomy snapshot immutability;
- trust, licensing-governed source catalogue and freshness rejection;
- pending/rejected bias review rejection;
- aggregate signal thresholds and confidence;
- conflicting-source confidence penalty;
- job aggregate, certification objective and technology-source provenance;
- stable/under-threshold signals staying observation-only;
- source/bias governance being re-checked after signal creation and again at publication time;
- curator vs reviewer publication boundary;
- approval/rejection history;
- regional/international access control, unfiltered-list non-leakage, source-scope administration and regional publication isolation;
- affected pathway notices and Notifications-inbox integration;
- explicit recalculation with active pathway unchanged;
- keeping current without migration;
- human rollback creating a new version;
- HTTP role/student-boundary smoke coverage.

The reference database schema is also executed against a fresh SQLite database during release verification.

## Frontend

`/market-signals` follows the existing LumaPath components/tokens. It provides:

- student international/regional profile comparison;
- impact explanation and before/after requirement preview;
- explicit Keep current / Recalculate controls;
- curator signal provenance, sample, confidence and methodology;
- proposal submit/approve/reject actions;
- loading, empty, permission, validation and upstream-error states;
- responsive/narrow-screen layout.

## Release limitation

The cumulative repository still has no committed `package-lock.json` or installed `node_modules`. Repository-local import/i18n/pseudo and TypeScript syntax checks can be run here, but a truthful dependency-backed `npm ci`, semantic typecheck, Next.js build and Playwright execution require generating/committing the lockfile and installing dependencies in a network-enabled environment.

## Release verification performed for this package

- FastAPI cumulative regression: **365 passed**.
- DOC-F34 focused market-taxonomy tests: **18 passed**.
- Local frontend import contract: **1,025 imports resolved**.
- i18n contract: **1,986 keys × 3 locales** with placeholders aligned.
- Pseudo-localization: **1,986 messages passed**.
- DOC-F34 changed TypeScript/TSX files: **17 syntax-transpiled with zero diagnostics**.
- `database/schemas/market_taxonomy.sql`: executed successfully against a fresh SQLite database.
- Python application/worker/demo modules: `compileall` passed before release cleanup.

The dependency-backed Next.js build remains subject to the cumulative repository limitation below.
