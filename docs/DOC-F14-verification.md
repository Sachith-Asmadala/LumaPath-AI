# DOC-F14 verification

## Acceptance criteria

- **AC1** Manual project creation and analysis require no external connection.
- **AC2** The normalized future repository-snapshot contract reports languages/topics/activity/completeness with collection timestamps, without creating an external connection.
- **AC3** README, tests and documentation gaps generate evidence-linked completeness indicators and recommendations.
- **AC4** Role skills are separated into demonstrated and `not_demonstrated`; the latter is explicitly not an ability judgment.
- **AC5** Factual descriptions are editable and only use project description plus recorded observable metadata.
- **AC6** Revocation rejects refresh with HTTP 409; imported repository data and its derived analysis can be deleted independently of the manual project.

## Automated coverage

`apps/api/tests/test_portfolio.py` covers manual/public-style projects, normalized explicitly selected private-repository snapshots, transparent scoring, role-skill evidence mapping, factual description editing, stale snapshots, empty repositories, renamed repositories, revocation, imported-data deletion, rate limiting, token separation, unsafe-link rejection, disabled-by-default repository ingestion, stale-after-revocation behavior and ownership denial.

`tests/e2e/portfolio.spec.ts` covers the primary manual UI flow: create → analyse → inspect skill evidence → edit factual description → accept recommendation.

## Deliberate non-claims

DOC-F14 does not authenticate to GitHub/Jira, read any repository by itself, create OAuth tokens, store source-control credentials, modify repository settings, push code, or infer contribution quality from commit counts.

## Final executable verification

- Portfolio-specific backend tests: **18/18 passed**.
- Complete FastAPI regression suite (DOC-F08/F09/F18/F19/F22/F14): **94/94 passed**.
- Python compilation: **passed**.
- Local frontend import graph: **659/659 imports resolved**.
- Internationalisation contract: **708 keys × 3 locales passed**.
- Pseudo-localisation: **708/708 messages passed**.
- TS/TSX syntax transpilation with the available TypeScript compiler: **224/224 files passed**.
- HTTP smoke: manual project create `201`, manual analysis `200`, trusted snapshot import `201`, repository analysis `200`, cross-owner read `403`, revoke `200`, refresh after revoke `409`, imported-data delete `200`.

A clean npm dependency installation was attempted so ESLint, semantic TypeScript checking, Vitest, the Next production build and Playwright could run. The environment transport timed out before the dependency tree completed. Therefore those dependency-backed commands are included for local/CI execution but are **not** claimed as freshly passing in this verification record.
