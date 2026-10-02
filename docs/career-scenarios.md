# DOC-F33 — Career Choice Scenarios

## Purpose

DOC-F33 compares two to four approved careers before a student changes direction. It is a planning simulator, not an employment predictor. Results are ranges with assumptions and explicit missing data.

## Architecture

`CareerScenarioService` snapshots:

- selected approved role definitions and prerequisite graphs;
- DOC-F29 taxonomy version;
- reusable owner-scoped DOC-F31 evidence references, proficiency and confidence;
- active pathway identity/version and transferable completed steps;
- declared weekly learning availability, target date and learning preferences.

Each calculation is written to `scenario_results`. Results are append-only and protected by a SQLite update trigger. Recomputing availability or target date creates a new result. By default, recomputation reuses the same evidence/taxonomy snapshot so the effect of the changed input is deterministic. `refresh_context=true` explicitly captures a new current snapshot.

## Skill credit and effort

A skill is transferable when the snapshot reaches the role proficiency requirement with at least moderate confidence (`0.55`). Missing or disputed evidence is never treated as credit.

Remaining skills stay in prerequisite/topological order. Partial proficiency reduces estimated work, but never to zero unless the skill is credited. The service returns a low/high effort range and derives duration from declared weekly availability. With zero weekly capacity, duration is reported as not computable.

## Cost routes

Every role returns three routes:

1. **Free** — only catalogue resources explicitly marked free; known cost is USD 0.
2. **Low-cost** — prefers free resources and may use approved resources with verified prices inside the documented budget envelope. The envelope is an assumption, not a publisher quote.
3. **Certification-focused** — shows mapped certification resources. Missing exam prices remain `unknown`; the service does not manufacture an upper price.

Time, internet/device costs and optional certification expenses are not silently treated as free.

## Switching safety

`POST /v1/career-scenarios/{scenario_id}/switch-draft` requires explicit confirmation and a selected immutable result. Before drafting it verifies:

- scenario ownership;
- role membership in the compared scenario;
- taxonomy version is still current;
- the active pathway identity/version has not changed since the snapshot.

The endpoint refreshes an evidence-only DOC-F29 assessment for the chosen role and asks the existing Pathway service to create a **draft**. A runtime invariant verifies the active pathway identity is unchanged. Activation still requires the existing Roadmap approval action.

Completed/reusable overlapping skills are preserved by the existing pathway-transfer logic.

## Privacy

Scenario snapshots do not store private evidence titles, CV text, mentor messages, documents or notes. They store only the minimum reusable evidence planning fields and source references needed to explain credit. All reads and writes are student-owner scoped server-side.

## API

- `GET /v1/career-scenarios/roles`
- `POST /v1/career-scenarios`
- `GET /v1/career-scenarios/saved`
- `GET /v1/career-scenarios/{scenario_id}`
- `POST /v1/career-scenarios/{scenario_id}/recompute`
- `PUT /v1/career-scenarios/{scenario_id}/saved`
- `POST /v1/career-scenarios/{scenario_id}/switch-draft`

## Failure behavior

The service fails closed on unsupported roles, cross-student access, stale taxonomy, changed active pathways and unconfirmed switching. Missing cost/evidence data is rendered as unknown. None of these states modify the active roadmap.
