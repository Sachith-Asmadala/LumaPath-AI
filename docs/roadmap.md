# Career Learning Roadmap · DOC-F13

DOC-F13 turns the existing prerequisite-aware Career Path and Skill Gap prototype into an owner-scoped, versioned learning roadmap that can propose realistic weekly commitments without automatically changing Planner.

## Product contract

The student flow is:

```text
choose role + goal + pace
→ generate a draft roadmap
→ inspect prerequisite order, evidence targets and resource facts
→ approve or reject the draft
→ update milestones / resource preferences on the active roadmap
→ select prerequisite-ready weekly actions
→ server revalidates current Planner capacity
→ explicitly add approved actions to Planner
```

Recalculation follows a separate review path:

```text
active roadmap
→ goal / evidence / capacity / pace changes
→ draft recalculation + change summary
→ active roadmap remains unchanged
→ approve OR reject
→ only an approved draft becomes active
```

## Dependency boundary

DOC-F29 Career Pathway Engine is now the server-owned taxonomy/assessment/resource layer. DOC-F13 continues to own roadmap versions, capacity allocation, approval and Planner handoff; its production service resolves definitions and assessed skill context through DOC-F29. `apps/api/app/modules/pathways/definitions.py` is retained only as a compatibility export.

The pathway service, versioning, approvals, Planner commitments, evidence credit and recalculation records do **not** depend on how those role definitions are produced. DOC-F29 can later replace/extend `pathway_for()` and the curated resource source without changing the persisted roadmap/version contract.

## Data model

Durable SQLite records are stored in:

- `pathways` — immutable roadmap versions plus active/draft/superseded/rejected state;
- `pathway_steps` — ordered skill milestones, prerequisites, evidence refs, completion state and selected resource decision;
- `pathway_plan_items` — forecast weekly commitments and their Planner approval state;
- `pathway_recalculations` — source version, draft version, trigger reasons and approve/reject result;
- `pathway_audit` — owner-scoped milestone/resource/version actions.

Reference DDL is in `database/schemas/pathways.sql`.

## Prerequisite ordering

Role definitions form a directed acyclic graph. The backend topologically sorts each graph and rejects:

- cycles;
- unknown prerequisite IDs;
- unsupported target roles.

Milestones with unsatisfied prerequisites remain `locked`. Completing or crediting prerequisites unlocks downstream milestones and makes their already-forecast weekly actions Planner-eligible.

A student-confirmed milestone completion is intentionally stored as `student_confirmed`; it is **not** presented as verified skill evidence.

## Transferable credit

A recalculation preserves completed work by skill identity:

- verified/completed evidence in the current context is credited;
- a skill completed/credited in a previous roadmap remains credited when it is also present in the new role pathway;
- only unfinished steps are rescheduled.

Changing from one career goal to another therefore does not discard transferable work such as Networking or Cloud fundamentals when the new pathway also requires it.

## Capacity-aware weekly allocation

The client sends only the scheduling facts required by the service:

- weekly learning availability;
- current daily planning capacity;
- academic due dates, remaining minutes, status and risk score;
- existing Planner block identity/times/categories;
- current skill/evidence status.

Task descriptions, private notes and unrelated personal content are not required for roadmap scheduling and are not sent.

Pace consumes a bounded fraction of declared weekly learning availability:

- Light: 50%
- Balanced: 75%
- Ambitious: 100%

Automatic commitments are 30–90 minute blocks within an 8-week preview horizon. Urgent academic due dates (risk ≥ 70) and the preceding day are protected from automatic career-learning placement. Existing Planner blocks and the current daily capacity are also respected.

If work cannot fit, LumaPath leaves it unscheduled and shows a warning instead of exceeding declared capacity.

## Planner approval gate

Generating or approving a roadmap does not itself create Tasks or Planner blocks.

The student selects weekly actions. Immediately before approval, FastAPI revalidates:

- roadmap is still active;
- action is not deferred or already approved;
- prerequisites are ready;
- the proposed time is not in the past;
- the latest Planner blocks do not overlap;
- the latest daily capacity would not be exceeded.

Only then does the API return typed apply-actions. The current prototype frontend applies them to the existing Task/Planner store with `Roadmap · vN` traceability and stable external IDs. Replaying the same client action is idempotent.

When SCRUM-14 becomes server-authoritative, this apply boundary can become a transactional backend Task/Planner call without changing the roadmap API.

## Learning resources

Curated resources expose, and the UI displays, only known facts:

- provider/source;
- source URL when known;
- free/paid cost type;
- known price when present;
- language;
- format;
- estimated learning duration.

Missing resource metadata is never guessed. If no suitable complete resource fits the current preferences/budget, the milestone is left without a selected resource and an explanatory warning is returned.

Students can:

- **Accept** a recommendation;
- **Defer** it with a reason;
- **Replace** it with one of the visible ranked alternatives, with a reason.

A defer affects the next recalculation: the same resource is strongly deprioritized rather than immediately recommended again. Replacing or accepting after a defer returns still-uncommitted weekly actions to draft review state.

## Recalculation/change summary

The frontend derives explicit recalculation triggers such as:

- role changed;
- goal wording changed;
- pace changed;
- weekly capacity changed;
- daily capacity changed;
- new verified/completed skill evidence appeared.

The server stores the trigger reasons and returns a change summary containing:

- added skills;
- removed skills;
- preserved completed/credited skills;
- moved weekly actions;
- changed resource recommendations;
- explanations.

The active version stays active until the student approves the draft. Rejecting the draft changes neither the active roadmap nor Planner.

## Privacy and safety

- All roadmap versions, steps, recalculations and plan items are owner-scoped.
- Roadmap scores/progress are not employment predictions.
- Student-confirmed learning completion is distinct from verified evidence.
- Academic obligation descriptions are not required for scheduling.
- No learning resource is forced onto the student.
- No weekly action is inserted automatically.
- Capacity overflow produces warnings rather than hidden overbooking.

## API

```text
GET  /v1/pathways/current
POST /v1/pathways/generate
GET  /v1/pathways/{pathway_id}
POST /v1/pathways/{pathway_id}/decision
POST /v1/pathways/{pathway_id}/recalculate
PUT  /v1/pathways/{pathway_id}/steps/{step_id}
POST /v1/pathways/{pathway_id}/steps/{step_id}/resource
POST /v1/pathways/{pathway_id}/weekly-actions/approve
```

The browser uses same-origin Next.js `/api/pathways/*` proxies and does not need the FastAPI host URL exposed client-side.

## UI / accessibility

The `/roadmap` workspace reuses the existing LumaPath cards, spacing, typography, motion and responsive layout. It includes:

- labelled role, pace and goal controls;
- a separate draft approval/rejection panel;
- visible prerequisite/locked states;
- target evidence and current evidence references;
- resource metadata and external source link;
- keyboard-native checkboxes/buttons/selects/inputs;
- a change summary before replacement;
- a 360px E2E overflow contract.

The UI is localized through DOC-F22. Server-generated calculation/reason text currently uses an explicitly disclosed English fallback for Sinhala/Tamil rather than pretending it has been human-translated.
