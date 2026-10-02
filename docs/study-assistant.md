# DOC-F08 — Context-Aware Study Assistant

## Purpose

The Study Assistant turns authorised student context into a structured next step. It is intentionally not a free-form chatbot: a student must select a module, active task, or learning objective before requesting help.

Supported modes:

- `concept_explanation`
- `revision_plan`
- `quiz`
- `assignment_breakdown`
- `todays_study_suggestion`

The web UI lives at `/study-assistant`. Tasks deep-link into assignment breakdown or today's suggestion, and Learning deep-links into a revision plan for the selected learning objective.

## Architecture

```text
Study Assistant page
  -> typed client service
  -> same-origin Next.js proxy (/api/study-assistant/*)
  -> FastAPI /v1/study-assistant/*
  -> StudyAssistantService
     -> ownership-checked context boundary
     -> context assembler / injection filtering
     -> structured provider
     -> Pydantic output validation
     -> approval validator
```

The competition provider is deterministic and structured so the feature works without an external AI key. The provider interface can later be replaced by an LLM implementation without changing the public response contract.

## API contracts

### `PUT /v1/study-assistant/context`

Synchronises the current student's assistant-safe context snapshot. Every module, task, learning objective, plan block and saved material reference must have the same owner as `X-Luma-Student-Id`.

The snapshot contains only fields required for this feature:

- module names
- active/plannable task metadata
- deadline/risk/progress fields
- current capacity
- planner blocks
- learning objectives and goal
- saved learning-material metadata/excerpts

### `POST /v1/study-assistant/respond`

Requires:

- explicit response mode
- one authorised context reference
- a question for concept explanation

Returns only a structured schema:

- title and summary
- typed response blocks
- context references used
- saved-material citations
- `why_this`
- editable proposed actions
- warnings / uncertainty labels

Malformed provider output is validated with Pydantic, retried once as a repair attempt, then rejected with `502` if it is still invalid. Invalid output is not stored or offered for saving.

### `POST /v1/study-assistant/actions/approve`

Saving is a separate command. The server verifies:

- the response belongs to the current student/session
- the action ID was actually proposed by that response
- protected source-context fields were not changed
- the context is still owned by the student
- duration fits current planning capacity
- start time is not after the deadline
- the proposed slot does not overlap any existing planner block
- quiz structure is valid

Only after this validation does the frontend add a plannable action to the existing prototype planner.

### `POST /v1/study-assistant/sessions/{session_id}/feedback`

Stores optional helpful/not-helpful feedback. Raw user prompts are not stored; durable sessions keep only a SHA-256 prompt digest, response type, selected context references, structured responses, saved actions, and feedback.

## Durable data contract

DOC-F08 uses `database/schemas/study_assistant.sql` and the SQLite repository implementation in `apps/api/app/modules/ai/study_assistant/repository.py`. Persisted assistant data includes:

- session owner, timestamps, selected context references and response modes
- prompt digests (not raw prompts)
- validated structured responses
- approved actions and optional feedback
- safe audit metadata

Expired sessions are purged according to `ASSISTANT_SESSION_RETENTION_HOURS` when session data is accessed. The current context snapshot itself is not persisted in this assistant store.

## Privacy and security

- Raw prompts: retention is effectively `0` because no raw prompt field exists in the durable schema; only a SHA-256 digest is stored.
- Uploaded/saved text is treated as untrusted data. Instruction-like lines are stripped before provider context assembly.
- Course facts, deadlines and assessment requirements are never invented. Missing authoritative material produces a warning/general-guidance state.
- Cross-student references fail closed.
- Requests are rate-limited per student identity.
- Response/action endpoints use `Cache-Control: no-store` through the Next.js proxy.
- Context is reduced before it reaches the assistant provider. The current assistant-safe snapshot is process-local and re-synced before each request instead of being duplicated into the assistant database.
- Structured sessions, approvals, feedback, and audit metadata are persisted in SQLite at `LUMAPATH_DATABASE_PATH`; Docker uses a named volume.
- Audit events intentionally contain identifiers/status metadata only, never the raw question.

### Authentication boundary

The current prototype has no production authentication story. FastAPI therefore uses `X-Luma-Student-Id` as a **development identity boundary** and performs ownership checks against it. This prevents accidental/cross-reference access inside the prototype but is not a substitute for cryptographically verified authentication. Replace `current_principal()` with the production JWT/session dependency when that story is delivered.

## Running locally

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
python -m pip install -e "./apps/api[test]"
npm run dev:api
```

Or run both services with Docker:

```bash
docker compose up --build
```

The Next.js application proxies browser requests to `LUMAPATH_API_URL` (default `http://127.0.0.1:8000`). This keeps the browser same-origin and keeps the backend URL server-side.

## Tests

Backend:

```bash
npm run test:api
```

Coverage includes:

- authorised concept explanation
- revision plan and quiz structured output
- review-before-save assignment breakdown
- deadline/capacity/goal-aware today's suggestion
- invalid provider output rejection
- cross-user context rejection
- prompt-injection text handling
- provider timeout
- raw-prompt non-retention

Frontend unit tests validate context minimisation and response-schema checks. Playwright covers task deep-link -> structured response -> approval -> task visible in the existing workspace.

## Failure states

- missing context -> clear empty state/manual path
- wrong context owner -> 403/denial
- missing synced context -> 404/no fabricated answer
- rate limit -> 429
- provider timeout/unavailable -> 503; nothing saved
- malformed provider output -> 502; nothing saved
- invalid edited action -> 422; nothing saved

## Current non-production limitations

Assistant session data is durable in SQLite for this prototype, while authoritative student/profile/task data still comes from the existing frontend prototype and is re-synced as a minimal process-local snapshot before each request. A future shared application database can replace that sync boundary without changing the Study Assistant API contract.

The remaining major non-production boundary is authentication: `X-Luma-Student-Id` is deliberately limited to development and must be replaced by verified session/JWT identity when the authentication story is integrated.
