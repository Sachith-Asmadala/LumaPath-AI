from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..careers.repository import CareerRepository
from ..careers.service import CareerService
from .repository import TeamRepository
from .schemas import *
from .service import TeamService

router = APIRouter(prefix="/v1/teams", tags=["teams"])
invite_router = APIRouter(prefix="/v1/team-invitations", tags=["teams"])
repository = TeamRepository(settings.database_path)
career_service = CareerService(CareerRepository(settings.database_path))
service = TeamService(repository, career_service=career_service)

@router.post("", response_model=TeamDetail, status_code=201)
def create_team(request: TeamCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_team(principal.student_id, request)

@router.get("", response_model=list[TeamSummary])
def list_teams(principal: Principal = Depends(current_principal)):
    return service.list_teams(principal.student_id)

@router.get("/{team_id}", response_model=TeamDetail)
def team_detail(team_id: str, principal: Principal = Depends(current_principal)):
    return service.team_detail(principal.student_id, team_id)

@router.post("/{team_id}/invitations", response_model=InvitationCreateResponse, status_code=201)
def create_invitation(team_id: str, request: InvitationCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_invitation(principal.student_id, team_id, request)

@router.get("/{team_id}/invitations", response_model=list[InvitationResponse])
def invitations(team_id: str, principal: Principal = Depends(current_principal)):
    return service.list_invitations(principal.student_id, team_id)

@router.post("/{team_id}/invitations/{invitation_id}/revoke", response_model=InvitationResponse)
def revoke_invitation(team_id: str, invitation_id: str, principal: Principal = Depends(current_principal)):
    return service.revoke_invitation(principal.student_id, team_id, invitation_id)

@invite_router.post("/accept", response_model=TeamDetail)
def accept_invitation(request: InvitationAcceptRequest, principal: Principal = Depends(current_principal)):
    return service.accept_invitation(principal.student_id, request)

@router.put("/{team_id}/members/{membership_id}/role", response_model=MemberResponse)
def update_member_role(team_id: str, membership_id: str, request: MemberRoleUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_member_role(principal.student_id, team_id, membership_id, request)

@router.post("/{team_id}/members/{membership_id}/remove", response_model=MemberResponse)
def remove_member(team_id: str, membership_id: str, request: MemberRemovalRequest, principal: Principal = Depends(current_principal)):
    return service.remove_member(principal.student_id, team_id, membership_id, request)

@router.post("/{team_id}/leave")
def leave_team(team_id: str, request: LeaveTeamRequest, principal: Principal = Depends(current_principal)):
    return service.leave_team(principal.student_id, team_id, request)

@router.put("/{team_id}/sharing", response_model=MemberSharingResponse)
def update_sharing(team_id: str, request: MemberSharingUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_sharing(principal.student_id, team_id, request)

@router.post("/{team_id}/projects", response_model=ProjectResponse, status_code=201)
def create_project(team_id: str, request: ProjectCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_project(principal.student_id, team_id, request)

@router.get("/{team_id}/projects", response_model=list[ProjectResponse])
def list_projects(team_id: str, principal: Principal = Depends(current_principal)):
    return service.list_projects(principal.student_id, team_id)

@router.get("/{team_id}/projects/{project_id}", response_model=ProjectWorkspaceResponse)
def project_workspace(team_id: str, project_id: str, principal: Principal = Depends(current_principal)):
    return service.project_workspace(principal.student_id, team_id, project_id)

@router.put("/{team_id}/projects/{project_id}", response_model=ProjectResponse)
def update_project(team_id: str, project_id: str, request: ProjectUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_project(principal.student_id, team_id, project_id, request)

@router.post("/{team_id}/projects/{project_id}/milestones", response_model=MilestoneResponse, status_code=201)
def create_milestone(team_id: str, project_id: str, request: MilestoneCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_milestone(principal.student_id, team_id, project_id, request)

@router.put("/{team_id}/projects/{project_id}/milestones/{milestone_id}", response_model=MilestoneResponse)
def update_milestone(team_id: str, project_id: str, milestone_id: str, request: MilestoneUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_milestone(principal.student_id, team_id, project_id, milestone_id, request)

@router.post("/{team_id}/projects/{project_id}/tasks", response_model=TaskResponse, status_code=201)
def create_task(team_id: str, project_id: str, request: TaskCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_task(principal.student_id, team_id, project_id, request)

@router.put("/{team_id}/projects/{project_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(team_id: str, project_id: str, task_id: str, request: TaskUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_task(principal.student_id, team_id, project_id, task_id, request)

@router.post("/{team_id}/projects/{project_id}/tasks/{task_id}/status", response_model=TaskResponse)
def task_status(team_id: str, project_id: str, task_id: str, request: TaskStatusRequest, principal: Principal = Depends(current_principal)):
    return service.update_task_status(principal.student_id, team_id, project_id, task_id, request)

@router.post("/{team_id}/projects/{project_id}/tasks/{task_id}/assignment", response_model=TaskResponse)
def task_assignment(team_id: str, project_id: str, task_id: str, request: TaskAssignmentRequest, principal: Principal = Depends(current_principal)):
    return service.assign_task(principal.student_id, team_id, project_id, task_id, request)

@router.post("/{team_id}/projects/{project_id}/tasks/{task_id}/comments", response_model=CommentResponse, status_code=201)
def add_comment(team_id: str, project_id: str, task_id: str, request: CommentCreateRequest, principal: Principal = Depends(current_principal)):
    return service.add_comment(principal.student_id, team_id, project_id, task_id, request)

@router.get("/{team_id}/projects/{project_id}/tasks/{task_id}/comments", response_model=list[CommentResponse])
def comments(team_id: str, project_id: str, task_id: str, principal: Principal = Depends(current_principal)):
    return service.comments(principal.student_id, team_id, project_id, task_id)

@router.post("/{team_id}/projects/{project_id}/meeting-notes", response_model=MeetingNoteResponse, status_code=201)
def create_meeting_note(team_id: str, project_id: str, request: MeetingNoteCreateRequest, principal: Principal = Depends(current_principal)):
    return service.create_meeting_note(principal.student_id, team_id, project_id, request)

@router.put("/{team_id}/projects/{project_id}/meeting-notes/{note_id}", response_model=MeetingNoteResponse)
def update_meeting_note(team_id: str, project_id: str, note_id: str, request: MeetingNoteUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_meeting_note(principal.student_id, team_id, project_id, note_id, request)

@router.post("/{team_id}/projects/{project_id}/allocation-suggestions", response_model=AllocationSuggestionResponse)
def allocation_suggestions(team_id: str, project_id: str, principal: Principal = Depends(current_principal)):
    return service.allocation_suggestions(principal.student_id, team_id, project_id)

@router.get("/{team_id}/activity", response_model=list[ActivityEventResponse])
def activity(team_id: str, project_id: str | None = None, principal: Principal = Depends(current_principal)):
    return service.activity(principal.student_id, team_id, project_id)

@router.post("/{team_id}/activity/{event_id}/corrections", response_model=ActivityEventResponse, status_code=201)
def correct_activity(team_id: str, event_id: int, request: ActivityCorrectionRequest, principal: Principal = Depends(current_principal)):
    return service.correct_activity(principal.student_id, team_id, event_id, request)

@router.get("/{team_id}/contributions", response_model=ContributionHistoryResponse)
def contributions(team_id: str, principal: Principal = Depends(current_principal)):
    return service.contribution_history(principal.student_id, team_id)
