# DOC-F22 verification — English, Sinhala and Tamil

Backlog: **DOC-F22 / Source catalogue feature 22**  
Translation resource version: **2026-10-01.1**

## Acceptance-criteria traceability

| AC | Implementation | Automated / code verification |
| --- | --- | --- |
| AC1 | Core shell/navigation and the priority path (onboarding, Tasks, Planner, Next Best Action, Focus, Study Assistant, Documents, Analytics and Settings) use stable English/Sinhala/Tamil keys. Source/user-authored academic text is intentionally preserved. | `scripts/check-i18n.mjs` enforces catalog parity and representative script fixtures. `tests/e2e/i18n.spec.ts` checks translated navigation. |
| AC2 | Locale is stored per student in `profile_preferences`; `localStorage` is an immediate/offline cache and the server profile becomes authoritative when identity is available. | SQLite repository-reopen test plus owner-scoped HTTP tests in `apps/api/tests/test_i18n.py`. |
| AC3 | Dates, times and numbers use shared `Intl.DateTimeFormat` / `Intl.NumberFormat` helpers. Planner, Analytics, Documents and other updated workflows call these presentation-layer formatters. | `src/i18n/i18n.test.ts` covers all supported locales; source syntax/import checks verify integration. |
| AC4 | Study Assistant request/response contracts carry `locale`, `requested_locale`, `response_locale` and `locale_fallback`. Sinhala/Tamil generated explanation fields must pass target-script coverage validation; otherwise English fallback is disclosed. Local Copilot also discloses English fallback for non-English interface locales. | Backend tests cover English fallback, validated Sinhala and validated Tamil output. |
| AC5 | Missing locale keys fall back to English. If no English/fallback copy exists, the user sees `Translation unavailable`, never the raw identifier. Missing-key reports contain only locale/key/resource version. | `src/i18n/i18n.test.ts`; catalog parity/source-key scanner; privacy test verifies report schema contains no prompt/content fields. |
| AC6 | `<html lang>` follows the locale, language-change status is announced through `aria-live`, and core workflow accessible names are translated. Existing native controls/keyboard paths are preserved and longer-script CSS allows wrapping/readable line height. | `tests/e2e/i18n.spec.ts` covers keyboard activation, `lang`, persistence and 360 px overflow. Full browser execution requires the frontend dependency tree. |

## Service/data contract

FastAPI endpoints:

```text
GET  /v1/profile/preferences/locale
PUT  /v1/profile/preferences/locale
POST /v1/profile/preferences/translation-reports
```

Supported BCP 47-compatible codes:

```text
en
si-LK
ta-LK
```

Persistent records:

```text
profile_preferences
translation_missing_reports
```

The report store deliberately excludes prompts, document bodies, task titles and other raw student content.

## AI locale boundary

Study Assistant providers receive the requested locale explicitly. The server validates generated explanatory fields rather than citations/source labels. This prevents a response containing only a translated heading from being labelled as Sinhala/Tamil while preserving exact technical/source text.

A failed language validation does **not** regenerate indefinitely or silently switch the interface. The structured response reports English as `response_locale` and sets `locale_fallback=true`; the UI discloses that condition in the selected interface language.

## Translation quality workflow

`docs/i18n-glossary.md` defines terminology guidance. `docs/i18n-review-workflow.md` defines `draft → developer_reviewed → native_review_required → approved` review states. `docs/i18n-review-fixtures.json` records high-risk strings that require native-speaker semantic sign-off.

Automated script/key validation is **not** represented as native-speaker certification. Native review remains a manual release-quality gate for Sinhala/Tamil wording.

## Verification commands

```bash
python -m pytest apps/api/tests -q
python -m compileall -q apps/api/app
npm run check:imports
node scripts/check-i18n.mjs
node scripts/check-pseudo-localization.mjs
```

A TypeScript syntax-transpilation pass is also run using the installed TypeScript compiler over `src/` and `tests/` without relying on project `node_modules`.

The repository additionally contains:

```text
src/i18n/i18n.test.ts
tests/e2e/i18n.spec.ts
```

for Vitest and Playwright coverage when the frontend dependencies are available.

## Environment limitation recorded for this build

A clean `npm ci --ignore-scripts --no-audit --no-fund` was attempted in the artifact environment but the package download hit the environment transport timeout before completion. Therefore this verification record does **not** claim a fresh pass for ESLint, full `tsc --noEmit`, Vitest, Next production build or Playwright. The incomplete `node_modules` directory is removed before packaging.

## Final executable results for this artifact

```text
FastAPI/backend regression tests       76 / 76 PASS
Python compilation                     PASS
Local frontend imports                 636 / 636 PASS
i18n catalog contract                  615 keys × 3 locales PASS
Pseudo-localisation                    615 / 615 messages PASS
TS/TSX syntax transpilation            212 / 212 files PASS
Profile locale HTTP smoke: PUT         HTTP 200
Profile locale HTTP smoke: GET         HTTP 200
Missing-key report HTTP smoke          HTTP 200
```

The backend regression count includes DOC-F08, DOC-F09, DOC-F18, DOC-F19 and DOC-F22 tests together.
