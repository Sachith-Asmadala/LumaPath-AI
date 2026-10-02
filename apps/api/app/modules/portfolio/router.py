from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import PortfolioRepository
from .schemas import (
    CreatePortfolioProjectRequest, DeleteImportedRepositoryResponse, ExternalRepositoryResponse, PortfolioAnalysisResponse,
    PortfolioProjectListResponse, PortfolioProjectResponse, PortfolioRecommendation, RecommendationDecisionRequest,
    RepositoryRevocationResponse, RepositorySnapshotInput, UpdatePortfolioProjectRequest,
)
from .service import PortfolioService

router = APIRouter(prefix="/v1/portfolio", tags=["portfolio"])
repository = PortfolioRepository(settings.database_path)
service = PortfolioService(repository, analyses_per_minute=settings.portfolio_analyses_per_minute)


def require_portfolio_integration(x_luma_portfolio_integration_key: str | None = Header(default=None, alias="X-Luma-Portfolio-Integration-Key")) -> None:
    expected = settings.portfolio_integration_ingest_key
    if not expected:
        raise HTTPException(status_code=503, detail="Repository snapshot ingestion is disabled until a future authorised integration is configured.")
    if x_luma_portfolio_integration_key != expected:
        raise HTTPException(status_code=403, detail="Repository snapshot ingestion requires the authorised integration boundary.")


@router.post("/projects", response_model=PortfolioProjectResponse, status_code=201)
def create_project(request: CreatePortfolioProjectRequest, principal: Principal = Depends(current_principal)) -> PortfolioProjectResponse:
    return service.create(principal.student_id, request)


@router.get("/projects", response_model=PortfolioProjectListResponse)
def list_projects(principal: Principal = Depends(current_principal)) -> PortfolioProjectListResponse:
    return service.list(principal.student_id)


@router.get("/projects/{project_id}", response_model=PortfolioProjectResponse)
def get_project(project_id: str, principal: Principal = Depends(current_principal)) -> PortfolioProjectResponse:
    return service.get(principal.student_id, project_id)


@router.put("/projects/{project_id}", response_model=PortfolioProjectResponse)
def update_project(project_id: str, request: UpdatePortfolioProjectRequest, principal: Principal = Depends(current_principal)) -> PortfolioProjectResponse:
    return service.update(principal.student_id, project_id, request)


@router.delete("/projects/{project_id}", status_code=204)
def delete_project(project_id: str, principal: Principal = Depends(current_principal)) -> Response:
    service.delete(principal.student_id, project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/projects/{project_id}/analysis", response_model=PortfolioAnalysisResponse)
def analyze_project(project_id: str, repository_id: str | None = None, principal: Principal = Depends(current_principal)) -> PortfolioAnalysisResponse:
    return service.analyze(principal.student_id, project_id, repository_id)


@router.post("/projects/{project_id}/recommendations/{recommendation_id}", response_model=PortfolioRecommendation)
def decide_recommendation(project_id: str, recommendation_id: str, request: RecommendationDecisionRequest, principal: Principal = Depends(current_principal)) -> PortfolioRecommendation:
    return service.decide_recommendation(principal.student_id, project_id, recommendation_id, request)


@router.post("/projects/{project_id}/repositories/import-snapshot", response_model=ExternalRepositoryResponse, status_code=201)
def import_repository_snapshot(project_id: str, request: RepositorySnapshotInput, principal: Principal = Depends(current_principal), _: None = Depends(require_portfolio_integration)) -> ExternalRepositoryResponse:
    return service.import_repository_snapshot(principal.student_id, project_id, request)


@router.post("/projects/{project_id}/repositories/{repository_id}/refresh-snapshot", response_model=ExternalRepositoryResponse)
def refresh_repository_snapshot(project_id: str, repository_id: str, request: RepositorySnapshotInput, principal: Principal = Depends(current_principal), _: None = Depends(require_portfolio_integration)) -> ExternalRepositoryResponse:
    return service.refresh_repository_snapshot(principal.student_id, project_id, repository_id, request)


@router.post("/projects/{project_id}/repositories/{repository_id}/revoke", response_model=RepositoryRevocationResponse)
def revoke_repository(project_id: str, repository_id: str, principal: Principal = Depends(current_principal)) -> RepositoryRevocationResponse:
    return service.revoke_repository(principal.student_id, project_id, repository_id)


@router.delete("/projects/{project_id}/repositories/{repository_id}", response_model=DeleteImportedRepositoryResponse)
def delete_repository_data(project_id: str, repository_id: str, principal: Principal = Depends(current_principal)) -> DeleteImportedRepositoryResponse:
    return service.delete_repository_data(principal.student_id, project_id, repository_id)
