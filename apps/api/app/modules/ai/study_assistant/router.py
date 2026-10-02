from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ....core.config import settings
from ....core.security import Principal, current_principal
from .provider import DeterministicStudyAssistantProvider
from .rate_limit import SlidingWindowRateLimiter
from .repository import SqliteAssistantRepository
from .schemas import (
    ApproveActionRequest,
    ApproveActionResponse,
    ContextSyncResponse,
    FeedbackRequest,
    FeedbackResponse,
    StudentAssistantContextSnapshot,
    StudyAssistantRequest,
    StudyAssistantResponse,
)
from .service import AssistantError, StudyAssistantService

router = APIRouter(prefix="/v1/study-assistant", tags=["study-assistant"])
repository = SqliteAssistantRepository(settings.database_path, session_retention_hours=settings.assistant_session_retention_hours)
service = StudyAssistantService(repository, DeterministicStudyAssistantProvider())
limiter = SlidingWindowRateLimiter(settings.assistant_rate_limit_per_minute)


def _handle(error: AssistantError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


@router.put("/context", response_model=ContextSyncResponse)
def sync_context(snapshot: StudentAssistantContextSnapshot, principal: Principal = Depends(current_principal)) -> ContextSyncResponse:
    try:
        return service.sync_context(principal.student_id, snapshot)
    except AssistantError as exc:
        raise _handle(exc) from exc


@router.post("/respond", response_model=StudyAssistantResponse)
def respond(request: StudyAssistantRequest, principal: Principal = Depends(current_principal)) -> StudyAssistantResponse:
    limiter.check(principal.student_id)
    try:
        return service.respond(principal.student_id, request)
    except AssistantError as exc:
        raise _handle(exc) from exc


@router.post("/actions/approve", response_model=ApproveActionResponse)
def approve_action(request: ApproveActionRequest, principal: Principal = Depends(current_principal)) -> ApproveActionResponse:
    try:
        return service.approve_action(principal.student_id, request)
    except AssistantError as exc:
        raise _handle(exc) from exc


@router.post("/sessions/{session_id}/feedback", response_model=FeedbackResponse)
def save_feedback(session_id: str, request: FeedbackRequest, principal: Principal = Depends(current_principal)) -> FeedbackResponse:
    try:
        service.save_feedback(principal.student_id, session_id, request)
        return FeedbackResponse(saved=True)
    except AssistantError as exc:
        raise _handle(exc) from exc
