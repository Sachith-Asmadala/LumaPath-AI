from __future__ import annotations

from ..subscriptions.service import EntitlementService, get_entitlements
from ..subscriptions.dependencies import mentor_access

from fastapi import APIRouter, Depends, Header

from ...core.config import settings
from ...core.security import Principal, current_principal
from ..pathways.repository import PathwayRepository
from .repository import MentorRepository
from .schemas import (
    AcceptInvitationRequest, AcceptInvitationResponse, AccessAuditResponse, ConsentPreviewRequest, ConsentPreviewResponse,
    CreateRelationshipRequest, CreateRelationshipResponse, GuidanceRequestCreate, GuidanceRequestResponse,
    MentorPlanActionRequest, MentorPlanActionResponse, MentorViewResponse, RecommendationCreate,
    RecommendationDecisionRequest, RecommendationResponse, RelationshipResponse, RevokeRelationshipRequest,
    UpdateConsentRequest,
)
from .service import MentorService

student_router = APIRouter(prefix="/v1/mentors", tags=["mentors"])
mentor_router = APIRouter(prefix="/v1/mentor-access", tags=["mentor-access"])
repository = MentorRepository(settings.database_path)
pathway_repository = PathwayRepository(settings.database_path)
service = MentorService(repository, pathway_repository)


@student_router.post("/consent-preview", response_model=ConsentPreviewResponse)
def consent_preview(request: ConsentPreviewRequest, principal: Principal = Depends(current_principal)):
    return service.consent_preview(principal.student_id, request)


@student_router.post("/relationships", response_model=CreateRelationshipResponse, status_code=201)
def create_relationship(request: CreateRelationshipRequest, principal: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    ent.require(principal.student_id, "institution_mentoring")
    return service.create_relationship(principal.student_id, request)


@student_router.get("/relationships", response_model=list[RelationshipResponse])
def list_relationships(principal: Principal = Depends(current_principal)):
    return service.list_relationships(principal.student_id)


@student_router.get("/relationships/{relationship_id}", response_model=RelationshipResponse)
def get_relationship(relationship_id: str, principal: Principal = Depends(current_principal)):
    return service.get_relationship(principal.student_id, relationship_id)


@student_router.put("/relationships/{relationship_id}/consent", response_model=RelationshipResponse)
def update_consent(relationship_id: str, request: UpdateConsentRequest, principal: Principal = Depends(current_principal)):
    return service.update_consent(principal.student_id, relationship_id, request)


@student_router.post("/relationships/{relationship_id}/revoke", response_model=RelationshipResponse)
def revoke_relationship(relationship_id: str, request: RevokeRelationshipRequest, principal: Principal = Depends(current_principal)):
    return service.revoke(principal.student_id, relationship_id, request.reason)


@student_router.post("/relationships/{relationship_id}/guidance-requests", response_model=GuidanceRequestResponse, status_code=201)
def guidance_request(relationship_id: str, request: GuidanceRequestCreate, principal: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    ent.require(principal.student_id, "institution_mentoring")
    return service.create_guidance_request(principal.student_id, relationship_id, request)


@student_router.get("/relationships/{relationship_id}/guidance-requests", response_model=list[GuidanceRequestResponse])
def guidance_requests(relationship_id: str, principal: Principal = Depends(current_principal)):
    return service.guidance_requests(principal.student_id, relationship_id)


@student_router.get("/relationships/{relationship_id}/recommendations", response_model=list[RecommendationResponse])
def recommendations(relationship_id: str, principal: Principal = Depends(current_principal)):
    return service.recommendations(principal.student_id, relationship_id)


@student_router.post("/relationships/{relationship_id}/recommendations/{recommendation_id}/decision", response_model=RecommendationResponse)
def recommendation_decision(relationship_id: str, recommendation_id: str, request: RecommendationDecisionRequest, principal: Principal = Depends(current_principal)):
    return service.decide_recommendation(principal.student_id, relationship_id, recommendation_id, request)


@student_router.post("/relationships/{relationship_id}/recommendations/{recommendation_id}/plan-action", response_model=MentorPlanActionResponse, status_code=201)
def recommendation_plan_action(relationship_id: str, recommendation_id: str, request: MentorPlanActionRequest, principal: Principal = Depends(current_principal)):
    return service.approve_plan_action(principal.student_id, relationship_id, recommendation_id, request)


@student_router.get("/relationships/{relationship_id}/access-history", response_model=list[AccessAuditResponse])
def access_history(relationship_id: str, principal: Principal = Depends(current_principal)):
    return service.access_history(principal.student_id, relationship_id)


@mentor_router.post("/invitations/accept", response_model=AcceptInvitationResponse)
def accept_invitation(request: AcceptInvitationRequest, ent: EntitlementService = Depends(get_entitlements)):
    invitation = repository.by_invitation_hash(service._hash_token(request.invitation_token))
    if invitation:
        ent.require(invitation["student_id"], "institution_mentoring")
    return service.accept_invitation(request)


@mentor_router.get("/relationships/{relationship_id}", response_model=MentorViewResponse, dependencies=[Depends(mentor_access)])
def mentor_view(relationship_id: str, x_luma_mentor_token: str | None = Header(default=None, alias="X-Luma-Mentor-Token")):
    return service.mentor_view(relationship_id, x_luma_mentor_token or "")


@mentor_router.post("/relationships/{relationship_id}/recommendations", response_model=RecommendationResponse, status_code=201, dependencies=[Depends(mentor_access)])
def mentor_recommendation(relationship_id: str, request: RecommendationCreate, x_luma_mentor_token: str | None = Header(default=None, alias="X-Luma-Mentor-Token")):
    return service.mentor_recommend(relationship_id, x_luma_mentor_token or "", request)
