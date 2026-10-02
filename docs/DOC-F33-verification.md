# DOC-F33 Verification Notes

Acceptance coverage:

- **AC1:** comparison service returns shared and role-unique approved skills for 2–4 careers.
- **AC2:** duration uses reusable evidence, prerequisite-ordered remaining work and weekly capacity.
- **AC3:** free, low-cost and certification-focused routes expose cost metadata, assumptions and missing prices.
- **AC4:** recomputation appends a new immutable result; capacity/target changes do not mutate the prior snapshot.
- **AC5:** reusable evidence and overlapping completed pathway skills remain transferable when a switch draft is created.
- **AC6:** simulation/recompute never changes the active pathway; switch creates only a pending draft after explicit confirmation.

Risk-focused backend tests cover zero capacity, missing target dates, evidence credit, unknown certification prices, immutable results, student boundaries, explicit switch confirmation and active-pathway preservation.

The frontend route is `/career-compare`. It follows the existing LumaPath card/spacing/motion system and includes loading, empty, error, uncertainty, missing-data and explicit switch-confirmation states.

Full dependency-backed Next.js build/Playwright execution requires the repository's npm dependencies and lockfile. Repository-local import/i18n/pseudo checks can run without those dependencies.
