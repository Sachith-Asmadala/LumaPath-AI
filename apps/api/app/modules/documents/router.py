from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..ai.study_assistant.rate_limit import SlidingWindowRateLimiter
from .jobs import ThreadPoolDocumentJobDispatcher
from .repository import SqliteDocumentRepository
from .schemas import ApproveDocumentActionRequest, ApproveDocumentActionResponse, DeleteDocumentResponse, DocumentListResponse, DocumentRecord, RetryDocumentResponse
from .security import MalwareScanner
from .service import DocumentError, DocumentService
from .storage import LocalPrivateObjectStorage

router = APIRouter(prefix="/v1/documents", tags=["documents"])
repository = SqliteDocumentRepository(settings.database_path)
storage = LocalPrivateObjectStorage(settings.document_storage_path)
scanner = MalwareScanner(require_scanner=settings.document_require_malware_scan)
dispatcher = ThreadPoolDocumentJobDispatcher(settings.document_worker_threads)
service = DocumentService(
    repository,
    storage,
    scanner,
    dispatcher,
    max_bytes=settings.document_max_upload_bytes,
    retention_days=settings.document_retention_days,
    max_processing_attempts=settings.document_max_processing_attempts,
)
limiter = SlidingWindowRateLimiter(settings.document_uploads_per_minute)


def _handle(error: DocumentError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=str(error))


@router.post("", response_model=DocumentRecord, status_code=202)
async def upload_document(
    file: UploadFile = File(...),
    document_kind: str | None = Form(default=None),
    module_id: str | None = Form(default=None),
    principal: Principal = Depends(current_principal),
) -> DocumentRecord:
    limiter.check(principal.student_id)
    try:
        data = await file.read(settings.document_max_upload_bytes + 1)
        return service.upload(
            principal.student_id,
            filename=file.filename or "upload",
            declared_mime=file.content_type,
            data=data,
            requested_kind=document_kind,
            module_id=module_id,
        )
    except DocumentError as exc:
        raise _handle(exc) from exc


@router.get("", response_model=DocumentListResponse)
def list_documents(principal: Principal = Depends(current_principal)) -> DocumentListResponse:
    return service.list(principal.student_id)


@router.get("/{document_id}", response_model=DocumentRecord)
def get_document(document_id: str, principal: Principal = Depends(current_principal)) -> DocumentRecord:
    try:
        return service.get(principal.student_id, document_id)
    except DocumentError as exc:
        raise _handle(exc) from exc


@router.post("/{document_id}/retry", response_model=RetryDocumentResponse, status_code=202)
def retry_document(document_id: str, principal: Principal = Depends(current_principal)) -> RetryDocumentResponse:
    try:
        return service.retry(principal.student_id, document_id)
    except DocumentError as exc:
        raise _handle(exc) from exc


@router.post("/{document_id}/actions/approve", response_model=ApproveDocumentActionResponse)
def approve_action(document_id: str, request: ApproveDocumentActionRequest, principal: Principal = Depends(current_principal)) -> ApproveDocumentActionResponse:
    try:
        return service.approve_action(principal.student_id, document_id, request)
    except DocumentError as exc:
        raise _handle(exc) from exc


@router.delete("/{document_id}", response_model=DeleteDocumentResponse)
def delete_document(document_id: str, principal: Principal = Depends(current_principal)) -> DeleteDocumentResponse:
    try:
        return service.delete(principal.student_id, document_id)
    except DocumentError as exc:
        raise _handle(exc) from exc
