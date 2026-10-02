from __future__ import annotations
from fastapi import APIRouter,Depends
from ...core.config import settings
from ...core.security import Principal,current_principal
from .repository import InterviewRepository
from ..cv.repository import CvRepository
from ..portfolio.repository import PortfolioRepository
from .service import InterviewService
from .schemas import *

router=APIRouter(prefix='/v1/interviews',tags=['interviews'])
repository=InterviewRepository(settings.database_path)
service=InterviewService(repository, cv_repository=CvRepository(settings.database_path), portfolio_repository=PortfolioRepository(settings.database_path))

@router.post('/sessions',response_model=InterviewSessionResponse,status_code=201)
def create_session(req:CreateInterviewSessionRequest,principal:Principal=Depends(current_principal)): return service.create(principal.student_id,req)
@router.get('/sessions',response_model=InterviewSessionListResponse)
def list_sessions(principal:Principal=Depends(current_principal)): return service.list(principal.student_id)
@router.get('/sessions/{session_id}',response_model=InterviewSessionResponse)
def get_session(session_id:str,principal:Principal=Depends(current_principal)): return service.get(principal.student_id,session_id)
@router.post('/sessions/{session_id}/start',response_model=InterviewSessionResponse)
def start(session_id:str,principal:Principal=Depends(current_principal)): return service.start(principal.student_id,session_id)
@router.post('/sessions/{session_id}/heartbeat',response_model=InterviewSessionResponse)
def heartbeat(session_id:str,principal:Principal=Depends(current_principal)): return service.heartbeat(principal.student_id,session_id)
@router.post('/sessions/{session_id}/pause',response_model=InterviewSessionResponse)
def pause(session_id:str,principal:Principal=Depends(current_principal)): return service.pause(principal.student_id,session_id)
@router.post('/sessions/{session_id}/resume',response_model=InterviewSessionResponse)
def resume(session_id:str,principal:Principal=Depends(current_principal)): return service.resume(principal.student_id,session_id)
@router.post('/sessions/{session_id}/answers',response_model=InterviewSessionResponse)
def answer(session_id:str,req:SubmitInterviewAnswerRequest,principal:Principal=Depends(current_principal)): return service.submit_answer(principal.student_id,session_id,req)
@router.post('/sessions/{session_id}/complete',response_model=InterviewSessionResponse)
def complete(session_id:str,principal:Principal=Depends(current_principal)): return service.complete(principal.student_id,session_id)
@router.post('/sessions/{session_id}/feedback/retry',response_model=InterviewSessionResponse)
def retry(session_id:str,principal:Principal=Depends(current_principal)): return service.retry_feedback(principal.student_id,session_id)
@router.post('/sessions/{session_id}/roadmap-topics',response_model=RoadmapTopicResponse)
def roadmap(session_id:str,req:RoadmapTopicRequest,principal:Principal=Depends(current_principal)): return service.roadmap_topics(principal.student_id,session_id,req)
@router.delete('/sessions/{session_id}',response_model=InterviewDeleteResponse)
def delete(session_id:str,principal:Principal=Depends(current_principal)): return service.delete(principal.student_id,session_id)
