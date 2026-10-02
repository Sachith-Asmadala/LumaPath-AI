# DOC-F19 — Focus sessions

DOC-F19 turns the prototype focus timer into an owner-scoped, timestamp-backed focus workflow without changing the established LumaPath visual system.

## User flow

```text
Next Best Action or Task
        │
        ▼
Choose task + objective + work/break duration
        │
        ▼
POST /v1/focus-sessions
        │
        ▼
Running ⇄ Paused
   │        │
   └─ heartbeat lease protects against sleep/offline gaps
        │
        ▼
Review result + progress + notes + estimate feedback
        │
        ▼
POST /v1/focus-sessions/{id}/finish
        │
        ├─ completed → measured productive minutes + task progress + estimate suggestion
        └─ interrupted/abandoned → history only, zero completed productive minutes
```

The focus view never blocks navigation. Browser notifications are optional and requested only after the student explicitly enables them. Audio cues are not enabled by default.

## Timer correctness

The client does not decrement a fragile in-memory counter. The durable record stores:

- `started_at`
- `active_segment_started_at`
- `last_heartbeat_at`
- `paused_at`
- `ended_at`
- `accumulated_active_seconds`

The UI derives remaining time from those timestamps. Refresh therefore reconstructs the same timer state.

### Sleep and offline gaps

While a session is running the browser sends a lightweight heartbeat every 15 seconds. The server allows a 30-second grace window. If the next heartbeat arrives after a gap longer than 45 seconds, the session is automatically paused at the last safe heartbeat plus the grace window. This prevents laptop sleep, a suspended tab, or a long offline period from being counted as focused work.

The browser also keeps an owner-specific local cache of the last server session. If FastAPI is unavailable after reload, the UI can show the timestamp-backed state but disables pause/resume/completion. It never fabricates a successful completion or adds productive time while disconnected.

## API

All routes require the existing prototype owner header `X-Luma-Student-Id`. Production authentication must replace this development trust boundary with a verified session/JWT principal.

### `POST /v1/focus-sessions`

Creates one active session for the current student. A student cannot start a second active session until the first is closed.

Required data includes task id/title, explicit objective, work/break duration, current task estimate and progress.

### `GET /v1/focus-sessions/active`

Returns the current running/paused session, if any. Used for reload recovery.

### `GET /v1/focus-sessions/{id}`

Returns an owner-scoped session. Cross-student access is rejected.

### `POST /v1/focus-sessions/{id}/heartbeat`

Refreshes the running lease. A stale gap safely auto-pauses instead of counting the gap as productive time.

### `POST /v1/focus-sessions/{id}/pause`

Freezes active elapsed time.

### `POST /v1/focus-sessions/{id}/resume`

Starts a new active timing segment.

### `POST /v1/focus-sessions/{id}/finish`

Requires a result of `completed`, `interrupted`, or `abandoned`, plus post-session task progress and optional notes/next step. Completed sessions also require perceived estimate feedback.

Only `completed` sessions produce `productive_minutes`. Interrupted and abandoned sessions deliberately return `0`.

## Estimate feedback

For a completed session LumaPath records both measured active minutes and the student's perceived estimate accuracy.

When progress increased, the backend computes an observation:

```text
observed total duration = measured focus minutes × 100 / progress gained
```

A single session does not overwrite the task estimate. The suggestion blends 35% of the observed total with 65% of the existing estimate. `about_right` feedback dampens the adjustment further. The response returns the full explanation shown to the student.

If the student supplies a manual future estimate, that explicit correction wins. Interrupted/abandoned sessions never change the estimate.

The current Task Manager is still prototype-owned React state, so after a server-approved completed session the frontend applies the returned progress, note and suggested estimate to the local task. When SCRUM-14 becomes server-owned, the same focus service should call the authoritative Task service transactionally instead of using this narrow bridge.

## Accessibility

- Native buttons, inputs, selects and textareas remain keyboard reachable.
- Visible labels are associated with form controls.
- The changing second-by-second clock is `aria-hidden`; a quieter textual status is exposed instead so screen readers are not spammed every second.
- Pause, resume, end and exit remain available without website/device blocking.
- Reduced-motion preferences continue to use the existing LumaPath motion system.

## Privacy and safety

- Sessions and history are owner-scoped in every repository/API lookup.
- Notes are optional and stored only with that student's session.
- No website blocking, device monitoring, webcam/microphone use, keystroke capture, punitive streaks or attention scoring exists.
- Focus interruption is recorded as a neutral state, not a failure or motivation judgment.
- Browser notifications are opt-in and respect permission denial.

## Persistence

The competition prototype uses the existing durable SQLite file configured by `LUMAPATH_DATABASE_PATH`. Runtime schema creation is handled by `FocusSessionRepository`; the reference schema is in `database/schemas/focus_sessions.sql`.
