# DOC-F09 verification — Document Intelligence

Backlog: **DOC-F09**  
Sprint: **S1 Learning Foundations**  
Due: **2026-10-16**

## Acceptance criteria trace

| AC | Implementation | Automated evidence |
| --- | --- | --- |
| AC1 | Multipart upload validates size/MIME/magic bytes, private random storage, durable `queued/processing/ready/failed` state | `test_ac1_supported_pdf_reaches_visible_queued_then_ready_state` |
| AC2 | PDF/PPTX/DOCX/TXT extraction preserves page/slide/paragraph/section refs; summary/outcomes require refs | `test_ac2_pdf_summary_and_learning_outcomes_have_page_references`, `test_pptx_and_docx_preserve_slide_or_paragraph_references` |
| AC3 | Date candidates are always unconfirmed and must be explicitly confirmed before planner creation | `test_ac3_dates_are_unconfirmed_and_cannot_create_task_until_confirmed` |
| AC4 | Flashcard/quiz sets are structured, editable and source-grounded before approval | `test_ac4_flashcards_and_quiz_are_structured_editable_and_source_grounded` |
| AC5 | Study-time/planner actions require review, start time, capacity fit and conflict checks | `test_ac5_study_time_action_requires_review_and_planner_validation` |
| AC6 | Unsupported, corrupt, oversized and encrypted inputs fail with safe actionable outcomes | `test_ac6_rejects_unsupported_corrupt_and_oversized_files`, `test_corrupt_and_encrypted_pdf_fail_safely_with_actionable_state` |

## Additional risk coverage

- cross-student document access and planner context denial;
- prompt-injection-like document text treated as untrusted content;
- per-owner duplicate upload deduplication;
- deletion of private source plus derived rows;
- bounded retry with persistent attempt count;
- DOC-F08 regression suite remains green.

## Verification performed in this build

- `pytest -q apps/api/tests` -> **33 passed** (DOC-F08 + DOC-F09 combined, including HTTP multipart/ownership smoke coverage).
- `python -m compileall -q apps/api/app` -> passed.
- `npm run check:imports` -> **576 local imports resolved** at the integration checkpoint.
- TypeScript/TSX syntax transpilation -> **183/183 files passed** at the integration checkpoint.

Full dependency-backed ESLint/Vitest/Next build/Playwright execution requires the npm dependency tree. This environment does not contain the local `node_modules` tree, so those commands are included in the repository but are not falsely reported as executed here.

## Production adapter boundaries

The story is complete for the competition prototype, with two deliberately replaceable infrastructure adapters:

1. `LocalPrivateObjectStorage` -> production private S3/R2/GCS bucket with encryption/access policy.
2. `ThreadPoolDocumentJobDispatcher` -> durable Celery/RQ/SQS/managed queue.

The API, persisted state model, validation, extractors and frontend do not depend on a specific provider.
