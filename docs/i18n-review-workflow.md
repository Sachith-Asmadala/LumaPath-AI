# Translation review workflow

DOC-F22 establishes a review workflow; automated checks do **not** certify linguistic quality.

## Status model

Translations move through these review states outside the runtime catalog:

1. `draft` — initial translation produced during implementation.
2. `developer_reviewed` — key meaning, placeholders, technical terms and UI context checked by the engineering team.
3. `native_review_required` — queued for a fluent Sinhala/Tamil reviewer.
4. `approved` — reviewer has checked meaning in context and the rendered narrow/wide layouts.

The current competition catalog is engineering-reviewed and still requires named native-speaker sign-off before it should be described as linguistically certified.

## Reviewer checklist

For every high-risk/core string, the reviewer checks:

- semantic equivalence rather than word-for-word similarity;
- no change to permissions, ranking or feature availability;
- technical terms/source quotations remain accurate;
- placeholders such as `{count}`, `{date}` and `{task}` are preserved;
- tone is clear and non-judgmental;
- dates/numbers are understandable in context;
- buttons remain action-oriented;
- screen-reader label communicates the same action as visible text;
- 360 px layout does not hide critical content.

## Change procedure

1. Change the English source only with a stable message key where possible.
2. Update all locale files in the same pull request.
3. Run `npm run check:i18n` and `npm run check:pseudo`.
4. Add/refresh representative review fixtures.
5. Obtain native review for changed high-risk strings.
6. Record reviewer/date/revision in the fixture manifest.
7. Increment `TRANSLATION_VERSION` for a reviewed resource release.

## Fallback policy

A missing translation always falls back to English. AI output that fails requested-language validation also falls back to English with an explicit disclosure. No workflow is hidden or disabled because a localized string is missing.
