from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import NotificationRepository
from .schemas import ActionResponse, CandidateSyncRequest, InboxResponse, NotificationPreferencesRequest, NotificationPreferencesResponse, RetryResponse, SyncResultResponse
from .service import NotificationService

router = APIRouter(prefix="/v1/notifications", tags=["notifications"])
repository = NotificationRepository(settings.database_path)
service = NotificationService(repository, max_attempts=settings.notification_delivery_max_attempts)

@router.get("/preferences", response_model=NotificationPreferencesResponse)
def preferences(principal: Principal = Depends(current_principal)):
    return service.get_preferences(principal.student_id)

@router.put("/preferences", response_model=NotificationPreferencesResponse)
def update_preferences(request: NotificationPreferencesRequest, principal: Principal = Depends(current_principal)):
    return service.set_preferences(principal.student_id, request)

@router.post("/candidates/sync", response_model=SyncResultResponse)
def sync_candidates(request: CandidateSyncRequest, principal: Principal = Depends(current_principal)):
    return service.sync(principal.student_id, request)

@router.get("/inbox", response_model=InboxResponse)
def inbox(include_dismissed: bool = Query(False), principal: Principal = Depends(current_principal)):
    return service.inbox(principal.student_id, include_dismissed)

@router.post("/deliveries/{delivery_id}/opened", response_model=ActionResponse)
def opened(delivery_id: str, principal: Principal = Depends(current_principal)):
    service.mark(principal.student_id, delivery_id, "opened"); return ActionResponse()

@router.post("/deliveries/{delivery_id}/dismissed", response_model=ActionResponse)
def dismissed(delivery_id: str, principal: Principal = Depends(current_principal)):
    service.mark(principal.student_id, delivery_id, "dismissed"); return ActionResponse()

@router.post("/deliveries/{delivery_id}/acted", response_model=ActionResponse)
def acted(delivery_id: str, principal: Principal = Depends(current_principal)):
    service.mark(principal.student_id, delivery_id, "acted"); return ActionResponse()

@router.post("/deliveries/retry", response_model=RetryResponse)
def retry(principal: Principal = Depends(current_principal)):
    return service.retry_failed(principal.student_id)
