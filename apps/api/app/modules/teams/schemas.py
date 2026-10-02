from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

TeamRole = Literal["owner", "coordinator", "member"]
MemberStatus = Literal["active", "left", "removed"]
ProjectStatus = Literal["active", "completed", "archived"]
MilestoneStatus = Literal["planned", "in_progress", "done"]
TaskStatus = Literal["todo", "in_progress", "blocked", "done", "cancelled"]


class TeamCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1200)
    owner_display_name: str = Field(min_length=1, max_length=120)


class TeamSummary(BaseModel):
    id: str
    name: str
    description: str
    status: str
    my_membership_id: str
    my_role: TeamRole
    active_member_count: int
    version: int
    created_at: datetime
    updated_at: datetime


class InvitationCreateRequest(BaseModel):
    invite_label: str = Field(min_length=1, max_length=160)
    role: Literal["coordinator", "member"] = "member"
    expires_at: datetime


class InvitationResponse(BaseModel):
    id: str
    team_id: str
    invite_label: str
    role: Literal["coordinator", "member"]
    status: Literal["pending", "accepted", "revoked", "expired"]
    expires_at: datetime
    created_at: datetime


class InvitationCreateResponse(BaseModel):
    invitation: InvitationResponse
    invitation_token: str


class InvitationAcceptRequest(BaseModel):
    invitation_token: str = Field(min_length=20, max_length=300)
    display_name: str = Field(min_length=1, max_length=120)


class MemberResponse(BaseModel):
    id: str
    display_name: str
    role: TeamRole
    status: MemberStatus
    is_self: bool
    joined_at: datetime
    removed_at: datetime | None = None
    version: int


class MemberRoleUpdateRequest(BaseModel):
    role: TeamRole
    expected_version: int = Field(ge=1)


class MemberRemovalRequest(BaseModel):
    reason: str = Field(min_length=2, max_length=500)
    expected_version: int = Field(ge=1)


class LeaveTeamRequest(BaseModel):
    reason: str = Field(default="Leaving the team", min_length=2, max_length=500)


class SharedSkill(BaseModel):
    skill_id: str
    name: str
    proficiency: int | None = Field(default=None, ge=0, le=100)
    confidence: float | None = Field(default=None, ge=0, le=1)


class MemberSharingUpdateRequest(BaseModel):
    share_availability: bool = False
    availability_minutes_per_week: int | None = Field(default=None, ge=0, le=7 * 24 * 60)
    share_skills: bool = False
    target_role: str | None = Field(default=None, max_length=120)
    skill_ids: list[str] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_sharing(self):
        if self.share_availability and self.availability_minutes_per_week is None:
            raise ValueError("Weekly availability is required when availability sharing is enabled.")
        if self.share_skills and (not self.target_role or not self.skill_ids):
            raise ValueError("Target role and selected skills are required when skill sharing is enabled.")
        return self


class MemberSharingResponse(BaseModel):
    membership_id: str
    availability_shared: bool
    availability_minutes_per_week: int | None = None
    skills_shared: bool
    target_role: str | None = None
    skills: list[SharedSkill] = Field(default_factory=list)
    updated_at: datetime
    privacy_note: str


class TeamDetail(BaseModel):
    team: TeamSummary
    members: list[MemberResponse]
    my_sharing: MemberSharingResponse | None = None
    privacy_note: str


class ProjectCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    description: str = Field(default="", max_length=2000)
    due_at: datetime | None = None
    owner_membership_id: str | None = None


class ProjectUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    name: str | None = Field(default=None, min_length=2, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    due_at: datetime | None = None
    status: ProjectStatus | None = None
    owner_membership_id: str | None = None


class ProjectResponse(BaseModel):
    id: str
    team_id: str
    name: str
    description: str
    owner_membership_id: str
    owner_display_name: str
    status: ProjectStatus
    due_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class MilestoneCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="", max_length=1200)
    due_at: datetime | None = None


class MilestoneUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, max_length=1200)
    due_at: datetime | None = None
    status: MilestoneStatus | None = None


class MilestoneResponse(BaseModel):
    id: str
    project_id: str
    title: str
    description: str
    due_at: datetime | None = None
    status: MilestoneStatus
    version: int
    created_at: datetime
    updated_at: datetime


class TaskCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=240)
    description: str = Field(default="", max_length=3000)
    milestone_id: str | None = None
    assignee_membership_id: str | None = None
    estimated_minutes: int = Field(default=60, ge=5, le=7 * 24 * 60)
    due_at: datetime | None = None
    required_skill_ids: list[str] = Field(default_factory=list, max_length=20)
    dependency_task_ids: list[str] = Field(default_factory=list, max_length=30)


class TaskUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=2, max_length=240)
    description: str | None = Field(default=None, max_length=3000)
    milestone_id: str | None = None
    estimated_minutes: int | None = Field(default=None, ge=5, le=7 * 24 * 60)
    due_at: datetime | None = None
    required_skill_ids: list[str] | None = Field(default=None, max_length=20)
    dependency_task_ids: list[str] | None = Field(default=None, max_length=30)


class TaskStatusRequest(BaseModel):
    status: TaskStatus
    expected_version: int = Field(ge=1)


class TaskAssignmentRequest(BaseModel):
    assignee_membership_id: str | None = None
    expected_version: int = Field(ge=1)
    confirmed: bool
    rationale_note: str = Field(default="", max_length=500)


class TaskResponse(BaseModel):
    id: str
    project_id: str
    milestone_id: str | None = None
    title: str
    description: str
    status: TaskStatus
    assignee_membership_id: str | None = None
    assignee_display_name: str | None = None
    estimated_minutes: int
    due_at: datetime | None = None
    required_skill_ids: list[str]
    dependency_task_ids: list[str]
    version: int
    created_by_membership_id: str
    created_at: datetime
    updated_at: datetime


class CommentCreateRequest(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


class CommentResponse(BaseModel):
    id: str
    task_id: str
    author_membership_id: str
    author_display_name: str
    body: str
    created_at: datetime


class MeetingNoteCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    occurred_at: datetime
    summary: str = Field(min_length=1, max_length=5000)
    decisions: str = Field(default="", max_length=5000)
    action_items: list[str] = Field(default_factory=list, max_length=30)


class MeetingNoteUpdateRequest(BaseModel):
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=2, max_length=200)
    occurred_at: datetime | None = None
    summary: str | None = Field(default=None, min_length=1, max_length=5000)
    decisions: str | None = Field(default=None, max_length=5000)
    action_items: list[str] | None = Field(default=None, max_length=30)


class MeetingNoteResponse(BaseModel):
    id: str
    project_id: str
    title: str
    occurred_at: datetime
    summary: str
    decisions: str
    action_items: list[str]
    created_by_membership_id: str
    created_by_display_name: str
    version: int
    created_at: datetime
    updated_at: datetime


class ProjectWorkspaceResponse(BaseModel):
    project: ProjectResponse
    milestones: list[MilestoneResponse]
    tasks: list[TaskResponse]
    meeting_notes: list[MeetingNoteResponse]


class AllocationCandidate(BaseModel):
    membership_id: str
    display_name: str
    fit_band: Literal["strong", "possible", "limited_data", "capacity_conflict", "skill_gap"]
    matched_skill_ids: list[str]
    missing_skill_ids: list[str]
    declared_weekly_minutes: int | None = None
    current_group_assigned_minutes: int
    remaining_declared_minutes: int | None = None
    rationale: list[str]
    privacy_note: str


class TaskAllocationSuggestion(BaseModel):
    task_id: str
    task_title: str
    required_skill_ids: list[str]
    estimated_minutes: int
    candidates: list[AllocationCandidate]
    assignment_requires_human_approval: bool = True
    disclaimer: str


class AllocationSuggestionResponse(BaseModel):
    project_id: str
    suggestions: list[TaskAllocationSuggestion]


class ActivityEventResponse(BaseModel):
    id: int
    project_id: str | None = None
    actor_membership_id: str | None = None
    actor_display_name: str | None = None
    entity_type: str
    entity_id: str
    event_type: str
    detail: dict
    occurred_at: datetime
    correction_of_event_id: int | None = None
    corrected: bool = False


class ActivityCorrectionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


class ContributionMemberSummary(BaseModel):
    membership_id: str
    display_name: str
    role: TeamRole
    task_created: int
    task_completed: int
    comments_added: int
    meeting_notes_added: int
    assignment_changes: int
    last_activity_at: datetime | None = None


class ContributionHistoryResponse(BaseModel):
    team_id: str
    members: list[ContributionMemberSummary]
    no_ranking: bool = True
    explanation: str
