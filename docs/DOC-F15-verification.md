# DOC-F15 Verification

Backlog: **DOC-F15 — CV improvement without fabricated experience**

## Acceptance criteria traceability

### AC1 — Review/correct parsed sections before analysis
- Upload and paste endpoints return structured sections.
- `PUT /sections` stores owner corrections and confirmation.
- Analysis returns `409` until `sections_confirmed_at` exists.
- Backend tests cover correction of the Skills section before analysis.

### AC2 — Structure, readability, skills, projects and experience
- Deterministic findings cover standard sections/contact, word length/sentence readability, role-skill evidence, project visibility and student-appropriate experience guidance.
- Findings contain severity, rationale, source section and proposed action.

### AC3 — Role relevance and ATS rationale
- DOC-F14 role taxonomy is reused; CV/Portfolio evidence states are separated.
- ATS-oriented report includes explicit rationale and an outcome disclaimer.
- No recruiter/ATS success probability is generated.

### AC4 — Missing achievements become evidence requests
- Experience lines without measurable evidence produce a question requesting a verifiable result/scale/outcome.
- Tests assert no invented metric is inserted.

### AC5 — Generated wording is editable and labelled draft
- Suggestions are stored as `proposed`, `accepted` or `dismissed`.
- Draft text can be edited before acceptance.
- Export puts accepted text under `ACCEPTED IMPROVEMENT DRAFTS` rather than modifying the source CV.

### AC6 — Safe unsupported/failed-file behavior
- Unsupported extension, size, MIME and signature failures are rejected before storage.
- Accepted files that later fail extraction remain privately stored with `parse_failed` and a safe error.
- An analysis exception returns a safe `503` while source text/file remains unchanged.

## Automated checks

Backend tests added in `apps/api/tests/test_cv.py` cover:

- paste parsing and confirmation gate;
- user section correction;
- required analysis categories;
- evidence-question behavior;
- Portfolio evidence mapping;
- editable/accepted wording and export;
- prompt-injection text;
- private DOCX upload;
- corrupt supported file preservation;
- unsupported files;
- analysis failure preservation;
- cross-student ownership;
- independent source/analysis deletion;
- retention expiry;
- analysis rate limiting;
- schema privacy boundary;
- real HTTP paste/review/analyse ownership path.

Frontend test files:

- `src/features/cv/domain/cv.test.ts`
- `tests/e2e/cv.spec.ts`

The E2E flow covers paste → review → confirm → analyse → edit → approve and a keyboard/narrow-width smoke check.

## Privacy/security review

- Owner ID is checked server-side on every document/suggestion/delete/export path.
- Original uploaded storage names are random and not returned to the web client.
- No route exposes original file bytes.
- No LLM provider is called by DOC-F15.
- Prompt-injection-like text is analysed only as untrusted CV content.
- CV source/analysis deletion and bounded retention are implemented.
- No employer/date/qualification/metric synthesis path exists in the deterministic suggestion generator.
- Client-only Student Profile claims are not promoted into CV wording; the current server profile only owns locale, so target role is explicit and Portfolio evidence remains source-labelled until a verified profile-evidence contract exists.

## Known prototype boundary

Authentication remains the shared prototype identity boundary (`X-Luma-Student-Id`). A production deployment must replace it with authenticated session/JWT identity without trusting arbitrary client-provided student IDs.

## Frontend dependency environment note

The provided baseline archive does not contain `package-lock.json`, so `npm ci` cannot run from the clean release as-is. An attempt to generate a lockfile with `npm install --package-lock-only` timed out in this execution environment. The root Dockerfile has therefore been hardened to use `npm ci` when a lockfile is present and fall back to `npm install` when it is absent.

For a reproducible competition release, generate and commit `package-lock.json` in a network-enabled development environment, then run:

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Until that dependency install succeeds, this verification does **not** claim fresh ESLint, semantic TypeScript, Vitest, Next production-build or Playwright passes. Static local-import, i18n/pseudo-localization and TypeScript syntax transpilation checks are run separately.

## Final verification result

Executed in the working environment for this release:

```text
FastAPI/backend regression tests      113 / 113 PASS
DOC-F15 backend tests                  19 / 19 PASS
Python compilation                     PASS
i18n catalogs                          816 keys × 3 PASS
Pseudo-localization                    816 / 816 PASS
Local frontend imports                 683 / 683 PASS
TS/TSX syntax transpilation            239 / 239 PASS

HTTP CV upload                         201 / parsed
HTTP section confirmation              200 / confirmed
HTTP analysis                          200
Cross-student read                     403
HTTP export                            200
HTTP source deletion                   200
```

The full dependency-backed frontend commands are not marked as fresh passes because the baseline archive has no `package-lock.json`, `npm ci` therefore cannot run, and a network attempt to generate a lockfile with `npm install --package-lock-only` timed out in this environment.
