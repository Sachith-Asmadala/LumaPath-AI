# Integrated prototype scope

## Audit

| Area | Before this extension | Decision |
| --- | --- | --- |
| Runtime / persistence | Next.js App Router, React context/reducer, localStorage | Extend the shared store and migrate old local data. |
| Auth / database / APIs / billing | Prototype entry forms; no backend, accounts, database, API routes, or payment integration | Keep browser-local. No simulated payment, premium entitlement, or security claims. |
| Onboarding | Academic profile, DevOps selection, preferences; incomplete drafts lost on reload | Add optional knowledge/interests/certificate preference and resume drafts. |
| Assessment / skill gaps | 12 weighted DevOps questions, six category scores, prerequisite analysis | Reuse scoring; preserve drafts, attempts, and completed learning on retake. |
| Roadmap / resources | Nine DevOps stages; local catalog and full free path only for Docker | Fill the free-path gaps using centralized curated learning sources. |
| Learning / projects | Scheduled tasks; no central learning view or project submissions; paid path cannot verify | Derive learning progress from existing tasks, connect sources and project evidence, extend verification. |
| Evidence / certificates | Seed evidence with demo verification; no external credential entry or earned record | Extend evidence; external credentials remain self-reported. Local completion records require learning, project submission, and a passing assessment. |
| Reassessment / readiness | Docker latest result only; readiness includes seeded values | Preserve attempt history; calculate assessed-student readiness from observable progress. Keep the clearly labelled sample scenario. |
| Student management | Tasks, planner, deadline import, capacity, recovery, notifications | Reuse these rather than create another task model. |
| Wellbeing | Optional Life Load factors/note and student-controlled recovery | Add clear-data controls and cautious, local support messaging. No diagnosis. |
| UI | Existing responsive dashboard, components, theme, Motion | Add integrated views and links using the existing design. |
| Multiple careers / production subscriptions / certified identity | Missing | Deferred: prototype fully supports DevOps only. Premium is a product preview, not purchasable access. |

All completion actions are learner-reported unless they are scored by a local question bank. Local records are not tamper-proof credentials or publicly verifiable certificates. No backend, migrations, credentials, or new dependencies are introduced.

## Implementation report

1. **Already present:** landing/access pages, onboarding, baseline scoring, skill gaps, nine-node DevOps roadmap, Docker recommendations, scheduler, tasks, Life Load/recovery, evidence, notifications and responsive workspace.
2. **Partial flows repaired:** unfinished onboarding and assessment now resume; baseline retakes preserve scheduled work; paid learning includes practice/project/verification stages; all roadmap stages have an open path.
3. **Implemented:** integrated Learning workspace, saved resources, career goal, project evidence, external certificate records, conditional downloadable local completion records, assessment history and repeat knowledge checks.
4. **Modified files:** shared types/seed/adapter/onboarding; state reducer/provider; roadmap/readiness/recommender/scheduler/reassessment helpers; onboarding/assessment/resource/free-path/planner/overview/evidence/settings screens; navigation/command palette; career nodes/readiness/completion cards; assistant and capacity check-in; journey and domain tests.
5. **Created files:** `src/lib/demo-data/devops-learning.ts`; domain `learning.ts`, `learning-assessment.ts`, `path-assessments.ts`, `contextual-reply.ts`, `learning-integration.test.ts`; `src/app/(workspace)/learning/page.tsx`, `plans/page.tsx`, `career-path/[skillId]/verify/page.tsx`; `features/career/components/skill-verification.tsx`; `features/learning/components/learning-records.tsx`; `tests/e2e/learning-controls.spec.ts`; this report.
6. **Schema:** additive TypeScript fields in the existing demo state for attempts/draft, bookmarks, goal, records, task learning references/timestamps, optional preferences and evidence metadata. Older saved state gets defaults. No database or migrations.
7. **APIs:** none added or changed. No external AI, credentials, LMS scraping, payments or runtime provider requests.
8. **UI:** Learning and Plans are integrated with the existing sidebar, planner, career nodes, Evidence Passport and Settings; existing typography, cards, theme and Motion are reused.
9. **Free/Premium:** the prototype remains fully usable for free. Plans describes possible Premium benefits and clearly states they are planned, not purchasable. No fake subscription or client-only access enforcement is introduced.
10. **Assessments:** reuse the 12-question weighted baseline and five Docker questions; add three deterministic checks for each other DevOps stage. Actual answers, categories, scores and timestamps are saved. Passing local checks establishes verification; task and evidence buttons cannot bypass it.
11. **Roadmap/recommendations:** prerequisite order remains centralized. Retakes keep verified achievements. Recommendations use level, budget, time, format, certificate preference and language; at most two catalog recommendations accompany an independent free path.
12. **Resources:** curated source metadata remains outside UI components. All nine stages have documentation, practice, a portfolio exercise and assessment. Docker retains its video option. Links open safely in another tab. No watch tracking, fabricated ratings or live-price claims.
13. **Certificates:** external records are explicitly self-reported and add no automatic readiness points. Local records require all scheduled stages, a valid project URL and passing attempt. Download is JSON; there is no public verification URL, PDF, accreditation or tamper-proof claim. Removing project evidence removes dependent local records.
14. **Student management:** learning progress derives from the existing scheduled tasks; completions update those same tasks. Goals follow roadmap milestones. Existing academic scheduling, deadline protection, notifications and capacity logic are reused.
15. **Wellbeing:** optional notes stay browser-local; Settings clears factors/notes without moving tasks. Assistant explanations use structured planning state, never quote private notes, and do not transmit them. Explicit crisis phrases show human/emergency-support guidance. This small local safeguard is not a comprehensive crisis-detection service or medical feature.
16. **Tests:** added learning eligibility/bypass/certificate/privacy/domain coverage; updated retained-work and recommendation expectations; extended the full Playwright journey through project submission, verification and record download; added onboarding resume coverage.
17. **Verification:** results are recorded below after execution. Workspace iCloud offloading and inconsistent installed Vite files required an isolated `/tmp/lumapath-verification` copy with clean dependencies from the existing lockfile. This did not change package versions or workspace dependencies.
18. **Configuration:** no new environment variables or services. Existing npm commands and optional `PLAYWRIGHT_BASE_URL` remain sufficient.
19. **Limitations:** browser-local single-student prototype, DevOps only, English curated resources, short illustrative knowledge checks, learner-reported learning/projects, illustrative Docker course prices, sample academic scenario. No backend authorization, multi-user isolation, payment processing, premium entitlement or public certificate verification. Those require a production backend and are deliberately outside this request.

### Verification results

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 59 tests passed across 15 files.
- `npm run build`: production build passed; 26 static pages and three dynamic skill routes generated.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3003 npm run test:e2e`: all 26 tests passed against the production preview.
- Browser flow covered registration → resumed onboarding → baseline → gaps → roadmap → free/credential selection → planner → learning stages → project → reassessment → earned record download → history → reset.
- Additional UI coverage: career goal, external certificate save/remove, private check-in deletion, Plans navigation, and eight populated Learning viewport/theme combinations.
- 40 further checks across Learning, Plans, Evidence and Settings at 360/390/430/768/1440px in both themes: no horizontal overflow or page errors. Representative mobile/desktop screenshots were inspected.

Checks ran in the isolated copy described above because the workspace’s installed dependency files were inconsistent and iCloud had offloaded source files. Dependencies were installed from the unchanged lockfile. Original workspace dependencies and the existing development server were left in place.
