from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, UploadFile

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..documents.storage import LocalPrivateObjectStorage
from ..portfolio.repository import PortfolioRepository
from .repository import CvRepository
from .schemas import (
    CreatePastedCvRequest, CvAnalysisResponse, CvDeleteResponse, CvDocumentListResponse, CvDocumentResponse,
    CvExportResponse, CvSuggestion, CvSuggestionDecisionRequest, UpdateCvSectionsRequest,
)
from .service import CvService

router = APIRouter(prefix="/v1/cv", tags=["cv"])
repository = CvRepository(settings.database_path)
portfolio_repository = PortfolioRepository(settings.database_path)
storage = LocalPrivateObjectStorage(settings.cv_storage_path)
service = CvService(
    repository, storage, portfolio_repository,
    max_upload_bytes=settings.cv_max_upload_bytes,
    require_malware_scan=settings.cv_require_malware_scan,
    analyses_per_minute=settings.cv_analyses_per_minute,
)


@router.post("/documents/paste", response_model=CvDocumentResponse, status_code=201)
def create_pasted_cv(request: CreatePastedCvRequest, principal: Principal = Depends(current_principal)) -> CvDocumentResponse:
    return service.create_paste(principal.student_id, request)


@router.post("/documents/upload", response_model=CvDocumentResponse, status_code=201)
async def upload_cv(
    file: UploadFile = File(...),
    target_role: str = Form(...),
    retention_days: int = Form(30),
    principal: Principal = Depends(current_principal),
) -> CvDocumentResponse:
    data = await file.read(settings.cv_max_upload_bytes + 1)
    return service.create_upload(principal.student_id, file.filename or "cv", file.content_type, data, target_role, retention_days)


@router.get("/documents", response_model=CvDocumentListResponse)
def list_cvs(principal: Principal = Depends(current_principal)) -> CvDocumentListResponse:
    return service.list(principal.student_id)


@router.get("/documents/{document_id}", response_model=CvDocumentResponse)
def get_cv(document_id: str, principal: Principal = Depends(current_principal)) -> CvDocumentResponse:
    return service.get(principal.student_id, document_id)


@router.put("/documents/{document_id}/sections", response_model=CvDocumentResponse)
def review_sections(document_id: str, request: UpdateCvSectionsRequest, principal: Principal = Depends(current_principal)) -> CvDocumentResponse:
    return service.update_sections(principal.student_id, document_id, request)


@router.post("/documents/{document_id}/analysis", response_model=CvAnalysisResponse)
def analyze_cv(document_id: str, principal: Principal = Depends(current_principal)) -> CvAnalysisResponse:
    return service.analyze(principal.student_id, document_id)


@router.post("/documents/{document_id}/suggestions/{suggestion_id}", response_model=CvSuggestion)
def decide_suggestion(document_id: str, suggestion_id: str, request: CvSuggestionDecisionRequest, principal: Principal = Depends(current_principal)) -> CvSuggestion:
    return service.decide_suggestion(principal.student_id, document_id, suggestion_id, request)


@router.get("/documents/{document_id}/export", response_model=CvExportResponse)
def export_cv(document_id: str, principal: Principal = Depends(current_principal)) -> CvExportResponse:
    return service.export(principal.student_id, document_id)


@router.delete("/documents/{document_id}/source", response_model=CvDeleteResponse)
def delete_source(document_id: str, principal: Principal = Depends(current_principal)) -> CvDeleteResponse:
    return service.delete_source(principal.student_id, document_id)


@router.delete("/documents/{document_id}/analysis", response_model=CvDeleteResponse)
def delete_analysis(document_id: str, principal: Principal = Depends(current_principal)) -> CvDeleteResponse:
    return service.delete_analysis(principal.student_id, document_id)


@router.delete("/documents/{document_id}", response_model=CvDeleteResponse)
def delete_cv(document_id: str, principal: Principal = Depends(current_principal)) -> CvDeleteResponse:
    return service.delete(principal.student_id, document_id)
