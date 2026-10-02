from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import FocusSessionRepository
from .schemas import FinishFocusSessionRequest, FocusSessionListResponse, FocusSessionResponse, StartFocusSessionRequest
from .service import FocusSessionService

router = APIRouter(prefix="/v1/focus-sessions", tags=["focus"])
_repository = FocusSessionRepository(settings.database_path)
_service = FocusSessionService(_repository)


@router.post("", response_model=FocusSessionResponse, status_code=201)
def start_focus(request: StartFocusSessionRequest, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.start(principal.student_id, request)


@router.get("/active", response_model=FocusSessionResponse | None)
def active_focus(principal: Principal = Depends(current_principal)) -> FocusSessionResponse | None:
    return _service.active(principal.student_id)


@router.get("", response_model=FocusSessionListResponse)
def recent_focus(limit: int = Query(default=20, ge=1, le=50), principal: Principal = Depends(current_principal)) -> FocusSessionListResponse:
    return FocusSessionListResponse(sessions=_service.recent(principal.student_id, limit))


@router.get("/{session_id}", response_model=FocusSessionResponse)
def get_focus(session_id: str, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.get(principal.student_id, session_id)


@router.post("/{session_id}/pause", response_model=FocusSessionResponse)
def pause_focus(session_id: str, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.pause(principal.student_id, session_id)


@router.post("/{session_id}/resume", response_model=FocusSessionResponse)
def resume_focus(session_id: str, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.resume(principal.student_id, session_id)


@router.post("/{session_id}/heartbeat", response_model=FocusSessionResponse)
def heartbeat_focus(session_id: str, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.heartbeat(principal.student_id, session_id)


@router.post("/{session_id}/finish", response_model=FocusSessionResponse)
def finish_focus(session_id: str, request: FinishFocusSessionRequest, principal: Principal = Depends(current_principal)) -> FocusSessionResponse:
    return _service.finish(principal.student_id, session_id, request)
