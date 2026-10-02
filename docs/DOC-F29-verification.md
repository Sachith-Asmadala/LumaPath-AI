# DOC-F29 Verification

Backlog reference: **DOC-F29 — Career Pathway Engine**

Translation resource version: `2026-10-02.8`

## Acceptance criteria

### AC1 — Versioned role requirements

Implemented through `career_roles`, `skills`, `role_skills`, `skill_dependencies` and `/v1/careers/roles*`. The UI displays taxonomy version, required proficiency, prerequisites and evidence targets. Publication validation rejects cycles and unknown prerequisite edges.

### AC2 — Declared + evidenced assessment

`POST /v1/careers/assessments` combines low-confidence self-assessment with quiz input and owner-scoped Portfolio/repository/CV/prior-roadmap evidence. Certificate input remains self-reported until a certificate-verification story exists. Every retained evidence row stores source, verification state, confidence and timestamp. Conflicting evidence is surfaced rather than hidden.

### AC3 — Prerequisite-ordered skill gap

`gap_order` is computed from the validated DAG after applying required proficiency + confidence rules. Tests assert Linux -> Networking -> Docker -> Kubernetes -> Monitoring and Git -> CI/CD ordering for DevOps.

### AC4 — Resource classes/preferences

`POST /v1/careers/skills/{skill_id}/resources/rank` supports course/certificate/tutorial/project resources and returns source, quality, cost, language, format, fit factors and unknown metadata without guessing.

### AC5 — Capacity/target feasibility

DOC-F13 continues capacity-safe scheduling. DOC-F29 target-date feasibility adds warnings when estimated missing-skill effort exceeds declared available learning minutes; zero capacity is explicit and no overlapping commitments are created to force feasibility.

### AC6 — Explained versions + transferable progress

DOC-F13 versioning remains authoritative. Production roadmap generation consumes the latest F29 assessment. Server-side evidence changes append an explicit DOC-F29 recalculation reason even when local prototype state did not change. Role switching preserves completed transferable steps; the recalculated draft requires approval before activation.

## Automated coverage

`apps/api/tests/test_career_engine.py` covers:

- versioned roles and proficiency requirements
- graph cycle rejection
- self + quiz + certificate evidence
- evidence conflict handling
- out-of-taxonomy rejection
- prerequisite gap ordering
- all required resource types
- unknown-resource rejection
- server assessment overriding client-only claims
- zero/insufficient target-date feasibility
- transferable progress after role switch
- owner isolation
- HTTP role/assessment/resource contracts
- target-date warning in pathway response
- server assessment change reason
- career-pathway alias/current contract

DOC-F13's existing `test_pathways.py` remains a compatibility regression suite.

Frontend contracts:

- `src/features/career-engine/domain/career-engine.test.ts`
- `tests/e2e/career-engine.spec.ts`

The E2E contract covers versioned requirements, assessment creation, evidence confidence/source display, ranked learning resource display, keyboard reachability and a 360px horizontal-overflow check.

## Known release environment limitation

The cumulative source still does not contain a committed `package-lock.json`. The release process attempts dependency/lockfile resolution, but if network installation is unavailable, semantic `tsc`, Vitest, Next production build and Playwright are reported as **not freshly executed** rather than being inferred from syntax/static checks.

## Final release verification

The frozen cumulative release was re-verified after the DOC-F29 authority migration and recalculation hardening:

- DOC-F29 focused FastAPI tests: `17 / 17` passed.
- Complete cumulative FastAPI regression suite: `259 / 259` passed.
- Python compilation for API and worker code: passed.
- Frontend local-import graph: `898 / 898` resolved.
- Internationalisation contract: `1,530 keys × 3 locales` passed.
- Pseudo-localisation: `1,530 / 1,530` messages passed.
- TS/TSX syntax transpilation: `359 / 359` files passed.
- Real HTTP smoke covered catalogue -> assessment -> ranked resources -> pathway draft -> approval -> reassessment -> explained recalculation, plus owner isolation.

A clean npm lockfile/dependency resolution was attempted, but dependency resolution exceeded the execution environment's network window. No usable `package-lock.json` or `node_modules` was produced. Consequently `npm run lint`, semantic `npm run typecheck`, Vitest, the Next production build and Playwright are deliberately reported as **not freshly executed** in this environment rather than inferred from the static checks above.
