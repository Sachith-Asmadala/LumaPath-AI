# Calendar sync worker boundary (DOC-F23)

Manual `.ics` / UTF-8 `.csv` import is request/preview/commit driven and does not need a background worker.

Future university/LMS providers should reuse `CalendarConnector` and `CalendarService.preview_provider_sync()` from `apps/api/app/modules/calendar/` inside a scheduler/worker. A provider worker must:

1. run only for an `active` owner-authorized connection;
2. use the minimum read-only scopes declared by the connector;
3. decrypt credentials only in the worker/service process using `CALENDAR_CREDENTIAL_KEY`;
4. fetch incremental source changes into a **preview**, never directly mutate Tasks/Planner;
5. preserve the existing mapped records until the student explicitly approves source changes/deletions;
6. mark expired credentials revoked and clear stored ciphertext;
7. make retries idempotent using stable source IDs/recurrence IDs and sync-run state;
8. never execute URLs/instructions from source descriptions.

DOC-F23 intentionally ships no real provider adapter or scheduled provider sync because provider authorization is out of scope for this story.
