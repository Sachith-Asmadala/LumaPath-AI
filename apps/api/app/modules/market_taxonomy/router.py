from __future__ import annotations

from ..subscriptions.dependencies import taxonomy_access
from ..subscriptions.service import EntitlementService, get_entitlements

from ..competition_demo.clock import competition_service

from fastapi import APIRouter, Depends, Query

from ...core.config import settings
from ...core.security import Principal, TaxonomyCuratorPrincipal, current_principal, current_taxonomy_curator
from ..careers.repository import CareerRepository
from ..careers.service import CareerService
from ..pathways.repository import PathwayRepository
from ..pathways.service import PathwayService
from ..notifications.repository import NotificationRepository
from ..notifications.service import NotificationService
from .repository import MarketTaxonomyRepository
from .schemas import (
    ApprovalView, ChangeProposalView, MarketGovernanceView, MarketSourceUpsertRequest, MarketSourceView,
    ObservationIngestRequest, ObservationView, ProfileComparisonResponse, ProposalCreateRequest,
    ProposalDecisionRequest, SignalComputeRequest, SkillSignalView, StudentTaxonomyUpdateView,
    StudentUpdateDecisionRequest, TaxonomyVersionView, TaxonomyRollbackRequest, TaxonomyRollbackResponse,
)
from .service import MarketTaxonomyService

router=APIRouter(prefix="/v1/market-taxonomy",tags=["market-taxonomy"],dependencies=[Depends(taxonomy_access)])
_career_repository=CareerRepository(settings.database_path)
_repository=MarketTaxonomyRepository(settings.database_path)
_career_service=CareerService(_career_repository)
_pathway_repository=PathwayRepository(settings.database_path)
_pathway_service=PathwayService(_pathway_repository,career_service=_career_service)
_notification_repository=NotificationRepository(settings.database_path)
_notification_service=NotificationService(_notification_repository,max_attempts=settings.notification_delivery_max_attempts)
_service=MarketTaxonomyService(_repository,_career_service,_pathway_repository,_pathway_service,notification_service=_notification_service)

@router.get("/governance",response_model=MarketGovernanceView)
def governance(_:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.governance()
@router.get("/sources",response_model=list[MarketSourceView])
def sources(p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.sources(p)
@router.put("/sources/{source_id}",response_model=MarketSourceView)
def upsert_source(source_id:str,request:MarketSourceUpsertRequest,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)):
    if source_id!=request.id: from fastapi import HTTPException; raise HTTPException(status_code=422,detail="Source path ID must match request ID.")
    return _service.upsert_source(p,request)
@router.post("/observations/ingest",response_model=list[ObservationView],status_code=201)
def ingest(request:ObservationIngestRequest,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.ingest(p,request)
@router.post("/signals/compute",response_model=SkillSignalView,status_code=201)
def compute(request:SignalComputeRequest,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.compute_signal(p,request)
@router.get("/signals",response_model=list[SkillSignalView])
def signals(profile_scope:str|None=Query(default=None),region_code:str|None=Query(default=None),p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.signals(p,profile_scope,region_code)
@router.post("/proposals",response_model=ChangeProposalView,status_code=201)
def propose(request:ProposalCreateRequest,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.create_proposal(p,request)
@router.get("/proposals",response_model=list[ChangeProposalView])
def proposals(status:str|None=Query(default=None),p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.proposals(p,status)
@router.post("/proposals/{proposal_id}/submit",response_model=ChangeProposalView)
def submit(proposal_id:str,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.submit(p,proposal_id)
@router.post("/proposals/{proposal_id}/decision",response_model=ChangeProposalView)
def decide(proposal_id:str,request:ProposalDecisionRequest,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.decide(p,proposal_id,request)
@router.get("/proposals/{proposal_id}/approvals",response_model=list[ApprovalView])
def approvals(proposal_id:str,p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.approvals(p,proposal_id)
@router.get("/versions",response_model=list[TaxonomyVersionView])
def versions(profile_scope:str|None=Query(default=None),region_code:str|None=Query(default=None),p:TaxonomyCuratorPrincipal=Depends(current_taxonomy_curator)): return _service.versions(p,profile_scope,region_code)

@router.post("/versions/rollback", response_model=TaxonomyRollbackResponse, status_code=201)
def rollback(request: TaxonomyRollbackRequest, p: TaxonomyCuratorPrincipal = Depends(current_taxonomy_curator)):
    return _service.rollback(p, request)

@router.get("/student/profile-comparison/{role_id}",response_model=ProfileComparisonResponse)
def compare(role_id:str,region_code:str|None=Query(default=None),p:Principal=Depends(current_principal),ent:EntitlementService=Depends(get_entitlements)):
    if region_code:
        ent.require(p.student_id, "regional_comparison")
    return competition_service(_service, p.student_id).compare_profiles(p.student_id,role_id,region_code)
@router.get("/student/updates",response_model=list[StudentTaxonomyUpdateView])
def updates(p:Principal=Depends(current_principal)): return competition_service(_service, p.student_id).student_updates(p.student_id)
@router.post("/student/updates/{impact_id}/decision",response_model=StudentTaxonomyUpdateView)
def update_decision(impact_id:str,request:StudentUpdateDecisionRequest,p:Principal=Depends(current_principal)): return competition_service(_service, p.student_id).decide_student_update(p.student_id,impact_id,request)
