from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import AchievementRepository
from .schemas import AchievementDashboardView, AchievementPreferencesUpdate
from .service import AchievementService

router = APIRouter(prefix="/v1/achievements", tags=["achievements"])
_repository = AchievementRepository(settings.database_path)
_service = AchievementService(_repository)

@router.get("", response_model=AchievementDashboardView)
def get_achievements(principal: Principal = Depends(current_principal)) -> AchievementDashboardView:
    return _service.dashboard(principal.student_id, evaluate=True)

@router.post("/evaluate", response_model=AchievementDashboardView)
def evaluate_achievements(principal: Principal = Depends(current_principal)) -> AchievementDashboardView:
    return _service.dashboard(principal.student_id, evaluate=True)

@router.put("/preferences", response_model=AchievementDashboardView)
def update_preferences(request: AchievementPreferencesUpdate, principal: Principal = Depends(current_principal)) -> AchievementDashboardView:
    return _service.update_preferences(principal.student_id, request)
