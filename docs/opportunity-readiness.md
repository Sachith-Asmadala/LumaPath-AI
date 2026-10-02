# DOC-F32 — Eligibility-aware Opportunity Readiness

## Purpose

DOC-F32 extends the private DOC-F28 opportunity catalogue. It helps a student understand **what an opportunity currently asks for**, which requirements are supported by their current approved LumaPath signals, which gaps remain, and which requirements still need confirmation. It can propose preparation work before the listed deadline, but it never submits an application and never states guaranteed eligibility.

The implementation deliberately separates four concerns:

1. versioned source requirements;
2. append-only eligibility evaluations;
3. editable preparation proposals that require explicit approval;
4. application lifecycle tracking with source-validity awareness.

DOC-F29 Career Pathway and Evidence Passport data are used only when the student enables personalized opportunity context. Unpersonalized browsing does not silently read those private signals.

## Source and requirement contract

Each opportunity stores:

- original `source_url` and normalized `canonical_url`;
- source name, trust state, last validation time and freshness expiry;
- application deadline;
- application steps;
- `requirement_version`;
- structured requirements in `opportunity_requirements`.

Each requirement preserves:

- a stable requirement ID/key;
- kind (`skill` or `profile`);
- matching operator and expected structured value;
- provider/catalogue wording in `source_text`;
- the original source in `source_reference`;
- the parsed requirement version.

Canonical source URLs have a uniqueness guard so the catalogue cannot silently insert the same governed listing under multiple IDs.

## Source validation history

`source_validation_history` is append/history oriented. Catalogue validation records whether a source is:

- `trusted`;
- `untrusted`;
- `stale`;
- `expired`;
- `quarantined`.

A student's report creates an immutable student-scoped `reported` validation event and places the opportunity into a catalogue-wide review quarantine. While that report is newer than the last governed source verification, the item is excluded from active recommendations, preparation approval and deadline alerts for every student. A later governed revalidation with a newer verification timestamp restores active use without deleting the report audit trail.

Only trusted, current catalogue validation can generate active opportunity recommendations or new active deadline-tracking states. Existing historical applications may still record a final result after the source expires.

## Eligibility evaluation

Current engine version: `eligibility-2026-11-v1`.

Every listed requirement is classified independently as:

- `met` — approved evidence/pathway/context currently supports the requirement;
- `unmet` — current approved context provides a meaningful contradictory/gap signal;
- `unknown` — LumaPath does not have adequate evidence to decide.

`unknown` is intentional. Absence of evidence is not rewritten as failure, and weak/stale/self-declared evidence is not promoted into certainty.

### Skill evidence order

When personalized context is enabled, a skill may be supported by:

1. trusted Evidence Passport states such as `verified`, `observed` or `reviewed`;
2. a completed/credited step in the active DOC-F29 pathway;
3. the student's explicit opportunity-context skill record.

An active pathway step that is still `in_progress`, `available` or `locked` may expose a preparation gap. If no reliable signal exists, the requirement remains `unknown`.

### Profile requirements

Profile conditions are evaluated only from the limited eligibility fields the student chooses to provide. Missing fields remain `unknown`.

### Auditability and privacy

Each evaluation stores:

- student owner;
- opportunity ID;
- requirement version;
- eligibility engine version;
- source validation ID;
- active pathway ID/version when used;
- per-requirement result;
- structured evidence references;
- evaluation time.

The evaluation summary does not persist raw CV text, task notes, document text, mentor messages or evidence titles. Evidence references are deliberately narrow.

Eligibility output is an explanatory readiness aid, **not** legal/visa advice, application advice from the opportunity provider, a hiring probability, or a guarantee of eligibility.

## Preparation plan

Current proposal version: `preparation-2026-11-v1`.

A preparation proposal is generated only from the exact eligibility evaluation the student is viewing. The backend verifies that the evaluation still matches the current:

- requirement version;
- source-validation version;
- deadline/source state.

The proposal converts:

- `unmet` requirements → editable gap-strengthening tasks;
- `unknown` requirements → editable verification tasks;
- source-listed application steps → editable application-preparation tasks.

### Backward scheduling

The scheduler works backward from the source deadline and uses:

- the student's current daily planning capacity;
- timezone;
- current Planner blocks passed through the narrow planner bridge;
- per-item estimated effort.

It never invents capacity. If work does not fit safely before the deadline, the affected items remain unscheduled and a warning is returned. The UI must not turn an unscheduled suggestion into an automatic task.

The listed source may provide only a date and not an exact closing time, so the proposal is intentionally conservative and tells the student to verify the exact provider deadline.

## Human approval and Planner handoff

Preparation uses a two-step human-in-the-loop flow:

1. build an editable proposal;
2. review task names/times/durations and explicitly approve selected items.

The approval endpoint revalidates the source, requirement version, deadline and Planner overlaps before writing any approved action. If the source/deadline/requirement version changed after proposal generation, approval returns a conflict and the draft is invalidated.

Approved items create idempotent `opportunity_plan_actions`. Repeating the same approval returns the existing actions rather than duplicating them.

The current LumaPath Planner is still client-owned. FastAPI therefore returns a server-validated Planner action contract, and the frontend inserts all newly approved tasks in one reducer batch so multiple tasks cannot overwrite one another. This is an intentional compatibility boundary until Planner becomes server-owned.

## Application tracking

The private lifecycle is:

`Interested → Preparing → Applied → Follow-up → Result`

`application_tracking` stores the current state and `application_tracking_events` preserves transitions. A Result requires a student-entered result label. No transition sends data to an employer/provider.

Source state is returned alongside tracking. When a source is stale, expired, untrusted, quarantined or under an unresolved report quarantine, `active_deadline_alerts_allowed` is false.

## HTTP endpoints

All endpoints remain owner-scoped by the project's current authenticated principal boundary:

- `POST /v1/opportunities/browse`
- `POST /v1/opportunities/{id}/interactions`
- `POST /v1/opportunities/{id}/preparation-plans`
- `POST /v1/opportunities/{id}/preparation-plans/{plan_id}/approve`
- `GET /v1/opportunities/{id}/tracking`
- `PUT /v1/opportunities/{id}/tracking`
- `GET /v1/opportunities/{id}/internship-handoff`

The older DOC-F28 `POST /v1/opportunities/{id}/plan-action` endpoint remains for compatibility, but the DOC-F32 UI uses the safer proposal/approval flow.

## Failure behavior

- Missing personalization → unpersonalized browse; no private pathway/evidence access.
- Missing requirement evidence → `unknown`, not an invented result.
- Zero/infeasible capacity → unscheduled checklist items plus warning.
- Planner overlap → approval rejected; no partial writes.
- Changed deadline/source/requirements → stale proposal invalidated.
- Reported source → globally quarantined from active recommendations/deadline alerts until governed revalidation; the original report remains audited.
- Stale/expired/untrusted/quarantined source → no active recommendation/deadline alert.
- Backend unavailable → frontend shows an error; it does not fabricate eligibility, tasks or application state.

## Source governance and demonstration data

The cumulative competition package still uses the DOC-F28 deterministic demonstration catalogue to exercise the workflow. It must not be described as live independently verified listings. A production deployment must connect the catalogue to an approved source-ingestion/editorial process and respect publisher terms.

For a competition demo, use the clearly documented DOC-F32 demo seeder after API/database initialization. It refreshes **synthetic fixture validation only** and creates synthetic student pathway/evidence context; it does not scrape or claim current publisher facts.

```bash
python scripts/seed-data/seed-doc-f32-demo.py
```

## Current authentication boundary

The wider prototype currently resolves student identity through the existing `X-Luma-Student-Id` development boundary. DOC-F32 consistently scopes data by that principal, but production deployment still requires the project-wide verified session/JWT identity upgrade described elsewhere in the repository.
