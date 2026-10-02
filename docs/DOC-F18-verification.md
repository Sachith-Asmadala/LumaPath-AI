# DOC-F18 verification — Progress Analytics

Backlog: **DOC-F18**  
Sprint: **S1 Learning Foundations**  
Metric version: **2026-10-v1**

## Acceptance criteria traceability

| AC | Implementation | Automated evidence |
|---|---|---|
| AC1 | Selected-period headline metrics for completed tasks, explicit misses, completion rate and productive hours | `test_ac1_headline_metrics_for_selected_period` |
| AC2 | Workload hours and difficulty grouped by module with source IDs and metric drill-down | `test_ac2_module_workload_and_difficulty_are_traceable` |
| AC3 | Readiness snapshots and skill proficiency history | `test_ac3_readiness_and_skill_history_show_changes` |
| AC4 | Versioned definitions for plan acceptance and adjustment; partial coverage is labelled | `test_ac4_plan_acceptance_and_adjustment_use_documented_definitions` |
| AC5 | Honest empty/partial states plus latest-event/aggregate freshness | `test_ac5_empty_period_is_honest_and_has_freshness` |
| AC6 | Owner-filtered service and HTTP identity boundary | `test_ac6_student_cannot_access_another_students_analytics`, `test_http_identity_boundary_blocks_cross_user_dashboard` |

## Additional risk tests

- IANA timezone/local-day boundary: `test_timezone_boundaries_use_student_local_day`
- Late-event backfill creates a new aggregate revision: `test_late_event_backfill_creates_new_aggregate_revision`
- Repeated state sync is idempotent: `test_repeated_sync_is_idempotent`
- Deleted source tombstones do not break current metrics: `test_deleted_source_is_hidden_from_current_module_workload_but_history_remains_safe`
- Estimate accuracy is explicitly estimated/partial: `test_estimate_accuracy_is_explicitly_estimated_not_measured`
- Raw task titles/descriptions/document content are not stored by the analytics adapter: `test_analytics_never_store_task_titles_or_document_content`
- Fixed timetable blocks are excluded from plan acceptance: `test_fixed_timetable_blocks_do_not_inflate_plan_acceptance`
- Daily and weekly aggregate rows are versioned: `test_daily_and_weekly_jobs_store_versioned_aggregate_rows`
- Future scheduled blocks record acceptance at observation time, not at the future start time: `test_plan_acceptance_is_recorded_when_observed_not_on_future_scheduled_start`
- Productive time uses a period delta when a prior cumulative baseline exists: `test_productive_hours_use_period_delta_when_prior_cumulative_observation_exists`
- Latest planner block version is used for estimate accuracy: `test_estimate_accuracy_uses_latest_planner_block_version_after_adjustment`

## Frontend coverage added

- `src/features/analytics/domain/analytics.test.ts` verifies the metric-safe normalization bridge excludes task title/description content and preserves planner/readiness signals.
- `tests/e2e/analytics.spec.ts` covers the primary dashboard journey and key trend sections when the full web/API stack is available.

## Privacy/security review

- Analytics data is owner-scoped.
- No public leaderboard, ranking or student comparison exists.
- No health, ability or motivation inference exists.
- Raw DOC-F09 document text and DOC-F08 prompts are not copied into analytics events.
- Source drill-down exposes IDs/structured metric fields only and routes the owner back to the source workspace for correction.
- Student-level DOC-F18 remains private. DOC-F25 now provides a separate institutional aggregate pipeline that enforces `ANALYTICS_MIN_COHORT_SIZE`, suppresses small metric/slice contributors, and never exposes this student drill-down to administrators.
- Production authentication remains a declared dependency: replace the prototype `X-Luma-Student-Id` trust boundary with the real verified principal.

## Verification commands

```bash
python -m pytest apps/api/tests -q
python -m compileall -q apps/api/app apps/api/tests
node scripts/check-local-imports.mjs
npm run typecheck
npm test
npm run build
npm run test:e2e -- analytics.spec.ts
```

The release report must distinguish checks actually executed in the delivery environment from commands included for local/CI execution.


## Delivery verification executed here

The DOC-F18 delivery environment successfully executed:

- `python -m pytest apps/api/tests -q` → **54 passed** across DOC-F08, DOC-F09 and DOC-F18.
- `python -m compileall -q apps/api/app apps/api/tests` → passed.
- `node scripts/check-local-imports.mjs` → **587 local imports resolved**.
- TypeScript compiler `transpileModule` syntax pass over `src/` + `tests/` → **191/191 TS/TSX files passed**.
- FastAPI smoke flow → analytics sync `200`, dashboard `200`, metric drill-down `200`.

A clean `npm ci` was attempted so the complete dependency-backed `npm run typecheck`, Vitest, Next production build and Playwright suite could be executed. Package installation did not complete inside this delivery environment, leaving an unusable partial `node_modules`; that partial directory is excluded from the release archive. Therefore those dependency-backed commands are **included for local/CI execution but are not claimed as freshly passing here**.
