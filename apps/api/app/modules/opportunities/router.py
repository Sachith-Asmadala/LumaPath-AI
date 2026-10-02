from __future__ import annotations

from fastapi import APIRouter, Depends

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..evidence_passport.repository import EvidencePassportRepository
from ..pathways.repository import PathwayRepository
from .repository import OpportunityRepository
from .schemas import *
from .service import OpportunityService

router = APIRouter(prefix="/v1/opportunities", tags=["opportunities"])
_repository = OpportunityRepository(settings.database_path)
_pathway_repository = PathwayRepository(settings.database_path)
_evidence_repository = EvidencePassportRepository(settings.database_path)
_service = OpportunityService(
    _repository,
    freshness_days=settings.opportunity_source_freshness_days,
    pathway_repository=_pathway_repository,
    evidence_repository=_evidence_repository,
)


@router.post("/browse", response_model=OpportunityBrowseResponse)
def browse(request: BrowseRequest, principal: Principal = Depends(current_principal)):
    return _service.browse(principal.student_id, request)


@router.post("/{opportunity_id}/interactions", response_model=InteractionResponse)
def interact(opportunity_id: str, request: InteractionRequest, principal: Principal = Depends(current_principal)):
    return _service.interact(principal.student_id, opportunity_id, request)


@router.post("/{opportunity_id}/plan-action", response_model=PreparationPlanResponse, status_code=201)
def plan(opportunity_id: str, request: PreparationPlanRequest, principal: Principal = Depends(current_principal)):
    return _service.plan(principal.student_id, opportunity_id, request)


@router.post("/{opportunity_id}/preparation-plans", response_model=PreparationPlanView, status_code=201)
def propose_preparation(opportunity_id: str, request: PreparationProposalRequest, principal: Principal = Depends(current_principal)):
    return _service.propose_preparation(principal.student_id, opportunity_id, request)


@router.post("/{opportunity_id}/preparation-plans/{plan_id}/approve", response_model=PreparationApproveResponse)
def approve_preparation(opportunity_id: str, plan_id: str, request: PreparationApproveRequest, principal: Principal = Depends(current_principal)):
    return _service.approve_preparation(principal.student_id, opportunity_id, plan_id, request)


@router.get("/{opportunity_id}/tracking", response_model=ApplicationTrackingView | None)
def get_tracking(opportunity_id: str, principal: Principal = Depends(current_principal)):
    return _service.get_tracking(principal.student_id, opportunity_id)


@router.put("/{opportunity_id}/tracking", response_model=ApplicationTrackingView)
def update_tracking(opportunity_id: str, request: TrackingUpdateRequest, principal: Principal = Depends(current_principal)):
    return _service.update_tracking(principal.student_id, opportunity_id, request)


@router.get("/{opportunity_id}/internship-handoff", response_model=InternshipHandoffResponse)
def handoff(opportunity_id: str, principal: Principal = Depends(current_principal)):
    return _service.internship_handoff(principal.student_id, opportunity_id)
