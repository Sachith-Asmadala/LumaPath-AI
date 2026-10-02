from __future__ import annotations

from fastapi import APIRouter, Depends, Response, status

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import InternshipRepository
from .schemas import (
    ApplicationListResponse, ApplicationResponse, ArchiveRequest, CreateApplicationRequest, PlannerActionRequest,
    PlannerActionResponse, ReminderRequest, ReminderResponse, StatusTransitionRequest, UpdateApplicationRequest,
)
from .service import InternshipService

router = APIRouter(prefix="/v1/internships", tags=["internships"])
repository = InternshipRepository(settings.database_path)
service = InternshipService(repository)


@router.post("/applications", response_model=ApplicationResponse, status_code=201)
def create_application(request: CreateApplicationRequest, principal: Principal = Depends(current_principal)) -> ApplicationResponse:
    return service.create(principal.student_id, request)


@router.get("/applications", response_model=ApplicationListResponse)
def list_applications(include_archived: bool = False, principal: Principal = Depends(current_principal)) -> ApplicationListResponse:
    return service.list(principal.student_id, include_archived)


@router.get("/applications/{application_id}", response_model=ApplicationResponse)
def get_application(application_id: str, principal: Principal = Depends(current_principal)) -> ApplicationResponse:
    return service.get(principal.student_id, application_id)


@router.put("/applications/{application_id}", response_model=ApplicationResponse)
def update_application(application_id: str, request: UpdateApplicationRequest, principal: Principal = Depends(current_principal)) -> ApplicationResponse:
    return service.update(principal.student_id, application_id, request)


@router.delete("/applications/{application_id}", status_code=204)
def delete_application(application_id: str, principal: Principal = Depends(current_principal)) -> Response:
    service.delete(principal.student_id, application_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/applications/{application_id}/status", response_model=ApplicationResponse)
def change_status(application_id: str, request: StatusTransitionRequest, principal: Principal = Depends(current_principal)) -> ApplicationResponse:
    return service.transition(principal.student_id, application_id, request)


@router.post("/applications/{application_id}/archive", response_model=ApplicationResponse)
def archive_application(application_id: str, request: ArchiveRequest, principal: Principal = Depends(current_principal)) -> ApplicationResponse:
    return service.archive(principal.student_id, application_id, request)


@router.post("/applications/{application_id}/reminders", response_model=ReminderResponse, status_code=201)
def create_reminder(application_id: str, request: ReminderRequest, principal: Principal = Depends(current_principal)) -> ReminderResponse:
    return service.create_reminder(principal.student_id, application_id, request)


@router.put("/applications/{application_id}/reminders/{reminder_id}", response_model=ReminderResponse)
def update_reminder(application_id: str, reminder_id: str, request: ReminderRequest, principal: Principal = Depends(current_principal)) -> ReminderResponse:
    return service.update_reminder(principal.student_id, application_id, reminder_id, request)


@router.post("/applications/{application_id}/planner-actions", response_model=PlannerActionResponse, status_code=201)
def create_planner_action(application_id: str, request: PlannerActionRequest, principal: Principal = Depends(current_principal)) -> PlannerActionResponse:
    return service.planner_action(principal.student_id, application_id, request)
