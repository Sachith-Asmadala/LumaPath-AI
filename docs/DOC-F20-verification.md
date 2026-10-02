# DOC-F20 Verification

Backlog: **DOC-F20 — Notification Policy & Inbox**

## Dependency review

- **SCRUM-14 Task Manager:** available in the cumulative prototype. Task/Planner state is still browser-owned, so DOC-F20 uses a narrow notification-candidate normalization bridge that sends only trigger-safe fields.
- **DOC-F16 Internship Tracker:** available and integrated server-to-server through confirmed application reminders.
- **DOC-F23 Calendar Integration:** implemented in this cumulative build after DOC-F20. Approved owner-scoped calendar imports now feed the previously reserved `calendar_event` policy path; assignment deadlines remain on the Task deadline path to prevent duplicate alerts.

## Acceptance criteria

- **AC1:** supported triggers create owner-scoped candidates with idempotency keys, reason/trigger, internal deep-link and one current version per trigger/source. Repeated source events deduplicate.
- **AC2:** IANA timezone, DST-aware quiet hours, per-hour/per-day non-critical caps and critical-alert precedence are implemented in the server policy engine.
- **AC3:** category and channel preferences are persisted. In-app is available now; push/email adapters require both provider availability and explicit permission/consent. A single control mutes non-critical categories without disabling critical alerts.
- **AC4:** expired/resolved candidates are removed from the current inbox. Disabling/closing an internship reminder resolves its current alert.
- **AC5:** one durable delivery row exists per candidate/channel. Failed provider attempts increment the same delivery row and retry with the same `delivery_id` idempotency identifier.
- **AC6:** all records are owner-scoped. External/lock-screen content is always a generic preview and never includes task, CV, mentor or application details.

## Policy and privacy checks

- no marketing event type
- no employer contact/application submission
- no email inbox scraping
- no silent push/email opt-in
- direct API enabling of push without permission is rejected
- direct API enabling of email without consent is rejected
- external action URLs are rejected; deep-links must be internal LumaPath paths
- quiet-hours start/end cannot silently form an accidental all-day window
- critical alerts bypass non-critical mute/caps but still respect explicit category disable and quiet hours
- resolved/expired alerts are not shown as current
- source updates supersede the older current alert rather than stacking duplicates
- provider retries use the same durable delivery ID
- notification analytics do not infer health, motivation, ability or employability

## Automated coverage

`apps/api/tests/test_notifications.py` covers:

- supported trigger delivery + deduplication
- quiet-hour deferral
- hourly/daily caps
- critical-alert cap precedence
- category preferences
- single non-critical mute
- expiry and resolved-source behavior
- external-provider retry idempotency
- privacy-safe external previews
- delivered/opened/dismissed/acted states
- owner isolation
- America/New_York DST quiet-hour boundary
- DOC-F16 reminder ingestion
- unsafe external action-link rejection
- preference persistence across repository reopen
- disabled internship-reminder resolution
- newer source-version superseding older current alert
- explicit external-channel consent/permission validation
- HTTP contract

Frontend contracts:

- `src/features/notifications/domain/notifications.test.ts`
- `tests/e2e/notifications.spec.ts`

The E2E contract covers the inbox, keyboard navigation to preferences and 360px overflow behavior.

## Worker contract

`apps/worker/jobs/notifications/run.py` runs one idempotent iteration. `loop.py` provides a container worker loop (60 seconds by default, 15-second minimum). `docker-compose.yml` shares the API data volume with this worker.

A worker smoke with a confirmed DOC-F16 reminder produced:

```text
students=1
in-app delivered=1
status=delivered
attempt_count=1
```

## Real FastAPI smoke

Using an isolated temporary SQLite database:

```text
PUT  /v1/notifications/preferences             200
POST /v1/notifications/candidates/sync         200 / delivered=1
GET  /v1/notifications/inbox                   200 / unread=1
POST /v1/notifications/deliveries/:id/acted    200
cross-owner delivery mutation                  403
```

## Final verification in this build

Executed successfully:

- cumulative FastAPI regression suite: **161 / 161 passed**
- DOC-F20 notification tests: **16 / 16 passed**
- Python compileall: **passed**
- local frontend import audit: **764 / 764 resolved**
- i18n contract: **1,079 keys × 3 locales passed**
- pseudo-localization: **1,079 / 1,079 passed**
- TS/TSX syntax transpilation: **281 / 281 files passed**

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted because the cumulative source archive still has no committed `package-lock.json`. Dependency resolution timed out in the environment before completion and did not leave a partial lockfile or `node_modules` tree.

Therefore this verification does **not** claim fresh passes for ESLint, semantic `tsc`, Vitest, Next production build or Playwright. The DOC-F20 frontend unit/E2E contracts are included for normal local/CI execution once the dependency tree is available.
