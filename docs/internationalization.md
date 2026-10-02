# LumaPath internationalisation (DOC-F22)

## Supported interface locales

LumaPath currently supports these BCP 47-compatible interface locale codes:

| Code | Language | Runtime fallback |
| --- | --- | --- |
| `en` | English | — |
| `si-LK` | Sinhala (Sri Lanka) | English |
| `ta-LK` | Tamil (Sri Lanka) | English |

Translation resources are versioned with `TRANSLATION_VERSION` in `src/i18n/config.ts`. The current resource version is `2026-10-02.3`.

The interface locale is intentionally separate from the student's **learning-resource language**. Changing the interface locale must not change permissions, task ranking, recommendations, feature availability, planner state, or saved academic data.

## Runtime architecture

`LocaleProvider` is the single presentation-layer locale boundary. It provides:

- stable message-key resolution;
- English fallback for missing translated keys;
- a final human-readable `Translation unavailable` fallback instead of exposing a raw message key;
- `Intl.DateTimeFormat` and `Intl.NumberFormat` helpers;
- persisted profile preference synchronization;
- `<html lang>` updates for assistive technology;
- an `aria-live` language-change announcement;
- privacy-safe missing-key reporting.

The server profile preference is authoritative once the student identity is known. `localStorage` is only a fast startup/offline cache.

## Profile contract

FastAPI exposes:

- `GET /v1/profile/preferences/locale`
- `PUT /v1/profile/preferences/locale`
- `POST /v1/profile/preferences/translation-reports`

The locale store is owner-scoped. Missing-translation reports contain only the locale, stable message key and translation-resource version. They must never include task text, prompts, document contents or other student material.

## Locale-neutral API rule

Domain APIs should return locale-neutral values whenever possible:

- timestamps as ISO 8601;
- durations as numeric seconds/minutes;
- numeric scores as numbers;
- stable enums/status codes;
- source/user-authored titles exactly as stored.

Dates, times and numbers are formatted in the frontend. User-authored/source quotations are not silently translated because doing so could change academic meaning.

## AI response contract

Study Assistant requests explicitly contain `locale`.

Responses declare:

- `requested_locale`;
- `response_locale`;
- `locale_fallback`.

Non-English model output is script-validated before it can be represented as Sinhala or Tamil. If validation fails, LumaPath keeps the selected interface locale but clearly labels the assistant response as an English fallback. Technical terms and source quotations can remain in their original language and therefore do not need to match every target-script character.

Uploaded/source document content remains untrusted data and is never interpreted as a locale/system instruction.

## Missing-key behavior

A missing `si-LK` or `ta-LK` key resolves to English. If the English key is also unavailable, the UI renders the translated equivalent of `Translation unavailable`; it never shows a raw identifier such as `planner.unknown.key`.

Missing-key reports are deduplicated on the server and can be triaged using the translation version.

## Accessibility and layout

The localization layer preserves the existing design system rather than maintaining language-specific layouts. Key accessibility rules are:

- native buttons, links, form controls and headings remain keyboard operable;
- translated accessible names are used on core workflow controls;
- `<html lang>` follows the selected locale;
- script text uses system/Noto-compatible fallbacks and increased readable line height;
- text containers permit wrapping rather than truncating critical instructions;
- reduced-motion behavior remains independent of language;
- no locale changes color contrast, permissions or feature visibility.

Playwright coverage checks locale switching via keyboard, persistence, core translated navigation and narrow-width overflow.

## CI checks

`npm run check:i18n` verifies key parity, placeholders and representative Sinhala/Tamil script fixtures.

`npm run check:pseudo` expands the English catalog while preserving placeholders to expose layout assumptions.

Both checks run before normal lint/type/test/build verification.
