# Reorganization Safety Report

This refactor was intentionally limited to project organization. Product behavior was preserved.

## What changed

- Moved browser-local demo data to `src/data/demo`.
- Moved shared prototype state to `src/state`.
- Moved LMS adapters to `src/integrations/lms`.
- Moved brand configuration to `src/config`.
- Moved feature-specific deterministic logic from the old generic `src/lib/domain` folder into each feature's `domain` folder.
- Moved Copilot and workspace-only shared controls into their owning feature folders.
- Moved the broad cross-domain invariant test to `src/tests/unit`.
- Removed two unreferenced duplicate backup files ending in ` 2.tsx`.
- Removed generated Playwright `test-results` files and added generated test folders to `.gitignore`.
- Added a dependency-free local-import checker and CI verification workflow.

## Safety checks performed

1. **Route preservation:** the original and organized projects both contain 32 Next.js route/layout/loading files, with identical paths.
2. **Behavior-preservation comparison:** 150 TypeScript/TSX source files were compared after normalizing local import module paths. There were **0 non-import source-content changes**.
3. **Import integrity:** 520 local imports across `src` and `tests` resolve successfully after the move.
4. **TypeScript syntax parse:** 161 TypeScript/TSX files were parsed with the TypeScript compiler parser with **0 syntax diagnostics**.
5. **Dependency declaration check:** all external packages imported by source/tests/scripts are declared in `package.json`; **0 mismatches** were found.
6. **Historical regression evidence:** the existing project documentation records successful lint, typecheck, unit, production-build, and Playwright checks before this structural move.

## Full runtime verification

The sandbox used for this reorganization could not complete `npm ci` because one required registry artifact was unavailable through the sandbox package cache/network path. For that reason, dependency-based commands were not re-run in this environment.

The repository now contains:

```bash
npm run check:imports
npm run verify
npm run verify:full
```

and `.github/workflows/ci.yml` automatically runs install, structural checks, lint, typecheck, unit tests, production build, and Playwright E2E tests on GitHub.

Before replacing the current stable branch, use a branch/PR and allow CI to complete successfully. Do not delete the original branch until CI and a quick manual demo pass are green.

## Recommended safe merge procedure

```bash
git checkout -b chore/safe-project-reorganization
npm ci
npm run verify:full
npm run dev
```

Manually verify the competition journey:

1. Landing → register/login prototype flow.
2. Onboarding → baseline assessment → results.
3. Skill gap → career path → resource/free path.
4. Tasks → capacity check-in → deadline risk.
5. Next Best Action → planner → recovery/replanning.
6. Learning progress → project evidence → reassessment.
7. Evidence Passport → readiness → intelligence/opportunity actions.
8. Settings/reset and page refresh persistence.

Only merge after these checks pass.
