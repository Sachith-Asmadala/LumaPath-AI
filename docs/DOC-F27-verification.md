# DOC-F27 Verification — Achievements & Non-Punitive Consistency

Backlog: `DOC-F27`  
Catalogue version: `2026-10-v1`

## Acceptance-criteria mapping

- **AC1** — versioned definitions plus a `(student, definition, version)` uniqueness constraint make evaluation idempotent and award each configured milestone once.
- **AC2** — the catalogue includes planning/task completion, on-time deadline handling, Focus consistency, Portfolio/CV reviews, Internship `Applied`, and Roadmap milestone evidence.
- **AC3** — Focus-only consistency uses one-day grace between qualifying days, no loss framing, and no award revocation merely because time passes.
- **AC4** — every award stores source type/id/time/href, rule version and current evidence status.
- **AC5** — celebrations are opt-in; users can hide the streak or the entire achievement workspace without changing underlying evidence.
- **AC6** — APIs are owner-scoped and no comparison/leaderboard endpoint or cross-user query exists.

## Safety/privacy checks

- AI/assistant prose is not read by the evaluator.
- CV/document contents are not copied into achievement records.
- Evidence labels are generic and link back to owner-authorised workspaces.
- Deleted/corrected sources mark awards `withdrawn` instead of silently keeping unsupported evidence active.
- Hiding/muting achievements never changes Tasks, Planner, Focus, Portfolio, CV, Internship or Roadmap records.

## Automated focused tests

`apps/api/tests/test_achievements.py` covers:

- one-time/idempotent awards;
- distinct plan-event counting;
- completed-plan milestone;
- due-date evidence and correction withdrawal;
- one-day grace consistency;
- non-revocation after a normal rest period;
- deletion withdrawal while preserving history;
- server-owned Portfolio/CV/Application milestones;
- exclusion of unverified AI claims;
- default opt-in celebration policy and hide controls;
- cross-user isolation;
- HTTP identity and preference contract.

Frontend contracts are in `src/features/achievements/domain/achievements.test.ts` and `tests/e2e/achievements.spec.ts`.

## Final executable verification

- DOC-F27 backend tests: **14 / 14 passed**.
- Complete cumulative FastAPI regression suite: **226 / 226 passed**.
- Python module compilation: **passed**.
- Frontend local-import graph: **864 / 864 resolved**.
- Translation catalogs: **1,407 keys × 3 locales passed**.
- Pseudo-localization: **1,407 / 1,407 passed**.
- TS/TSX syntax transpilation: **336 / 336 files passed**.
- API smoke: first qualifying event awarded once; repeat evaluation returned zero new awards; preference update returned 200; another owner saw no foreign awards; missing student identity returned 401.

A fresh npm lockfile/dependency resolution was attempted with `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`, but package resolution did not complete within the execution environment. Therefore semantic `tsc`, Vitest, Next production build and Playwright are **not claimed as freshly executed** in this release. Their DOC-F27 contracts are included for normal local/CI execution once dependencies are available.
