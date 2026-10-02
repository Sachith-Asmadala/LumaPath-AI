# DOC-F21 Verification

Backlog: **DOC-F21 — Team Workspaces**

## Acceptance criteria coverage

- **AC1** — active authorised members can create projects, milestones, tasks, comments and meeting notes. Project ownership is explicit.
- **AC2** — task assignments/status updates append actor/timestamp events to immutable activity history.
- **AC3** — allocation uses only explicitly shared skills/availability and current group assignments; every assignment requires explicit human confirmation.
- **AC4** — contribution history contains factual action counts with immutable correction events and no leaderboard/effort score.
- **AC5** — all server reads/writes require active team membership; outsiders receive `403`.
- **AC6** — invitation expiry and membership removal/leave are checked server-side on every access and deny immediately.

## Automated backend coverage

`apps/api/tests/test_teams.py` covers:

- team creation and invitation acceptance;
- one-time and expired invitation tokens;
- role/access matrix;
- project, milestone, task and meeting-note creation;
- actor/timestamp assignment and status history;
- task dependency blocking and cycle rejection;
- explicitly shared allocation inputs and private-schema absence;
- human assignment confirmation;
- factual/correctable contribution history;
- comments and meeting notes;
- optimistic concurrency conflicts;
- outsider denial;
- immediate removal denial with history retention;
- sharing revocation without project-history loss;
- ownership transfer and leave;
- real FastAPI HTTP flow.

Frontend contracts:

- `src/features/teams/domain/teams.test.ts`
- `tests/e2e/teams.spec.ts`

The Playwright contract checks consent-minimal allocation explanations, absence of leaderboard language, keyboard focus and 360px layout safety.

## Privacy assertions

The team-sharing table does not contain grades, private check-in notes, CV fields or personal-task content. Allocation does not query the private Task Manager/capacity store. Activity audit details contain shared-team event metadata rather than private profile content.

## Release checks

Frozen release counts should be generated from the final artifact immediately before packaging. Dependency-backed Next/Vitest/Playwright execution remains separate from source/static verification if npm installation is unavailable in the execution environment.

## Frozen verification results

Final source verification for this cumulative build:

```text
DOC-F21 focused backend tests       14 / 14 PASS
Cumulative FastAPI regression      292 / 292 PASS
Python compilation                       PASS
Frontend local imports              946 / 946 PASS
i18n contract                     1,761 keys × 3 PASS
Pseudo-localization               1,761 / 1,761 PASS
TS/TSX syntax transpilation          386 / 386 PASS
```

Real isolated FastAPI lifecycle:

```text
Create team                         HTTP 201
Create invitation                   HTTP 201
Accept invitation                   HTTP 200
Optional availability sharing       HTTP 200
Create project                      HTTP 201
Create shared task                  HTTP 201
Allocation suggestions              HTTP 200
Human-confirmed assignment          HTTP 200
Outsider read                       HTTP 403
Remove member                       HTTP 200
Removed-member next read            HTTP 403
```

A clean `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` was attempted, but dependency resolution did not complete in this execution environment. Partial `node_modules`/lockfile artifacts were removed. Consequently fresh semantic `npm run typecheck`, Vitest, Next production build and Playwright execution are not claimed here; their DOC-F21 contracts are included for normal network-enabled CI.
