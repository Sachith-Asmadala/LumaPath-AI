from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from ..careers.service import CareerService
from .repository import TeamRepository
from .schemas import (
    ActivityCorrectionRequest, ActivityEventResponse, AllocationCandidate, AllocationSuggestionResponse,
    CommentCreateRequest, CommentResponse, ContributionHistoryResponse, ContributionMemberSummary,
    InvitationAcceptRequest, InvitationCreateRequest, InvitationCreateResponse, InvitationResponse,
    LeaveTeamRequest, MeetingNoteCreateRequest, MeetingNoteResponse, MeetingNoteUpdateRequest,
    MemberRemovalRequest, MemberResponse, MemberRoleUpdateRequest, MemberSharingResponse, MemberSharingUpdateRequest,
    MilestoneCreateRequest, MilestoneResponse, MilestoneUpdateRequest, ProjectCreateRequest, ProjectResponse,
    ProjectUpdateRequest, ProjectWorkspaceResponse, SharedSkill, TaskAllocationSuggestion, TaskAssignmentRequest,
    TaskCreateRequest, TaskResponse, TaskStatusRequest, TaskUpdateRequest, TeamCreateRequest, TeamDetail, TeamSummary,
)

PRIVACY_NOTE = (
    "Team collaboration uses only shared project records plus the limited availability/skill summary each member explicitly opts to share. "
    "Private capacity check-ins, grades, personal tasks, CV content and private notes are never exposed to the team."
)
ALLOCATION_DISCLAIMER = (
    "Allocation suggestions use only member-shared skill and weekly-availability summaries plus existing team assignments. "
    "They are planning aids, not effort, ability or performance judgments, and a human must confirm every assignment."
)
CONTRIBUTION_EXPLANATION = (
    "This history reports recorded team actions only. It is not an effort score, quality rating, leaderboard or basis for grading. "
    "Corrections are kept as immutable follow-up events."
)


class TeamService:
    def __init__(self, repository: TeamRepository, career_service: CareerService | None = None, now=lambda: datetime.now(timezone.utc)):
        self.repository = repository
        self.career_service = career_service
        self.now = now

    @staticmethod
    def _hash(token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    def _iso(self, value: datetime | None = None) -> str:
        return (value or self.now()).astimezone(timezone.utc).isoformat()

    def _active_member(self, student_id: str, team_id: str):
        team = self.repository.team(team_id)
        membership = self.repository.membership_for_student(team_id, student_id)
        if team is None or team["status"] != "active" or membership is None or membership["status"] != "active":
            raise HTTPException(status_code=403, detail="Active team membership is required.")
        return team, membership

    def _project_access(self, student_id: str, team_id: str, project_id: str):
        team, member = self._active_member(student_id, team_id)
        project = self.repository.project(project_id)
        if project is None or project["team_id"] != team_id:
            raise HTTPException(status_code=404, detail="Group project not found.")
        return team, member, project

    def _member_in_team(self, team_id: str, membership_id: str, active: bool = True):
        member = self.repository.membership(membership_id)
        if member is None or member["team_id"] != team_id or (active and member["status"] != "active"):
            raise HTTPException(status_code=422, detail="Selected team member is not active in this team.")
        return member

    def _can_coordinate(self, member, project=None) -> bool:
        return member["role"] in {"owner", "coordinator"} or (project is not None and project["owner_membership_id"] == member["id"])

    def _require_coordinate(self, member, project=None):
        if not self._can_coordinate(member, project):
            raise HTTPException(status_code=403, detail="Project owner, team coordinator or team owner permission is required.")

    def _team_summary(self, team, membership=None) -> TeamSummary:
        if membership is None:
            raise RuntimeError("Membership is required for a team summary.")
        count = len(self.repository.memberships(team["id"], active_only=True))
        return TeamSummary(id=team["id"], name=team["name"], description=team["description"], status=team["status"], my_membership_id=membership["id"], my_role=membership["role"], active_member_count=count, version=team["version"], created_at=datetime.fromisoformat(team["created_at"]), updated_at=datetime.fromisoformat(team["updated_at"]))

    def _member_response(self, row, student_id: str) -> MemberResponse:
        return MemberResponse(id=row["id"], display_name=row["display_name"], role=row["role"], status=row["status"], is_self=row["student_id"] == student_id, joined_at=datetime.fromisoformat(row["joined_at"]), removed_at=datetime.fromisoformat(row["removed_at"]) if row["removed_at"] else None, version=row["version"])

    def _sharing_response(self, row) -> MemberSharingResponse | None:
        if row is None:
            return None
        skills = [SharedSkill(**item) for item in json.loads(row["skill_snapshot_json"])] if row["skills_shared"] else []
        return MemberSharingResponse(membership_id=row["membership_id"], availability_shared=bool(row["availability_shared"]), availability_minutes_per_week=row["availability_minutes_per_week"] if row["availability_shared"] else None, skills_shared=bool(row["skills_shared"]), target_role=row["target_role"] if row["skills_shared"] else None, skills=skills, updated_at=datetime.fromisoformat(row["updated_at"]), privacy_note=PRIVACY_NOTE)

    def create_team(self, student_id: str, request: TeamCreateRequest) -> TeamDetail:
        now = self._iso()
        team_id = f"team_{uuid4().hex[:18]}"
        membership_id = f"member_{uuid4().hex[:18]}"
        team = {"id": team_id, "name": request.name.strip(), "description": request.description.strip(), "owner_student_id": student_id, "status": "active", "version": 1, "created_at": now, "updated_at": now}
        owner = {"id": membership_id, "team_id": team_id, "student_id": student_id, "display_name": request.owner_display_name.strip(), "role": "owner", "status": "active", "joined_at": now, "removed_at": None, "version": 1}
        team_row, member_row = self.repository.create_team(team, owner)
        self.repository.audit(team_id, None, membership_id, "team", team_id, "team_created", {"name": team["name"]}, now)
        return TeamDetail(team=self._team_summary(team_row, member_row), members=[self._member_response(member_row, student_id)], my_sharing=None, privacy_note=PRIVACY_NOTE)

    def list_teams(self, student_id: str) -> list[TeamSummary]:
        rows = self.repository.teams_for_student(student_id)
        return [TeamSummary(id=row["id"], name=row["name"], description=row["description"], status=row["status"], my_membership_id=row["membership_id"], my_role=row["membership_role"], active_member_count=row["active_member_count"], version=row["version"], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"])) for row in rows]

    def team_detail(self, student_id: str, team_id: str) -> TeamDetail:
        team, member = self._active_member(student_id, team_id)
        members = [self._member_response(row, student_id) for row in self.repository.memberships(team_id)]
        return TeamDetail(team=self._team_summary(team, member), members=members, my_sharing=self._sharing_response(self.repository.sharing(member["id"])), privacy_note=PRIVACY_NOTE)

    def create_invitation(self, student_id: str, team_id: str, request: InvitationCreateRequest) -> InvitationCreateResponse:
        _, actor = self._active_member(student_id, team_id)
        if actor["role"] not in {"owner", "coordinator"}:
            raise HTTPException(status_code=403, detail="Only a team owner or coordinator can create invitations.")
        if request.expires_at.astimezone(timezone.utc) <= self.now().astimezone(timezone.utc):
            raise HTTPException(status_code=422, detail="Invitation expiry must be in the future.")
        token = secrets.token_urlsafe(32)
        now = self._iso()
        values = {"id": f"invite_{uuid4().hex[:18]}", "team_id": team_id, "invite_label": request.invite_label.strip(), "role": request.role, "token_hash": self._hash(token), "status": "pending", "expires_at": request.expires_at.astimezone(timezone.utc).isoformat(), "created_by_membership_id": actor["id"], "accepted_by_membership_id": None, "created_at": now, "accepted_at": None, "revoked_at": None}
        row = self.repository.create_invitation(values)
        self.repository.audit(team_id, None, actor["id"], "membership", values["id"], "invitation_created", {"invite_label": values["invite_label"], "role": values["role"], "expires_at": values["expires_at"]}, now)
        return InvitationCreateResponse(invitation=self._invitation_response(row), invitation_token=token)

    def _invitation_response(self, row) -> InvitationResponse:
        status = row["status"]
        if status == "pending" and datetime.fromisoformat(row["expires_at"]) <= self.now().astimezone(timezone.utc):
            status = "expired"
        return InvitationResponse(id=row["id"], team_id=row["team_id"], invite_label=row["invite_label"], role=row["role"], status=status, expires_at=datetime.fromisoformat(row["expires_at"]), created_at=datetime.fromisoformat(row["created_at"]))

    def list_invitations(self, student_id: str, team_id: str) -> list[InvitationResponse]:
        _, actor = self._active_member(student_id, team_id)
        if actor["role"] not in {"owner", "coordinator"}:
            raise HTTPException(status_code=403, detail="Only a team owner or coordinator can view invitations.")
        return [self._invitation_response(row) for row in self.repository.invitations(team_id)]

    def revoke_invitation(self, student_id: str, team_id: str, invitation_id: str) -> InvitationResponse:
        _, actor = self._active_member(student_id, team_id)
        if actor["role"] not in {"owner", "coordinator"}:
            raise HTTPException(status_code=403, detail="Only a team owner or coordinator can revoke invitations.")
        row = self.repository.invitation(invitation_id)
        if row is None or row["team_id"] != team_id:
            raise HTTPException(status_code=404, detail="Invitation not found.")
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Only pending invitations can be revoked.")
        now = self._iso()
        row = self.repository.update_invitation_status(invitation_id, "revoked", now)
        self.repository.audit(team_id, None, actor["id"], "membership", invitation_id, "invitation_revoked", {}, now)
        return self._invitation_response(row)

    def accept_invitation(self, student_id: str, request: InvitationAcceptRequest) -> TeamDetail:
        row = self.repository.invitation_by_hash(self._hash(request.invitation_token))
        if row is None:
            raise HTTPException(status_code=404, detail="Invitation is invalid or has already been used.")
        now_dt = self.now().astimezone(timezone.utc)
        if row["status"] != "pending" or datetime.fromisoformat(row["expires_at"]) <= now_dt:
            raise HTTPException(status_code=403, detail="Invitation has expired or is no longer active.")
        existing = self.repository.membership_for_student(row["team_id"], student_id)
        if existing and existing["status"] == "active":
            raise HTTPException(status_code=409, detail="You are already an active member of this team.")
        if existing:
            raise HTTPException(status_code=409, detail="A previous membership exists and must be restored by the team owner rather than reusing an invitation.")
        now = self._iso(now_dt)
        member = {"id": f"member_{uuid4().hex[:18]}", "team_id": row["team_id"], "student_id": student_id, "display_name": request.display_name.strip(), "role": row["role"], "status": "active", "joined_at": now, "removed_at": None, "version": 1}
        member_row = self.repository.accept_invitation(row["id"], member, now)
        self.repository.audit(row["team_id"], None, member_row["id"], "membership", member_row["id"], "member_joined", {"role": member_row["role"]}, now)
        return self.team_detail(student_id, row["team_id"])

    def update_member_role(self, student_id: str, team_id: str, membership_id: str, request: MemberRoleUpdateRequest) -> MemberResponse:
        team, actor = self._active_member(student_id, team_id)
        if actor["role"] != "owner":
            raise HTTPException(status_code=403, detail="Only the team owner can change member roles.")
        target = self._member_in_team(team_id, membership_id)
        if request.role == "owner":
            if target["id"] == actor["id"]:
                return self._member_response(target, student_id)
            # Transfer ownership atomically enough for SQLite under the service lock sequence.
            demoted = self.repository.update_membership(actor["id"], actor["version"], role="coordinator")
            if demoted is None:
                raise HTTPException(status_code=409, detail="Team ownership changed concurrently. Refresh and retry.")
            updated = self.repository.update_membership(target["id"], request.expected_version, role="owner")
            if updated is None:
                # restore best-effort; this path only happens on concurrent edits
                self.repository.update_membership(demoted["id"], demoted["version"], role="owner")
                raise HTTPException(status_code=409, detail="Member was updated by someone else. Refresh and retry.")
            self.repository.execute("UPDATE teams SET owner_student_id=?,version=version+1,updated_at=? WHERE id=?", (target["student_id"], self._iso(), team_id))
            event = "ownership_transferred"
        else:
            if target["role"] == "owner" and target["id"] == actor["id"]:
                raise HTTPException(status_code=409, detail="Transfer ownership to another active member before changing the owner role.")
            updated = self.repository.update_membership(target["id"], request.expected_version, role=request.role)
            if updated is None:
                raise HTTPException(status_code=409, detail="Member was updated by someone else. Refresh and retry.")
            event = "member_role_changed"
        self.repository.audit(team_id, None, actor["id"], "membership", target["id"], event, {"role": request.role}, self._iso())
        return self._member_response(updated, student_id)

    def remove_member(self, student_id: str, team_id: str, membership_id: str, request: MemberRemovalRequest) -> MemberResponse:
        _, actor = self._active_member(student_id, team_id)
        if actor["role"] != "owner":
            raise HTTPException(status_code=403, detail="Only the team owner can remove members.")
        target = self._member_in_team(team_id, membership_id)
        if target["role"] == "owner":
            raise HTTPException(status_code=409, detail="The team owner cannot be removed. Transfer ownership first.")
        now = self._iso()
        updated = self.repository.update_membership(target["id"], request.expected_version, status="removed", removed_at=now)
        if updated is None:
            raise HTTPException(status_code=409, detail="Member was updated by someone else. Refresh and retry.")
        self.repository.audit(team_id, None, actor["id"], "membership", target["id"], "member_removed", {"reason": request.reason.strip()}, now)
        return self._member_response(updated, student_id)

    def leave_team(self, student_id: str, team_id: str, request: LeaveTeamRequest):
        _, member = self._active_member(student_id, team_id)
        if member["role"] == "owner":
            raise HTTPException(status_code=409, detail="Transfer ownership before leaving the team.")
        now = self._iso()
        updated = self.repository.update_membership(member["id"], member["version"], status="left", removed_at=now)
        if updated is None:
            raise HTTPException(status_code=409, detail="Membership changed concurrently. Refresh and retry.")
        self.repository.audit(team_id, None, member["id"], "membership", member["id"], "member_left", {"reason": request.reason.strip()}, now)
        return {"status": "left", "team_id": team_id}

    def update_sharing(self, student_id: str, team_id: str, request: MemberSharingUpdateRequest) -> MemberSharingResponse:
        _, member = self._active_member(student_id, team_id)
        skills: list[dict] = []
        if request.share_skills:
            if self.career_service is None:
                raise HTTPException(status_code=503, detail="Career taxonomy is unavailable for skill sharing.")
            role = self.career_service.role_detail(request.target_role or "")
            approved = {item.skill_id: item.name for item in role.skills}
            unknown = set(request.skill_ids) - set(approved)
            if unknown:
                raise HTTPException(status_code=422, detail=f"Selected skills are outside the approved role taxonomy: {', '.join(sorted(unknown))}.")
            assessment_by_skill = {}
            try:
                assessment = self.career_service.current_assessment(student_id, role.name)
                assessment_by_skill = {item.skill_id: item for item in assessment.skills}
            except HTTPException as exc:
                if exc.status_code != 404:
                    raise
            for skill_id in request.skill_ids:
                assessed = assessment_by_skill.get(skill_id)
                skills.append({"skill_id": skill_id, "name": approved[skill_id], "proficiency": assessed.proficiency if assessed else None, "confidence": assessed.confidence if assessed else None})
        values = {
            "membership_id": member["id"], "team_id": team_id, "student_id": student_id,
            "availability_shared": int(request.share_availability),
            "availability_minutes_per_week": request.availability_minutes_per_week if request.share_availability else None,
            "skills_shared": int(request.share_skills), "target_role": request.target_role if request.share_skills else None,
            "skill_ids_json": json.dumps(request.skill_ids if request.share_skills else []), "skill_snapshot_json": json.dumps(skills), "updated_at": self._iso(),
        }
        row = self.repository.upsert_sharing(values)
        self.repository.audit(team_id, None, member["id"], "sharing", member["id"], "sharing_updated", {"availability_shared": request.share_availability, "skills_shared": request.share_skills, "shared_skill_ids": request.skill_ids if request.share_skills else []}, values["updated_at"])
        return self._sharing_response(row)

    def create_project(self, student_id: str, team_id: str, request: ProjectCreateRequest) -> ProjectResponse:
        _, actor = self._active_member(student_id, team_id)
        owner = actor if request.owner_membership_id is None else self._member_in_team(team_id, request.owner_membership_id)
        if owner["id"] != actor["id"] and actor["role"] not in {"owner", "coordinator"}:
            raise HTTPException(status_code=403, detail="Only a coordinator or owner can create a project owned by another member.")
        now = self._iso()
        values = {"id": f"project_{uuid4().hex[:18]}", "team_id": team_id, "name": request.name.strip(), "description": request.description.strip(), "owner_membership_id": owner["id"], "status": "active", "due_at": request.due_at.astimezone(timezone.utc).isoformat() if request.due_at else None, "version": 1, "created_by_membership_id": actor["id"], "created_at": now, "updated_at": now}
        row = self.repository.create_project(values)
        self.repository.audit(team_id, row["id"], actor["id"], "project", row["id"], "project_created", {"name": row["name"], "owner_membership_id": row["owner_membership_id"]}, now)
        return self._project_response(row)

    def list_projects(self, student_id: str, team_id: str) -> list[ProjectResponse]:
        self._active_member(student_id, team_id)
        return [self._project_response(row) for row in self.repository.projects(team_id)]

    def _project_response(self, row) -> ProjectResponse:
        owner = self.repository.membership(row["owner_membership_id"])
        return ProjectResponse(id=row["id"], team_id=row["team_id"], name=row["name"], description=row["description"], owner_membership_id=row["owner_membership_id"], owner_display_name=owner["display_name"] if owner else "Former member", status=row["status"], due_at=datetime.fromisoformat(row["due_at"]) if row["due_at"] else None, version=row["version"], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]))

    def update_project(self, student_id: str, team_id: str, project_id: str, request: ProjectUpdateRequest) -> ProjectResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        self._require_coordinate(actor, project)
        owner_id = request.owner_membership_id if request.owner_membership_id is not None else project["owner_membership_id"]
        if request.owner_membership_id is not None:
            self._member_in_team(team_id, request.owner_membership_id)
        fields = {"name": request.name.strip() if request.name is not None else project["name"], "description": request.description.strip() if request.description is not None else project["description"], "due_at": request.due_at.astimezone(timezone.utc).isoformat() if request.due_at else project["due_at"], "status": request.status or project["status"], "owner_membership_id": owner_id, "updated_at": self._iso()}
        row = self.repository.update_versioned("group_projects", project_id, request.expected_version, {"name", "description", "due_at", "status", "owner_membership_id", "updated_at"}, **fields)
        if row is None:
            raise HTTPException(status_code=409, detail="Project was updated by another member. Refresh and retry.")
        self.repository.audit(team_id, project_id, actor["id"], "project", project_id, "project_updated", {"version": row["version"]}, fields["updated_at"])
        return self._project_response(row)

    def create_milestone(self, student_id: str, team_id: str, project_id: str, request: MilestoneCreateRequest) -> MilestoneResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        now = self._iso()
        values = {"id": f"milestone_{uuid4().hex[:18]}", "project_id": project_id, "team_id": team_id, "title": request.title.strip(), "description": request.description.strip(), "due_at": request.due_at.astimezone(timezone.utc).isoformat() if request.due_at else None, "status": "planned", "version": 1, "created_by_membership_id": actor["id"], "created_at": now, "updated_at": now}
        row = self.repository.create_milestone(values)
        self.repository.audit(team_id, project_id, actor["id"], "milestone", row["id"], "milestone_created", {"title": row["title"]}, now)
        return self._milestone_response(row)

    def update_milestone(self, student_id: str, team_id: str, project_id: str, milestone_id: str, request: MilestoneUpdateRequest) -> MilestoneResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        row0 = self.repository.milestone(milestone_id)
        if row0 is None or row0["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="Milestone not found.")
        now = self._iso()
        fields = {"updated_at": now}
        for key in ("title", "description", "status"):
            value = getattr(request, key)
            if value is not None:
                fields[key] = value.strip() if isinstance(value, str) and key != "status" else value
        if request.due_at is not None:
            fields["due_at"] = request.due_at.astimezone(timezone.utc).isoformat()
        row = self.repository.update_versioned("group_milestones", milestone_id, request.expected_version, {"title", "description", "due_at", "status", "updated_at"}, **fields)
        if row is None:
            raise HTTPException(status_code=409, detail="Milestone was updated by another member. Refresh and retry.")
        self.repository.audit(team_id, project_id, actor["id"], "milestone", milestone_id, "milestone_updated", {"status": row["status"], "version": row["version"]}, now)
        return self._milestone_response(row)

    def _milestone_response(self, row) -> MilestoneResponse:
        return MilestoneResponse(id=row["id"], project_id=row["project_id"], title=row["title"], description=row["description"], due_at=datetime.fromisoformat(row["due_at"]) if row["due_at"] else None, status=row["status"], version=row["version"], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]))

    def _validate_task_links(self, project_id: str, task_id: str | None, milestone_id: str | None, assignee_id: str | None, dependency_ids: list[str]):
        project = self.repository.project(project_id)
        team_id = project["team_id"] if project else None
        if milestone_id:
            milestone = self.repository.milestone(milestone_id)
            if milestone is None or milestone["project_id"] != project_id:
                raise HTTPException(status_code=422, detail="Milestone must belong to this project.")
        if assignee_id:
            self._member_in_team(team_id, assignee_id)
        for dep_id in dependency_ids:
            dep = self.repository.task(dep_id)
            if dep is None or dep["project_id"] != project_id:
                raise HTTPException(status_code=422, detail="Every dependency must be a task in the same project.")
            if task_id and dep_id == task_id:
                raise HTTPException(status_code=422, detail="A task cannot depend on itself.")
        edges = [(row["task_id"], row["depends_on_task_id"]) for row in self.repository.dependency_rows(project_id) if row["task_id"] != task_id]
        if task_id:
            edges.extend((task_id, dep) for dep in dependency_ids)
            graph: dict[str, list[str]] = {}
            for child, parent in edges:
                graph.setdefault(child, []).append(parent)
            visiting: set[str] = set(); visited: set[str] = set()
            def visit(node: str):
                if node in visiting:
                    raise HTTPException(status_code=422, detail="Task dependency cycle detected.")
                if node in visited:
                    return
                visiting.add(node)
                for parent in graph.get(node, []): visit(parent)
                visiting.remove(node); visited.add(node)
            for node in list(graph): visit(node)

    def create_task(self, student_id: str, team_id: str, project_id: str, request: TaskCreateRequest) -> TaskResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        task_id = f"gtask_{uuid4().hex[:18]}"
        self._validate_task_links(project_id, task_id, request.milestone_id, request.assignee_membership_id, request.dependency_task_ids)
        if request.assignee_membership_id and not self._can_coordinate(actor, project):
            raise HTTPException(status_code=403, detail="Create the task unassigned or ask a project coordinator to approve the assignment.")
        now = self._iso()
        values = {"id": task_id, "project_id": project_id, "team_id": team_id, "milestone_id": request.milestone_id, "title": request.title.strip(), "description": request.description.strip(), "status": "todo", "assignee_membership_id": request.assignee_membership_id, "estimated_minutes": request.estimated_minutes, "due_at": request.due_at.astimezone(timezone.utc).isoformat() if request.due_at else None, "required_skill_ids_json": json.dumps(request.required_skill_ids), "version": 1, "created_by_membership_id": actor["id"], "created_at": now, "updated_at": now}
        row = self.repository.create_task(values, request.dependency_task_ids)
        self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_created", {"title": row["title"], "assignee_membership_id": row["assignee_membership_id"]}, now)
        if row["assignee_membership_id"]:
            self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_assigned", {"assignee_membership_id": row["assignee_membership_id"], "confirmed": True}, now)
        return self._task_response(row)

    def update_task(self, student_id: str, team_id: str, project_id: str, task_id: str, request: TaskUpdateRequest) -> TaskResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        row0 = self.repository.task(task_id)
        if row0 is None or row0["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="Group task not found.")
        dependencies = request.dependency_task_ids if request.dependency_task_ids is not None else self.repository.dependencies(task_id)
        milestone_id = request.milestone_id if request.milestone_id is not None else row0["milestone_id"]
        self._validate_task_links(project_id, task_id, milestone_id, row0["assignee_membership_id"], dependencies)
        now = self._iso(); fields = {"updated_at": now}
        for key in ("title", "description", "estimated_minutes"):
            value = getattr(request, key)
            if value is not None: fields[key] = value.strip() if isinstance(value, str) else value
        if request.milestone_id is not None: fields["milestone_id"] = request.milestone_id
        if request.due_at is not None: fields["due_at"] = request.due_at.astimezone(timezone.utc).isoformat()
        if request.required_skill_ids is not None: fields["required_skill_ids_json"] = json.dumps(request.required_skill_ids)
        row = self.repository.update_versioned("group_tasks", task_id, request.expected_version, {"title", "description", "milestone_id", "estimated_minutes", "due_at", "required_skill_ids_json", "updated_at"}, **fields)
        if row is None:
            raise HTTPException(status_code=409, detail="Task was updated by another member. Refresh and retry.")
        if request.dependency_task_ids is not None:
            self.repository.set_dependencies(task_id, project_id, dependencies, now)
        self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_updated", {"version": row["version"]}, now)
        return self._task_response(row)

    def update_task_status(self, student_id: str, team_id: str, project_id: str, task_id: str, request: TaskStatusRequest) -> TaskResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        row0 = self.repository.task(task_id)
        if row0 is None or row0["project_id"] != project_id:
            raise HTTPException(status_code=404, detail="Group task not found.")
        if not (self._can_coordinate(actor, project) or row0["assignee_membership_id"] == actor["id"] or row0["created_by_membership_id"] == actor["id"]):
            raise HTTPException(status_code=403, detail="Only the task assignee, creator or project coordinator can change its status.")
        if request.status in {"in_progress", "done"}:
            incomplete = [dep for dep in self.repository.dependencies(task_id) if (self.repository.task(dep) or {"status":"missing"})["status"] != "done"]
            if incomplete:
                raise HTTPException(status_code=409, detail="Complete task dependencies before starting or completing this task.")
        now = self._iso()
        row = self.repository.update_versioned("group_tasks", task_id, request.expected_version, {"status", "updated_at"}, status=request.status, updated_at=now)
        if row is None: raise HTTPException(status_code=409, detail="Task was updated by another member. Refresh and retry.")
        self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_status_changed", {"from": row0["status"], "to": request.status}, now)
        if request.status == "done": self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_completed", {}, now)
        return self._task_response(row)

    def assign_task(self, student_id: str, team_id: str, project_id: str, task_id: str, request: TaskAssignmentRequest) -> TaskResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        self._require_coordinate(actor, project)
        row0 = self.repository.task(task_id)
        if row0 is None or row0["project_id"] != project_id: raise HTTPException(status_code=404, detail="Group task not found.")
        if not request.confirmed: raise HTTPException(status_code=422, detail="A human must explicitly confirm the assignment.")
        if request.assignee_membership_id: self._member_in_team(team_id, request.assignee_membership_id)
        now = self._iso()
        row = self.repository.update_versioned("group_tasks", task_id, request.expected_version, {"assignee_membership_id", "updated_at"}, assignee_membership_id=request.assignee_membership_id, updated_at=now)
        if row is None: raise HTTPException(status_code=409, detail="Task was updated by another member. Refresh and retry.")
        self.repository.audit(team_id, project_id, actor["id"], "task", task_id, "task_assigned", {"from": row0["assignee_membership_id"], "to": request.assignee_membership_id, "confirmed": True, "rationale_note": request.rationale_note.strip()}, now)
        return self._task_response(row)

    def _task_response(self, row) -> TaskResponse:
        assignee = self.repository.membership(row["assignee_membership_id"]) if row["assignee_membership_id"] else None
        return TaskResponse(id=row["id"], project_id=row["project_id"], milestone_id=row["milestone_id"], title=row["title"], description=row["description"], status=row["status"], assignee_membership_id=row["assignee_membership_id"], assignee_display_name=assignee["display_name"] if assignee else None, estimated_minutes=row["estimated_minutes"], due_at=datetime.fromisoformat(row["due_at"]) if row["due_at"] else None, required_skill_ids=json.loads(row["required_skill_ids_json"]), dependency_task_ids=self.repository.dependencies(row["id"]), version=row["version"], created_by_membership_id=row["created_by_membership_id"], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]))

    def add_comment(self, student_id: str, team_id: str, project_id: str, task_id: str, request: CommentCreateRequest) -> CommentResponse:
        _, actor, _ = self._project_access(student_id, team_id, project_id)
        task = self.repository.task(task_id)
        if task is None or task["project_id"] != project_id: raise HTTPException(status_code=404, detail="Group task not found.")
        now = self._iso(); values = {"id": f"comment_{uuid4().hex[:18]}", "task_id": task_id, "team_id": team_id, "author_membership_id": actor["id"], "body": request.body.strip(), "created_at": now}
        row = self.repository.create_comment(values)
        self.repository.audit(team_id, project_id, actor["id"], "comment", row["id"], "comment_added", {"task_id": task_id}, now)
        return self._comment_response(row)

    def comments(self, student_id: str, team_id: str, project_id: str, task_id: str) -> list[CommentResponse]:
        self._project_access(student_id, team_id, project_id)
        task = self.repository.task(task_id)
        if task is None or task["project_id"] != project_id: raise HTTPException(status_code=404, detail="Group task not found.")
        return [self._comment_response(row) for row in self.repository.comments(task_id)]

    def _comment_response(self, row):
        author = self.repository.membership(row["author_membership_id"])
        return CommentResponse(id=row["id"], task_id=row["task_id"], author_membership_id=row["author_membership_id"], author_display_name=author["display_name"] if author else "Former member", body=row["body"], created_at=datetime.fromisoformat(row["created_at"]))

    def create_meeting_note(self, student_id: str, team_id: str, project_id: str, request: MeetingNoteCreateRequest) -> MeetingNoteResponse:
        _, actor, _ = self._project_access(student_id, team_id, project_id)
        now = self._iso(); values = {"id": f"meeting_{uuid4().hex[:18]}", "project_id": project_id, "team_id": team_id, "title": request.title.strip(), "occurred_at": request.occurred_at.astimezone(timezone.utc).isoformat(), "summary": request.summary.strip(), "decisions": request.decisions.strip(), "action_items_json": json.dumps(request.action_items), "version": 1, "created_by_membership_id": actor["id"], "created_at": now, "updated_at": now}
        row = self.repository.create_meeting_note(values)
        self.repository.audit(team_id, project_id, actor["id"], "meeting_note", row["id"], "meeting_note_added", {"title": row["title"], "occurred_at": row["occurred_at"]}, now)
        return self._meeting_note_response(row)

    def update_meeting_note(self, student_id: str, team_id: str, project_id: str, note_id: str, request: MeetingNoteUpdateRequest) -> MeetingNoteResponse:
        _, actor, project = self._project_access(student_id, team_id, project_id)
        row0 = self.repository.meeting_note(note_id)
        if row0 is None or row0["project_id"] != project_id: raise HTTPException(status_code=404, detail="Meeting note not found.")
        if not (row0["created_by_membership_id"] == actor["id"] or self._can_coordinate(actor, project)):
            raise HTTPException(status_code=403, detail="Only the note author or project coordinator can edit this meeting note.")
        now = self._iso(); fields={"updated_at":now}
        for key in ("title","summary","decisions"):
            value=getattr(request,key)
            if value is not None: fields[key]=value.strip()
        if request.occurred_at is not None: fields["occurred_at"]=request.occurred_at.astimezone(timezone.utc).isoformat()
        if request.action_items is not None: fields["action_items_json"]=json.dumps(request.action_items)
        row=self.repository.update_versioned("meeting_notes",note_id,request.expected_version,{"title","occurred_at","summary","decisions","action_items_json","updated_at"},**fields)
        if row is None: raise HTTPException(status_code=409, detail="Meeting note was updated by another member. Refresh and retry.")
        self.repository.audit(team_id,project_id,actor["id"],"meeting_note",note_id,"meeting_note_updated",{"version":row["version"]},now)
        return self._meeting_note_response(row)

    def _meeting_note_response(self,row):
        author=self.repository.membership(row["created_by_membership_id"])
        return MeetingNoteResponse(id=row["id"],project_id=row["project_id"],title=row["title"],occurred_at=datetime.fromisoformat(row["occurred_at"]),summary=row["summary"],decisions=row["decisions"],action_items=json.loads(row["action_items_json"]),created_by_membership_id=row["created_by_membership_id"],created_by_display_name=author["display_name"] if author else "Former member",version=row["version"],created_at=datetime.fromisoformat(row["created_at"]),updated_at=datetime.fromisoformat(row["updated_at"]))

    def project_workspace(self, student_id: str, team_id: str, project_id: str) -> ProjectWorkspaceResponse:
        _, _, project = self._project_access(student_id, team_id, project_id)
        return ProjectWorkspaceResponse(project=self._project_response(project), milestones=[self._milestone_response(row) for row in self.repository.milestones(project_id)], tasks=[self._task_response(row) for row in self.repository.tasks(project_id)], meeting_notes=[self._meeting_note_response(row) for row in self.repository.meeting_notes(project_id)])

    def allocation_suggestions(self, student_id: str, team_id: str, project_id: str) -> AllocationSuggestionResponse:
        _, _, project = self._project_access(student_id, team_id, project_id)
        members = self.repository.memberships(team_id, active_only=True)
        sharing = {row["membership_id"]: row for row in self.repository.sharing_for_team(team_id)}
        suggestions=[]
        for task in self.repository.tasks(project_id):
            if task["status"] in {"done","cancelled"}: continue
            required=json.loads(task["required_skill_ids_json"]); candidates=[]
            for member in members:
                shared=sharing.get(member["id"]); skill_snapshot=json.loads(shared["skill_snapshot_json"]) if shared and shared["skills_shared"] else []
                shared_ids={item["skill_id"] for item in skill_snapshot}; matched=[sid for sid in required if sid in shared_ids]; missing=[sid for sid in required if sid not in shared_ids]
                assigned=self.repository.active_assigned_minutes(project_id,member["id"]); declared=int(shared["availability_minutes_per_week"]) if shared and shared["availability_shared"] and shared["availability_minutes_per_week"] is not None else None; remaining=max(0,declared-assigned) if declared is not None else None
                reasons=[]
                if matched: reasons.append(f"Shares {len(matched)} of {len(required)} task skill requirements: {', '.join(matched)}.")
                elif required: reasons.append("No matching task skills are currently shared with this team.")
                else: reasons.append("This task has no required-skill tags, so skill fit is intentionally not inferred.")
                if declared is not None: reasons.append(f"Declared team availability leaves about {remaining} minutes after current active group assignments.")
                else: reasons.append("Weekly availability has not been shared, so capacity fit is unknown.")
                if declared is not None and remaining < task["estimated_minutes"]: band="capacity_conflict"
                elif required and not matched and shared and shared["skills_shared"]: band="skill_gap"
                elif required and len(matched)==len(required) and (declared is None or remaining>=task["estimated_minutes"]): band="strong"
                elif matched or (declared is not None and remaining>=task["estimated_minutes"]): band="possible"
                else: band="limited_data"
                candidates.append(AllocationCandidate(membership_id=member["id"],display_name=member["display_name"],fit_band=band,matched_skill_ids=matched,missing_skill_ids=missing,declared_weekly_minutes=declared,current_group_assigned_minutes=assigned,remaining_declared_minutes=remaining,rationale=reasons,privacy_note=PRIVACY_NOTE))
            # Stable member order prevents this from becoming a performance leaderboard.
            suggestions.append(TaskAllocationSuggestion(task_id=task["id"],task_title=task["title"],required_skill_ids=required,estimated_minutes=task["estimated_minutes"],candidates=candidates,disclaimer=ALLOCATION_DISCLAIMER))
        return AllocationSuggestionResponse(project_id=project_id,suggestions=suggestions)

    def activity(self, student_id: str, team_id: str, project_id: str | None = None) -> list[ActivityEventResponse]:
        self._active_member(student_id, team_id)
        if project_id:
            project=self.repository.project(project_id)
            if project is None or project["team_id"]!=team_id: raise HTTPException(status_code=404,detail="Group project not found.")
        corrected=self.repository.corrected_event_ids(team_id); responses=[]
        for row in self.repository.activity(team_id,project_id):
            actor=self.repository.membership(row["actor_membership_id"]) if row["actor_membership_id"] else None
            responses.append(ActivityEventResponse(id=row["id"],project_id=row["project_id"],actor_membership_id=row["actor_membership_id"],actor_display_name=actor["display_name"] if actor else None,entity_type=row["entity_type"],entity_id=row["entity_id"],event_type=row["event_type"],detail=json.loads(row["detail_json"]),occurred_at=datetime.fromisoformat(row["occurred_at"]),correction_of_event_id=row["correction_of_event_id"],corrected=row["id"] in corrected))
        return responses

    def correct_activity(self, student_id: str, team_id: str, event_id: int, request: ActivityCorrectionRequest) -> ActivityEventResponse:
        _, actor=self._active_member(student_id,team_id); original=self.repository.activity_event(event_id)
        if original is None or original["team_id"]!=team_id: raise HTTPException(status_code=404,detail="Activity event not found.")
        if original["correction_of_event_id"] is not None: raise HTTPException(status_code=409,detail="A correction event cannot itself be corrected; add a new factual note instead.")
        if not (actor["role"] in {"owner","coordinator"} or original["actor_membership_id"]==actor["id"]): raise HTTPException(status_code=403,detail="Only the original actor, team coordinator or owner can correct this activity record.")
        if event_id in self.repository.corrected_event_ids(team_id): raise HTTPException(status_code=409,detail="This activity record already has a correction.")
        now=self._iso(); correction_id=self.repository.audit(team_id,original["project_id"],actor["id"],"activity_correction",str(event_id),"activity_corrected",{"reason":request.reason.strip(),"original_event_type":original["event_type"]},now,event_id)
        return next(item for item in self.activity(student_id,team_id) if item.id==correction_id)

    def contribution_history(self, student_id: str, team_id: str) -> ContributionHistoryResponse:
        self._active_member(student_id,team_id); members=self.repository.memberships(team_id); events=self.repository.activity(team_id); corrected=self.repository.corrected_event_ids(team_id)
        counters={member["id"]:{"task_created":0,"task_completed":0,"comments_added":0,"meeting_notes_added":0,"assignment_changes":0,"last":None} for member in members}
        mapping={"task_created":"task_created","task_completed":"task_completed","comment_added":"comments_added","meeting_note_added":"meeting_notes_added","task_assigned":"assignment_changes"}
        for event in events:
            if event["id"] in corrected or event["correction_of_event_id"] is not None: continue
            actor=event["actor_membership_id"]
            if actor not in counters or event["event_type"] not in mapping: continue
            counters[actor][mapping[event["event_type"]]]+=1
            when=datetime.fromisoformat(event["occurred_at"])
            if counters[actor]["last"] is None or when>counters[actor]["last"]: counters[actor]["last"]=when
        summaries=[ContributionMemberSummary(membership_id=m["id"],display_name=m["display_name"],role=m["role"],task_created=counters[m["id"]]["task_created"],task_completed=counters[m["id"]]["task_completed"],comments_added=counters[m["id"]]["comments_added"],meeting_notes_added=counters[m["id"]]["meeting_notes_added"],assignment_changes=counters[m["id"]]["assignment_changes"],last_activity_at=counters[m["id"]]["last"]) for m in members]
        return ContributionHistoryResponse(team_id=team_id,members=summaries,explanation=CONTRIBUTION_EXPLANATION)
