# DOC-F28 — Opportunity Recommendations

## Purpose

DOC-F28 adds a private opportunity catalogue and an explainable recommendation layer for internships, hackathons, competitions, workshops, scholarships, certifications and university events. It does not submit applications or guarantee eligibility.

## Trust before ranking

An opportunity must pass three gates before it can be active:

1. `trust_status` is `verified` or `curated`;
2. `closes_on` has not passed;
3. `source_checked_at` is within `OPPORTUNITY_SOURCE_FRESHNESS_DAYS` (default 30).

Only after those gates are passed can personalization affect ordering. `untrusted`/`quarantined`, stale and expired entries do not receive a recommendation score and are not returned as active opportunities.

The current competition package includes **curated demonstration catalogue fixtures** with explicit source metadata so the workflow is deterministic. Production deployment must replace those fixtures with a verified ingestion/editorial feed; the UI says this directly and never presents the demo feed as independently authoritative.

## Privacy-minimal recommendation context

The recommendation endpoint accepts only a normalized context:

- selected target role;
- readiness score;
- skill IDs, levels and whether a skill is currently demonstrated;
- explicit type/location/cost preferences;
- optional basic eligibility fields the student chooses to provide.

It does **not** require or store CV text, task descriptions, mentor content, document text, check-in notes or other raw private content. Recommendation snapshots store only factor outputs plus a small context summary (role, score, skill IDs and preference keys).

Students can call the same endpoint with no context. This returns unpersonalized browsing ordered by closing date.

## Ranking definition

The current rule version is `2026-10-v1`. Ranking is deterministic and returns each factor:

- career-goal fit — max 30;
- recorded skill evidence — max 25;
- readiness alignment — max 15;
- preferred opportunity type — max 10;
- location preference — max 5;
- cost preference — max 5;
- private feedback adjustment — bounded to ±10.

A recommendation score is a discovery/ranking signal, **not** an eligibility or hiring probability.

## Eligibility

Eligibility is tri-state for every structured requirement:

- `met`: supplied data matches the listed rule;
- `unmet`: supplied data appears not to match;
- `unknown`: required student data was not supplied.

The overall result is `unknown` whenever any requirement is unknown and none is known to fail. The UI never rewrites `unknown` as “eligible.” The original provider source remains authoritative.

## Feedback

Interactions are private to the owner:

- Save: small positive affinity for related future ranking;
- Dismiss: small negative affinity;
- Report: immediately removes the item from that student's active catalogue and creates a moderation signal;
- Planned: records that a preparation action was approved.

A student report creates an auditable `reported` validation event and immediately places the item into a temporary catalogue-wide review quarantine, because DOC-F32 forbids reported sources from producing active recommendations. The quarantine is resolved only by a later governed source verification; the report event itself is never deleted.

## Planner handoff

A preparation action is a two-step flow:

1. Student selects exact start time/duration and confirms it;
2. FastAPI validates the time is future and does not overlap the latest Planner blocks sent through the existing narrow planner bridge.

The response is idempotent and carries `Opportunity · <provider>` source traceability. The frontend then inserts the validated Career task using the existing Task/Planner adapter.

## DOC-F16 internship handoff

Internship recommendations expose a factual handoff containing only provider, role, source URL, closing date and listed required skill IDs. The resulting DOC-F16 application is created as `source_type=recommendation`; the imported closing date remains **unconfirmed** until the student verifies it.

## Sponsored placement

`is_sponsored`/`sponsor_name` are explicit catalogue fields. Sponsored items are visibly labeled in list and detail views and receive no hidden ranking boost.

## Failure handling

- Missing profile/context → unpersonalized browsing, not an error.
- Stale/expired/untrusted source → removed before ranking.
- Reported item → removed from active recommendations for all students until governed revalidation.
- Planner conflict → `409`, plan unchanged.
- Unconfirmed Planner action → `422`, plan unchanged.
- Backend timeout/unavailable → UI error state; no interaction is fabricated locally.

## DOC-F32 extension

DOC-F32 adds versioned source requirements, Evidence Passport/DOC-F29-aware tri-state evaluations, source-validation history, editable backward-scheduled preparation proposals, explicit Planner approval and application lifecycle tracking. See `docs/opportunity-readiness.md` and `docs/DOC-F32-verification.md`.

## Production follow-up

A future source ingestion/admin story should replace deterministic demo fixtures with verified feeds or editorial entry tools, perform scheduled freshness checks and moderate reports. The public recommendation contract does not need to change.
