# DOC-F17 Interview Practice

## Purpose

Interview Practice provides private, role-specific preparation for technical, behavioural and project interview rounds. It is a learning tool only. Its scores are **practice rubric indicators**, not hiring predictions, employment decisions, candidate rankings or verified factual judgments.

## Dependencies used

DOC-F17 reuses existing LumaPath contracts instead of duplicating them:

- the approved role/skill taxonomy from Portfolio/Career;
- latest owner-scoped DOC-F15 CV analysis, when available, to prioritise skill gaps for technical questions;
- recorded Portfolio project titles as optional project-round context;
- DOC-F22 locale/navigation/accessibility infrastructure;
- the persisted timestamp + heartbeat recovery pattern proven by DOC-F19 Focus;
- the existing `career-learning` Planner task path for student-approved follow-up study topics.

CV/Portfolio context is represented by evidence references such as `cv_analysis:<id>:skill:<skill>:<status>`. A question may be targeted by a current evidence gap, but LumaPath never states that the student lacks that skill.

## Template and rubric versioning

Current versions:

- template: `2026-10-v1`
- rubric: `2026-10-v1`

Templates vary by:

- target role;
- level (`intern`, `junior`, `mid`);
- round (`technical`, `behavioral`, `project`).

Technical questions use the role taxonomy and preferentially surface owner-scoped CV evidence gaps when available. Level changes the expected scope: fundamentals for intern practice, implementation/failure trade-offs for junior practice, and architecture/operational risk for mid-level practice.

## Session state machine

The server owns the authoritative state:

`ready → running ↔ paused → completed → feedback_ready | feedback_failed`

Rules:

- maximum 3 explicit pauses per practice session;
- each main question can create at most the configured 0–2 follow-ups;
- follow-ups are only generated when the answer is short or lacks concrete decision/evidence structure;
- session completion is explicit and only allowed after all current questions are answered;
- an over-time answer is preserved and marked `timed_out`; it is not discarded;
- a 15-second frontend heartbeat supports recovery;
- a running session with a heartbeat gap greater than 75 seconds is automatically paused at the last safe heartbeat so laptop sleep/offline time is not falsely counted as answer time.

## Evaluation model

The current release uses `DeterministicInterviewEvaluator`, which implements the same provider boundary that a future external evaluation provider can use.

Each answer receives four separately visible criteria:

- relevance;
- structure;
- content / technical detail;
- communication.

Every criterion stores:

- score 0–5;
- rationale;
- response id;
- a short response excerpt;
- rubric version.

The evaluator does **not** independently verify factual correctness. Technical/content feedback checks whether the answer states observable reasoning, trade-offs and verification—not whether an employment claim is true.

Feedback items are `strength`, `improvement` or `study_topic`, and every item contains references such as `response:<id>` and `rubric:<criterion>:<response-id>`.

## Protected-characteristic boundary

Protected-characteristic words are excluded from automated scoring signals. LumaPath does not infer or score:

- age;
- gender;
- race/ethnicity;
- religion;
- disability;
- marital/pregnancy status;
- nationality;
- sexual orientation;
- emotion/personality;
- motivation;
- employability.

There is no public ranking or student-to-student comparison endpoint.

## Provider/evaluator failure

Completed answers are persisted before feedback generation. If the evaluator/provider fails:

- session status becomes `feedback_failed`;
- every completed response remains unchanged;
- the UI shows a safe retry state;
- `POST /feedback/retry` evaluates the persisted responses without repeating the interview.

## Media/recording consent

Text-only is the default and fully supported.

The session stores a separate recording preference:

- `text`: no recording is applicable;
- `audio` / `video` + storage off: recording storage is not consented;
- `audio` / `video` + storage on: storage consent is recorded.

DOC-F17 intentionally exposes **no audio/video upload endpoint**, so this release stores no recording bytes. The recording-preference table is separate so a future media-capture implementation cannot silently inherit permission from interview answers.

## Retention and deletion

Retention is explicitly selected as 7, 30 or 90 days. Expired sessions are cascade-deleted with questions, responses, rubric rows, feedback and recording preferences. Expiry is checked at owner access time, so a bookmarked direct URL cannot bypass retention.

The owner can delete a session at any time.

## Study topics

Only improvement/study-topic feedback references from the current session can be converted into roadmap items. The server validates those refs, then the frontend adds the approved topic to the existing `career-learning` Planner path. Nothing is added automatically.

## API

- `POST /v1/interviews/sessions`
- `GET /v1/interviews/sessions`
- `GET /v1/interviews/sessions/{id}`
- `DELETE /v1/interviews/sessions/{id}`
- `POST /v1/interviews/sessions/{id}/start`
- `POST /v1/interviews/sessions/{id}/heartbeat`
- `POST /v1/interviews/sessions/{id}/pause`
- `POST /v1/interviews/sessions/{id}/resume`
- `POST /v1/interviews/sessions/{id}/answers`
- `POST /v1/interviews/sessions/{id}/complete`
- `POST /v1/interviews/sessions/{id}/feedback/retry`
- `POST /v1/interviews/sessions/{id}/roadmap-topics`

All endpoints use the same owner-scoped prototype principal boundary as earlier stories. Production authentication should replace `X-Luma-Student-Id` without changing ownership checks.
