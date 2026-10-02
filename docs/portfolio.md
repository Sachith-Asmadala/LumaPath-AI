# Portfolio intelligence · DOC-F14

DOC-F14 adds an owner-scoped portfolio workspace at `/portfolio` and a FastAPI domain under `/v1/portfolio`.

## Boundaries

The story **does not connect GitHub, Jira, GitLab or any other external account**. No OAuth flow is created and no access token is stored. Manual projects are fully supported without an integration.

A future explicitly authorised source-control connector may call the repository-snapshot ingestion contract after the student selects a repository. That contract accepts only normalized facts plus an opaque `authorization_reference`; the portfolio database intentionally has no access-token column. Ingestion/refresh HTTP routes are disabled unless `PORTFOLIO_INTEGRATION_INGEST_KEY` is configured and the trusted server-to-server caller supplies it.

## Project analysis

Completeness is deterministic and transparent:

| Signal | Points |
| --- | ---: |
| Clear description | 15 |
| Project link | 5 |
| Live demo | 10 |
| README | 20 |
| Automated tests | 20 |
| Documentation | 15 |
| Activity timestamp | 5 |
| Topics | 5 |
| Technology/language evidence | 5 |

The total is a **portfolio completeness score**, not a quality, ability, contribution or employability score.

Skill evidence is mapped against the target-role taxonomy. Manual claims are `self_reported`; future repository snapshots are `observed`. If no rule matches a skill, the state is `not_demonstrated`, which only means the selected project evidence does not currently show it.

Commit/activity volume is never used as a contribution-quality proxy.

## Repository snapshot lifecycle

A future connector may import one explicitly selected repository using scope `read_selected_repository_metadata`. The snapshot can include normalized languages, topics, activity timestamp, README/test/documentation flags, CI/container/IaC/Kubernetes/monitoring indicators and demo links already approved by the integration story.

- `active`: refresh snapshots may be accepted by the contract.
- `revoked`: refresh is rejected with HTTP 409.
- Imported facts remain private after revocation until the owner deletes them.
- Deleting imported data also deletes analysis snapshots, recommendations and skill evidence derived from that repository, while preserving the manual portfolio project.
- Snapshots older than 7 days are shown as stale.

## API

- `POST /v1/portfolio/projects`
- `GET /v1/portfolio/projects`
- `GET /v1/portfolio/projects/{project_id}`
- `PUT /v1/portfolio/projects/{project_id}`
- `DELETE /v1/portfolio/projects/{project_id}`
- `POST /v1/portfolio/projects/{project_id}/analysis`
- `POST /v1/portfolio/projects/{project_id}/recommendations/{recommendation_id}`
- `POST /v1/portfolio/projects/{project_id}/repositories/import-snapshot` (future authorised integration boundary; not called by DOC-F14 UI)
- `POST /v1/portfolio/projects/{project_id}/repositories/{repository_id}/refresh-snapshot`
- `POST /v1/portfolio/projects/{project_id}/repositories/{repository_id}/revoke`
- `DELETE /v1/portfolio/projects/{project_id}/repositories/{repository_id}`

The Next.js UI uses same-origin `/api/portfolio/*` proxies. Repository connection creation is intentionally absent.

## Privacy and security

Every project, repository reference, analysis, skill-evidence row and recommendation is scoped to `student_id`. Cross-student access fails closed. The current prototype identity header must later be replaced by the production authenticated principal.

`PORTFOLIO_ANALYSES_PER_MINUTE` defaults to `10` to limit repeated analysis requests. `PORTFOLIO_INTEGRATION_INGEST_KEY` is empty by default, which keeps repository ingestion disabled in DOC-F14.
