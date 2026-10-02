# DOC-F23 Verification

Backlog: **DOC-F23 — Calendar Integration**

## Dependency review

- **SCRUM-13 Student Profile:** current cumulative build provides student ownership identity and locale/profile preferences. Calendar source timezone remains explicit per connection/import.
- **SCRUM-14 Academic Task Manager:** Tasks/Planner are available in the prototype but remain browser-owned. DOC-F23 therefore uses a narrow existing-record comparison input and typed post-approval apply actions. No external source directly mutates client state.
- **DOC-F20 Notification Policy:** present and now activated for approved non-deadline calendar events.

## Acceptance criteria traceability

- **AC1:** iCalendar and UTF-8 CSV preview lectures, exams, deadlines, workshops/events with source timezone, UTC normalization, confidence and source metadata. Recurrence and DST are covered by deterministic fixtures.
- **AC2:** exact duplicates and overlapping Planner conflicts are returned in preview before commit. Nothing is imported during preview.
- **AC3:** approved deadlines map to Academic Tasks; lectures/exams/workshops/events map to fixed Planner blocks. Every mapping keeps an external item ID and visible `Calendar · source` traceability badge.
- **AC4:** external ID + recurrence identity gives idempotent incremental sync. Commit has an idempotency key. Personal title/time/due-date edits are detected and protected on update. Skipping a source change preserves the existing mapping and causes the unapproved change to remain visible on future sync.
- **AC5:** revoke stops sync and clears future-provider ciphertext. Cleanup offers controlled detach/keep or removal of mapped records.
- **AC6:** invalid iCalendar/CSV and provider failures leave existing plan/imported records unchanged. Provider partial failures never return apply actions.

## Security/privacy checks

- manual import requires no provider account or credential;
- there is no public provider-connect endpoint;
- future provider registration requires explicit authorization;
- server-side Fernet encryption is required before provider credentials are persisted;
- minimum read scope is enforced;
- expired authorization clears ciphertext and revokes connection;
- cross-student source/item/sync access is denied;
- external descriptions are treated only as untrusted text;
- instruction-like text gets a visible warning and is never executed;
- comparison input excludes task descriptions, private notes, CV data and unrelated personal content;
- source deletion never silently deletes a personal record;
- unsafe provider/source failures do not fabricate dates or plan changes.

## Backend automated coverage

`apps/api/tests/test_calendar.py` covers:

- iCalendar type classification + timezone normalization
- CSV explicit types + UTF-8 parsing
- recurrence + `EXDATE`
- America/New_York DST boundary
- duplicate detection
- Planner overlap conflicts
- deadline → Task mapping
- exam/event → fixed Planner mapping
- repeated source sync idempotency
- personal override detection/preservation
- source-deletion review
- revoke + cleanup
- corrupt/invalid source safety
- instruction-like external descriptions
- owner isolation
- explicit override endpoint
- server-side credential encryption contract
- missing credential-encryption-key fail-closed behavior
- provider minimum-scope/authorization boundary
- incremental provider cursor staged until explicit preview commit
- partial provider failure preserving existing imported snapshot
- expired provider authorization revocation
- DOC-F20 calendar notification integration
- HTTP preview/commit/list/ownership contract
- repeated commit idempotency
- skipped changed-item mapping preservation

## Frontend contracts

- `src/features/calendar/domain/calendar.test.ts`
- `tests/e2e/calendar-sync.spec.ts`

The domain contract verifies minimum-data comparison, review-safe defaults, Task/Planner mapping, user-override preservation and detach/delete behavior.

The E2E contract covers:

```text
upload iCalendar
→ preview
→ inspect source item/change state
→ explicit decision
→ apply
→ source badge
→ Planner record
```

It also includes keyboard focus and 360px horizontal-overflow checks.

## Provider-neutral worker boundary

`apps/worker/jobs/calendar_sync/README.md` documents how a future explicitly-authorized LMS/university adapter should use the same preview/approval contract. No real provider adapter is shipped by DOC-F23.

## Real FastAPI smoke

Using an isolated temporary SQLite database and the real multipart endpoints:

```text
POST /v1/calendar/imports/preview             201 / 2 items
POST /v1/calendar/sync-runs/:id/commit        200 / exam→planner_event, deadline→task
GET  /v1/calendar/items                       200 / Calendar · academic.ics source badges
GET  /v1/notifications/inbox                  200 / calendar_event current
cross-owner connection item listing           403
POST /v1/calendar/connections/:id/revoke       200 / revoked
```

The notification smoke uses a fixed clock so the approved exam is inside DOC-F20's delivery window.

## Final release verification

Executed successfully in this cumulative build:

- cumulative FastAPI regression suite: **183 / 183 passed**
- DOC-F23 calendar tests: **22 / 22 passed**
- Python compileall: **passed**
- local frontend import audit: **787 / 787 resolved**
- i18n contract: **1,161 keys × 3 locales passed**
- pseudo-localization: **1,161 / 1,161 passed**
- TS/TSX syntax transpilation: **294 / 294 files passed**

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted because the cumulative source archive still has no committed `package-lock.json`. Dependency resolution timed out before completion and left neither a lockfile nor `node_modules`.

Therefore this verification does **not** claim fresh passes for ESLint, semantic `tsc`, Vitest, Next production build, or Playwright. The DOC-F23 unit/E2E contracts are included for normal local/CI execution once the dependency tree is available.
