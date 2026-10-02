from __future__ import annotations

from datetime import date

from ..subscriptions.dependencies import institution_access

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from ...core.config import settings
from ...core.security import AdministratorPrincipal, current_administrator
from .repository import InstitutionalAnalyticsRepository
from .schemas import (
    AuditEventResponse,
    CohortSummary,
    GovernanceResponse,
    InstitutionalAnalyticsDashboard,
    MetricDefinitionResponse,
    RefreshResponse,
)
from .service import InstitutionalAnalyticsService

router = APIRouter(prefix="/v1/institutional-analytics", tags=["institutional-analytics"], dependencies=[Depends(institution_access)])
_repository = InstitutionalAnalyticsRepository(
    settings.database_path,
    settings.institutional_analytics_subject_key_secret,
)
_service = InstitutionalAnalyticsService(
    _repository,
    privacy_threshold=settings.analytics_min_cohort_size,
    retention_days=settings.institutional_analytics_retention_days,
    freshness_hours=settings.institutional_analytics_freshness_hours,
    purpose=settings.institutional_analytics_purpose,
)


@router.get("/cohorts", response_model=list[CohortSummary])
def list_cohorts(principal: AdministratorPrincipal = Depends(current_administrator)) -> list[CohortSummary]:
    return _service.list_cohorts(principal)


@router.get("/definitions", response_model=list[MetricDefinitionResponse])
def metric_definitions(principal: AdministratorPrincipal = Depends(current_administrator)) -> list[MetricDefinitionResponse]:
    return _service.definitions(principal)


@router.get("/governance", response_model=GovernanceResponse)
def governance(principal: AdministratorPrincipal = Depends(current_administrator)) -> GovernanceResponse:
    return _service.governance(principal)


@router.post("/cohorts/{cohort_id}/refresh", response_model=RefreshResponse)
def refresh_cohort(
    cohort_id: str,
    start: date = Query(...),
    end: date = Query(...),
    timezone: str = Query(default="Asia/Colombo", min_length=1, max_length=64),
    principal: AdministratorPrincipal = Depends(current_administrator),
) -> RefreshResponse:
    return _service.refresh(principal, cohort_id, start, end, timezone)


@router.get("/dashboard", response_model=InstitutionalAnalyticsDashboard)
def dashboard(
    cohort_id: str = Query(..., min_length=1, max_length=160),
    start: date = Query(...),
    end: date = Query(...),
    timezone: str = Query(default="Asia/Colombo", min_length=1, max_length=64),
    principal: AdministratorPrincipal = Depends(current_administrator),
) -> InstitutionalAnalyticsDashboard:
    return _service.dashboard(principal, cohort_id, start, end, timezone)


@router.get("/export")
def export_aggregates(
    cohort_id: str = Query(..., min_length=1, max_length=160),
    start: date = Query(...),
    end: date = Query(...),
    timezone: str = Query(default="Asia/Colombo", min_length=1, max_length=64),
    principal: AdministratorPrincipal = Depends(current_administrator),
) -> Response:
    content = _service.export_csv(principal, cohort_id, start, end, timezone)
    safe_cohort = "".join(character if character.isalnum() or character in {"-", "_"} else "-" for character in cohort_id)[:80]
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="lumapath-{safe_cohort}-{start.isoformat()}-{end.isoformat()}.csv"',
            "Cache-Control": "no-store, private",
        },
    )


@router.get("/audit", response_model=list[AuditEventResponse])
def audit_log(
    limit: int = Query(default=50, ge=1, le=200),
    principal: AdministratorPrincipal = Depends(current_administrator),
) -> list[AuditEventResponse]:
    if principal.role != "institution_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Institution administrator role is required to view analytics audit records.")
    return [
        AuditEventResponse(
            id=int(row["id"]),
            administrator_id=row["administrator_id"],
            administrator_role=row["administrator_role"],
            institution_id=row["institution_id"],
            action=row["action"],
            cohort_id=row["cohort_id"],
            occurred_at=row["occurred_at"],
            purpose=row["purpose"],
            detail=row["detail"],
        )
        for row in _repository.audits(principal.institution_id, limit)
    ]
