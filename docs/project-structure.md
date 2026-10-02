# LumaPath AI Project Structure

This structure keeps the current competition prototype behavior unchanged while making ownership explicit and keeping future backend expansion possible.

## Design rules

1. `src/app` owns Next.js routes only. Route folders were intentionally not moved during the reorganization.
2. `src/features/<feature>/components` owns UI that belongs to one product feature.
3. `src/features/<feature>/domain` owns deterministic business rules for that feature.
4. `src/components` is reserved for truly shared UI, layout, branding, animation, and public-page building blocks.
5. `src/data/demo` contains the browser-local prototype data model, seed data, scenario clock, and learning catalog.
6. `src/state` contains cross-feature application state. The current prototype still uses the existing reducer/context implementation.
7. `src/integrations` contains provider adapters such as the mock university LMS.
8. `src/config` contains stable application configuration such as brand metadata.
9. `src/lib` is intentionally small and only contains generic utilities that do not belong to a product feature.
10. Unit tests remain next to the domain they protect, except broad cross-domain invariants in `src/tests/unit`.
11. Playwright journeys remain in `tests/e2e`.

## Current structure

```text
LumaPath-AI/
├── public/
│   └── brand/
├── src/
│   ├── app/                         # Next.js routes; unchanged URLs
│   │   ├── (workspace)/
│   │   ├── assessment/
│   │   ├── login/
│   │   ├── onboarding/
│   │   └── register/
│   ├── components/                  # Shared/reusable presentation components
│   │   ├── brand/
│   │   ├── layout/
│   │   ├── motion/
│   │   ├── public/
│   │   ├── shared/
│   │   └── ui/
│   ├── config/
│   │   └── brand.ts
│   ├── data/
│   │   └── demo/                    # Browser-local prototype data + fixtures
│   ├── features/
│   │   ├── assessment/
│   │   │   └── domain/
│   │   ├── assistant/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── capacity/
│   │   │   └── domain/
│   │   ├── career/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── dashboard/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── evidence/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── focus/
│   │   │   └── components/
│   │   ├── intelligence/
│   │   │   └── components/
│   │   ├── learning/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── onboarding/
│   │   │   └── domain/
│   │   ├── planner/
│   │   │   ├── components/
│   │   │   └── domain/
│   │   ├── skills/
│   │   │   └── components/
│   │   ├── tasks/
│   │   │   └── domain/
│   │   └── workspace/
│   │       ├── components/
│   │       └── domain/
│   ├── hooks/
│   ├── integrations/
│   │   └── lms/
│   ├── lib/
│   │   └── utils.ts
│   ├── state/
│   │   └── demo-provider.tsx
│   └── tests/
│       └── unit/
├── tests/
│   └── e2e/
├── scripts/
│   └── check-local-imports.mjs
├── docs/
├── .github/workflows/
├── package.json
└── README.md
```

## Safety guarantees used for this reorganization

- All 32 Next.js route/layout/loading files were kept at the same route paths.
- Source logic was not rewritten; only local import module paths changed for moved files.
- A normalized source comparison confirmed no non-import TypeScript/TSX content changed across the reorganization.
- 520 local imports across `src` and `tests` resolved after the move.
- Unreferenced duplicate backup files with ` 2.tsx` suffixes were removed.
- Generated Playwright result files were removed and are now ignored.
- `npm run check:imports` provides a dependency-free structural guard for future moves.
- CI now runs import checks, lint, type checking, unit tests, production build, and Playwright E2E tests on repository changes.

## Future backend expansion

When a production backend is added, keep it separate from the working prototype instead of mixing server code into browser feature folders. A safe next step is:

```text
apps/
├── web/       # current Next.js application
├── api/       # future FastAPI modular backend
└── worker/    # future background jobs
```

Do that migration only after the current competition branch is stable and tagged, because moving the entire Next.js root into `apps/web` changes deployment/build configuration and is a larger risk than the source reorganization completed here.
