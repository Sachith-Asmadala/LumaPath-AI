# DOC-F24 Verification — Mentor Support

## Acceptance criteria

- **AC1:** Student can preview, create, scope, expire and immediately revoke a relationship. Mentor must accept the one-time invitation before access becomes active.
- **AC2:** Mentor reads are filtered server-side by the active consent grants. Guidance requests are explicitly student-created. Private categories are absent from the share schema.
- **AC3:** Mentor recommendations are separate records. Student accept/dismiss is required, followed by a second explicit schedule confirmation before a Planner action is returned.
- **AC4:** Private capacity/check-in notes, raw CV content, interview recordings/answers and personal task notes are not fields in mentor share storage.
- **AC5:** Student can inspect access history including mentor views and recommendations.
- **AC6:** Every mentor access validates status and expiry. Revoked/expired relationships return access denied immediately.

## Automated coverage
`apps/api/tests/test_mentors.py` covers invitation/acceptance, consent filtering, scope change, recommendation approval, Planner overlap, private-field schema boundaries, access audit, expiry, one-time invites, cross-owner denial and HTTP role/consent enforcement.

Frontend contracts:
- `src/features/mentors/domain/mentors.test.ts`
- `tests/e2e/mentors.spec.ts`

## Known prototype boundary
Student identity still uses the trusted development `X-Luma-Student-Id` header shared by the existing project. DOC-F24 improves mentor delegation independently by using random hashed relationship tokens rather than a spoofable mentor ID header.

## Final release verification

Executed against the cumulative DOC-F24 source tree:

- FastAPI cumulative regression suite: **212/212 passed**.
- DOC-F24 focused mentor suite: **14/14 passed**.
- Python application compilation: **passed**.
- Frontend local import resolution: **845/845 passed**.
- Internationalisation contract: **1,336 keys × 3 locales passed**.
- Pseudo-localisation: **1,336/1,336 passed**.
- TS/TSX syntax transpilation: **302/302 files passed**.

A real HTTP lifecycle smoke covered relationship creation, one-time invitation acceptance, scoped mentor read, guidance request, mentor recommendation, student acceptance, explicit Planner approval, access-history read, revocation and immediate post-revocation denial. Cross-role access remained permission checked at the API boundary.

## Frontend dependency-backed verification limitation

The cumulative prototype still has no committed `package-lock.json`. A clean npm dependency/lockfile resolution was attempted during implementation but did not complete in the execution environment. No partial `node_modules` or generated lockfile is included in the release.

Accordingly, this release does **not** claim fresh passes for semantic `tsc`, Vitest, the Next.js production build or Playwright. The frontend unit/E2E contracts are included for normal CI/local execution once the dependency tree is available.

## Privacy/security notes

- Invitation and mentor-access secrets are never stored in plaintext; only SHA-256 hashes are persisted.
- Mentor access tokens are relationship-bound and cannot be reused against another relationship.
- Consent expansion/update requires a fresh student-side consent preview before save.
- Revoked/expired access is denied immediately at the server policy layer; revoked-token attempts remain auditable by hash.
- Private capacity/check-in notes, raw CV documents, interview recordings/answers, uploaded study-document content and unrelated private task notes are not part of the mentor sharing schema in DOC-F24.
- Mentor recommendations cannot mutate the Planner directly. Student acceptance and a separate schedule confirmation are both required.
