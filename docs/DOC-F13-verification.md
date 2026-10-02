# DOC-F13 Verification

Backlog: **DOC-F13 — Career Learning Roadmap**

## Dependency review

- **SCRUM-22 Skill-Gap Analysis:** available in the prototype and passed to the roadmap as minimal owner-scoped skill/evidence context.
- **DOC-F29 Career Pathway Engine:** implemented as the server-owned role/skill/resource taxonomy and assessment layer. DOC-F13 production pathway generation consumes its validated definitions and latest student assessment while retaining the existing version/approval/Planner contracts.
- Existing **Capacity**, **Academic Tasks**, **Planner**, **Evidence**, **DOC-F22 i18n** and Task/Planner source-traceability contracts are reused.

## Acceptance criteria traceability

- **AC1 — prerequisite ordering:** pathway definitions are validated/topologically sorted. Cycles and unknown prerequisite IDs are rejected. Locked milestones unlock only after prerequisites are completed/credited.
- **AC2 — capacity:** weekly actions use declared weekly learning availability, the selected pace, current daily planning capacity and existing Planner blocks. Urgent academic due dates and the preceding day are protected. Unfit work remains unscheduled with a warning.
- **AC3 — milestones:** ordered milestones show state, prerequisite list, current proficiency/evidence refs and target evidence. The active roadmap allows explicit start/completion updates. Student-confirmed completion is not labelled verified evidence.
- **AC4 — explained recalculation:** goal/role/pace/capacity/evidence changes create a new draft version with trigger reasons plus added/removed/preserved/moved/resource-change summary. The active version remains untouched.
- **AC5 — transferable work:** verified/completed skill evidence and completed skills that exist in both old/new role pathways remain credited after a goal switch and are not rescheduled.
- **AC6 — approval gate:** initial/recalculated drafts must be explicitly approved or rejected. Weekly actions require a second explicit selection and a latest-state server validation before Planner apply-actions are returned.

## Resource decision verification

- source/cost/language/format facts are displayed from curated metadata;
- missing metadata/resource coverage is not guessed;
- accept/defer/replace decisions and reasons are stored;
- a deferred resource is strongly deprioritized during the next recalculation;
- accept/replace after a defer reactivates only still-uncommitted weekly actions;
- replacements must come from the visible ranked alternatives.

## Privacy/security checks

- cross-student roadmap access is denied;
- academic task descriptions/private notes are excluded from roadmap scheduling context;
- Planner writes are never automatic;
- current Planner overlap/capacity is revalidated immediately before approval;
- source linkage uses stable roadmap/pathway/step/plan-item IDs;
- career-learning progress is not framed as employment probability or guaranteed outcome.

## Automated coverage

`apps/api/tests/test_pathways.py` covers:

- topological ordering and cycle rejection;
- academic-date protection and pace/week capacity;
- zero-capacity state;
- milestone completion/unlock;
- resource metadata + accept/defer/replace;
- deferred-resource feedback influencing a later recalculation;
- reactivation of deferred weekly actions after replacement;
- missing-resource no-guess behavior;
- recalculation draft + change explanation;
- transferable goal-switch credit;
- approve/reject version behavior;
- latest Planner overlap/capacity validation;
- locked-step Planner rejection;
- owner isolation;
- real HTTP generate/current/approve ownership contract.

Frontend contracts:

- `src/features/pathways/domain/pathways.test.ts`
- `tests/e2e/roadmap.spec.ts`

The domain test verifies minimum-data context, recalculation reasons and idempotent source-traceable Planner application.

The E2E contract covers:

```text
open Roadmap
→ generate draft
→ verify weekly action cannot be selected yet
→ approve roadmap
→ select prerequisite-ready action
→ explicit add to Planner
→ verify Roadmap · v1 source badge in Planner
```

It also contains keyboard focus and 360px horizontal-overflow checks.

## Real FastAPI smoke

Using an isolated temporary SQLite database and the real roadmap endpoints:

```text
POST /v1/pathways/generate                       201 / draft
POST /v1/pathways/:id/decision                  200 / active
POST /v1/pathways/:id/weekly-actions/approve    200 / 1 action / Roadmap · v1
GET  /v1/pathways/current                       200 / active version returned
cross-owner GET /v1/pathways/:id                403
```

## Final release verification

Executed successfully in this cumulative build:

- cumulative FastAPI regression suite: **198 / 198 passed**
- DOC-F13 pathway tests: **15 / 15 passed**
- Python compileall: **passed**
- local frontend import audit: **813 / 813 resolved**
- i18n contract: **1,243 keys × 3 locales passed**
- pseudo-localization: **1,243 / 1,243 passed**
- TS/TSX syntax transpilation: **307 / 307 files passed**

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted because the cumulative source still has no committed `package-lock.json`. Dependency resolution did not complete within the execution window. The stalled process was terminated and partial `node_modules` / lockfile artifacts were removed.

Therefore this verification does **not** claim fresh passes for ESLint, semantic `tsc`, Vitest, Next production build or Playwright. DOC-F13's Vitest/Playwright contracts are included for normal local/CI execution once the dependency tree is available.
