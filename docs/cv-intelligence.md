# CV Intelligence — DOC-F15

## Purpose

DOC-F15 adds an owner-scoped CV review workspace at `/cv`. It helps a student inspect a CV for structure, readability, target-role evidence and ATS-oriented risks without creating employers, dates, qualifications, metrics or achievements.

The workflow is deliberately **review-first**:

1. Upload PDF/DOCX/TXT or paste text.
2. Choose the target role and an explicit 7/30/90-day retention period.
3. Review and correct parsed sections.
4. Confirm those sections as the analysis source of truth.
5. Run deterministic checks.
6. Edit, accept or dismiss individual draft suggestions.
7. Copy/export accepted drafts, or delete source/analysis independently.

## Privacy and storage

CV content is treated as personal data.

- Uploaded files use the same hardened validation primitives as DOC-F09: size, extension, browser MIME, magic bytes and optional ClamAV scanning.
- Files are stored in private object storage under random names outside `public/`.
- Pasted CV text is stored only in the owner-scoped CV record.
- The CV module does not call an LLM or external model provider, so CV content is not sent to a model or third party by this story.
- No training/reuse fields or third-party sharing path exist in the CV schema.
- Source retention must be selected: 7, 30 or 90 days. Expired CV records and derived analysis are purged together.
- The student may delete just the original source, just the analysis, or the complete CV record at any time.

Production authentication should replace the current prototype `X-Luma-Student-Id` development identity header with a verified session/JWT principal.

## Supported sources

- PDF
- DOCX
- UTF-8 TXT
- Paste-in text

PPTX is intentionally not a CV format for this story. OCR for scanned/image-only CVs is not added by DOC-F15.

If a supported file passes validation but parsing fails, its private original remains unchanged and the record returns `parse_failed` plus an actionable error. Analysis is blocked until usable sections exist.

## Parsed sections

The deterministic parser recognizes common headings and returns a reviewable structure:

- Contact
- Summary
- Education
- Experience
- Projects
- Skills
- Certifications
- Other

Analysis cannot run until the owner confirms the parsed representation. User corrections replace the parsed representation used by analysis; they do not alter the original uploaded file.

## Analysis rules

`analysis_version = 2026-10-v1`

The analyzer uses deterministic checks for:

- standard section presence;
- contact email detectability;
- approximate CV word length;
- long-sentence readability;
- repeated first-person phrasing;
- student-appropriate Experience/Projects visibility;
- target-role skill terms from the DOC-F14 role taxonomy;
- ATS text/heading risks;
- prompt-injection-like text as untrusted CV content.

An uploaded file also receives a low-severity formatting caveat because text extraction cannot prove that every ATS will interpret columns, graphics or text boxes correctly.

The ATS report is explicitly not a recruiter/ATS outcome prediction and does not promise interview or hiring success.

## Evidence model

Role skills use three states:

- `cv_evidenced`: matching evidence is visible in the confirmed CV text.
- `portfolio_evidenced`: matching evidence exists in the student's existing DOC-F14 Portfolio analysis but is absent from the CV.
- `not_demonstrated_in_cv`: no matching evidence is visible in either source used by this analysis.

`not_demonstrated_in_cv` describes the document evidence only. It is never a judgment that the student lacks the skill.

Portfolio-derived wording always keeps an evidence reference and its existing verification status (`self_reported` or `observed`). Manual Portfolio data is not silently upgraded to verified repository evidence.

The current prototype Student Profile backend only owns locale preference; career/profile details still live in the prototype client state. DOC-F15 therefore uses the explicitly selected target role as context but does **not** copy names, qualifications, employers or other client-only profile claims into generated wording. When SCRUM-13 exposes verified server-side profile evidence, it can be added behind the same evidence-reference contract.

## Suggestions

All generated items are stored as **drafts**. Two types exist:

- `wording`: deterministic wording based on existing target role, CV text or Portfolio evidence;
- `evidence_request`: a question asking the student for a verifiable result/scale/outcome.

The module never fills a missing achievement with a number. For an Experience statement without a measurable outcome, it asks a question such as “What result or scale can you verify?” and explicitly says to keep the statement factual if no metric exists.

The owner can edit every draft before `accepted` or `dismissed` status is stored.

## API

```text
POST   /v1/cv/documents/paste
POST   /v1/cv/documents/upload
GET    /v1/cv/documents
GET    /v1/cv/documents/{document_id}
PUT    /v1/cv/documents/{document_id}/sections
POST   /v1/cv/documents/{document_id}/analysis
POST   /v1/cv/documents/{document_id}/suggestions/{suggestion_id}
GET    /v1/cv/documents/{document_id}/export
DELETE /v1/cv/documents/{document_id}/source
DELETE /v1/cv/documents/{document_id}/analysis
DELETE /v1/cv/documents/{document_id}
```

The web client uses same-origin Next.js routes under `/api/cv/*`; the browser does not call the FastAPI origin directly.

## Export behavior

Export is plain text and never mutates the source. It contains:

1. the owner-confirmed CV sections;
2. a separate `ACCEPTED IMPROVEMENT DRAFTS` section;
3. a reminder to verify every factual claim.

This prevents an accepted draft from silently overwriting the student's original CV.

## Configuration

```env
CV_STORAGE_PATH=./apps/api/data/private-cv
CV_MAX_UPLOAD_BYTES=8388608
CV_REQUIRE_MALWARE_SCAN=false
CV_ANALYSES_PER_MINUTE=8
```

For a release environment with ClamAV available, set `CV_REQUIRE_MALWARE_SCAN=true` so uploads fail closed when scanning is unavailable.

## Operational notes

- `CV_STORAGE_PATH` must remain private and outside Next.js static assets.
- The Docker compose volume already covers `/app/apps/api/data`, including CV storage and SQLite.
- Expired rows are purged opportunistically by CV operations in this prototype. A production deployment should also schedule a periodic purge job.
- The analysis version is stored per snapshot so future rule changes do not silently rewrite past reports.
