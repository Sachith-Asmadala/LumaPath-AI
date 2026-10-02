from __future__ import annotations

from fastapi import APIRouter, Depends, Query, HTTPException

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import CareerRepository
from .schemas import (
    CareerRoleDetail, CareerRoleSummary, ResourcePreferencesInput, SkillAssessmentRequest,
    SkillAssessmentResponse, SkillResourcesResponse,
)
from .service import CareerService

router = APIRouter(prefix="/v1/careers", tags=["careers"])
repository = CareerRepository(settings.database_path)
service = CareerService(repository)


@router.get("/roles", response_model=list[CareerRoleSummary])
def roles(_: Principal = Depends(current_principal)):
    return service.list_roles()


@router.get("/roles/{role_id}", response_model=CareerRoleDetail)
def role(role_id: str, _: Principal = Depends(current_principal)):
    return service.role_detail(role_id)


@router.post("/assessments", response_model=SkillAssessmentResponse, status_code=201)
def assess(request: SkillAssessmentRequest, principal: Principal = Depends(current_principal)):
    return service.assess(principal.student_id, request)


@router.get("/assessments/current", response_model=SkillAssessmentResponse)
def current_assessment(target_role: str | None = Query(default=None), principal: Principal = Depends(current_principal)):
    return service.current_assessment(principal.student_id, target_role)


@router.post("/skills/{skill_id}/resources/rank", response_model=SkillResourcesResponse)
def rank_resources(skill_id: str, request: ResourcePreferencesInput, _: Principal = Depends(current_principal)):
    return service.ranked_resources(skill_id, request)


# DOC-F29 owns taxonomy/assessment; DOC-F13 still owns roadmap scheduling/version
# persistence. These aliases expose one career-engine surface without duplicating
# pathway state or creating a second source of truth.
@router.post("/pathways/generate", status_code=201)
def generate_pathway(request: dict, principal: Principal = Depends(current_principal)):
    from ..pathways.router import service as pathway_service
    from ..pathways.schemas import PathwayContextRequest
    role_name = str(request.get("target_role", ""))
    try:
        service.current_assessment(principal.student_id, role_name)
    except HTTPException as exc:
        if exc.status_code == 404:
            raise HTTPException(status_code=409, detail="Complete the DOC-F29 skill assessment for this role before generating a pathway.") from exc
        raise
    return pathway_service.generate(principal.student_id, PathwayContextRequest.model_validate(request))


@router.get("/pathways/current")
def current_pathway(principal: Principal = Depends(current_principal)):
    from ..pathways.router import service as pathway_service
    return pathway_service.current(principal.student_id)
