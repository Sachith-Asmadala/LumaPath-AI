# DOC-F31 Verification

## Acceptance criteria

- **AC1:** Passport groups one or more provenance-linked records under each skill.
- **AC2:** Manual projects, selected repositories, live demos, certificates, assessments and explicit mentor validation are supported.
- **AC3:** Status/confidence is deterministic by evidence type, freshness, review and correction. Expiry/dispute/revalidation and certificate metadata correction are explicit.
- **AC4:** DOC-F29 skill assessment consumes active Passport evidence; weak/stale/disputed status cannot masquerade as strong verified evidence. Revoked/stale repository snapshots are also weakened in the backwards-compatible Portfolio assessment path.
- **AC5:** Export and share require explicitly selected owner evidence. Shares expire, are capped at 30 days, and revoke immediately.
- **AC6:** Student reads/mutations are owner-scoped. Mentor validation is relationship-token scoped. Recipient share access is separately audited.

## Safety/privacy verification

- Self-entered certificate URLs/references never become `verified` automatically.
- Unknown taxonomy skills and non-HTTP(S) certificate URLs are rejected.
- Private originals are absent from share/export schemas.
- Public share responses exclude owner-only correction notes, edit/revalidation flags and internal `source_ref` identifiers.
- Public share tokens are stored only as SHA-256 hashes.
- Source deletion marks synced evidence stale instead of retaining it as current observed proof.
- Revoked repository access reduces F29 readiness evidence rather than leaving the prior repository snapshot high-confidence.
- Mentor validation requires an active unexpired DOC-F24 relationship and a student-created validation request.
- Certificate corrections preserve a hidden credential reference unless the owner explicitly replaces it.

## Automated tests

`apps/api/tests/test_evidence_passport.py` contains **19 focused tests** covering provenance sync, every supported evidence class, expiry/dispute/revalidation, certificate correction, F29 readiness integration, revoked repository freshness, selected export/share, 30-day share bounds, hashed share tokens, recipient audit, safe public serialization, immediate revocation, expired links, ownership, invalid metadata, deleted sources, mentor-token binding and HTTP identity/share behavior.

Frontend automated contracts are included in:

- `src/features/evidence-passport/domain/evidence-passport.test.ts`
- `tests/e2e/evidence-passport.spec.ts`

The E2E contract covers selecting one evidence record, creating a scoped recruiter share, confirming unselected evidence is absent, immediate revocation, keyboard reachability and a 360px narrow-layout check.

## Frozen release verification

- DOC-F31 focused FastAPI tests: **19 / 19 PASS**
- Complete cumulative FastAPI regression: **278 / 278 PASS**
- Python compilation: **PASS**
- Frontend local imports: **929 / 929 PASS**
- i18n contract: **1,637 keys × 3 locales PASS**
- Pseudo-localization: **1,637 / 1,637 PASS**
- TS/TSX syntax transpilation: **377 / 377 PASS**

Real HTTP smoke:

- certificate metadata create: `201`
- scoped evidence share create: `201`
- public selected-evidence read: `200`
- owner-only correction/internal source fields absent from public response: `PASS`
- 31-day share request rejected: `422`
- cross-owner export: `403`
- owner revoke: `200`
- same public token after revoke: `403`

A clean npm lockfile/dependency resolution was attempted, but package resolution did not complete within this execution environment. No partial `package-lock.json` or `node_modules` is included in the release. Fresh semantic `tsc`, Vitest, Next production build and Playwright execution are therefore not claimed; the relevant frontend automated contracts are included for normal network-enabled CI.
