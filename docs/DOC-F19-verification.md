# DOC-F19 verification — Focus Sessions

Backlog: **DOC-F19**  
Sprint: **S1 Learning Foundations**

## Acceptance criteria traceability

| AC | Implementation | Automated evidence |
|---|---|---|
| AC1 | Session stores owner-scoped task id/title plus explicit visible objective | `test_ac1_session_links_task_and_visible_objective` |
| AC2 | Timestamp/heartbeat timer with pause/resume, reload recovery and break-due state | `test_ac2_pause_resume_and_reload_recovery_use_timestamps`, `test_ac2_break_due_survives_refresh`, `test_running_session_auto_pauses_after_sleep_gap_without_counting_the_gap` |
| AC3 | Native keyboard controls, associated labels, non-spamming screen-reader timer text and unrestricted exit | `tests/e2e/focus.spec.ts` + accessibility implementation review |
| AC4 | Completion stores post-session progress, notes and next step; frontend applies approved completed result to the task | `test_ac4_completed_session_keeps_progress_notes_and_next_step`, `tests/e2e/focus.spec.ts` |
| AC5 | Measured time + progress produce an explained smoothed estimate; manual correction wins | `test_ac5_estimate_feedback_is_transparent_and_manual_correction_wins` |
| AC6 | Interrupted/abandoned sessions persist but produce zero completed productive minutes | `test_ac6_interrupted_and_abandoned_sessions_do_not_count_productive_time` |

## Additional risk tests

- Cross-student read/mutation rejection: `test_student_cannot_access_or_mutate_another_students_session`
- One active session per student: `test_only_one_active_session_per_student`
- Task progress cannot move backwards: `test_progress_cannot_move_backwards`
- Paused state does not accumulate an offline/sleep gap: `test_paused_session_does_not_accumulate_sleep_or_offline_gap`
- Running session sleep gap auto-pauses at the last safe heartbeat: `test_running_session_auto_pauses_after_sleep_gap_without_counting_the_gap`
- Owner-scoped history: `test_recent_history_is_owner_scoped`
- HTTP contract and owner boundary: `test_http_focus_contract_and_ownership`
- Pure frontend timer recovery projection: `src/features/focus/domain/focus.test.ts`
- Primary task → focus → review → save journey: `tests/e2e/focus.spec.ts`

## Failure/privacy review

- API timeout/offline state never marks a session complete.
- A cached session may be displayed while offline, but mutating controls remain disabled until reconnection.
- Long inactive heartbeat gaps are auto-paused so sleep/offline time is not inflated.
- Browser notification permission is requested only by an explicit student action. Permission denial does not block focus.
- No audio, device surveillance, website blocking, punitive streak logic or attention/health inference was introduced.
- The existing prototype `X-Luma-Student-Id` remains a development identity boundary and must be replaced by verified production auth.

## Verification commands

```bash
python -m pytest apps/api/tests -q
python -m compileall -q apps/api/app apps/api/tests
node scripts/check-local-imports.mjs
npm run typecheck
npm test
npm run build
npm run test:e2e -- focus.spec.ts
```

The delivery report distinguishes commands executed here from dependency-backed web commands included for local/CI execution.

## Delivery verification executed here

The DOC-F19 delivery environment successfully executed:

- `python -m pytest apps/api/tests -q` → **67 passed** across DOC-F08, DOC-F09, DOC-F18 and DOC-F19.
- `python -m compileall -q apps/api/app apps/api/tests` → passed.
- `node scripts/check-local-imports.mjs` → **602 local imports resolved**.
- TypeScript compiler `transpileModule` syntax pass over `src/` + `tests/` → **203/203 TS/TSX files passed**.
- FastAPI smoke flow → start `201`, active recovery `200`, pause `200`, resume `200`, cross-owner read `403`, interrupted finish `200` with `productive_minutes=0`.

A clean `npm ci --ignore-scripts --no-audit --no-fund` was attempted for dependency-backed `npm run typecheck`, Vitest, Next production build and Playwright execution, but the package installation hit the delivery environment transport timeout before completion. The partial `node_modules` directory was deleted. Therefore those commands are included for local/CI execution and are **not** claimed as freshly passing here.
