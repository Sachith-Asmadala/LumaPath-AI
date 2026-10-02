from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import PathwayRepository
from .schemas import (
    CurrentRoadmapResponse, MilestoneUpdateRequest, PathwayContextRequest, PathwayDecisionRequest, PathwayResponse,
    PlannerApprovalRequest, PlannerApprovalResponse, RecalculateRequest, ResourceDecisionRequest,
)
from .service import PathwayService
from ..careers.repository import CareerRepository
from ..careers.service import CareerService

router = APIRouter(prefix="/v1/pathways", tags=["pathways"])
repository = PathwayRepository(settings.database_path)
career_repository = CareerRepository(settings.database_path)
career_service = CareerService(career_repository)
service = PathwayService(repository, career_service=career_service)


@router.get("/current", response_model=CurrentRoadmapResponse)
def current(principal: Principal = Depends(current_principal)):
    return service.current(principal.student_id)


@router.post("/generate", response_model=PathwayResponse, status_code=201)
def generate(request: PathwayContextRequest, principal: Principal = Depends(current_principal)):
    return service.generate(principal.student_id, request)


@router.get("/{pathway_id}", response_model=PathwayResponse)
def get(pathway_id: str, principal: Principal = Depends(current_principal)):
    return service.get(principal.student_id, pathway_id)


@router.post("/{pathway_id}/decision", response_model=PathwayResponse)
def decision(pathway_id: str, request: PathwayDecisionRequest, principal: Principal = Depends(current_principal)):
    return service.decide(principal.student_id, pathway_id, request)


@router.post("/{pathway_id}/recalculate", response_model=PathwayResponse, status_code=201)
def recalculate(pathway_id: str, request: RecalculateRequest, principal: Principal = Depends(current_principal)):
    return service.recalculate(principal.student_id, pathway_id, request)


@router.put("/{pathway_id}/steps/{step_id}", response_model=PathwayResponse)
def milestone(pathway_id: str, step_id: str, request: MilestoneUpdateRequest, principal: Principal = Depends(current_principal)):
    return service.update_milestone(principal.student_id, pathway_id, step_id, request)


@router.post("/{pathway_id}/steps/{step_id}/resource", response_model=PathwayResponse)
def resource(pathway_id: str, step_id: str, request: ResourceDecisionRequest, principal: Principal = Depends(current_principal)):
    return service.update_resource(principal.student_id, pathway_id, step_id, request)


@router.post("/{pathway_id}/weekly-actions/approve", response_model=PlannerApprovalResponse)
def approve_weekly_actions(pathway_id: str, request: PlannerApprovalRequest, principal: Principal = Depends(current_principal)):
    return service.approve_weekly_actions(principal.student_id, pathway_id, request)
