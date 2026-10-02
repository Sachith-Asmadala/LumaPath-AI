# DOC-F08 Verification — Context-Aware Study Assistant

## Acceptance criteria mapping

| AC | Integrated behavior | Automated coverage |
|---|---|---|
| AC1 | Authorised module context can produce a structured concept explanation without inventing course requirements. | `test_ac1_concept_explanation_is_tied_to_authorised_module` |
| AC2 | Revision plans and quizzes return typed, editable blocks/actions. | `test_ac2_revision_plan_and_quiz_are_structured_and_editable` + frontend domain test |
| AC3 | Assignment breakdown actions remain proposals until server approval and frontend review. | `test_ac3_assignment_breakdown_requires_review_before_task_creation` + Playwright flow |
| AC4 | Today's suggestion considers active risk, deadline, planning capacity and current goal and returns `why_this`. | `test_ac4_today_suggestion_uses_deadline_capacity_and_goal` |
| AC5 | Invalid provider output is repaired once then rejected; invalid edited actions are blocked before save. | `test_ac5_invalid_provider_output_is_rejected_and_never_saved`, `test_edited_action_over_capacity_is_rejected_before_save` |
| AC6 | Missing/foreign context fails closed and produces no fabricated response. | `test_ac6_cross_user_reference_is_denied_and_missing_context_is_clear`, `test_empty_context_does_not_fabricate_a_module` |

## Additional risk verification

- Prompt-injection-like material is treated as untrusted data and stripped before provider context.
- Provider timeout and unexpected provider errors return safe failures and persist nothing.
- Raw user prompts are not persisted; only SHA-256 digests are stored.
- Durable SQLite storage survives repository re-open and still excludes raw prompt text.
- Assistant audit events contain safe metadata only.
- Approval validates ownership, proposal identity, capacity, dates, source deadline and planner overlap.
- The per-student rate limiter is unit-tested and returns HTTP 429 when the window is exhausted.
- Same-origin Next.js proxy prevents direct browser coupling to the FastAPI host and sends `Cache-Control: no-store`.

## Commands verified in this implementation workspace

```bash
PYTHONPATH=. python3 -m pytest apps/api/tests -q
python3 -m compileall -q apps/api/app apps/api/tests
node scripts/check-local-imports.mjs
```

Latest backend result: **17 passed**.

The TypeScript/TSX source was also syntax-transpiled with the available TypeScript compiler across `src` and `tests`: **173 files passed**.

## Environment limitation

A fresh `npm ci` could not complete in the implementation environment because external package download access was unavailable. Therefore the full dependency-backed commands (`npm run lint`, `npm run typecheck`, Vitest, Next.js production build, and Playwright browser execution) were not falsely reported as passing here. The repository contains the new unit/E2E coverage so those commands can run normally in CI or a machine with dependencies available.
