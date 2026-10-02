from __future__ import annotations

from ..subscriptions.service import EntitlementService, get_entitlements

from fastapi import APIRouter, Depends, Query

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import IntelligenceRepository
from .schemas import AddToPlanRequest, FeedResponse, InteractionRequest, InteractionResponse, PlannerHandoffResponse
from .service import IntelligenceService
from ..pathways.repository import PathwayRepository

router = APIRouter(prefix="/v1/intelligence", tags=["intelligence"])
repository = IntelligenceRepository(settings.database_path)
pathway_repository = PathwayRepository(settings.database_path)
service = IntelligenceService(
    repository, pathway_repository,
    daily_limit=settings.content_feed_daily_limit,
    per_source_limit=settings.content_feed_per_source_limit,
    per_category_limit=settings.content_feed_per_category_limit,
)


@router.get("/feed", response_model=FeedResponse)
def feed(view: str = Query(default="today", pattern="^(today|saved|planned)$"), principal: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    result = service.feed(principal.student_id, view)
    return result.model_copy(update={"items": ent.feed_items(principal.student_id, result.items)})


@router.post("/feed/{article_id}/interactions", response_model=InteractionResponse)
def interaction(article_id: str, request: InteractionRequest, principal: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    if request.action != "save":
        return service.interact(principal.student_id, article_id, request)
    with ent.resource(principal.student_id, "intelligence_items", article_id, period="day"):
        return service.interact(principal.student_id, article_id, request)


@router.post("/feed/{article_id}/add-to-plan", response_model=PlannerHandoffResponse)
def add_to_plan(article_id: str, request: AddToPlanRequest, principal: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    with ent.resource(principal.student_id, "intelligence_items", article_id, period="day"):
        return service.add_to_plan(principal.student_id, article_id, request)
