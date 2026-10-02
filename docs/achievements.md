# DOC-F27 — Private Achievements & Consistency

DOC-F27 is intentionally a **private personal-progress feature**, not a leaderboard or engagement game. Awards are produced only from existing LumaPath domain records and carry a versioned rule plus evidence references.

## Evidence sources

The current catalogue reads only these existing owner-scoped records:

- append-only Analytics task/planner events for planned work and recorded task completion;
- completed Focus sessions with positive `productive_minutes` for study consistency;
- deterministic Portfolio analysis snapshots;
- deterministic CV analysis snapshots;
- Internship application status events that reach `Applied`;
- completed/credited Career Roadmap milestones.

Assistant/Copilot text, model claims, uploaded-document prose, private mentor content and free-form AI output are not achievement evidence.

## Catalogue version

Current rule catalogue: `2026-10-v1`.

Each award is unique by `(student_id, definition_key, definition_version)`. Re-running evaluation is therefore idempotent. A later catalogue can coexist under a new version without silently changing the meaning of older awards.

Current milestones cover:

- first completed planned task;
- first approved personal planning commitment;
- five distinct approved planning commitments;
- an on-time dated task completion;
- three qualifying Focus-study days;
- first deterministic Portfolio review;
- first deterministic CV review;
- first Internship application recorded as `Applied`;
- first completed/credited Career Roadmap milestone.

Career milestones are optional and remain private.

## Corrections and deletions

Awards are historical records; source evidence remains authoritative.

If the source is corrected/deleted and the rule is no longer satisfied, the award is **not erased**. Its `evidence_status` becomes `withdrawn`. This preserves audit history without continuing to represent unsupported evidence as current.

If new valid evidence later satisfies the same rule/version, the same award is restored instead of creating a duplicate.

## Consistency rule

A qualifying study day is a day with at least one completed Focus session that records positive productive time.

The current run:

- counts qualifying study days, not every calendar day;
- allows one missed calendar day between qualifying days as grace;
- does not subtract points or remove prior achievements;
- naturally starts a new run after a longer break;
- never uses "lost", "failed", or punishment language.

The historic `study.consistency_three` achievement uses the **longest qualifying run**, so a later rest period does not revoke it. It can only be withdrawn if the underlying source sessions are actually corrected/deleted such that the qualifying history no longer exists.

## Preferences

- `feature_visible`: hides/shows the achievement workspace.
- `celebrations_enabled`: defaults **off**; when enabled, newly awarded milestones may show a small private toast.
- `streak_visible`: hides/shows the consistency summary independently of awards.

Hiding/muting the feature never changes domain data or award evidence.

## Privacy and comparison boundary

There are no cohort, leaderboard, rank, percentile, score-sharing or public-achievement endpoints. Every API call is owner-scoped through the existing student principal boundary. The response explicitly declares `private_only=true` and `comparison_enabled=false`.

## APIs

- `GET /v1/achievements`
- `POST /v1/achievements/evaluate`
- `PUT /v1/achievements/preferences`

The Next.js frontend uses same-origin `/api/achievements/*` proxy routes.
