# DOC-F20 — Notification policy and inbox

## Purpose

DOC-F20 turns deadline/risk/planning/application signals into concise, owner-scoped alerts **without unlimited reminders or silent external contact**.

The implementation deliberately separates:

1. **candidate generation** — a source says something may deserve attention;
2. **policy evaluation** — preferences, urgency, quiet hours, caps, expiry and deduplication decide whether/when it may be delivered;
3. **message generation** — creates in-app vs privacy-safe external preview text;
4. **channel delivery** — an adapter performs one idempotent delivery attempt.

This prevents a source event from directly sending a notification.

## Supported trigger types

- `deadline`
- `risk`
- `top_priority`
- `missed_work`
- `study_session`
- `application_date`
- `roadmap_milestone`
- `calendar_event` (active for approved DOC-F23 calendar imports)

The current Task/Planner prototype is still client-owned, so it uses `buildNotificationCandidates()` to send only the minimum notification-safe fields. The bridge does **not** send task descriptions, life-load notes, CV content, assistant prompts or mentor content.

Internship reminders are server-owned after DOC-F16 and are ingested directly from the durable application/reminder tables.

## Policy precedence

For a current candidate, LumaPath applies:

1. resolved/expired checks;
2. category preference;
3. one-control non-critical mute;
4. quiet hours in the student's IANA timezone;
5. hourly/daily caps for non-critical items;
6. channel consent/availability;
7. idempotent delivery.

Critical alerts bypass the non-critical mute and frequency caps, but **do not bypass an explicitly disabled category or quiet hours**.

When a newer version of the same trigger/source arrives, its older current candidate is marked resolved. This prevents risk-score or reminder edits from producing multiple current alerts.

## Quiet hours and timezone

Preferences store an IANA zone (for example `Asia/Colombo` or `America/New_York`). Python `zoneinfo` is used when determining quiet-hour boundaries, including DST changes.

A candidate that falls inside quiet hours is not discarded. It is moved to the next local quiet-hour end and remains deduplicated.

## Frequency caps

Defaults:

- max 3 non-critical in-app alerts/hour;
- max 6 non-critical in-app alerts/day.

Critical alerts are excluded from these caps. Both limits are configurable within bounded server validation.

## In-app inbox

The in-app delivery contains:

- concise title;
- reason/trigger;
- safe source label;
- actionable internal deep-link;
- delivered/opened/dismissed/acted timestamps.

Resolved and expired candidates are not shown as current alerts. Dismissed items are hidden from the default inbox query but remain available to audit/history logic.

## External channels

Push/email are adapter contracts only in this prototype. They are disabled unless:

- a provider adapter is configured server-side; **and**
- the student has explicitly enabled/consented to that channel.

Every external adapter receives the durable `delivery_id` for provider idempotency.

The default external/lock-screen preview is always generic:

> **LumaPath reminder**  
> Open LumaPath to review the next action.

It never contains task titles, CV content, mentor content, company details or similar sensitive text.

## Retry semantics

`notification_deliveries` has one row per `(candidate, channel)`. A provider failure increments `attempt_count` on the same row. Retry therefore cannot create a second delivery record for the same candidate/channel.

`NOTIFICATION_DELIVERY_MAX_ATTEMPTS` defaults to `3`.

The worker entrypoint is:

```bash
python -m apps.worker.jobs.notifications.run
```

A production scheduler can call this every minute or move the same service call into Celery/RQ/SQS.

## DOC-F23 integration

DOC-F23 is present in this cumulative build. Approved, owner-scoped imported exams/lectures/workshops/events now feed the existing `calendar_event` policy path. Imported assignment deadlines continue through the Task deadline path so LumaPath does not send duplicate calendar + task deadline alerts. Revoking or deleting a calendar source resolves its current calendar alerts.

No real university/LMS provider is connected by DOC-F23; manual iCalendar/CSV import is the supported source until a later explicit authorization flow is implemented.

## Privacy and prohibited behavior

DOC-F20 does not:

- scrape email inboxes;
- send marketing;
- contact employers;
- expose lock-screen private content by default;
- infer health, motivation or ability;
- deliver unlimited reminders;
- silently enable push/email.

Ownership is checked on all delivery mutations.
