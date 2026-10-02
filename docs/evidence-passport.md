# DOC-F31 — Evidence Passport

## Purpose

DOC-F31 turns the existing career/portfolio evidence into an owner-controlled skill-to-evidence graph. It records provenance and verification meaning without copying sensitive originals into a new store.

## Supported evidence

| Evidence | Source | Default status | Typical confidence |
| --- | --- | --- | ---: |
| Manual portfolio project | DOC-F14 | `self_declared` | <= 0.58 |
| Explicitly selected repository analysis | DOC-F14 | `observed` while current/authorised | <= 0.88 |
| Live demo linked to analysed project | DOC-F14 | `observed` or `self_declared` | 0.40–0.58 |
| Certificate metadata | DOC-F31 | `self_declared`; `expired` after expiry | 0.50 |
| LumaPath quiz/assessment | DOC-F29 | `observed`, stale after 180 days | 0.50–0.75 |
| Explicit mentor validation request | DOC-F24 + DOC-F31 | `reviewed`, `self_declared`, or `disputed` | 0.10–0.72 |

`verified` is reserved for a future evidence source that actually supplies a trustworthy verification signal. DOC-F31 does not promote a self-entered certificate to verified merely because a URL/reference exists.

## Confidence/readiness rules

Evidence is never counted only because a generated claim exists. Passport contribution combines:

1. the source-specific confidence,
2. verification status,
3. optional proficiency signal,
4. freshness/expiry,
5. owner disputes/corrections.

Status weights are intentionally transparent: `verified=1.0`, `observed=.85`, `reviewed=.75`, `self_declared=.45`, `stale=.25`, `expired=.10`, `disputed=0`.

DOC-F29 consumes active Passport evidence during a new skill assessment. This means readiness can benefit from reviewed/observed evidence and is weakened by stale/disputed evidence; course/roadmap completion alone is not treated as sufficient proof. The backwards-compatible direct Portfolio evidence path also checks repository revocation and snapshot freshness, so an old repository snapshot cannot remain high-confidence after access is revoked.

## Freshness and corrections

- repository/live-demo evidence: stale after 30 days or immediately when the selected source is no longer current/authorised;
- assessment evidence: stale after 180 days;
- self-declared project/certificate evidence: stale after 365 days unless the owner reviews it again;
- certificates: `expired` after the supplied expiry date regardless of owner review;
- owner corrections can mark any evidence `disputed`; clearing a dispute restores the evidence-type status only after explicit review;
- certificate metadata (including mapped skill and expiry) can be corrected or deleted by the owner; hidden credential references are preserved when unrelated fields are edited without re-entry.

Source deletion/correction does not rewrite history. Synced evidence becomes stale/withdrawn from readiness rather than being silently treated as current proof.

## Mentor validation

A mentor cannot independently browse the student Passport. The student must create a skill-specific validation request against an active DOC-F24 mentor relationship. The mentor relationship token is checked again before a response is accepted. The resulting evidence stores only the skill, decision, provenance and factual note required for that review.

## Sharing and export

Exports and share links require explicit `evidence_ids` owned by the student.

- share tokens are random and only SHA-256 hashes are stored;
- every share has an expiry and is capped at 30 days;
- revocation is immediate;
- the public view contains only selected evidence summaries and safe provenance; owner-only correction notes, edit flags and internal source IDs are never serialized to recipients;
- underlying CV documents, repository credentials/content, interview answers/recordings, mentor conversations and uploaded study files are never included;
- recipient access is written to `evidence_access_audit`.

A share/export explains verification meaning and does not claim guaranteed credential authenticity or professional proficiency.

## API

Student-owned:

- `GET /v1/evidence-passport`
- `POST /v1/evidence-passport/sync`
- `POST|PUT|DELETE /v1/evidence-passport/certificates...`
- `PUT /v1/evidence-passport/evidence/{id}`
- `POST /v1/evidence-passport/evidence/{id}/revalidate`
- `POST|GET /v1/evidence-passport/mentor-validation-requests`
- `POST /v1/evidence-passport/export`
- `POST|GET /v1/evidence-passport/shares`
- `POST /v1/evidence-passport/shares/{id}/revoke`
- `GET /v1/evidence-passport/access-history`

Mentor-scoped:

- `GET /v1/evidence-mentor/relationships/{id}/validation-requests`
- `POST /v1/evidence-mentor/validation-requests/{id}/respond`

Time-bound recipient:

- `GET /v1/evidence-share/{token}`

## Privacy

The Passport stores normalized provenance, confidence/status, reference hashes and safe metadata. Originals remain in their source domain. A repository authorization token, CV source, private document body, interview recording/answer, private check-in, task note, or mentor conversation is not copied into `skill_evidence` or a share grant.

The current student identity boundary is still the project's development `X-Luma-Student-Id` contract; production authentication should replace it without changing the owner checks in this domain.
