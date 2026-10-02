from __future__ import annotations

from fastapi import APIRouter, Depends, Header

from ...core.config import settings
from ...core.security import Principal, current_principal
from .repository import EvidencePassportRepository
from .schemas import CertificateInput, EvidenceCorrectionRequest, ExportRequest, MentorValidationRequestCreate, MentorValidationResponseInput, ShareCreateRequest
from .service import EvidencePassportService

router=APIRouter(prefix="/v1/evidence-passport",tags=["evidence-passport"])
public_router=APIRouter(prefix="/v1/evidence-share",tags=["evidence-share"])
mentor_router=APIRouter(prefix="/v1/evidence-mentor",tags=["evidence-mentor"])
repository=EvidencePassportRepository(settings.database_path)
service=EvidencePassportService(repository)

@router.get("")
def dashboard(principal:Principal=Depends(current_principal)):
    return service.dashboard(principal.student_id)

@router.post("/sync")
def sync(principal:Principal=Depends(current_principal)):
    return service.sync(principal.student_id)

@router.post("/certificates",status_code=201)
def add_certificate(request:CertificateInput,principal:Principal=Depends(current_principal)):
    return service.add_certificate(principal.student_id,request)

@router.put("/certificates/{certificate_id}")
def update_certificate(certificate_id:str,request:CertificateInput,principal:Principal=Depends(current_principal)):
    return service.update_certificate(principal.student_id,certificate_id,request)

@router.delete("/certificates/{certificate_id}")
def delete_certificate(certificate_id:str,principal:Principal=Depends(current_principal)):
    return service.delete_certificate(principal.student_id,certificate_id)

@router.put("/evidence/{evidence_id}")
def correct(evidence_id:str,request:EvidenceCorrectionRequest,principal:Principal=Depends(current_principal)):
    return service.correct_evidence(principal.student_id,evidence_id,request)

@router.post("/evidence/{evidence_id}/revalidate")
def revalidate(evidence_id:str,principal:Principal=Depends(current_principal)):
    return service.revalidate(principal.student_id,evidence_id)

@router.post("/mentor-validation-requests",status_code=201)
def request_mentor_validation(request:MentorValidationRequestCreate,principal:Principal=Depends(current_principal)):
    return service.create_mentor_validation_request(principal.student_id,request)

@router.get("/mentor-validation-requests")
def mentor_validation_requests(principal:Principal=Depends(current_principal)):
    return service.mentor_requests(principal.student_id)

@mentor_router.get("/relationships/{relationship_id}/validation-requests")
def mentor_validation_requests(relationship_id:str,x_luma_mentor_token:str|None=Header(default=None,alias="X-Luma-Mentor-Token")):
    if not x_luma_mentor_token:
        from fastapi import HTTPException
        raise HTTPException(401,"Mentor access token is required.")
    return service.mentor_relationship_requests(x_luma_mentor_token,relationship_id)

@mentor_router.post("/validation-requests/{request_id}/respond")
def mentor_respond(request_id:str,request:MentorValidationResponseInput,x_luma_mentor_token:str|None=Header(default=None,alias="X-Luma-Mentor-Token")):
    if not x_luma_mentor_token: from fastapi import HTTPException; raise HTTPException(401,"Mentor access token is required.")
    return service.mentor_respond(x_luma_mentor_token,request_id,request)

@router.post("/export")
def export(request:ExportRequest,principal:Principal=Depends(current_principal)):
    return service.export(principal.student_id,request)

@router.post("/shares",status_code=201)
def create_share(request:ShareCreateRequest,principal:Principal=Depends(current_principal)):
    return service.create_share(principal.student_id,request)

@router.get("/shares")
def shares(principal:Principal=Depends(current_principal)):
    return service.shares(principal.student_id)

@router.post("/shares/{share_id}/revoke")
def revoke_share(share_id:str,principal:Principal=Depends(current_principal)):
    return service.revoke_share(principal.student_id,share_id)

@router.get("/access-history")
def access_history(principal:Principal=Depends(current_principal)):
    return service.audits(principal.student_id)

@public_router.get("/{token}")
def public_share(token:str):
    return service.public_share(token)
