from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import SqliteProfilePreferenceRepository
from .schemas import LocalePreferenceRequest, LocalePreferenceResponse, TranslationReportRequest, TranslationReportResponse
from .service import ProfilePreferenceService

router = APIRouter(prefix="/v1/profile/preferences", tags=["profile-preferences"])
repository = SqliteProfilePreferenceRepository(settings.database_path)
service = ProfilePreferenceService(repository)


@router.get("/locale", response_model=LocalePreferenceResponse)
def get_locale(principal: Principal = Depends(current_principal)) -> LocalePreferenceResponse:
    return service.get_locale(principal.student_id)


@router.put("/locale", response_model=LocalePreferenceResponse)
def set_locale(request: LocalePreferenceRequest, principal: Principal = Depends(current_principal)) -> LocalePreferenceResponse:
    return service.set_locale(principal.student_id, request.locale, request.translation_version)


@router.post("/translation-reports", response_model=TranslationReportResponse)
def report_translation(request: TranslationReportRequest, principal: Principal = Depends(current_principal)) -> TranslationReportResponse:
    service.report_missing_translation(principal.student_id, request.locale, request.key, request.translation_version)
    return TranslationReportResponse(saved=True)
