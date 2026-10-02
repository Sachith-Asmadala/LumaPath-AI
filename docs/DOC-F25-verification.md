# DOC-F25 verification — Institutional aggregate analytics

Backlog: **DOC-F25**  
Sprint: **S4 Intelligence & Release**  
Metric version: **2026-10-doc-f25-v1**

## Dependency check

- DOC-F18 Progress Analytics is present and remains private/student-scoped. DOC-F25 consumes only approved event fields during aggregate refresh and does not expose DOC-F18 source drill-down.
- DOC-F24 Mentor Portal is present. Only the existence/timestamp of explicit guidance requests contributes to mentoring demand; question/context text is never copied.

## Acceptance criteria traceability

| AC | Implementation | Automated evidence |
|---|---|---|
| AC1 | Approved aggregate skill gap, readiness, workload and engagement metrics with formulas/definitions | `test_ac1_documented_skill_readiness_workload_and_engagement_aggregates` |
| AC2 | Internship preparation, mentor guidance demand and explicit workshop-interest aggregates | `test_ac2_internship_preparation_and_support_demand_metrics_are_supported` |
| AC3 | Cohort-level and metric/slice-level minimum-contributor suppression | `test_ac3_small_cohort_and_small_skill_slice_are_suppressed` |
| AC4 | FastAPI administrator role + institution boundary enforcement | `test_ac4_cross_institution_and_role_boundaries_are_server_enforced`, `test_http_boundary_requires_admin_claims_and_blocks_cross_institution` |
| AC5 | Cohort definition, metric version, source freshness and refresh timestamp returned by API/UI | `test_ac5_freshness_cohort_definition_and_metric_version_are_visible` |
| AC6 | Aggregate-only CSV, export permission control and immutable audit event | `test_ac6_export_contains_only_aggregates_and_is_audited` |

## Additional privacy/governance tests

- `test_institutional_tables_do_not_persist_direct_student_identifiers`
- `test_unapproved_metric_is_not_materialised`
- Small skill slice suppression verifies a re-identification edge even when the parent cohort is eligible.
- `analytics_viewer` can read but cannot refresh/export.
- Cross-institution attempts are denied and audited.

## Frontend coverage

`tests/e2e/programme-analytics.spec.ts` covers the primary administrator flow with mocked aggregate APIs:

- authorised cohort visible
- aggregate readiness/internship/mentor/workshop metrics visible
- suppressed skill slice explanation visible
- metric-definition dialog exposes documented formula and approval state

## Verification executed in this delivery environment

- `python -m pytest apps/api/tests -q` → **304 passed**.
- `node scripts/check-local-imports.mjs` → **965 local imports resolved**.
- `npm run check:i18n` → **1812 keys × 3 locales passed**.
- `npm run check:pseudo` → **1812 messages passed**.

`npm run typecheck` could not produce a meaningful dependency-backed result because the uploaded archive has no installed frontend dependencies/`node_modules`; the global TypeScript compiler reports missing `next`, `react`, `@playwright/test`, `@types/node`, etc. This is an environment/dependency-resolution limitation rather than a claimed passing typecheck. Run the full frontend suite after restoring dependencies from a committed lockfile.

## Release/privacy notes

- No student-level admin drill-down exists.
- No private document, mentor question, CV text, task title or source ID is exposed through DOC-F25.
- Suppressed metrics blank both the value and sample size in API/export responses.
- Institutional analytics is explicitly prohibited from automated disciplinary/high-stakes use in API/UI/docs.
- Production authentication remains a prerequisite: replace trusted development admin headers with verified administrator session/JWT claims.
