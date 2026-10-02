# DOC-F32 Verification — Opportunity Readiness

Backlog: **DOC-F32**  
Delivery phase: **S4 Intelligence & Release**

## Acceptance-criteria traceability

### AC1 — Deadline, prerequisites, source and validation date

Implemented by the expanded opportunity contract and `/opportunities` detail UI:

- deadline and original source URL;
- source trust/status;
- last verified and freshness expiry;
- versioned structured prerequisites;
- application steps;
- preserved requirement source reference.

Automated coverage includes requirement-version/source-reference persistence, canonical deduplication and HTTP response validation.

### AC2 — Every requirement is met, unmet or unknown with evidence

`EligibilityCheck` is requirement-level and exposes:

- status;
- explanation;
- structured supporting evidence references;
- source text/reference;
- required flag.

Tests cover pathway-completed `met`, pathway-in-progress `unmet`, trusted Evidence Passport support, stale evidence remaining `unknown`, and unpersonalized browsing refusing to silently consume private signals.

### AC3 — Editable preparation suggestions

The preparation endpoint creates editable checklist items for readiness gaps, unknown verification work and source-listed application steps. The workspace allows the student to edit task title, time, duration and inclusion before approval.

Tests cover gap/verification mapping and infeasible/zero-capacity scheduling.

### AC4 — Approved preparation enters Planner without duplicates

No preparation task is inserted before explicit confirmation. Approval rechecks source/deadline/version and conflicts, persists idempotent actions, and the frontend inserts newly approved actions using a batch Planner reducer.

Tests cover confirmation, conflicts, repeated approval/idempotency and deadline-change invalidation.

### AC5 — Application/follow-up/result status

Private tracking supports:

- Interested;
- Preparing;
- Applied;
- Follow-up;
- Result.

Current state and event history are persisted. Result requires an explicit value. There is no provider submission endpoint.

### AC6 — Expired/untrusted/reported sources stop active recommendations

The source-validation layer excludes stale, expired, untrusted, quarantined or unresolved-reported catalogue records. A student report records an immutable source-review event and quarantines the opportunity from active recommendation, preparation and deadline-alert flows for all students until a later governed source verification supersedes the report. The report history is retained.

Tests confirm that an expired source blocks a new Interested state while preserving the ability to record a Result for an already-applied historical application.

## Risk-oriented automated tests

Backend coverage includes:

- structured requirement parsing/versioning;
- original source-reference preservation;
- met/unmet/unknown rule evaluation;
- unknown handling for missing/weak evidence;
- DOC-F29 active pathway integration;
- Evidence Passport integration;
- privacy-minimal evaluation persistence;
- backward scheduling;
- zero-capacity and occupied-slot behavior;
- explicit preparation approval;
- Planner action idempotency;
- deadline/version invalidation;
- canonical opportunity deduplication;
- report quarantine, cross-student exclusion and governed revalidation;
- application lifecycle/history;
- expired-source behavior;
- HTTP browse → prepare → approve → track contract.

The Playwright opportunity journey covers the same primary frontend flow with mocked server contracts, including explicit second approval and Result tracking.

## UI/failure-state verification

The existing LumaPath style was preserved. DOC-F32 extends the same opportunity cards/detail panel rather than introducing another design system.

The page includes:

- loading state;
- empty/filter state;
- backend error state;
- requirement unknown state;
- source freshness/status display;
- preparation warnings;
- disabled approval until explicit confirmation;
- reported-source behavior;
- application tracking form validation;
- narrow-screen/keyboard E2E coverage.

No state fabricates data when the backend is unavailable.

## Privacy and security review

Verified design constraints:

- no automatic application submission;
- no guaranteed-eligibility language;
- no legal/visa-advice engine;
- no raw CV/document/mentor content copied into eligibility evaluations;
- private pathway/evidence not consumed during unpersonalized browsing;
- preparation requires human approval;
- source/deadline changes invalidate stale preparation;
- reports create auditable temporary catalogue-wide quarantine, and only a later governed revalidation can restore active recommendations;
- active alerts require a current trusted source;
- owner-scoped application/preparation/evaluation records.

The project-wide prototype authentication caveat remains: production should replace the development `X-Luma-Student-Id` identity boundary with verified authentication/session claims.


## Verified release-candidate checks

The cumulative DOC-F32 package was verified with:

- **335/335 FastAPI tests passing**;
- **978 local frontend imports resolved**;
- **1,843 i18n keys aligned across English, Sinhala and Tamil**;
- pseudo-localization passing for all 1,843 messages;
- DOC-F32 database schema executed successfully in a fresh SQLite database;
- all 13 changed Opportunity/API/E2E TypeScript/TSX files syntax-parsed with zero errors;
- the synthetic DOC-F32 demo seeder exercised seven active governed fixtures per demo student.

A full dependency-backed Next.js semantic typecheck/build/Playwright run is still gated by the cumulative baseline's missing committed `package-lock.json` and `node_modules`. Do not claim those commands passed until dependencies are installed and the release commands below complete successfully.

## Release commands

Backend regression:

```bash
pytest -q apps/api/tests
```

Frontend repository contracts that do not require dependency installation:

```bash
node scripts/check-local-imports.mjs
node scripts/check-i18n.mjs
node scripts/check-pseudo-localization.mjs
```

When npm dependencies are available, also run:

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The uploaded cumulative baseline still has no committed `package-lock.json`/`node_modules`; therefore dependency-backed Next.js/Playwright execution must not be claimed until those commands run successfully in a network-enabled environment.
