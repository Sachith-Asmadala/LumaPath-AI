from __future__ import annotations

import hashlib
import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.schemas import SkillAssessmentRequest
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.evidence_passport.schemas import (
    CertificateInput, EvidenceCorrectionRequest, ExportRequest, MentorValidationRequestCreate,
    MentorValidationResponseInput, ShareCreateRequest,
)
from apps.api.app.modules.evidence_passport.service import EvidencePassportService
from apps.api.app.modules.mentors.repository import MentorRepository
from apps.api.app.modules.portfolio.repository import PortfolioRepository

NOW = datetime(2026, 11, 3, 6, 0, tzinfo=timezone.utc)


def services(tmp_path: Path):
    db=str(tmp_path/"evidence.db")
    CareerRepository(db)
    PortfolioRepository(db)
    MentorRepository(db)
    repo=EvidencePassportRepository(db)
    return EvidencePassportService(repo, now=lambda:NOW), repo, db


def insert_portfolio(db: str, student="student-a", observed=True, with_demo=True):
    now=NOW.isoformat(); project="proj-1"; snap="snap-1"; repo="repo-1"
    with sqlite3.connect(db) as con:
        con.execute("PRAGMA foreign_keys=ON")
        con.execute("INSERT INTO portfolio_projects(id,student_id,title,description,target_role,project_url,live_demo_url,facts_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (project,student,"Container API","API project","DevOps Engineer","https://example.test/project","https://demo.example.test" if with_demo else None,"{}",now,now))
        if observed:
            con.execute("INSERT INTO external_repositories(id,project_id,student_id,provider,external_repository_id,full_name,repository_url,live_demo_url,visibility,access_status,authorization_reference,authorization_scope,collected_at,imported_at,revoked_at,facts_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (repo,project,student,"github","123","student/container-api","https://github.com/example/container-api","https://demo.example.test" if with_demo else None,"private","active","opaque","contents:read",now,now,None,"{}"))
        con.execute("INSERT INTO portfolio_analysis_snapshots(id,project_id,student_id,source_kind,source_repository_id,target_role,source_timestamp,analyzed_at,completeness_score,indicators_json,factual_description,stale,disclaimer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (snap,project,student,"repository" if observed else "manual",repo if observed else None,"DevOps Engineer",now,now,80,"[]","Container API",0,"demo"))
        con.execute("INSERT INTO portfolio_skill_evidence(snapshot_id,student_id,skill_id,skill_name,status,confidence,evidence_json,source_type,source_timestamp) VALUES (?,?,?,?,?,?,?,?,?)",
                    (snap,student,"docker","Docker","observed" if observed else "self_reported",0.82,"[\"Dockerfile\"]","repository" if observed else "manual_project",now))
        con.commit()


def insert_active_mentor(db: str, token="mentor-secret", student="student-a"):
    token_hash=hashlib.sha256(token.encode()).hexdigest(); now=NOW.isoformat(); exp=(NOW+timedelta(days=20)).isoformat()
    with sqlite3.connect(db) as con:
        con.execute("INSERT INTO mentor_relationships(id,student_id,mentor_label,mentor_name,purpose,status,invitation_token_hash,mentor_access_token_hash,invite_expires_at,expires_at,accepted_at,revoked_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    ("rel-1",student,"Career mentor","Mina Mentor","Evidence review","active",hashlib.sha256(b"invite").hexdigest(),token_hash,exp,exp,now,None,now,now))
        con.commit()
    return token


def test_ac1_portfolio_repository_and_live_demo_have_provenance(tmp_path):
    service,_,db=services(tmp_path); insert_portfolio(db)
    service.sync("student-a"); dashboard=service.dashboard("student-a",do_sync=False)
    docker=next(s for s in dashboard.skills if s.skill_id=="docker")
    assert {e.evidence_type for e in docker.evidence} >= {"repository","live_demo"}
    repository=next(e for e in docker.evidence if e.evidence_type=="repository")
    assert repository.verification_status=="observed" and repository.provenance.source_ref.startswith("portfolio:")
    assert len(repository.provenance.reference_hash)==64


def test_ac2_certificate_assessment_and_mentor_validation_supported(tmp_path):
    service,_,db=services(tmp_path)
    cert=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Container Fundamentals",issuer="Example Academy",acquired_at=date(2026,10,1),source_url="https://academy.example/cert/1",proficiency=70))
    assert cert.evidence_type=="certificate" and cert.verification_status=="self_declared"
    career=CareerService(CareerRepository(db),now=lambda:NOW)
    career.assess("student-a",SkillAssessmentRequest(target_role="DevOps Engineer",quiz_evidence=[{"skill_id":"docker","score":78,"quiz_id":"docker-q"}]))
    service.sync("student-a")
    assert any(e.evidence_type=="assessment" for s in service.dashboard("student-a",False).skills for e in s.evidence)
    token=insert_active_mentor(db)
    req=service.create_mentor_validation_request("student-a",MentorValidationRequestCreate(relationship_id="rel-1",skill_id="docker",request_note="Please review my container work."))
    reviewed=service.mentor_respond(token,req.id,MentorValidationResponseInput(relationship_id="rel-1",decision="validated",note="I reviewed the student's container project and discussion.",proficiency=72))
    assert reviewed.evidence_type=="mentor_validation" and reviewed.verification_status=="reviewed"


def test_ac3_expiry_dispute_correction_and_revalidation_are_transparent(tmp_path):
    service,_,_=services(tmp_path)
    expired=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Old cert",issuer="Issuer",acquired_at=date(2024,1,1),expires_at=date(2025,1,1)))
    assert expired.verification_status=="expired" and expired.readiness_contribution < 10
    current=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Current cert",issuer="Issuer",acquired_at=date(2026,1,1),proficiency=70))
    disputed=service.correct_evidence("student-a",current.id,EvidenceCorrectionRequest(disputed=True,note="The skill mapping is not accurate."))
    assert disputed.verification_status=="disputed" and disputed.readiness_contribution==0
    restored=service.correct_evidence("student-a",current.id,EvidenceCorrectionRequest(disputed=False,note="I reviewed the mapping and restored the record."))
    assert restored.verification_status=="self_declared"
    assert service.revalidate("student-a",current.id).provenance.last_reviewed_at is not None


def test_ac4_f29_assessment_uses_passport_status_not_course_completion_alone(tmp_path):
    service,_,db=services(tmp_path)
    service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer",proficiency=75))
    token=insert_active_mentor(db)
    req=service.create_mentor_validation_request("student-a",MentorValidationRequestCreate(relationship_id="rel-1",skill_id="docker"))
    service.mentor_respond(token,req.id,MentorValidationResponseInput(relationship_id="rel-1",decision="validated",note="Reviewed practical container evidence.",proficiency=78))
    career=CareerService(CareerRepository(db),now=lambda:NOW)
    assessment=career.assess("student-a",SkillAssessmentRequest(target_role="DevOps Engineer",include_portfolio_evidence=False,include_cv_evidence=False))
    docker=next(s for s in assessment.skills if s.skill_id=="docker")
    assert {e.source_type for e in docker.evidence} >= {"certificate","mentor_validation"}
    assert docker.confidence >= 0.55


def test_ac5_export_and_share_include_only_selected_and_revoke_immediately(tmp_path):
    service,_,_=services(tmp_path)
    a=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    b=service.add_certificate("student-a",CertificateInput(skill_id="git",title="Git cert",issuer="Issuer"))
    export=service.export("student-a",ExportRequest(evidence_ids=[a.id]))
    assert "Docker cert" in export.content and "Git cert" not in export.content
    share=service.create_share("student-a",ShareCreateRequest(evidence_ids=[a.id],expires_at=NOW+timedelta(days=2),label="Recruiter share"))
    public=service.public_share(share.share_token)
    assert [e.id for e in public.evidence]==[a.id]
    service.revoke_share("student-a",share.share.id)
    with pytest.raises(HTTPException) as exc: service.public_share(share.share_token)
    assert exc.value.status_code==403


def test_expired_share_denies_access(tmp_path):
    service,repo,_=services(tmp_path)
    a=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    token="expired-token"; now=(NOW-timedelta(days=2)).isoformat()
    repo.create_share({"id":"eshare-expired","student_id":"student-a","token_hash":hashlib.sha256(token.encode()).hexdigest(),"label":"Expired","evidence_ids_json":json.dumps([a.id]),"created_at":now,"expires_at":(NOW-timedelta(days=1)).isoformat()})
    with pytest.raises(HTTPException) as exc: service.public_share(token)
    assert exc.value.status_code==410


def test_ac6_access_is_owner_controlled_and_audited(tmp_path):
    service,_,_=services(tmp_path)
    a=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    with pytest.raises(HTTPException) as exc: service.export("student-b",ExportRequest(evidence_ids=[a.id]))
    assert exc.value.status_code==403
    service.dashboard("student-a")
    events={event.event_type for event in service.audits("student-a")}
    assert {"certificate_added","passport_viewed"} <= events


def test_forged_metadata_unknown_skill_and_unsafe_url_rejected(tmp_path):
    service,_,_=services(tmp_path)
    with pytest.raises(HTTPException): service.add_certificate("student-a",CertificateInput(skill_id="invented",title="Fake",issuer="Issuer"))
    with pytest.raises(Exception): CertificateInput(skill_id="docker",title="Fake",issuer="Issuer",source_url="javascript:alert(1)")


def test_source_deletion_marks_synced_evidence_stale_not_verified(tmp_path):
    service,_,db=services(tmp_path); insert_portfolio(db)
    service.sync("student-a")
    before=next(e for s in service.dashboard("student-a",False).skills for e in s.evidence if e.evidence_type=="repository")
    assert before.verification_status=="observed"
    with sqlite3.connect(db) as con:
        con.execute("DELETE FROM portfolio_skill_evidence"); con.commit()
    service.sync("student-a")
    after=next(e for s in service.dashboard("student-a",False).skills for e in s.evidence if e.evidence_type=="repository")
    assert after.verification_status=="stale"


def test_mentor_token_is_relationship_bound(tmp_path):
    service,_,db=services(tmp_path); token=insert_active_mentor(db)
    req=service.create_mentor_validation_request("student-a",MentorValidationRequestCreate(relationship_id="rel-1",skill_id="docker"))
    with pytest.raises(HTTPException) as exc:
        service.mentor_respond(token,req.id,MentorValidationResponseInput(relationship_id="different",decision="validated",note="Reviewed."))
    assert exc.value.status_code==403


def test_http_passport_share_and_cross_user_contract(monkeypatch,tmp_path):
    import apps.api.app.modules.evidence_passport.router as router
    service,repo,_=services(tmp_path)
    monkeypatch.setattr(router,"repository",repo); monkeypatch.setattr(router,"service",service)
    client=TestClient(app); a={"X-Luma-Student-Id":"student-a"}; b={"X-Luma-Student-Id":"student-b"}
    cert=client.post("/v1/evidence-passport/certificates",headers=a,json={"skill_id":"docker","title":"Docker cert","issuer":"Issuer"})
    assert cert.status_code==201
    evid=cert.json()["id"]
    dashboard=client.get("/v1/evidence-passport",headers=a); assert dashboard.status_code==200
    blocked=client.post("/v1/evidence-passport/export",headers=b,json={"evidence_ids":[evid]}); assert blocked.status_code==403
    share=client.post("/v1/evidence-passport/shares",headers=a,json={"evidence_ids":[evid],"expires_at":(NOW+timedelta(days=1)).isoformat(),"label":"Recruiter"})
    assert share.status_code==201
    token=share.json()["share_token"]
    public=client.get(f"/v1/evidence-share/{token}"); assert public.status_code==200 and len(public.json()["evidence"])==1
    revoked=client.post(f"/v1/evidence-passport/shares/{share.json()['share']['id']}/revoke",headers=a); assert revoked.status_code==200
    assert client.get(f"/v1/evidence-share/{token}").status_code==403


def test_unauthenticated_passport_is_denied():
    client=TestClient(app)
    assert client.get("/v1/evidence-passport").status_code==401

def test_repository_dispute_can_be_cleared_back_to_observed(tmp_path):
    service,_,db=services(tmp_path); insert_portfolio(db); service.sync("student-a")
    item=next(e for s in service.dashboard("student-a",False).skills for e in s.evidence if e.evidence_type=="repository")
    assert service.correct_evidence("student-a",item.id,EvidenceCorrectionRequest(disputed=True,note="Temporary provenance concern.")).verification_status=="disputed"
    restored=service.correct_evidence("student-a",item.id,EvidenceCorrectionRequest(disputed=False,note="Repository provenance reviewed."))
    assert restored.verification_status=="observed"


def test_certificate_skill_correction_retires_old_mapping(tmp_path):
    service,_,_=services(tmp_path)
    item=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Foundation",issuer="Issuer"))
    cert_id=item.provenance.source_ref.split(":",1)[1]
    updated=service.update_certificate("student-a",cert_id,CertificateInput(skill_id="git",title="Foundation",issuer="Issuer"))
    assert updated.skill_id=="git"
    active=[e for s in service.dashboard("student-a",False).skills for e in s.evidence if e.provenance.source_ref==f"certificate:{cert_id}"]
    assert len(active)==1 and active[0].skill_id=="git"


def test_revoked_repository_no_longer_contributes_high_confidence_to_f29(tmp_path):
    service,_,db=services(tmp_path); insert_portfolio(db); service.sync("student-a")
    career=CareerService(CareerRepository(db),now=lambda:NOW)
    active=career.assess("student-a",SkillAssessmentRequest(target_role="DevOps Engineer",include_portfolio_evidence=True,include_cv_evidence=False))
    docker_active=next(s for s in active.skills if s.skill_id=="docker")
    repo_active=next(e for e in docker_active.evidence if e.source_ref.startswith("portfolio:"))
    assert repo_active.verification_status=="observed" and repo_active.confidence >= 0.7
    with sqlite3.connect(db) as con:
        con.execute("UPDATE external_repositories SET access_status='revoked', revoked_at=? WHERE id='repo-1'",(NOW.isoformat(),))
        con.commit()
    service.sync("student-a")
    revoked=career.assess("student-a",SkillAssessmentRequest(target_role="DevOps Engineer",include_portfolio_evidence=True,include_cv_evidence=False))
    docker_revoked=next(s for s in revoked.skills if s.skill_id=="docker")
    repo_revoked=next(e for e in docker_revoked.evidence if e.source_ref.startswith("portfolio:"))
    assert repo_revoked.verification_status=="self_reported"
    assert repo_revoked.confidence <= 0.25


def test_share_expiry_is_bounded_to_thirty_days(tmp_path):
    service,_,_=services(tmp_path)
    evidence=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    with pytest.raises(HTTPException) as exc:
        service.create_share("student-a",ShareCreateRequest(evidence_ids=[evidence.id],expires_at=NOW+timedelta(days=31),label="Too long"))
    assert exc.value.status_code==422


def test_certificate_metadata_correction_preserves_hidden_reference_when_not_reentered(tmp_path):
    service,repo,_=services(tmp_path)
    item=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Container Fundamentals",issuer="Issuer",credential_reference="CRED-123",proficiency=70))
    cert_id=item.provenance.source_ref.split(":",1)[1]
    updated=service.update_certificate("student-a",cert_id,CertificateInput(skill_id="docker",title="Container Fundamentals Advanced",issuer="Issuer",credential_reference="",proficiency=75))
    assert updated.title=="Container Fundamentals Advanced"
    assert repo.certificate(cert_id)["credential_reference"]=="CRED-123"


def test_share_token_is_hashed_at_rest_and_recipient_access_is_audited(tmp_path):
    service,_,db=services(tmp_path)
    item=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    share=service.create_share("student-a",ShareCreateRequest(evidence_ids=[item.id],expires_at=NOW+timedelta(days=7),label="Scoped"))
    with sqlite3.connect(db) as con:
        con.row_factory=sqlite3.Row
        row=con.execute("SELECT token_hash FROM evidence_share_grants WHERE id=?",(share.share.id,)).fetchone()
    assert row["token_hash"]!=share.share_token and len(row["token_hash"])==64
    service.public_share(share.share_token)
    events=service.audits("student-a")
    assert any(e.actor_type=="share_recipient" and e.event_type=="share_viewed" for e in events)


def test_public_share_schema_excludes_owner_only_correction_and_internal_source_id(tmp_path):
    service,repo,_=services(tmp_path)
    item=service.add_certificate("student-a",CertificateInput(skill_id="docker",title="Docker cert",issuer="Issuer"))
    service.correct_evidence("student-a",item.id,EvidenceCorrectionRequest(disputed=True,note="Private owner correction note."))
    share=service.create_share("student-a",ShareCreateRequest(evidence_ids=[item.id],expires_at=NOW+timedelta(days=7),label="Safe public share"))
    payload=service.public_share(share.share_token).model_dump(mode="json")
    shared=payload["evidence"][0]
    assert "correction_note" not in shared and "can_edit" not in shared and "can_revalidate" not in shared
    assert "source_ref" not in shared["provenance"]
    assert len(shared["provenance"]["reference_hash"])==64
