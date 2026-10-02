# Competition MVP v1.0 — frozen release candidate

Release identifier: **`1.0.0-competition`**. The public health contract and subtle workspace version identify this candidate. Use [the short competition guide](competition-demo.md) for startup, reset, presentation clicks, offline backup and judge-facing limitations.

## Release fixes

- Replaced outdated README architecture claims with the actual Next.js → server proxies → FastAPI → services/repositories → SQLite/private storage → workers architecture. Browser-local planning and future integrations are explicit.
- Production rejects development student/admin/curator identity headers. Both demo mutations return 404, and all synthetic CLI seeders reject production before writing data.
- Web health checks the backend and returns 503/degraded when unavailable. Health responses disclose release status/version, not configuration.
- Preserved the visual design; constrained dialog height for narrow/projector displays, hid Pro's institutional curator controls, corrected proposal-limit terminology, and made the competition banner reflect the actual current plan.
- Fixed pseudo-localisation corrupting interpolation placeholders; aligned existing assistant/HTTP test fixtures with current locale/entitlement contracts. Added missing async/PDF test dependencies. No broad new test suite or product module was added.
- Made the macOS launcher bind the frontend to localhost. Documented all API environment variables without modifying private `.env`.
- Excluded virtual environments, development caches, temporary databases, private uploads and generated outputs from release packaging. Intentional fixture sources remain included.

## Checks actually executed

- `npm ci`: successful, locked dependency installation; reported zero dependency vulnerabilities.
- `npm run verify`: passed import, i18n, pseudo-localisation, lint, typecheck, all **115 frontend tests**, and production build. Lint has **27 existing warnings and no errors**; stylistic warnings were not broadly refactored.
- Complete existing Python suite using Python **3.12.15**: **376 passed**. After the final demo-route lockout adjustment, the relevant **11 subscription/reset tests** passed again.
- Python `compileall`, shell `bash -n run.sh setup.sh`, and `git diff --check`: passed.
- Existing focused Playwright competition/subscription cases: **4 passed**. Includes actual preparation approval/handoff, comparison, repeated reset, corrupt storage, plan persistence, mobile pricing and useful upgrade states.
- Additional browser inspection: Overview, Planner, Opportunities, Career Compare, Pricing and Market Signals at **1366px and 390px** had no horizontal overflow, uncaught page errors or console warnings. The existing repeated-reset case ran at **1920×1080**. A simulated subscription failure showed no fabricated current plan.
- Static literal UI route audit: **45 route patterns**, no unresolved literal links.
- Production API identity/reset/plan-switch checks, all five seed-script guards, frontend production demo lockout, and healthy/degraded web health checks passed. No production seed database was created.

Cold Next.js development compilation caused early browser timeouts while other release checks ran concurrently. Warming routes and using a reset wait consistent with the endpoint timeout produced passing runs. Warm the demo once before a live presentation. One upstream Starlette/httpx deprecation warning remains in Python checks.

## Remaining boundaries

This is a competition release, not a public production authentication/billing rollout. Verified sessions, payment lifecycle, live institutional/LMS connectors and production operational hardening remain incomplete. Planner/capacity state remains partly browser-local. Fixtures can be synthetic; no employment/eligibility guarantees are made. No Docker build, cloud deployment or external integration was claimed as tested in this pass.

## Files changed in this release pass

Earlier competition-demo implementation files remain part of the candidate. This final pass changed:

| Area | Files |
| --- | --- |
| Documentation / environment / packaging | `README.md`, `.env.example`, `.gitignore`, `.dockerignore`, `docs/competition-demo.md`, `docs/competition-release.md`, `docs/monetisation.md`, `run.sh` |
| Version / checks configuration | `package.json`, `package-lock.json`, `apps/api/pyproject.toml`, `eslint.config.mjs`, `tsconfig.json`, `src/lib/release.ts` |
| API release boundaries | `apps/api/app/core/security.py`, `apps/api/app/main.py`, `apps/api/app/modules/subscriptions/router.py`, `src/app/api/health/route.ts` |
| Synthetic seed guards | `scripts/seed-data/seed-doc-f25-demo.py`, `seed-doc-f30-demo.py`, `seed-doc-f32-demo.py`, `seed-doc-f34-demo.py` |
| UI reliability / terminology | `src/components/layout/navigation.tsx`, `src/components/ui/dialog.tsx`, `src/components/public/landing-page.tsx`, `src/config/brand.ts`, `src/app/(workspace)/market-signals/page.tsx`, `src/features/dashboard/components/priority-explanation-sheet.tsx`, `src/features/competition/components/demo-controls.tsx`, `src/features/subscriptions/components/membership-page.tsx`, `src/features/subscriptions/entitlements.ts`, `src/i18n/core.ts` |
| Existing Python fixture alignment | `apps/api/tests/entitlement_helpers.py`, `test_career_scenarios.py`, `test_institutional_analytics.py`, `test_market_taxonomy.py`, `test_mentors.py`, `test_opportunity_readiness.py` |
| Existing frontend/browser fixture alignment | `src/features/assistant/domain/study-assistant.test.ts`, `tests/e2e/competition-demo.spec.ts`, `cv.spec.ts`, `evidence-passport.spec.ts`, `internships.spec.ts`, `portfolio.spec.ts` |

No further product features should be added to this frozen candidate; only verified release defects justify changes.
