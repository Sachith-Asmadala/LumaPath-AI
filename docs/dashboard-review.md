# Connected Overview review

LumaPath remains a Next.js 15.5 / React 19 application using the existing React context reducer, Motion, FullCalendar, React Flow, and UI components. No dependencies or state libraries were added. Existing routes, navigation, notification center, command palette, background graph, focus flow, and adapter interface remain in place.

## Behavior

- Overview pairs the main recommendation with DevOps Readiness, capacity with the Adaptive Day Plan, and deadline risk with a compact career pathway. Intelligence and compact progress follow.
- The recommendation retains its explanation sheet. The hero now shows time, risk, career impact, a factor-backed priority score, and clear primary/secondary actions.
- Capacity presets populate existing manual inputs. Applying them runs five explicit phases against the latest shared state. Risk updates precede schedule movement, which precedes recommendation replacement.
- Decision Pulse explains capacity, recovery, career, and intelligence updates across routes, then collapses 3.5 seconds after completion.
- Low capacity moves AWS to Thursday instead of dropping it. Stable block IDs and recorded previous times preserve movement continuity. Normal capacity restores standard blocks while preserving user-created and completed work.
- Recovery lowers database risk and reserves a focus window. On a low-capacity day it moves other flexible work and trims focus buffers to respect the available budget.
- Docker verification sequences verification, prerequisite availability, then readiness. Starting from the untouched scenario, readiness changes from 72 to 74. Repeated task/skill/evidence verification cannot award the same completion twice.
- Intelligence previews use the existing feed and opportunity actions. Verified Docker changes the preview to a CI/CD resource; adding it creates a shared task and planner block.
- The desktop floating Copilot is removed. The top bar, sidebar and command palette open the existing shared drawer; mobile retains the floating entry.
- Risk classifications use the shared four-level function. Counters and plan/path progress derive from shared state. Productive time and consistency begin at zero for this scenario and advance with activity; fabricated historical totals were removed. Analytics now charts scheduled hours from actual blocks.

## Files

New components:

- `src/features/dashboard/components/decision-pulse.tsx`
- `src/features/dashboard/components/mini-career-path.tsx`
- `src/features/dashboard/components/career-intelligence-preview.tsx`

New shared helpers and tests:

- `src/lib/demo-data/scenario.ts`: one scenario clock, offset dates and week labels.
- `src/lib/domain/dashboard.ts`: presets, phased adaptation, recovery and progress selectors.
- `src/lib/domain/dashboard.test.ts`: state and domain regression coverage.
- `tests/e2e/overview.spec.ts`: full Overview journey and 390px/820px reduced-motion checks.

Modified existing components:

- `src/app/(workspace)/overview/page.tsx`: hierarchy and responsive ordering.
- All eight original files in `src/features/dashboard/components/`: wording, presets, simplified hero, risk details, animated timeline, readiness feedback, explanation and progress.
- `src/components/layout/navigation.tsx`, `top-bar.tsx`: shared pulse, Copilot visibility and date labels.
- `src/components/motion/animated.tsx`, `page-transition.tsx`: decimal-safe counters, animated readiness, accessible outgoing pages.
- `src/components/ai-copilot/copilot-drawer.tsx`: current recommendation and schedule context.
- `src/features/career/components/career-skill-node.tsx`: reduced-motion layout handling.
- `src/features/planner/components/planner-calendar.tsx`, `task-editor-dialog.tsx`: scenario dates.
- `src/app/(workspace)/planner/page.tsx`, `analytics/page.tsx`, `career-path/page.tsx`: dates, shared metrics, pathway wording and totals.

Modified shared state/configuration:

- `src/lib/state/demo-provider.tsx`: phased actions, shared feedback, idempotent verification and consistent task completion.
- `src/lib/demo-data/types.ts`, `seed.ts`: movement history, scenario dates and consistent initial counters/risk.
- `src/lib/domain/planner.ts`, `priority.ts`: centralized dates, bounded low-capacity blocks and scores derived from supplied factors.
- `tests/e2e/demo-journey.spec.ts`: preserved regression journey using the new controls.
- `vitest.config.mts`: JSX transform for reducer tests.
- `playwright.config.ts`: bounded concurrency and a route-compilation timeout.

## Animation and responsive behavior

Motion animates recommendation replacement, stable timeline blocks, pathway edges, risk counters, the readiness ring and temporary system feedback. Reduced motion removes layout movement and pulse effects, shortens phase delays, and preserves readable status text. The original faint Student Context Graph remains unchanged. Mobile uses one column and prioritizes action, capacity, plan, risk and pathway; tablet uses two columns, and wide screens use a larger hero column. Exiting route content is inert to prevent duplicate accessible controls during transitions.

## Limitations

The existing adapter remains an in-memory deterministic scenario, with its single date in `demoScenario.date` (September 28, 2026). Reloading or Demo Reset restores seed data. Priorities, risks, opportunity matches and readiness are illustrative local rules; verification is not an institutional credential check. Career articles and opportunities are seeded examples, not live feeds. The Copilot explains local context and does not call an AI backend. The existing introductory Terraform unlock rule is retained alongside the Docker-to-CI/CD prerequisite.

## Manual review

1. On Overview select Low Capacity, then Update My Plan. Observe risk first, moved AWS next, and the new database recommendation last.
2. Open Why this?, inspect its six factors and score, then close it.
3. Expand Database Assignment and apply recovery. Confirm its reduced risk and reserved evening block.
4. Open View Full Path, verify Docker, and observe CI/CD/Terraform availability and +2 Readiness. Return to Overview to see 74%.
5. Add the CI/CD resource to the plan, then inspect Wednesday in Planner. Repeat the action to confirm there is no duplicate task.
6. Switch between Normal Day and Low Capacity; inspect the timeline, planner and weekly metrics. Check narrow mobile widths and OS reduced-motion mode.

## Validation

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 13 tests passed across two files.
- `npm run test:e2e -- --workers=1`: all four browser tests passed, including the original cross-route journey, the new recovery/readiness/intelligence flow, and 390px/820px reduced-motion checks with no browser runtime errors.
- `npm run build`: passed; all 15 static pages generated, including final lint and type validation.
- Desktop and mobile screenshots were inspected. The browser tests verify no horizontal overflow at the two responsive widths.

Testing also identified and fixed an overlapping explanation close button, duplicate accessible content during route exit animations, and a reduced-motion counter hydration mismatch.
