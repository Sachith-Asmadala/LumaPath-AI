# DOC-F16 Verification

Backlog: **DOC-F16 — Internship Application Management**

## Acceptance-criteria mapping

- **AC1:** manual/recommended application create and edit include company, role, confirmed/unconfirmed dates, contacts, requirements, notes and next action.
- **AC2:** explicit transition graph plus append-only `application_events`; invalid transitions return HTTP 409.
- **AC3:** reminder create/edit/disable endpoints persist timezone, quiet hours and notification preference.
- **AC4:** required skills are reconciled against owner-scoped Portfolio evidence and returned as small evidence-linked preparation actions.
- **AC5:** deadline state is `missing`, `unconfirmed`, `past_due`, `today` or `upcoming`; missing/past dates do not block manual tracking.
- **AC6:** every read/write checks owner identity; cross-student access returns HTTP 403.

## Safety boundaries verified

- no employer-contact endpoint
- no application-submission endpoint
- no inbox scraping
- no public outcome sharing
- no skill/ability inference from application count or commit/activity volume
- planner actions require explicit confirmation
- reminders tied to deadline/interview/follow-up require confirmed source dates

## Automated coverage

`apps/api/tests/test_internships.py` covers:

- create/edit
- missing-date state
- valid and invalid status transitions/history
- idempotent saves
- duplicate recommendation import
- quiet-hour scheduling
- notifications disabled
- planner confirmation/date gates
- Portfolio evidence mapping
- closed archive/outcome notes
- open archive rejection
- ownership denial
- cascade deletion
- real FastAPI HTTP contract

Frontend contracts:

- `src/features/internships/domain/internships.test.ts`
- `tests/e2e/internships.spec.ts`

The E2E flow covers manual creation, status movement, reminder creation, Planner approval, keyboard reachability and 360px overflow.

## Final verification in this build

Executed successfully:

- FastAPI cumulative regression suite: **127 / 127 passed**
- Python compileall: **passed**
- Local frontend import audit: **706 / 706 resolved**
- i18n contract: **932 keys × 3 locales passed**
- pseudo-localization: **932 / 932 passed**
- TS/TSX syntax transpilation: **252 / 252 files passed**

HTTP smoke using a temporary SQLite database:

- application create: **201**
- Interested → Preparing transition: **200**
- interview reminder create: **201**
- quiet-hours adjustment: requested 23:30 Asia/Colombo → effective 07:00 next day
- confirmed Planner action: **201**
- cross-owner application read: **403**

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted because the cumulative source archive still has no committed `package-lock.json`. The environment transport timed out before dependency resolution completed. Therefore this verification does **not** claim fresh passes for ESLint, semantic `tsc`, Vitest, Next production build or Playwright. Their DOC-F16 tests/configuration are included for normal local/CI execution once dependencies are available.
