# DOC-F23 — Calendar Integration

## Purpose

DOC-F23 lets a student bring academic calendar dates into LumaPath without silently trusting or importing an external source. The production rule is:

> **source → normalize → preview → resolve → approve → apply**

Manual iCalendar and UTF-8 CSV work without any external account. A provider-neutral connector contract exists for a future explicitly-authorized university/LMS integration, but this story does not create a real provider connection.

## Supported manual formats

### iCalendar (`.ics`)

The parser supports:

- `VEVENT`
- `UID`
- `SUMMARY`
- `DESCRIPTION`
- `DTSTART` / `DTEND`
- IANA `TZID`
- UTC `Z` timestamps
- date-only events
- common `DURATION` values (`PT#H#M`)
- `RRULE` recurrence, bounded to 500 occurrences / 366 days
- `EXDATE`
- `RECURRENCE-ID`
- `LAST-MODIFIED` / `DTSTAMP`
- optional `X-LUMAPATH-TYPE` for explicit item classification

### CSV

CSV must be UTF-8 and include:

- `title`, `summary`, or `name`
- `start`, `start_at`, `date`, `deadline`, or `due_at`

Optional columns include `end`, `end_at`, `timezone`, `type`, `kind`, `external_id`, `uid`, `id`, `description`, `last_modified`, and `updated_at`.

## Normalized kinds

Every source item becomes one of:

- `lecture`
- `exam`
- `deadline`
- `event`
- `workshop`

An explicit source type receives high confidence. Keyword classification is lower-confidence and remains visible in the preview. Unknown items become `event`; LumaPath does not invent an academic category. Classification confidence describes how confidently LumaPath recognized the event type; it does **not** certify that a user-uploaded file was officially issued. The UI asks the student to confirm that the source came from their university/LMS before relying on its dates.

## Timezones

The source timezone is an IANA timezone such as `Asia/Colombo` or `America/New_York`. Source-local dates are normalized to UTC for storage/comparison while retaining the source timezone for traceability and presentation.

Python `zoneinfo` handles DST transitions. The test suite includes a New York DST boundary fixture.

## Safe preview contract

Uploading a source does **not** modify a task or Planner block. The server returns a preview with one change state per source item:

- `new`
- `unchanged`
- `changed`
- `duplicate`
- `conflict`
- `deleted`

Duplicate detection compares title + source time against the minimal current Task/Planner snapshot supplied by the browser. Planner overlap conflicts are surfaced separately.

Only identity/timing fields are sent for comparison. Task descriptions, CV content, personal notes, capacity notes, and other unrelated private content are not sent to the calendar service.

## Explicit commit decisions

Per preview item, the student can choose:

- `import`
- `update`
- `link_existing`
- `skip`
- `keep_personal`
- `remove_internal`

A commit is idempotent by `idempotency_key`.

A skipped changed item retains its existing source mapping and old source snapshot. The same unapproved source change therefore appears again on the next sync rather than being silently accepted or detached.

## Internal mapping

Approved items map as follows:

- assignment/submission `deadline` → Academic Task with `dueAt`
- lecture / exam / workshop / general event → fixed Academic Planner block

Mapped records keep:

- stable external calendar item ID
- `Calendar · <source name>` badge
- source sync timestamp in the server record

The prototype Task Manager is still browser-owned, so FastAPI returns typed `CalendarApplyAction` records that the existing `DemoProvider` applies only after server commit. When SCRUM-14 becomes fully server-owned, the same actions should become transactional Task/Planner service calls.

## User overrides

For an already mapped record, the next preview compares current LumaPath title/time/due date with the last imported snapshot. Changed personal fields are recorded as overrides:

- `title`
- `start_at`
- `end_at`
- `due_at`

An approved source update preserves those fields while updating non-overridden source fields.

Editing an imported fixed Planner event edits the fixed block itself; it does not create a new task. The next sync therefore recognizes the personal edit as an override.

## Source deletions

If an external item disappears, no personal record is automatically deleted. The preview offers:

- **Keep personal record** → detach source metadata and keep the Task/Planner record
- **Remove imported record** → return a delete action for the mapped record and mark source item deleted
- **Skip** → leave everything unchanged so the deletion can be reviewed again later

## Revocation and cleanup

Revocation:

- stops future sync;
- clears provider credential ciphertext when applicable;
- keeps existing mapped records;
- causes current DOC-F20 calendar alerts to resolve.

Cleanup can either:

- delete source/import metadata and **detach** personal records, or
- delete source/import metadata and return explicit delete actions for mapped records.

## Provider-neutral future connector

`CalendarConnector` declares:

- connector key
- minimum scopes
- incremental fetch
- revoke capability

A real provider connection is not publicly exposed in DOC-F23. Internal registration requires:

1. an explicit authorization flag;
2. `calendar.read` at minimum;
3. `CALENDAR_CREDENTIAL_KEY` configured server-side;
4. plaintext provider secret passed only to the service, where it is immediately Fernet-encrypted before persistence.

Provider sync verifies the connector's required scopes before fetching. Incremental provider cursors are staged on the sync run and are promoted to the connection only after the student commits that preview; preview failure, provider failure, or an uncommitted preview cannot advance the cursor and skip unseen changes. Expired authorization revokes the connection and clears ciphertext. Provider/partial failures create no new plan mutations and preserve existing imported records.

## Untrusted external content

Calendar descriptions are data, never instructions. They are not executed, followed, or injected into system instructions. Instruction-like descriptions display a warning in preview.

Deep links embedded in a description are not executed by the import pipeline.

## DOC-F20 notification integration

Approved imported calendar items feed the server-owned Notification Policy:

- exams and non-deadline calendar events can emit `calendar_event` candidates subject to preference, timezone, quiet hours, caps and deduplication;
- imported assignment deadlines rely on the existing Task deadline notification path to avoid duplicate alerts;
- revoked/deleted calendar sources resolve their current calendar alerts.

## Configuration

```env
CALENDAR_MAX_UPLOAD_BYTES=2097152
CALENDAR_CREDENTIAL_KEY=
```

Manual import does not require `CALENDAR_CREDENTIAL_KEY`. A future provider connection fails closed until it is configured.

## Current provider boundary

There is deliberately no "Connect university" or "Connect LMS" API/UI in DOC-F23. Manual import remains the supported path until a future story supplies a real provider, authorization flow, consent UX and provider-specific security review.
