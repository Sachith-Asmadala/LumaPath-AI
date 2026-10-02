# Team Workspaces — DOC-F21

## Purpose

DOC-F21 adds consent-minimal, owner-scoped team collaboration without merging shared work into a student's private personal Task store. The server is authoritative for membership, roles, shared project data, assignments and immutable activity history.

## Permission model

- **Owner** — invitations, member removal, role changes/ownership transfer, project coordination, assignments.
- **Coordinator** — invitations, project coordination and human-confirmed assignments.
- **Member** — read the active team, create shared projects/milestones/tasks/meeting notes/comments, update tasks they own/created where allowed, and manage their own optional sharing.
- Project ownership is explicit through `owner_membership_id` and also grants coordination rights for that project.
- Every protected read/write resolves the current student to an **active** membership on the server.
- Removed/left members are denied immediately. Historical activity is retained.

The current prototype student identity remains the development `X-Luma-Student-Id` boundary. Production authentication should replace that header with a verified session/JWT without changing team membership authorization.

## Invitation security

Invitations use a cryptographically random one-time token. Only SHA-256 is stored. Invitations have an expiry, can be revoked, and are consumed on acceptance. No invitation email is sent by DOC-F21; the student shares the token through a channel they choose.

## Privacy boundary

Team allocation **never reads** private capacity/check-ins, grades, personal Tasks, CV contents or private notes.

Each member can independently opt into:

1. a manually declared weekly team-work allowance, and/or
2. selected career skill IDs.

For selected skills, the server snapshots only the matching current DOC-F29 assessment summary (`skill_id`, name, proficiency/confidence when available). Turning sharing off stops future suggestions from using those fields but does not erase legitimate project history.

## Shared work

Team workspaces support:

- projects with explicit owners;
- milestones;
- tasks with assignee, required skills, due date, estimate and status;
- dependency edges with cycle detection;
- comments;
- meeting notes;
- optimistic `version` checks on mutable shared records;
- append-only activity events.

A task cannot start/complete while dependencies are incomplete. Concurrent stale edits receive HTTP `409` instead of silently overwriting another member.

## Allocation suggestions

Allocation suggestions use only:

- task required-skill tags;
- member-selected shared skills;
- member-declared weekly team-work minutes;
- estimated minutes already assigned to that member inside the group project.

The service returns qualitative fit bands and transparent reasons. It does not infer motivation, intelligence, effort or contribution quality. A suggestion never assigns anyone automatically; a coordinator/project owner/owner must explicitly confirm the assignment.

## Contribution history and corrections

`team_activity_events` is append-only. Status changes, assignments, creation actions, comments, notes and membership/permission events include an actor and UTC timestamp.

Corrections create a separate `activity_corrected` event pointing to the original record. The original is never overwritten. Contribution summaries exclude corrected source actions and report factual counts only; there is no score, ordering, leaderboard or grading signal.

## API

Main routes:

- `POST/GET /v1/teams`
- `GET /v1/teams/{team_id}`
- `POST/GET /v1/teams/{team_id}/invitations`
- `POST /v1/team-invitations/accept`
- `PUT /v1/teams/{team_id}/sharing`
- membership role/remove/leave endpoints
- project/milestone/task CRUD-style operations
- task status/assignment/comment operations
- meeting-note operations
- `POST .../allocation-suggestions`
- `GET /v1/teams/{team_id}/activity`
- `POST .../activity/{event_id}/corrections`
- `GET /v1/teams/{team_id}/contributions`

The browser uses same-origin `/api/teams/*` proxies.

## Out of scope

DOC-F21 does not grade team members, create public rankings, infer effort from activity volume, expose private check-ins, send invitations externally, or automatically assign work.
