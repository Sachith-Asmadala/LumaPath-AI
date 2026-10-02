-- DOC-F21 Team Workspaces reference schema.
-- Runtime SQLite migrations are created by apps/api/app/modules/teams/repository.py.
-- Team records are intentionally separate from personal task/capacity/CV data.

CREATE TABLE teams (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE team_memberships (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL, -- owner | coordinator | member
  status TEXT NOT NULL, -- active | left | removed
  joined_at TEXT NOT NULL,
  removed_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  UNIQUE(team_id, student_id)
);

CREATE TABLE team_invitations (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  invite_label TEXT NOT NULL,
  role TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  accepted_by_membership_id TEXT REFERENCES team_memberships(id),
  created_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT
);

CREATE TABLE team_member_sharing (
  membership_id TEXT PRIMARY KEY REFERENCES team_memberships(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  availability_shared INTEGER NOT NULL DEFAULT 0,
  availability_minutes_per_week INTEGER,
  skills_shared INTEGER NOT NULL DEFAULT 0,
  target_role TEXT,
  skill_ids_json TEXT NOT NULL DEFAULT '[]',
  skill_snapshot_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE group_projects (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  status TEXT NOT NULL,
  due_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE group_milestones (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_at TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE group_tasks (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  milestone_id TEXT REFERENCES group_milestones(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  assignee_membership_id TEXT REFERENCES team_memberships(id) ON DELETE SET NULL,
  estimated_minutes INTEGER NOT NULL,
  due_at TEXT,
  required_skill_ids_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE group_task_dependencies (
  task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(task_id, depends_on_task_id)
);

CREATE TABLE group_task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  author_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE meeting_notes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  summary TEXT NOT NULL,
  decisions TEXT NOT NULL DEFAULT '',
  action_items_json TEXT NOT NULL DEFAULT '[]',
  version INTEGER NOT NULL DEFAULT 1,
  created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE team_activity_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES group_projects(id) ON DELETE CASCADE,
  actor_membership_id TEXT REFERENCES team_memberships(id),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  correction_of_event_id INTEGER REFERENCES team_activity_events(id),
  occurred_at TEXT NOT NULL
);
