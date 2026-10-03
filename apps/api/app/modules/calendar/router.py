from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile

from ...core.config import settings
from ...core.security import Principal, current_principal
from .connectors import CredentialCipher
from .repository import CalendarRepository
from .schemas import CleanupRequest, CleanupResponse, CommitRequest, CommitResponse, ConnectionListResponse, ExistingRecordInput, ItemListResponse, OverrideRequest, CalendarItemResponse, PreviewResponse, RevokeResponse
from .service import CalendarService
from .schemas import SyncHistoryItem, SyncHistoryResponse

router = APIRouter(prefix="/v1/calendar", tags=["calendar"])
repository = CalendarRepository(settings.database_path)
credential_cipher = CredentialCipher(settings.calendar_credential_key) if settings.calendar_credential_key else None
service = CalendarService(repository, max_upload_bytes=settings.calendar_max_upload_bytes, credential_cipher=credential_cipher)


def _records(raw: str) -> list[ExistingRecordInput]:
    if not raw.strip(): return []
    try: data = json.loads(raw)
    except json.JSONDecodeError as exc: raise ValueError("existing_records_json must contain valid JSON.") from exc
    return [ExistingRecordInput.model_validate(item) for item in data]


@router.post("/imports/preview", response_model=PreviewResponse, status_code=201)
async def preview(file: UploadFile = File(...), timezone: str = Form("Asia/Colombo"), connection_id: str | None = Form(None), existing_records_json: str = Form("[]"), principal: Principal = Depends(current_principal)):
    try: records = _records(existing_records_json)
    except (ValueError, TypeError) as exc:
        from fastapi import HTTPException
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return await service.preview_upload(principal.student_id, file, timezone, records, connection_id)


@router.post("/sync-runs/{run_id}/commit", response_model=CommitResponse)
def commit(run_id: str, request: CommitRequest, principal: Principal = Depends(current_principal)):
    return service.commit(principal.student_id, run_id, request)


@router.get("/connections", response_model=ConnectionListResponse)
def connections(principal: Principal = Depends(current_principal)):
    return service.list_connections(principal.student_id)


@router.get("/sync-history", response_model=SyncHistoryResponse)
def sync_history(principal: Principal = Depends(current_principal)):
    items = []
    for row in repository.list_sync_history(principal.student_id):
        counts = json.loads(row["commit_json"]) if row["commit_json"] else {}
        items.append(SyncHistoryItem(
            id=row["id"], connection_id=row["connection_id"], connection_name=row["connection_name"],
            status=row["status"], source_filename=row["source_filename"], source_format=row["source_format"],
            started_at=row["started_at"], completed_at=row["completed_at"],
            imported=counts.get("imported", 0), updated=counts.get("updated", 0), skipped=counts.get("skipped", 0),
        ))
    return SyncHistoryResponse(items=items)


@router.post("/connections/{connection_id}/revoke", response_model=RevokeResponse)
def revoke(connection_id: str, principal: Principal = Depends(current_principal)):
    return service.revoke(principal.student_id, connection_id)


@router.post("/connections/{connection_id}/cleanup", response_model=CleanupResponse)
def cleanup(connection_id: str, request: CleanupRequest, principal: Principal = Depends(current_principal)):
    return service.cleanup(principal.student_id, connection_id, request)


@router.get("/items", response_model=ItemListResponse)
def items(connection_id: str | None = Query(None), include_deleted: bool = Query(False), principal: Principal = Depends(current_principal)):
    return service.list_items(principal.student_id, connection_id, include_deleted)


@router.put("/items/{item_id}/overrides", response_model=CalendarItemResponse)
def overrides(item_id: str, request: OverrideRequest, principal: Principal = Depends(current_principal)):
    return service.set_overrides(principal.student_id, item_id, request)
