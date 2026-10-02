# DOC-F18 — Private student analytics

DOC-F18 replaces the prototype-only `/analytics` calculations with a private, source-traceable analytics service. The UI keeps the existing LumaPath visual system while the metrics move behind FastAPI.

## Architecture

```text
Task / Planner / Readiness / Skill state
            │
            │ metric-safe normalization bridge (prototype only)
            ▼
POST /v1/analytics/sync
            │
            ▼
append-only analytics_activity_events
            │
     ┌──────┴─────────┐
     │                │
     ▼                ▼
daily aggregate   weekly aggregate
(revisioned)      (revisioned)
     │                │
     └──────┬─────────┘
            ▼
GET /v1/analytics/dashboard
GET /v1/analytics/metrics/{metric}
            │
            ▼
Analytics UI + source drill-down
```

The current frontend still owns Task/Planner/Readiness demo state, so `buildAnalyticsSyncPayload()` is intentionally a narrow adapter. It sends IDs, statuses, dates, minutes, module label, difficulty and score values only. It does **not** send task descriptions, document content, assistant prompts, evidence bodies or other raw institutional content. When those dependent domains become server-owned, they should publish the same activity events directly and the bridge can be removed without changing the dashboard API.

## Event model

`analytics_activity_events` is append-only and owner-scoped. Important event types are:

- `task_observed`
- `task_completed`
- `task_missed`
- `productive_minutes_observed`
- `plan_block_reviewed`
- `plan_block_accepted`
- `plan_block_adjusted`
- `readiness_observed`
- `skill_observed`
- `source_deleted`

Every event has a per-student idempotency key, occurrence time, original student timezone, source type/id, measurement kind (`measured`, `estimated`, or `mixed`) and a deliberately small JSON payload.

## Metric version

Current metric version: `2026-10-v1`.

Changing a formula requires a new metric version. Existing aggregate rows are retained so historical calculations remain auditable.

### Completed tasks

Distinct tasks with a recorded completion timestamp inside the selected local-date range. Progress percentages never imply completion.

### Missed deadlines

Distinct tasks explicitly marked `missed`. LumaPath does not infer that an unfinished task is missed just because a due date has passed.

### Completion rate

```text
completed terminal outcomes / (completed + explicitly missed terminal outcomes)
```

Upcoming and in-progress work is excluded from the denominator.

### Productive hours

The selected-period delta between the latest cumulative productive-minute observation in the range and the latest observation before the range. If no earlier baseline exists, LumaPath shows the available total but marks it **Partial**. The current prototype's `productiveMinutes` combines focus-session minutes with estimated remaining minutes when a task is manually completed, so the UI labels this signal **Mixed** rather than pretending it is purely measured.

### Module workload

Estimated active task minutes grouped by module from the latest task observations available at the period end, plus per-day workload/difficulty history across the selected period when observations exist.

### Difficulty trend

Average task difficulty value by module. This is a planning value only; it is never interpreted as health, intelligence, motivation, ability or course quality.

### Estimate accuracy

For completed tasks with planner blocks, using the **latest accepted version of each planner block** so rescheduled blocks are not double-counted:

```text
100 - |scheduled minutes - estimated minutes| / estimated minutes * 100
```

Because per-task actual tracked time is not complete in the prototype, the UI labels this metric **Estimated / Partial**.

### Career readiness

Versioned snapshots from the Career Readiness domain. The analytics service records movement; it does not independently invent readiness scores or make employability judgments.

### Skill progress

Current proficiency snapshots plus historical assessment observations when they exist.

### Plan acceptance

```text
accepted plan proposals / reviewed plan proposals
```

The current prototype bridge only sees retained non-fixed planner blocks, so fixed timetable items (for example lectures) are excluded and rejection instrumentation is incomplete. Review/acceptance/adjustment events are timestamped when the current planner state is observed, while the scheduled block start remains source data. The metric is intentionally marked **Partial** until a server-owned planner can emit the true reviewed/accepted/rejected timestamps directly.

### Plan adjustment

```text
accepted blocks with previousStartAt != startAt / accepted blocks
```

No reason, motivation or wellbeing conclusion is inferred from an adjustment.

## Timezone boundaries

All API ranges are local calendar dates plus an explicit IANA timezone (default `Asia/Colombo`). The service converts the range to UTC for storage/querying. Tests cover a completion just after local midnight so it cannot leak into the prior UTC/local day.

## Backfill safety

`AggregateJob` rebuilds the affected local day and its Monday–Sunday week. Aggregate rows are append-only revisions:

```text
(student, grain, period_start, timezone, metric_version, revision)
```

A late event therefore creates a new revision instead of mutating historical output silently. The API runtime uses a small thread pool; production can replace `AnalyticsAggregationDispatcher` with Celery, RQ or SQS without changing the event schema.

## API

### `POST /v1/analytics/sync`

Prototype normalization endpoint. Requires `X-Luma-Student-Id`. Duplicate events are ignored by per-student idempotency keys.

### `GET /v1/analytics/dashboard`

Query parameters:

- `start=YYYY-MM-DD`
- `end=YYYY-MM-DD`
- `timezone=Asia/Colombo`

Returns headline metrics, daily outcome trend, module workload/difficulty, estimate accuracy, readiness movement, skill history, plan patterns and freshness/partial-data metadata.

### `GET /v1/analytics/metrics/{metric}`

Returns the metric definition, explanation and private source references behind the number. Raw content is not returned.

The Next.js browser app calls same-origin `/api/analytics/*` routes; those proxy to FastAPI and forward only the owner identity boundary.

## Privacy and ownership

- Every event and query is scoped by student identity server-side.
- There is no endpoint for public rankings or student-vs-student comparison.
- Raw document text, assistant prompts and task descriptions are excluded from analytics storage.
- A `source_deleted` tombstone hides the original source from current workload/drill-down while historical aggregate behavior remains stable.
- The prototype auth boundary is the existing development `X-Luma-Student-Id` header. Production auth must replace it with a verified session/JWT principal.
- `ANALYTICS_MIN_COHORT_SIZE` defaults to `10`. DOC-F18 exposes no cohort reuse endpoint; any future cohort feature must enforce this threshold before returning an aggregate.

## Empty, partial and failure states

The API returns explicit `empty`, `data_status`, `measurement_kind` and `freshness` metadata. The frontend never falls back to locally fabricated totals if the analytics API fails.

## Operational configuration

```env
ANALYTICS_WORKER_THREADS=1
ANALYTICS_MIN_COHORT_SIZE=10
```

Analytics uses the same durable SQLite file configured by `LUMAPATH_DATABASE_PATH` in this competition prototype.

## DOC-F25 institutional reuse

DOC-F18 remains a private student analytics service. Programme administrators do **not** receive this dashboard or its source drill-down. DOC-F25 consumes only approved event fields during an aggregation refresh, matches members through HMAC subject keys, applies cohort/contributor suppression, and writes a separate `institutional_analytics_aggregates` store. See `docs/institutional-analytics.md`.
