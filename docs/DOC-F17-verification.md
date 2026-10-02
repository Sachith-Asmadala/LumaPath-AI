# DOC-F17 Verification

Backlog: **DOC-F17 — Role-specific Interview Practice**

## Acceptance-criteria mapping

- **AC1:** role + level + technical/behavioural/project templates are server-versioned and tied to the approved skill taxonomy. Owner-scoped CV evidence gaps can prioritise technical questions.
- **AC2:** persisted timed state machine supports explicit start, pause, resume, heartbeat recovery, over-time answer capture, bounded follow-ups and explicit completion.
- **AC3:** feedback exposes relevance, structure, content/technical detail and communication as separate rubric criteria.
- **AC4:** strengths, improvements and study topics include response/rubric refs; selected improvement/study-topic refs can be converted into existing `career-learning` roadmap tasks.
- **AC5:** text-only works end-to-end; recording storage is a separate explicit consent preference; session deletion cascade-deletes responses, rubric rows and feedback.
- **AC6:** feedback-provider failure sets a safe retry state while completed answers remain persisted and unchanged.

## Safety/privacy checks

- no hiring-decision endpoint
- no public leaderboard/comparison
- no biometric/emotion analysis
- no protected-characteristic inference/scoring
- no deceptive interviewer impersonation
- no guaranteed interview-outcome wording
- no automatic roadmap insertion
- no recording bytes stored in DOC-F17
- retention enforced on direct owner access as well as list/create flows
- cross-student session access returns 403

## Automated coverage

`apps/api/tests/test_interviews.py` covers:

- technical / behavioural / project modes
- intern / junior / mid template differences
- consent gate
- text-only mode
- recording-storage preference
- pause/resume and repository reopen recovery
- heartbeat sleep-gap auto-pause
- bounded follow-ups
- timed-out answer preservation
- criterion separation and traceability
- protected-characteristic scoring boundary
- provider failure + retry
- evidence-linked roadmap topics
- cross-owner denial
- session deletion
- retention purge and direct-expiry denial
- pause limit
- HTTP contract
- DOC-F15 CV gap targeting/evidence references

Frontend contracts:

- `src/features/interviews/domain/interviews.test.ts`
- `tests/e2e/interviews.spec.ts`

The E2E contract covers keyboard start, timed answer submission, explicit completion, feedback display and 360px overflow.

## Final verification in this build

Executed successfully:

- FastAPI cumulative regression suite: **145 / 145 passed**
- DOC-F17 interview tests: **18 / 18 passed**
- Python compileall: **passed**
- Local frontend import audit: **732 / 732 resolved**
- i18n contract: **1,024 keys × 3 locales passed**
- pseudo-localization: **1,024 / 1,024 passed**
- TS/TSX syntax transpilation: **268 / 268 files passed**

Real FastAPI smoke using a temporary SQLite database:

- session create: **201**
- session start: **200**
- four answer submissions: **200** each
- explicit completion: **200 / feedback_ready**
- cross-owner read: **403**
- owner deletion: **200**

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted because the cumulative source archive still has no committed `package-lock.json`. Dependency resolution did not complete within the environment transport window. Therefore this verification does **not** claim fresh passes for ESLint, semantic `tsc`, Vitest, Next production build or Playwright. The DOC-F17 unit/E2E contracts are included for normal local/CI execution once the dependency tree is available.
