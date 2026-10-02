# DOC-F25 — Institutional aggregate analytics

DOC-F25 adds a programme-administrator analytics surface without exposing DOC-F18 student-level analytics. The feature is purpose-limited to improving student-support programmes.

## Architecture

```text
Approved source domains
(DOC-F18 analytics, internship tracker, CV, interview practice, DOC-F24 mentor requests,
 explicit workshop-interest support signals)
        │
        │ refresh pipeline; direct identifiers exist only in source-domain memory
        ▼
HMAC cohort subject key match
        │
        ├── reject wrong institution
        ├── minimum cohort/contributor threshold
        ├── suppress small metric and skill slices
        └── approved metric + purpose check
        ▼
institutional_analytics_aggregates
(versioned, revisioned, no student identifiers/source IDs)
        │
        ├── GET dashboard
        ├── metric definition dialog
        └── CSV aggregate export
                 │
                 ▼
          audited administrator action
```

The dashboard endpoint reads **aggregate rows only**. It does not query student records or expose a student drill-down.

## Administrator boundary

DOC-F25 introduces the prototype administrator claims:

- `X-Luma-Admin-Id`
- `X-Luma-Admin-Role`
- `X-Luma-Institution-Id`

Supported roles:

- `programme_admin` — view, refresh and export authorised institutional aggregates.
- `institution_admin` — same analytics permissions plus audit-log viewing.
- `analytics_viewer` — read-only dashboard/definitions; no refresh/export.

Every cohort is checked against the principal institution inside FastAPI. A cohort from another institution returns `403` and the denied attempt is audited.

These are development headers, matching the existing prototype identity pattern. Production must replace them with verified administrator session/JWT claims. The Next.js proxy only provides demo defaults outside production.

## Privacy model

`ANALYTICS_MIN_COHORT_SIZE` is the privacy threshold (default `10`). Privacy is enforced twice:

1. A cohort smaller than the configured threshold receives only suppressed aggregate rows.
2. Even in an eligible cohort, each metric or skill slice is suppressed when fewer than the threshold number of distinct contributors supplied that signal.

Suppressed API/export rows contain:

- `value = null` / blank CSV value
- `sample_size = null` / blank CSV sample
- `suppressed = true`
- an explanatory reason

No endpoint exposes cohort subject keys, direct student IDs, source IDs, task titles, mentor content, CV content or document text.

Cohort membership stores an HMAC-derived `subject_key`. `INSTITUTIONAL_ANALYTICS_SUBJECT_KEY_SECRET` must be a long random server-only secret in production. Direct student identifiers are used only transiently to derive the key while provisioning/matching.

## Metric version

Current version: `2026-10-doc-f25-v1`.

Formula changes require a new metric version. Metric approvals are stored in `institutional_analytics_metric_approvals` and are checked both during refresh and dashboard reads. Removing approval prevents an older snapshot from being exposed.

### Average skill gap — `skill_gap_points`

For each contributor, take the latest recorded proficiency for each observed skill in the selected period, calculate:

```text
max(70 - proficiency, 0)
```

and average the contributor-level gaps. Skill-specific slices are independently thresholded.

This is a programme-planning benchmark, not an assessment of intelligence, potential or suitability.

### Average career readiness — `readiness_average`

Average each contributor's latest recorded DOC-F18 readiness score in the selected period.

It cannot be used for admissions, discipline, grading or employment screening.

### Average active workload — `workload_hours`

Use the latest recorded task state inside the selected period, exclude completed/missed tasks, total estimated active minutes per contributor and average as hours/student.

This is planned workload, not measured effort.

### Recorded engagement — `engagement_rate`

```text
distinct cohort members with >=1 approved DOC-F18 event in period
---------------------------------------------------------------- × 100
                    eligible cohort membership
```

No-event does not mean disengagement, low motivation, wellbeing risk or misconduct.

### Internship preparation activity — `internship_preparation_rate`

Distinct cohort members with an internship application, CV analysis or interview-practice activity created in the period, divided by eligible cohort membership.

This is activity only; it does not predict employability or application quality.

### Mentoring support demand — `mentoring_demand_rate`

Distinct cohort members who explicitly created a DOC-F24 mentor guidance request in the period, divided by eligible cohort membership.

Private request text is never copied into institutional analytics.

### Workshop interest — `workshop_interest_rate`

Distinct cohort members with an explicit `workshop_interest` support signal in the period, divided by eligible cohort membership.

LumaPath intentionally does **not** infer workshop demand from low skills/readiness, missed work or private messages.

## Cohort provisioning

Cohort provisioning is intentionally not exposed as a programme-admin dashboard action in this story. A trusted institutional integration should call `InstitutionalAnalyticsRepository.upsert_cohort(...)` using the institution's authoritative membership list. The repository immediately converts supplied student IDs to HMAC subject keys and stores no direct student IDs in DOC-F25 tables.

## API

```text
GET  /v1/institutional-analytics/cohorts
GET  /v1/institutional-analytics/definitions
GET  /v1/institutional-analytics/governance
POST /v1/institutional-analytics/cohorts/{cohort_id}/refresh?start=YYYY-MM-DD&end=YYYY-MM-DD&timezone=...
GET  /v1/institutional-analytics/dashboard?cohort_id=...&start=...&end=...&timezone=...
GET  /v1/institutional-analytics/export?cohort_id=...&start=...&end=...&timezone=...
GET  /v1/institutional-analytics/audit   # institution_admin only
```

Refreshes are revisioned. Dashboard/export selects only the latest revision for the exact cohort, period, timezone and metric version.

## Governance and operations

- Purpose: `INSTITUTIONAL_ANALYTICS_PURPOSE=student_support_programme_improvement`
- Aggregate retention: `INSTITUTIONAL_ANALYTICS_RETENTION_DAYS` (default `365`)
- Freshness warning: `INSTITUTIONAL_ANALYTICS_FRESHNESS_HOURS` (default `24`)
- Privacy threshold: `ANALYTICS_MIN_COHORT_SIZE` (default `10`)
- Subject-key secret: `INSTITUTIONAL_ANALYTICS_SUBJECT_KEY_SECRET`

Every catalogue access, definition/governance access, dashboard view, refresh, cross-institution denial and CSV export is audited with administrator, institution, purpose, cohort/period metadata and metric version. Student identifiers are not written to the audit.

The repository exposes `purge_expired_aggregates(...)` as the retention hook; refresh calls it after writing a new snapshot.

## Frontend

Route: `/programme-analytics`

The page reuses the existing LumaPath workspace design system and includes:

- authorised cohort selector
- start/end date filters
- refresh/freshness state
- privacy threshold status
- aggregate metric cards
- weekly aggregate trend views
- thresholded skill slices
- metric formula/definition dialog
- CSV aggregate export controls
- purpose/high-stakes-use notice
- loading, no-cohort, no-snapshot, error and suppression states

## Release verification

```bash
python -m pytest apps/api/tests -q
python -m compileall -q apps/api/app apps/api/tests
node scripts/check-local-imports.mjs
npm run check:i18n
npm run check:pseudo
npm run typecheck
npm test
npm run build
npm run test:e2e -- programme-analytics.spec.ts
```

The dependency-backed frontend commands require the repository's npm dependencies to be installed from a reproducible lockfile.

### Local competition/demo fixture

To explicitly seed a 12-student **synthetic** cohort (never run automatically):

```bash
python scripts/seed-data/seed-doc-f25-demo.py
```

The script writes only `doc-f25-demo-*` source identities, provisions an HMAC cohort, creates privacy-safe aggregate snapshots for the current 30-day period, and prints the period to select in `/programme-analytics`.

For re-identification resistance, API periods must span at least **7 calendar days**. Arbitrary student-level or custom-dimension filters are not supported; only authorised cohort + period filters are exposed.
