# DOC-F34 — Governed Market Signals and Role/Skill Taxonomy

## Purpose

DOC-F34 keeps LumaPath role/skill priorities reviewable as market evidence changes. It deliberately separates **observed market signals** from **published taxonomy requirements**. A signal can never silently edit a student's career goal, active roadmap, completed work, or evidence.

The feature has two user surfaces:

- **Students** compare the approved international profile with an approved regional profile and review impact notices after a taxonomy publication.
- **Taxonomy curators/reviewers** inspect governed evidence, submit proposals, and make human approval/rejection decisions.

The workspace route is `/market-signals`.

## Governance boundary

Accepted evidence is aggregate metadata only from registered `market_sources`:

1. `job_aggregate` — governed aggregate counts/shares, never raw job-description bodies;
2. `certification_objectives` — official/reviewed objective metadata and skill mappings;
3. `technology_source` — trusted technology/release metadata and reviewed skill mappings.

A source must satisfy all of the following before observations can influence signals:

- HTTPS provenance;
- source status `approved`;
- bias review status `approved`;
- trust score >= 70;
- region allowed by the source catalogue;
- observation age within the source-specific freshness window;
- curator region scope permits the operation.

The ingestion worker accepts normalized aggregate observations only. It does **not** scrape the open web and does not retain individual job descriptions, student records, private messages, CV text, or documents.

## Signal methodology (`doc-f34-signal-v1`)

For a role/skill/profile tuple, observations are ordered by observation period and divided into prior and recent windows. Each window uses a sample-size weighted skill share:

`weighted_share = Σ(skill_share × sample_size) / Σ(sample_size)`

`delta = recent_share - prior_share`

Labels:

- `emerging` when `delta >= +0.08`;
- `declining` when `delta <= -0.08`;
- otherwise `stable`.

Confidence is a bounded combination of:

- aggregate sample size;
- number of independent governed sources;
- source trust;
- recency;
- a disagreement penalty when recent sources conflict on direction.

Publication eligibility additionally requires:

- total aggregate sample >= 50;
- >= 2 independent governed sources;
- confidence >= 0.62;
- no unresolved limitation;
- label is `emerging` or `declining`.

A stable or below-threshold result stays an **observation only**. These thresholds make the implementation deterministic and auditable; they are not employment predictions.

Each `skill_signal` retains source IDs, observation IDs, source type, source name, observation date/period, region, sample size, confidence, methodology version, provenance URL, limitations, creation time, and expiry.

## Bias, stale and conflicting evidence

- Sources that have not passed bias review cannot be ingested.
- Stale observations are rejected according to the source's `max_age_days`.
- Conflicting recent governed sources reduce confidence and add an explicit limitation.
- Observations are purged after their source-specific retention period.
- Expired signals must be recomputed from current observations before a proposal can be created.
- Source trust, bias status, licensing policy and observation freshness are re-checked again at proposal creation and again immediately before human approval, so a source revoked during review cannot be published from a stale signal.

The product does not infer an individual student's employability from these aggregates.

## Taxonomy lifecycle

The taxonomy lifecycle actively uses `draft`, `review`, `approved`, and `retired` states. Creating a proposal atomically creates an **immutable candidate taxonomy snapshot** in `draft`; submitting the proposal moves that same candidate to `review`; human approval promotes that exact immutable candidate to `approved`; rejection retires the candidate without publishing it. The prior approved snapshot in the same profile scope is retired only after approval.

`change_proposals` are always separate from observed signals and reference both the base version and immutable `candidate_version`. A proposal records:

- source signal and confidence;
- base taxonomy version;
- role and skill;
- proposed proficiency/change type;
- international/regional scope;
- impact level;
- curator rationale;
- decision and resulting taxonomy version.

All publication decisions require the `taxonomy_reviewer` role. AI may summarize already-grounded evidence but cannot approve, reject, or publish a taxonomy change.

Approval/rejection history is append-only in `taxonomy_approvals`.

## Immutable versions and rollback

`taxonomy_versions.snapshot_json` is protected by a database trigger: snapshot, parent version, scope, region and methodology cannot be edited after creation.

Rollback does not rewrite history. A reviewer selects a historical international snapshot, and LumaPath publishes a **new approved version** copied from that reviewed snapshot. The previous default becomes retired. Existing student pathways still remain unchanged until the owner explicitly requests recalculation.

## Regional profiles

Profiles are explicitly scoped as:

- `international`; or
- `regional` + `region_code` (for example `lk`).

A regional publication does not retire or replace the approved international default. Curator APIs enforce `X-Luma-Region-Scope` server-side for source administration, ingestion, signal computation, unfiltered signal/proposal/version reads, review decisions and rollback. Omitting a region filter never broadens a curator's scope. Student comparison only returns approved profiles and explicitly states that comparison does not change the active career goal or roadmap.

## Pathway impact and migration safety

Every pathway already stores `definition_version`. After an approved **international** change, LumaPath finds only active pathways that:

- target the affected role; and
- were created from the replaced taxonomy version.

It creates an owner-scoped impact notice containing before/after requirements and a plain explanation. The existing Notifications inbox also receives an in-app roadmap update that links to `/market-signals`.

The student's current active pathway is never modified at publication time.

The student can:

- **Keep current** — retain the existing version;
- **Dismiss** — close the notice;
- **Recalculate** — only after explicit confirmation; this creates a new **draft** pathway using the new approved taxonomy.

The existing pathway remains active until the separate Roadmap approval flow is used. Previously completed or evidence-credited skills are not silently downgraded.

## Core data tables

- `taxonomy_versions`
- `market_sources`
- `market_observations`
- `skill_signals`
- `change_proposals`
- `taxonomy_approvals`
- `taxonomy_impact_notifications`
- `taxonomy_audit`

The reference schema is `database/schemas/market_taxonomy.sql`.

## API contract

Curator/reviewer endpoints under `/v1/market-taxonomy`:

- `GET /governance`
- `GET /sources`
- `PUT /sources/{source_id}`
- `POST /observations/ingest`
- `POST /signals/compute`
- `GET /signals`
- `POST /proposals`
- `GET /proposals`
- `POST /proposals/{proposal_id}/submit`
- `POST /proposals/{proposal_id}/decision`
- `GET /proposals/{proposal_id}/approvals`
- `GET /versions`
- `POST /versions/rollback`

Student endpoints:

- `GET /student/profile-comparison/{role_id}`
- `GET /student/updates`
- `POST /student/updates/{impact_id}/decision`

## Identity boundary

This repository still uses the existing prototype header identity boundary. DOC-F34 adds `X-Luma-Curator-Id`, `X-Luma-Curator-Role`, and `X-Luma-Region-Scope`, with server-side role/region checks. Production deployment must populate those claims from verified session/JWT identity rather than trusting browser-authored headers.

## Failure behavior

DOC-F34 fails closed when:

- a source is unapproved, stale, low-trust, bias-review pending/rejected, or outside region scope;
- evidence is insufficient for a publishable signal;
- a signal expires;
- a proposal's base taxonomy changed during review;
- a curator/reviewer lacks the required role or regional scope;
- a student tries to act on another student's update;
- the student's active pathway changed before recalculation.

These states do not fabricate evidence or mutate a roadmap.
