# DOC-F29 Career Pathway Engine

DOC-F29 makes the career taxonomy and student-skill assessment server-owned. It replaces the temporary DOC-F13 definition source while keeping DOC-F13's versioned roadmap, approval, capacity scheduling and Planner contracts intact.

## User flow

1. Open **Career Path**.
2. Select an approved career role.
3. Review the published taxonomy version, required proficiency, prerequisites and recommended evidence for every skill.
4. Run a skill assessment. The service combines low-confidence self assessment with any available quiz, CV, Portfolio, repository and prior-roadmap evidence. Every evidence record retains source, confidence and verification state.
5. Review explicit skill gaps and conflicting/uncertain evidence.
6. Inspect ranked courses, certificates, tutorials and projects. Ranking exposes quality, cost, language, format/type and source facts; unknown provider data is left unknown.
7. Open **Roadmap**, choose weekly capacity and target date, then generate a draft. DOC-F13 remains responsible for capacity-aware weekly allocation and explicit activation/Planner approval.
8. When evidence, target, availability or target date changes, recalculation creates a new explained draft; the active version remains unchanged until approval.

## Approved taxonomy boundary

The current approved taxonomy version is `2026-10-v2`. Runtime tables are:

- `career_roles`
- `skills`
- `role_skills`
- `skill_dependencies`
- `learning_resources`
- `resource_skills`
- `skill_assessments`
- `student_skills`
- `student_skill_evidence`

The authoritative seed catalogue lives in `apps/api/app/modules/careers/catalog.py`. Graphs are topologically validated and cycles/unknown prerequisite references fail publication. AI/model output cannot add or change role requirements in this story.

`apps/api/app/modules/pathways/definitions.py` now contains compatibility exports only. The production Pathway router resolves definitions/resources/assessed skill context through DOC-F29.

## Skill evidence and confidence

DOC-F29 deliberately distinguishes evidence sources:

| Source | Treatment |
| --- | --- |
| Self assessment | low-confidence, self-reported |
| LumaPath quiz | observed evidence |
| Certificate supplied by the student | self-reported until a certificate-verification service exists |
| Manual Portfolio project | self-reported project evidence |
| Explicitly authorised repository snapshot | observed project evidence |
| Reviewed CV wording | supportive self-reported evidence, not verification |
| Roadmap completion | `student_confirmed` unless backed by verified evidence |

A proficiency estimate is a weighted planning signal. Multiple independent evidence sources can raise confidence, but confidence is capped and never represented as certainty. Materially conflicting strong evidence is retained and shown with a conflict warning rather than silently resolved.

A role requirement is considered met only when the estimated proficiency reaches the published threshold **and** evidence confidence reaches the minimum planning confidence. This is not an employability/hiring score.

## Skill-gap ordering

Skill gaps are filtered against the selected role's required proficiency, then ordered using the validated prerequisite DAG. Missing prerequisites therefore appear before advanced outcomes. Unknown/invented skills are rejected at the API boundary.

## Resource ranking

The skill-resource service supports:

- courses
- certificates
- tutorials
- projects

Ranking is deterministic and explains:

- editorial quality signal
- language preference
- format preference
- resource-type preference
- declared cost preference

Missing metadata is not guessed. Certificate fees in the seeded catalogue are intentionally left unknown where the provider fee can change.

Editorial quality is a catalogue signal, not a guarantee of learning quality, certification success or employment outcome.

## Capacity and target date

DOC-F13 continues to enforce weekly/daily capacity and academic/Planner conflicts. DOC-F29 adds target-date feasibility context. If the remaining gap effort cannot fit within declared weekly learning capacity before the target date, the roadmap draft is still reviewable but includes a visible infeasibility warning. It never creates overlapping work to make the date appear feasible.

## Transferable progress

Existing DOC-F13 behavior remains: completed/credited skills shared between two roles remain credited when the student changes target role. Only unfinished work is recalculated. A new role can have a different current assessment without erasing transferable completion from the active roadmap.

## APIs

Career taxonomy/assessment/resources:

- `GET /v1/careers/roles`
- `GET /v1/careers/roles/{role_id}`
- `POST /v1/careers/assessments`
- `GET /v1/careers/assessments/current?target_role=...`
- `POST /v1/careers/skills/{skill_id}/resources/rank`

Career-engine aliases over the existing single roadmap store:

- `POST /v1/careers/pathways/generate`
- `GET /v1/careers/pathways/current`

DOC-F13 roadmap endpoints under `/v1/pathways/*` remain the authoritative roadmap version/approval persistence contract.

## Privacy and security

All student assessment records are owner-scoped. The assessment endpoint accepts only skill IDs contained in the approved selected-role taxonomy. Repository/project/CV evidence is looked up from owner-scoped server records instead of trusting arbitrary client claims as observed/verified evidence.

The browser sends only low-confidence self-assessment/quiz context derived from the prototype where necessary; Portfolio/CV/repository evidence is collected server-side. No raw CV text, task notes, mentor data or uploaded document contents are copied into the career assessment tables.

## Failure behavior

- Unknown role -> safe 404.
- Skill outside selected taxonomy -> 422; no assessment stored.
- Missing assessment -> roadmap generation through DOC-F29 production service returns a clear prerequisite error.
- Cyclic/invalid approved taxonomy -> service fails validation rather than producing a path.
- Zero/insufficient capacity -> honest infeasibility/unscheduled warnings; no fabricated completion date.
- Conflicting evidence -> retained with lower confidence and an uncertainty explanation.
