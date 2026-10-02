from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..careers.repository import CareerRepository
from ..careers.schemas import CareerRoleSummary
from ..careers.service import CareerService
from ..evidence_passport.repository import EvidencePassportRepository
from ..pathways.repository import PathwayRepository
from ..pathways.service import PathwayService
from .repository import CareerScenarioRepository
from .schemas import (
    ScenarioCreateRequest, ScenarioRecomputeRequest, ScenarioSaveRequest,
    ScenarioSwitchRequest, ScenarioSwitchResponse, ScenarioView,
)
from .service import CareerScenarioService


router = APIRouter(prefix="/v1/career-scenarios", tags=["career-scenarios"])
_repository = CareerScenarioRepository(settings.database_path)
_career_repository = CareerRepository(settings.database_path)
_career_service = CareerService(_career_repository)
_evidence_repository = EvidencePassportRepository(settings.database_path)
_pathway_repository = PathwayRepository(settings.database_path)
_pathway_service = PathwayService(_pathway_repository, career_service=_career_service)
_service = CareerScenarioService(
    _repository,
    _career_service,
    _evidence_repository,
    _pathway_repository,
    _pathway_service,
)


@router.get("/roles", response_model=list[CareerRoleSummary])
def roles(_: Principal = Depends(current_principal)):
    return _service.roles()


@router.post("", response_model=ScenarioView, status_code=201)
def create(request: ScenarioCreateRequest, principal: Principal = Depends(current_principal)):
    return _service.create(principal.student_id, request)


@router.get("/saved", response_model=list[ScenarioView])
def saved(principal: Principal = Depends(current_principal)):
    return _service.list_saved(principal.student_id)


@router.get("/{scenario_id}", response_model=ScenarioView)
def get(scenario_id: str, principal: Principal = Depends(current_principal)):
    return _service.get(principal.student_id, scenario_id)


@router.post("/{scenario_id}/recompute", response_model=ScenarioView, status_code=201)
def recompute(scenario_id: str, request: ScenarioRecomputeRequest, principal: Principal = Depends(current_principal)):
    return _service.recompute(principal.student_id, scenario_id, request)


@router.put("/{scenario_id}/saved", response_model=ScenarioView)
def save(scenario_id: str, request: ScenarioSaveRequest, principal: Principal = Depends(current_principal)):
    return _service.save(principal.student_id, scenario_id, request)


@router.post("/{scenario_id}/switch-draft", response_model=ScenarioSwitchResponse, status_code=201)
def switch_draft(scenario_id: str, request: ScenarioSwitchRequest, principal: Principal = Depends(current_principal)):
    return _service.switch_draft(principal.student_id, scenario_id, request)
