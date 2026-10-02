from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query

from ...core.config import settings
from ...core.security import Principal, current_principal
from .jobs import AggregateJob, ThreadedAnalyticsAggregationDispatcher
from .repository import AnalyticsRepository
from .schemas import AnalyticsDashboardResponse, AnalyticsSyncRequest, MetricDrilldownResponse, SyncResponse
from .service import AnalyticsService
from .timeutils import local_date

router = APIRouter(prefix="/v1/analytics", tags=["analytics"])
_repository = AnalyticsRepository(settings.database_path)
_service = AnalyticsService(_repository)
_dispatcher = ThreadedAnalyticsAggregationDispatcher(AggregateJob(_repository), max_workers=settings.analytics_worker_threads)


@router.post("/sync", response_model=SyncResponse)
def sync_analytics(request: AnalyticsSyncRequest, principal: Principal = Depends(current_principal)) -> SyncResponse:
    response = _service.sync(principal.student_id, request)
    affected = {local_date(request.observed_at, request.timezone)}
    for task in request.tasks:
        if task.completed_at:
            affected.add(local_date(task.completed_at, request.timezone))
        elif task.due_at and task.status == "missed":
            affected.add(local_date(task.due_at, request.timezone))
    if request.plan_blocks:
        affected.add(local_date(request.observed_at, request.timezone))
    for item in request.skill_history:
        affected.add(local_date(item.observed_at, request.timezone))
    _dispatcher.enqueue(principal.student_id, affected, request.timezone)
    return response


@router.get("/dashboard", response_model=AnalyticsDashboardResponse)
def analytics_dashboard(
    start: date = Query(...),
    end: date = Query(...),
    timezone: str = Query(default="Asia/Colombo", min_length=1, max_length=64),
    principal: Principal = Depends(current_principal),
) -> AnalyticsDashboardResponse:
    return _service.dashboard(principal.student_id, start, end, timezone)


@router.get("/metrics/{metric}", response_model=MetricDrilldownResponse)
def analytics_metric(
    metric: str,
    start: date = Query(...),
    end: date = Query(...),
    timezone: str = Query(default="Asia/Colombo", min_length=1, max_length=64),
    principal: Principal = Depends(current_principal),
) -> MetricDrilldownResponse:
    return _service.drilldown(principal.student_id, metric, start, end, timezone)
