# DOC-F09 — Document Intelligence

## Purpose

Document Intelligence turns owner-authorized PDF, PowerPoint, DOCX and UTF-8 TXT study files into grounded study material and reviewable actions. It never executes instructions contained in uploaded text and never writes extracted dates directly into the planner.

## Primary flow

1. `POST /v1/documents` validates size, extension, declared MIME and magic bytes.
2. The source is stored under a random private filename outside the Next.js public tree.
3. ClamAV is used when `clamscan` is available. If scanning is required but unavailable, the upload fails closed.
4. A durable document row is created as `queued` and the job dispatcher schedules processing.
5. Processing moves through `processing` and then `ready` or `failed`.
6. Extractors preserve page/slide/paragraph/section locations.
7. Separate structured analyzers produce summary, learning outcomes, date candidates, study-time estimate, flashcards, quiz questions and proposed actions.
8. Planner actions remain proposals until the student edits/reviews them and calls the approval endpoint.
9. The server re-validates ownership, source references, date confirmation, planning capacity and planner conflicts before approval.
10. `DELETE /v1/documents/{id}` removes the private source and all derived chunks/results/actions through the same owner-scoped operation.

## Supported formats

| Format | Validation | Location references |
| --- | --- | --- |
| PDF | `%PDF-` magic + parser validation | Page |
| PPTX | ZIP signature + PowerPoint package structure | Slide |
| DOCX | ZIP signature + Word package structure | Paragraph range |
| TXT | UTF-8 + binary/NUL rejection | Section |

Scanned-image OCR and arbitrary handwritten OCR remain out of scope. A PDF with no extractable text fails with an actionable message rather than invented content.

## API

- `POST /v1/documents` — multipart upload, returns a document record (`202`).
- `GET /v1/documents` — owner-scoped private document list.
- `GET /v1/documents/{document_id}` — status/results polling.
- `POST /v1/documents/{document_id}/retry` — bounded retry for failed processing.
- `POST /v1/documents/{document_id}/actions/approve` — review-gated action approval.
- `DELETE /v1/documents/{document_id}` — delete source and derived data together.

The Next.js app proxies these routes through `/api/documents...`; browser code never receives the private storage path.

## Data model

Runtime SQLite tables:

- `documents`
- `document_chunks`
- `document_analysis_results`
- `document_proposed_actions`
- `document_audit`

See `database/schemas/documents.sql` for the reference schema.

## Security and privacy controls

- owner ID is checked on every read/retry/approve/delete operation;
- a known document owned by another student returns a denial rather than its data;
- source filenames are not used as storage names;
- private storage is outside `public/` and no file-download/static route is exposed;
- SHA-256 supports per-owner duplicate detection without cross-user deduplication leakage;
- source text is treated as untrusted content; instruction-like strings are never executed;
- dates remain `official_status=unconfirmed` and require explicit confirmation before planner creation;
- uploads are rate limited;
- file retention defaults to 30 days and expired sources plus derived records are deleted together;
- audit metadata contains IDs/event types, not document content;
- the development identity boundary remains `X-Luma-Student-Id` until the production auth story replaces it with a verified JWT/session principal.

## Malware scanning

`DOCUMENT_REQUIRE_MALWARE_SCAN=false` allows a development environment without ClamAV and records `scan_status=unavailable`.

For a release environment, install ClamAV and set:

```env
DOCUMENT_REQUIRE_MALWARE_SCAN=true
```

If ClamAV is required but not available, the source is removed and the request fails safely.

## Background processing

The prototype uses `ThreadPoolDocumentJobDispatcher`. The persisted state machine is independent from that implementation so a durable queue can replace it later. See `apps/worker/jobs/document_processing/README.md`.

## Configuration

```env
DOCUMENT_STORAGE_PATH=./apps/api/data/private-documents
DOCUMENT_MAX_UPLOAD_BYTES=15728640
DOCUMENT_RETENTION_DAYS=30
DOCUMENT_REQUIRE_MALWARE_SCAN=false
DOCUMENT_WORKER_THREADS=2
DOCUMENT_MAX_PROCESSING_ATTEMPTS=3
DOCUMENT_UPLOADS_PER_MINUTE=8
```

## Failure behavior

- unsupported extension -> 422 with supported formats;
- MIME/signature mismatch -> 422;
- oversized file -> 422 with maximum size;
- corrupt Office/PDF -> failed processing state or upload rejection where detectable;
- encrypted PDF -> failed state with password-removal guidance;
- image-only PDF -> failed state explaining OCR is outside scope;
- worker/parser failure -> safe generic failure with retry path;
- missing/cross-owner document -> 404/403 without data leakage;
- unconfirmed date/capacity conflict/planner overlap -> action approval rejected, nothing is added.

## Tests

`apps/api/tests/test_documents.py` covers:

- queued/processing contract;
- PDF page references;
- PPTX slide references;
- DOCX paragraph references;
- date confirmation;
- editable flashcards/quiz persistence;
- planner validation;
- unsupported/corrupt/oversized/encrypted files;
- owner isolation;
- instruction-like uploaded text;
- duplicate uploads;
- retry limits/attempt state;
- source + derived deletion.

Frontend domain tests are in `src/features/documents/domain/documents.test.ts`; the Playwright primary-flow test is `tests/e2e/documents.spec.ts`.
