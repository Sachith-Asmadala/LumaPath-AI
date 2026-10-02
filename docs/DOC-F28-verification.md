# DOC-F28 Verification — Opportunity Recommendations

Backlog: `DOC-F28`  
Catalogue/ranking version: `2026-10-v1`  
Translation resource version: `2026-10-02.7`

## Acceptance criteria mapping

- **AC1 — Categories:** the active catalogue contract supports internships, hackathons, competitions, workshops, scholarships, certifications and university events.
- **AC2 — Explainable personalization:** recommendation scoring uses only a selected career goal, normalized skill evidence, readiness and explicit preferences. Each personalized item returns factor-by-factor points plus a concise `why_fit` explanation.
- **AC3 — Eligibility uncertainty:** requirements use `met`, `not_met` or `unknown`. Missing student attributes stay `unknown`; the UI never converts that state into an eligibility guarantee.
- **AC4 — Actions:** save/unsave, dismiss, report and preparation-to-Planner persist. Internship opportunities expose a factual DOC-F16 handoff with the deadline deliberately left unconfirmed.
- **AC5 — Active-source safety:** expired, stale, `untrusted` and `quarantined` entries are removed before ranking. Reported items disappear from the reporting student's active catalogue.
- **AC6 — Privacy-minimal browsing:** no profile is required. The same catalogue works unpersonalized, and personalized requests do not submit CV text, task descriptions, documents, mentor content or private notes.

## Backend automated coverage

`apps/api/tests/test_opportunities.py` contains **16 focused tests** covering:

1. all seven required categories;
2. expiry/trust/freshness gates;
3. transparent ranking factors and skill evidence;
4. unknown eligibility;
5. known eligibility gaps;
6. sponsored disclosure;
7. save persistence and positive feedback;
8. dismiss behavior;
9. report reason + owner-scoped removal;
10. Planner confirmation and overlap rejection;
11. idempotent Planner actions;
12. factual internship handoff and category restriction;
13. privacy-minimal recommendation snapshot storage;
14. category filtering without profile data;
15. HTTP identity + owner-scoped interactions;
16. interaction persistence across repository reopen.

## Cumulative regression

Final backend run:

```text
242 / 242 tests PASS
```

This includes all previous cumulative story suites plus DOC-F28.

## Static frontend / localization verification

```text
Python compilation                 PASS
Frontend local imports             886 / 886 PASS
i18n catalogs                    1,487 keys × 3 PASS
Pseudo-localization              1,487 / 1,487 PASS
TS/TSX syntax transpilation         346 / 346 PASS
```

The opportunity workspace also adds a Playwright contract at `tests/e2e/opportunities.spec.ts` and a Vitest domain contract at `src/features/opportunities/domain/opportunities.test.ts`.

## Real FastAPI smoke flow

Using an isolated temporary SQLite database:

```text
Personalized browse                HTTP 200
Active results                     7
Top internship fit                 90
Eligibility without optional data  unknown
Save interaction                   HTTP 200 / saved=true
Preparation action                 HTTP 201
Planner source                     Opportunity · Northstar Labs
Internship handoff                 HTTP 200
Handoff reference                  opportunity:devops-intern-2026
Other student saved state          false
```

## Privacy/storage check

`recommendation_snapshots.context_summary_json` stores only normalized fields used to interpret the ranking: target role, readiness score, skill IDs and explicit preference/eligibility field names. It does not store CV bodies, task text, mentor content or free-form private notes.

## Source and moderation boundary

The current package contains deterministic **curated competition/demo catalogue fixtures** to exercise the product contract. The UI and docs disclose that these fixtures must be replaced by a verified feed/editorial process before production use.

`OPPORTUNITY_SOURCE_FRESHNESS_DAYS` defaults to 30. A stale source is excluded before ranking.

A student report quarantines the item for that student's active experience and records a moderation interaction. A single report does not globally hide an item from all users; global `quarantined` state is an editorial trust decision.

## Frontend dependency limitation

A fresh `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted, but dependency resolution did not complete in the execution environment. It produced neither a usable `package-lock.json` nor `node_modules`.

Accordingly this verification **does not claim fresh passes** for:

```text
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Those commands should be run in normal network-enabled CI after generating and committing the lockfile. The separate import/i18n/pseudo/syntax checks above were executed successfully.
