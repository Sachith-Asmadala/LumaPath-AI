# DOC-F24 Mentor Support

## Purpose
Mentor Support provides student-issued, purpose-limited and time-bounded access to a small set of mentoring summaries. It is not an institutional monitoring surface and mentors never receive direct control of the student's Planner.

## Identity and tokens
The existing prototype student boundary continues to use `X-Luma-Student-Id` until the production authentication story replaces it. Mentor access deliberately does **not** use a free-form mentor identity header.

1. The student creates a relationship after reviewing the consent preview.
2. FastAPI returns a random one-time invitation token and stores only its SHA-256 hash.
3. The intended mentor accepts the invitation.
4. FastAPI returns a separate random relationship access token and stores only its hash.
5. Mentor reads and writes require `X-Luma-Mentor-Token` and are checked against relationship status, expiry and current consent on every request.
6. Revocation or expiry denies the token immediately.

The browser stores accepted mentor access in local storage only for the mentor view. The mentor can remove that token from the browser at any time; student revocation remains authoritative server-side.

## Consent categories
The implemented categories are:

- `academic_summary` — degree/year/semester/modules, task counts and concise upcoming deadline facts.
- `career_goal` — target role and student career/learning goal.
- `career_readiness` — score and high-level breakdown only.
- `roadmap` — current server-owned roadmap goal and milestone states.

The following are not represented in the mentor-share schema and therefore cannot leak through this feature by accident:

- private capacity/life-load check-ins or notes;
- raw CV documents/source text;
- interview recordings or raw interview answers;
- private task descriptions and personal notes;
- uploaded study-document contents.

A later story must add a new explicit category and policy review before any of these classes can be shared.

## Consent changes
Only the student endpoints can change scope, expiry or revoke the relationship. Consent grants retain grant/revoke timestamps. Updating scope stores a new safe summary snapshot containing only currently selected summary categories. Roadmap data is read directly from the active server-owned pathway and reduced to milestone-safe fields.

## Guidance and Planner boundary
Mentor recommendations are separate records. A mentor recommendation cannot mutate student state.

Student flow:

`proposed -> accepted/dismissed -> (accepted only) explicit schedule confirmation -> Planner apply action`

The server re-checks Planner overlap before returning an action. Comments can never be converted to plan actions. Planner conversion is idempotent per recommendation.

## Access audit
Student-visible audit records capture meaningful security events such as invitation acceptance, consent updates, mentor shared-summary reads, recommendation creation, expiry and revocation. Audit detail stores event metadata/counts rather than shared academic/CV content.

## Privacy and cache behavior
All Next.js mentor proxies return `Cache-Control: no-store, private`. Mentor tokens are never returned in a URL by the server. The invitation token can appear in the student-generated invitation URL exactly once; after acceptance the page replaces that URL with a relationship identifier.

## Production follow-up
Replace the prototype student identity header with verified account/session identity. Mentor relationship tokens remain useful as scoped delegation credentials, but may later be bound to an authenticated mentor account for account recovery and multi-device access.
