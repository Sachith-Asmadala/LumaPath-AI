from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock


class TeamRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _init_schema(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                owner_student_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                version INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS team_memberships (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                role TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                joined_at TEXT NOT NULL,
                removed_at TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                UNIQUE(team_id, student_id)
            );
            CREATE INDEX IF NOT EXISTS idx_team_membership_student ON team_memberships(student_id,status,joined_at DESC);
            CREATE INDEX IF NOT EXISTS idx_team_membership_team ON team_memberships(team_id,status,joined_at);

            CREATE TABLE IF NOT EXISTS team_invitations (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                invite_label TEXT NOT NULL,
                role TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                status TEXT NOT NULL DEFAULT 'pending',
                expires_at TEXT NOT NULL,
                created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                accepted_by_membership_id TEXT REFERENCES team_memberships(id),
                created_at TEXT NOT NULL,
                accepted_at TEXT,
                revoked_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_team_invites_team ON team_invitations(team_id,status,created_at DESC);

            CREATE TABLE IF NOT EXISTS team_member_sharing (
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

            CREATE TABLE IF NOT EXISTS group_projects (
                id TEXT PRIMARY KEY,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                owner_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                status TEXT NOT NULL DEFAULT 'active',
                due_at TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_group_projects_team ON group_projects(team_id,status,created_at DESC);

            CREATE TABLE IF NOT EXISTS group_milestones (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                due_at TEXT,
                status TEXT NOT NULL DEFAULT 'planned',
                version INTEGER NOT NULL DEFAULT 1,
                created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_group_milestones_project ON group_milestones(project_id,due_at);

            CREATE TABLE IF NOT EXISTS group_tasks (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                milestone_id TEXT REFERENCES group_milestones(id) ON DELETE SET NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'todo',
                assignee_membership_id TEXT REFERENCES team_memberships(id) ON DELETE SET NULL,
                estimated_minutes INTEGER NOT NULL,
                due_at TEXT,
                required_skill_ids_json TEXT NOT NULL DEFAULT '[]',
                version INTEGER NOT NULL DEFAULT 1,
                created_by_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_group_tasks_project ON group_tasks(project_id,status,due_at);
            CREATE INDEX IF NOT EXISTS idx_group_tasks_assignee ON group_tasks(assignee_membership_id,status);

            CREATE TABLE IF NOT EXISTS group_task_dependencies (
                task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
                depends_on_task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
                project_id TEXT NOT NULL REFERENCES group_projects(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL,
                PRIMARY KEY(task_id, depends_on_task_id)
            );

            CREATE TABLE IF NOT EXISTS group_task_comments (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL REFERENCES group_tasks(id) ON DELETE CASCADE,
                team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                author_membership_id TEXT NOT NULL REFERENCES team_memberships(id),
                body TEXT NOT NULL,
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_group_comments_task ON group_task_comments(task_id,created_at);

            CREATE TABLE IF NOT EXISTS meeting_notes (
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
            CREATE INDEX IF NOT EXISTS idx_meeting_notes_project ON meeting_notes(project_id,occurred_at DESC);

            CREATE TABLE IF NOT EXISTS team_activity_events (
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
            CREATE INDEX IF NOT EXISTS idx_team_activity ON team_activity_events(team_id,occurred_at DESC,id DESC);
            CREATE INDEX IF NOT EXISTS idx_project_activity ON team_activity_events(project_id,occurred_at DESC,id DESC);
            """)

    def execute(self, sql: str, params=()):
        with self._lock, self._connect() as db:
            cur = db.execute(sql, params)
            db.commit()
            return cur

    def one(self, sql: str, params=()):
        with self._connect() as db:
            return db.execute(sql, params).fetchone()

    def all(self, sql: str, params=()):
        with self._connect() as db:
            return db.execute(sql, params).fetchall()

    def create_team(self, team: dict, owner: dict):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO teams(id,name,description,owner_student_id,status,version,created_at,updated_at) VALUES (:id,:name,:description,:owner_student_id,:status,:version,:created_at,:updated_at)", team)
            db.execute("INSERT INTO team_memberships(id,team_id,student_id,display_name,role,status,joined_at,removed_at,version) VALUES (:id,:team_id,:student_id,:display_name,:role,:status,:joined_at,:removed_at,:version)", owner)
        return self.team(team["id"]), self.membership(owner["id"])

    def team(self, team_id: str):
        return self.one("SELECT * FROM teams WHERE id=?", (team_id,))

    def membership(self, membership_id: str):
        return self.one("SELECT * FROM team_memberships WHERE id=?", (membership_id,))

    def membership_for_student(self, team_id: str, student_id: str):
        return self.one("SELECT * FROM team_memberships WHERE team_id=? AND student_id=?", (team_id, student_id))

    def memberships(self, team_id: str, active_only: bool = False):
        sql = "SELECT * FROM team_memberships WHERE team_id=?"
        params = [team_id]
        if active_only:
            sql += " AND status='active'"
        sql += " ORDER BY joined_at,id"
        return self.all(sql, params)

    def teams_for_student(self, student_id: str):
        return self.all("""SELECT t.*,m.id AS membership_id,m.role AS membership_role,
            (SELECT COUNT(*) FROM team_memberships x WHERE x.team_id=t.id AND x.status='active') AS active_member_count
            FROM teams t JOIN team_memberships m ON m.team_id=t.id
            WHERE m.student_id=? AND m.status='active' AND t.status='active' ORDER BY t.updated_at DESC""", (student_id,))

    def invitations(self, team_id: str):
        return self.all("SELECT * FROM team_invitations WHERE team_id=? ORDER BY created_at DESC", (team_id,))

    def invitation_by_hash(self, token_hash: str):
        return self.one("SELECT * FROM team_invitations WHERE token_hash=?", (token_hash,))

    def invitation(self, invitation_id: str):
        return self.one("SELECT * FROM team_invitations WHERE id=?", (invitation_id,))

    def create_invitation(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO team_invitations(id,team_id,invite_label,role,token_hash,status,expires_at,created_by_membership_id,accepted_by_membership_id,created_at,accepted_at,revoked_at)
                VALUES (:id,:team_id,:invite_label,:role,:token_hash,:status,:expires_at,:created_by_membership_id,:accepted_by_membership_id,:created_at,:accepted_at,:revoked_at)""", values)
        return self.invitation(values["id"])

    def accept_invitation(self, invitation_id: str, membership: dict, accepted_at: str):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO team_memberships(id,team_id,student_id,display_name,role,status,joined_at,removed_at,version) VALUES (:id,:team_id,:student_id,:display_name,:role,:status,:joined_at,:removed_at,:version)", membership)
            db.execute("UPDATE team_invitations SET status='accepted',accepted_by_membership_id=?,accepted_at=?,token_hash=? WHERE id=?", (membership["id"], accepted_at, f"used:{invitation_id}", invitation_id))
        return self.membership(membership["id"])

    def update_invitation_status(self, invitation_id: str, status: str, timestamp: str):
        field = "revoked_at" if status == "revoked" else "accepted_at"
        self.execute(f"UPDATE team_invitations SET status=?, {field}=? WHERE id=?", (status, timestamp, invitation_id))
        return self.invitation(invitation_id)

    def update_membership(self, membership_id: str, expected_version: int, **fields):
        allowed = {"role", "status", "removed_at", "display_name"}
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return self.membership(membership_id)
        assignments = ",".join(f"{key}=?" for key in updates) + ",version=version+1"
        params = list(updates.values()) + [membership_id, expected_version]
        with self._lock, self._connect() as db:
            cur = db.execute(f"UPDATE team_memberships SET {assignments} WHERE id=? AND version=?", params)
            if cur.rowcount != 1:
                return None
        return self.membership(membership_id)

    def upsert_sharing(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO team_member_sharing(membership_id,team_id,student_id,availability_shared,availability_minutes_per_week,skills_shared,target_role,skill_ids_json,skill_snapshot_json,updated_at)
                VALUES (:membership_id,:team_id,:student_id,:availability_shared,:availability_minutes_per_week,:skills_shared,:target_role,:skill_ids_json,:skill_snapshot_json,:updated_at)
                ON CONFLICT(membership_id) DO UPDATE SET availability_shared=excluded.availability_shared,availability_minutes_per_week=excluded.availability_minutes_per_week,skills_shared=excluded.skills_shared,target_role=excluded.target_role,skill_ids_json=excluded.skill_ids_json,skill_snapshot_json=excluded.skill_snapshot_json,updated_at=excluded.updated_at""", values)
        return self.sharing(values["membership_id"])

    def sharing(self, membership_id: str):
        return self.one("SELECT * FROM team_member_sharing WHERE membership_id=?", (membership_id,))

    def sharing_for_team(self, team_id: str):
        return self.all("SELECT s.* FROM team_member_sharing s JOIN team_memberships m ON m.id=s.membership_id WHERE s.team_id=? AND m.status='active'", (team_id,))

    def project(self, project_id: str):
        return self.one("SELECT * FROM group_projects WHERE id=?", (project_id,))

    def projects(self, team_id: str):
        return self.all("SELECT * FROM group_projects WHERE team_id=? ORDER BY created_at DESC", (team_id,))

    def create_project(self, values: dict):
        self.execute("""INSERT INTO group_projects(id,team_id,name,description,owner_membership_id,status,due_at,version,created_by_membership_id,created_at,updated_at)
            VALUES (:id,:team_id,:name,:description,:owner_membership_id,:status,:due_at,:version,:created_by_membership_id,:created_at,:updated_at)""", values)
        return self.project(values["id"])

    def update_versioned(self, table: str, row_id: str, expected_version: int, allowed: set[str], **fields):
        updates = {k: v for k, v in fields.items() if k in allowed}
        if not updates:
            return self.one(f"SELECT * FROM {table} WHERE id=?", (row_id,))
        assignments = ",".join(f"{k}=?" for k in updates) + ",version=version+1"
        params = list(updates.values()) + [row_id, expected_version]
        with self._lock, self._connect() as db:
            cur = db.execute(f"UPDATE {table} SET {assignments} WHERE id=? AND version=?", params)
            if cur.rowcount != 1:
                return None
        return self.one(f"SELECT * FROM {table} WHERE id=?", (row_id,))

    def milestone(self, milestone_id: str):
        return self.one("SELECT * FROM group_milestones WHERE id=?", (milestone_id,))

    def milestones(self, project_id: str):
        return self.all("SELECT * FROM group_milestones WHERE project_id=? ORDER BY COALESCE(due_at,'9999'),created_at", (project_id,))

    def create_milestone(self, values: dict):
        self.execute("""INSERT INTO group_milestones(id,project_id,team_id,title,description,due_at,status,version,created_by_membership_id,created_at,updated_at)
            VALUES (:id,:project_id,:team_id,:title,:description,:due_at,:status,:version,:created_by_membership_id,:created_at,:updated_at)""", values)
        return self.milestone(values["id"])

    def task(self, task_id: str):
        return self.one("SELECT * FROM group_tasks WHERE id=?", (task_id,))

    def tasks(self, project_id: str):
        return self.all("SELECT * FROM group_tasks WHERE project_id=? ORDER BY CASE status WHEN 'done' THEN 2 WHEN 'cancelled' THEN 3 ELSE 1 END,COALESCE(due_at,'9999'),created_at", (project_id,))

    def create_task(self, values: dict, dependency_ids: list[str]):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO group_tasks(id,project_id,team_id,milestone_id,title,description,status,assignee_membership_id,estimated_minutes,due_at,required_skill_ids_json,version,created_by_membership_id,created_at,updated_at)
                VALUES (:id,:project_id,:team_id,:milestone_id,:title,:description,:status,:assignee_membership_id,:estimated_minutes,:due_at,:required_skill_ids_json,:version,:created_by_membership_id,:created_at,:updated_at)""", values)
            db.executemany("INSERT INTO group_task_dependencies(task_id,depends_on_task_id,project_id,created_at) VALUES (?,?,?,?)", [(values["id"], dep, values["project_id"], values["created_at"]) for dep in dependency_ids])
        return self.task(values["id"])

    def set_dependencies(self, task_id: str, project_id: str, dependency_ids: list[str], timestamp: str):
        with self._lock, self._connect() as db:
            db.execute("DELETE FROM group_task_dependencies WHERE task_id=?", (task_id,))
            db.executemany("INSERT INTO group_task_dependencies(task_id,depends_on_task_id,project_id,created_at) VALUES (?,?,?,?)", [(task_id, dep, project_id, timestamp) for dep in dependency_ids])

    def dependencies(self, task_id: str):
        return [row["depends_on_task_id"] for row in self.all("SELECT depends_on_task_id FROM group_task_dependencies WHERE task_id=? ORDER BY depends_on_task_id", (task_id,))]

    def dependency_rows(self, project_id: str):
        return self.all("SELECT task_id,depends_on_task_id FROM group_task_dependencies WHERE project_id=?", (project_id,))

    def comment(self, comment_id: str):
        return self.one("SELECT * FROM group_task_comments WHERE id=?", (comment_id,))

    def comments(self, task_id: str):
        return self.all("SELECT * FROM group_task_comments WHERE task_id=? ORDER BY created_at,id", (task_id,))

    def create_comment(self, values: dict):
        self.execute("INSERT INTO group_task_comments(id,task_id,team_id,author_membership_id,body,created_at) VALUES (:id,:task_id,:team_id,:author_membership_id,:body,:created_at)", values)
        return self.comment(values["id"])

    def meeting_note(self, note_id: str):
        return self.one("SELECT * FROM meeting_notes WHERE id=?", (note_id,))

    def meeting_notes(self, project_id: str):
        return self.all("SELECT * FROM meeting_notes WHERE project_id=? ORDER BY occurred_at DESC,created_at DESC", (project_id,))

    def create_meeting_note(self, values: dict):
        self.execute("""INSERT INTO meeting_notes(id,project_id,team_id,title,occurred_at,summary,decisions,action_items_json,version,created_by_membership_id,created_at,updated_at)
            VALUES (:id,:project_id,:team_id,:title,:occurred_at,:summary,:decisions,:action_items_json,:version,:created_by_membership_id,:created_at,:updated_at)""", values)
        return self.meeting_note(values["id"])

    def activity(self, team_id: str, project_id: str | None = None):
        if project_id:
            return self.all("SELECT * FROM team_activity_events WHERE team_id=? AND project_id=? ORDER BY occurred_at DESC,id DESC", (team_id, project_id))
        return self.all("SELECT * FROM team_activity_events WHERE team_id=? ORDER BY occurred_at DESC,id DESC", (team_id,))

    def activity_event(self, event_id: int):
        return self.one("SELECT * FROM team_activity_events WHERE id=?", (event_id,))

    def audit(self, team_id: str, project_id: str | None, actor_membership_id: str | None, entity_type: str, entity_id: str, event_type: str, detail: dict, occurred_at: str, correction_of_event_id: int | None = None):
        with self._lock, self._connect() as db:
            cur = db.execute("""INSERT INTO team_activity_events(team_id,project_id,actor_membership_id,entity_type,entity_id,event_type,detail_json,correction_of_event_id,occurred_at)
                VALUES (?,?,?,?,?,?,?,?,?)""", (team_id, project_id, actor_membership_id, entity_type, entity_id, event_type, json.dumps(detail, separators=(",", ":")), correction_of_event_id, occurred_at))
            return cur.lastrowid

    def corrected_event_ids(self, team_id: str):
        return {int(row["correction_of_event_id"]) for row in self.all("SELECT correction_of_event_id FROM team_activity_events WHERE team_id=? AND correction_of_event_id IS NOT NULL", (team_id,))}

    def active_assigned_minutes(self, project_id: str, membership_id: str):
        row = self.one("SELECT COALESCE(SUM(estimated_minutes),0) AS minutes FROM group_tasks WHERE project_id=? AND assignee_membership_id=? AND status NOT IN ('done','cancelled')", (project_id, membership_id))
        return int(row["minutes"] if row else 0)
