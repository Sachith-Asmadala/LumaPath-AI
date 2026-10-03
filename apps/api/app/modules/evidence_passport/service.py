from __future__ import annotations

import hashlib
import json
import secrets
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException

from .repository import EvidencePassportRepository
from .schemas import (
    AccessAuditView, CertificateInput, EvidenceCorrectionRequest, EvidenceProvenance, EvidenceRecord, ExportRequest,
    ExportResponse, MentorValidationRequestCreate, MentorValidationRequestView, MentorValidationResponseInput,
    PassportSummary, PublicEvidenceProvenance, PublicEvidenceRecord, PublicEvidenceShare, ShareCreateRequest, ShareCreateResponse, ShareGrantView, SkillPassport,
)

PASSPORT_DISCLAIMER = (
    "Evidence Passport reports provenance and verification meaning; it does not guarantee credential authenticity, professional proficiency, or employment outcomes."
)
STATUS_WEIGHT = {"verified":1.0,"observed":0.85,"reviewed":0.75,"self_declared":0.45,"stale":0.25,"disputed":0.0,"expired":0.1}


class EvidencePassportService:
    def __init__(self, repository: EvidencePassportRepository, now=lambda: datetime.now(timezone.utc)):
        self.repository=repository
        self.now=now

    @staticmethod
    def _hash(value: str) -> str:
        return hashlib.sha256(value.encode("utf-8")).hexdigest()

    def _skill_name(self, skill_id: str) -> str:
        name=self.repository.skill_name(skill_id)
        if not name:
            raise HTTPException(status_code=422,detail="Skill is not in the approved career taxonomy.")
        return name

    def _status_for(self,row) -> tuple[str,float,str]:
        now=self.now().astimezone(timezone.utc)
        status=row["verification_status"]
        confidence=float(row["confidence"])
        if row["owner_disputed"]:
            return "disputed", min(confidence,0.1), "disputed"
        if row["expires_at"]:
            try:
                expiry=date.fromisoformat(row["expires_at"])
                if expiry < now.date():
                    return "expired", min(confidence,0.15), "expired"
            except ValueError:
                pass
        if row["source_missing"]:
            return "stale", min(confidence,0.25), "stale"
        try:
            freshness_source = row["last_reviewed_at"] if row["evidence_type"] in {"certificate", "manual_project"} and row["last_reviewed_at"] else row["observed_at"]
            observed=datetime.fromisoformat(freshness_source)
            if observed.tzinfo is None: observed=observed.replace(tzinfo=timezone.utc)
            age=(now-observed.astimezone(timezone.utc)).days
            stale_after={"repository":30,"live_demo":30,"assessment":180,"manual_project":365,"mentor_validation":365,"certificate":365}.get(row["evidence_type"],180)
            if age>stale_after and status not in {"verified","disputed","expired"}:
                return "stale", min(confidence,0.35), "stale"
            if status == "stale" and row["evidence_type"] in {"certificate", "manual_project"} and row["last_reviewed_at"] and not row["source_missing"]:
                return "self_declared", max(confidence,0.40), "fresh"
        except ValueError:
            pass
        return status,confidence,"fresh"

    def _view(self,row) -> EvidenceRecord:
        status,confidence,freshness=self._status_for(row)
        proficiency=row["proficiency"]
        contribution=0 if proficiency is None else round(max(0,min(100,int(proficiency))) * confidence * STATUS_WEIGHT.get(status,0))
        can_edit=row["source_origin"] in {"certificate","mentor_validation"}
        return EvidenceRecord(
            id=row["id"],skill_id=row["skill_id"],skill_name=row["skill_name"],evidence_type=row["evidence_type"],title=row["title"],
            verification_status=status,confidence=round(confidence,3),proficiency=proficiency,freshness=freshness,
            readiness_contribution=max(0,min(100,contribution)),
            provenance=EvidenceProvenance(source=row["source_origin"],source_ref=row["source_ref"],source_url=row["source_url"],issuer=row["issuer"],
                acquired_at=date.fromisoformat(row["acquired_at"]) if row["acquired_at"] else None,expires_at=date.fromisoformat(row["expires_at"]) if row["expires_at"] else None,
                observed_at=datetime.fromisoformat(row["observed_at"]),last_reviewed_at=datetime.fromisoformat(row["last_reviewed_at"]) if row["last_reviewed_at"] else None,
                reference_hash=row["reference_hash"]),correction_note=row["correction_note"],can_edit=can_edit,can_revalidate=status not in {"disputed","expired"}
        )

    def sync(self,student_id:str) -> dict:
        now=self.now().astimezone(timezone.utc); now_iso=now.isoformat()
        seen_portfolio:set[tuple[str,str,str]]=set(); seen_assessment:set[tuple[str,str,str]]=set()
        for row in self.repository.latest_portfolio_rows(student_id):
            if row["status"] == "not_demonstrated":
                continue
            skill_id=row["skill_id"]; skill_name=row["skill_name"] or self._skill_name(skill_id)
            repo=bool(row["source_repository_id"])
            source_ref=f"portfolio:{row['snapshot_id']}:{skill_id}"
            status="observed" if repo and row["status"]=="observed" and row["access_status"]=="active" and not row["stale"] else ("stale" if row["stale"] or (repo and row["access_status"]!="active") else "self_declared")
            confidence=min(0.88 if status=="observed" else 0.58,max(0.25,float(row["confidence"])))
            source_url=row["repository_url"] if repo else row["project_url"]
            observed=row["collected_at"] if repo and row["collected_at"] else row["source_timestamp"]
            e_type="repository" if repo else "manual_project"
            values=self._values(student_id,skill_id,skill_name,e_type,row["project_title"],"portfolio",source_ref,source_url,None,None,None,observed,status,confidence,None,{"portfolio_status":row["status"],"snapshot_id":row["snapshot_id"]},now_iso)
            self.repository.upsert_evidence(values); seen_portfolio.add((source_ref,skill_id,e_type))
            demo_url=row["repository_live_demo"] or row["project_live_demo"]
            if demo_url and (demo_url.startswith("https://") or demo_url.startswith("http://")):
                demo_ref=f"live-demo:{row['project_id']}:{skill_id}"
                demo_status="observed" if status=="observed" else "self_declared"
                self.repository.upsert_evidence(self._values(student_id,skill_id,skill_name,"live_demo",f"Live demo · {row['project_title']}","portfolio",demo_ref,demo_url,None,None,None,observed,demo_status,0.58 if demo_status=="observed" else 0.40,None,{"project_id":row["project_id"]},now_iso)); seen_portfolio.add((demo_ref,skill_id,"live_demo"))
        self.repository.mark_missing_synced(student_id,"portfolio",seen_portfolio,now_iso)

        # Keep the newest instance of a quiz source; past assessment evidence remains useful but becomes stale after 180 days.
        dedupe=set()
        for row in self.repository.latest_assessment_rows(student_id):
            key=(row["source_ref"],row["skill_id"])
            if key in dedupe: continue
            dedupe.add(key)
            source_ref=row["source_ref"]
            values=self._values(student_id,row["skill_id"],row["skill_name"] or self._skill_name(row["skill_id"]),"assessment",row["source_label"],"career_assessment",source_ref,None,None,None,None,row["observed_at"],"observed",min(0.75,max(0.50,float(row["confidence"]))),int(row["proficiency"]),{"assessment_id":row["assessment_id"]},now_iso)
            self.repository.upsert_evidence(values); seen_assessment.add((source_ref,row["skill_id"],"assessment"))
        self.repository.mark_missing_synced(student_id,"career_assessment",seen_assessment,now_iso)
        self._sync_certificates(student_id)
        self.repository.audit(student_id,"student","evidence_synced",[],"Synchronized owner-scoped Portfolio and assessment provenance into the Evidence Passport.",now_iso)
        return {"status":"ok","synced_at":now_iso}

    def _sync_certificates(self,student_id:str):
        now_iso=self.now().astimezone(timezone.utc).isoformat()
        for cert in self.repository.certificates(student_id):
            skill_name=self._skill_name(cert["skill_id"])
            status="self_declared"
            if cert["expires_at"] and date.fromisoformat(cert["expires_at"]) < self.now().date(): status="expired"
            proficiency=cert["proficiency"] if cert["proficiency"] is not None else 55
            self.repository.upsert_evidence(self._values(student_id,cert["skill_id"],skill_name,"certificate",cert["title"],"certificate",f"certificate:{cert['id']}",cert["source_url"],cert["issuer"],cert["acquired_at"],cert["expires_at"],cert["updated_at"],status,0.50,proficiency,{"certificate_id":cert["id"],"credential_reference":cert["credential_reference"]},now_iso,reference_hash=cert["reference_hash"]))

    def _values(self,student_id,skill_id,skill_name,evidence_type,title,origin,source_ref,source_url,issuer,acquired_at,expires_at,observed_at,status,confidence,proficiency,metadata,now_iso,reference_hash=None):
        return {"id":f"evid_{uuid4().hex[:20]}","student_id":student_id,"skill_id":skill_id,"skill_name":skill_name,"evidence_type":evidence_type,"title":title[:180],"source_origin":origin,
            "source_ref":source_ref[:300],"source_url":source_url,"issuer":issuer,"acquired_at":acquired_at,"expires_at":expires_at,"observed_at":observed_at or now_iso,"last_reviewed_at":None,
            "reference_hash":reference_hash or self._hash(f"{student_id}|{skill_id}|{evidence_type}|{source_ref}|{title}"),"verification_status":status,"confidence":max(0,min(1,float(confidence))),"proficiency":proficiency,
            "correction_note":"","owner_disputed":0,"source_missing":0,"active":1,"metadata_json":json.dumps(metadata,separators=(",",":")),"created_at":now_iso,"updated_at":now_iso}

    def dashboard(self,student_id:str,do_sync:bool=True) -> PassportSummary:
        if do_sync: self.sync(student_id)
        now=self.now().astimezone(timezone.utc)
        records=[self._view(row) for row in self.repository.list_evidence(student_id)]
        assessed={row["skill_id"]:row for row in self.repository.latest_student_skills(student_id)}
        grouped:dict[str,list[EvidenceRecord]]={}
        for item in records: grouped.setdefault(item.skill_id,[]).append(item)
        for skill_id in assessed: grouped.setdefault(skill_id,[])
        skills=[]
        def sort_name(entry):
            skill_id, items = entry
            row = assessed.get(skill_id)
            return (row["skill_name"] if row else (items[0].skill_name if items else skill_id)).lower()
        for skill_id,items in sorted(grouped.items(), key=sort_name):
            row=assessed.get(skill_id); name=(row["skill_name"] if row else (items[0].skill_name if items else self._skill_name(skill_id)))
            readiness=max([item.readiness_contribution for item in items] or [0])
            disputed=any(item.verification_status=="disputed" for item in items)
            strong=any(item.verification_status in {"verified","observed","reviewed"} and item.confidence>=0.6 for item in items)
            if disputed and not strong: status="disputed"
            elif strong: status="supported"
            elif items: status="limited"
            else: status="unsupported"
            gap=("No evidence is currently linked to this skill." if not items else "Evidence is present but remains self-declared, stale, expired, or low-confidence." if status=="limited" else "Evidence has a dispute that should be reviewed." if status=="disputed" else "Multiple evidence sources currently support this skill claim.")
            skills.append(SkillPassport(skill_id=skill_id,skill_name=name,required_proficiency=int(row["required_proficiency"]) if row else None,assessed_proficiency=int(row["proficiency"]) if row else None,readiness_score=readiness,status=status,evidence=items,gap_explanation=gap))
        self.repository.audit(student_id,"student","passport_viewed",[r.id for r in records],"Student viewed their private Evidence Passport.",now.isoformat())
        return PassportSummary(generated_at=now,skills=skills,total_evidence=len(records),verified_or_observed=sum(r.verification_status in {"verified","observed","reviewed"} for r in records),stale_or_expired=sum(r.verification_status in {"stale","expired"} for r in records),disputed=sum(r.verification_status=="disputed" for r in records),disclaimer=PASSPORT_DISCLAIMER)

    def add_certificate(self,student_id:str,request:CertificateInput) -> EvidenceRecord:
        skill_name=self._skill_name(request.skill_id); now=self.now().astimezone(timezone.utc); cert_id=f"cert_{uuid4().hex[:20]}"
        reference_hash=self._hash(f"{student_id}|{request.skill_id}|{request.issuer}|{request.title}|{request.credential_reference}|{request.source_url or ''}|{request.acquired_at}|{request.expires_at}")
        values={"id":cert_id,"student_id":student_id,"skill_id":request.skill_id,"title":request.title.strip(),"issuer":request.issuer.strip(),"acquired_at":request.acquired_at.isoformat() if request.acquired_at else None,"expires_at":request.expires_at.isoformat() if request.expires_at else None,"credential_reference":request.credential_reference.strip(),"source_url":request.source_url,"proficiency":request.proficiency,"reference_hash":reference_hash,"created_at":now.isoformat(),"updated_at":now.isoformat()}
        self.repository.create_certificate(values); self._sync_certificates(student_id)
        row=next(r for r in self.repository.list_evidence(student_id) if r["source_ref"]==f"certificate:{cert_id}")
        self.repository.audit(student_id,"student","certificate_added",[row["id"]],"Student added certificate metadata. Authenticity remains self-declared until independently verified.",now.isoformat())
        return self._view(row)

    def update_certificate(self,student_id:str,certificate_id:str,request:CertificateInput) -> EvidenceRecord:
        self._skill_name(request.skill_id); cert=self.repository.certificate(certificate_id)
        if not cert or cert["student_id"]!=student_id: raise HTTPException(404,"Certificate record not found.")
        now=self.now().astimezone(timezone.utc)
        credential_reference=request.credential_reference.strip() or cert["credential_reference"]
        reference_hash=self._hash(f"{student_id}|{request.skill_id}|{request.issuer}|{request.title}|{credential_reference}|{request.source_url or ''}|{request.acquired_at}|{request.expires_at}")
        self.repository.update_certificate(certificate_id,student_id,{"skill_id":request.skill_id,"title":request.title.strip(),"issuer":request.issuer.strip(),"acquired_at":request.acquired_at.isoformat() if request.acquired_at else None,"expires_at":request.expires_at.isoformat() if request.expires_at else None,"credential_reference":credential_reference,"source_url":request.source_url,"proficiency":request.proficiency,"reference_hash":reference_hash,"updated_at":now.isoformat()})
        self.repository.retire_source_ref(student_id, f"certificate:{certificate_id}", now.isoformat())
        self._sync_certificates(student_id); row=next(r for r in self.repository.list_evidence(student_id) if r["source_ref"]==f"certificate:{certificate_id}")
        self.repository.audit(student_id,"student","certificate_corrected",[row["id"]],"Student corrected certificate metadata; verification status remains evidence-type based.",now.isoformat()); return self._view(row)

    def delete_certificate(self,student_id:str,certificate_id:str):
        if not self.repository.delete_certificate(certificate_id,student_id): raise HTTPException(404,"Certificate record not found.")
        self.repository.audit(student_id,"student","certificate_deleted",[],"Student deleted certificate metadata and withdrew its active Passport evidence.",self.now().astimezone(timezone.utc).isoformat())
        return {"status":"deleted"}

    def correct_evidence(self,student_id:str,evidence_id:str,request:EvidenceCorrectionRequest):
        existing=self.repository.evidence_for_owner(evidence_id,student_id)
        if not existing: raise HTTPException(404,"Evidence record not found.")
        restore={"repository":"observed","live_demo":"observed","assessment":"observed","mentor_validation":"reviewed","manual_project":"self_declared","certificate":"self_declared"}.get(existing["evidence_type"],"self_declared")
        if existing["source_missing"]: restore="stale"
        if existing["expires_at"]:
            try:
                if date.fromisoformat(existing["expires_at"]) < self.now().date(): restore="expired"
            except ValueError: pass
        row=self.repository.set_disputed(evidence_id,student_id,request.disputed,request.note.strip(),self.now().astimezone(timezone.utc).isoformat(),restore)
        return self._view(row)

    def revalidate(self,student_id:str,evidence_id:str):
        row=self.repository.revalidate(evidence_id,student_id,self.now().astimezone(timezone.utc).isoformat())
        if not row: raise HTTPException(404,"Evidence record not found.")
        return self._view(row)

    def create_mentor_validation_request(self,student_id:str,request:MentorValidationRequestCreate):
        now=self.now().astimezone(timezone.utc); relationship=self.repository.active_mentor_relationship(student_id,request.relationship_id,now.isoformat())
        if not relationship: raise HTTPException(409,"Mentor validation requires an active, unexpired relationship owned by the student.")
        skill_name=self._skill_name(request.skill_id); request_id=f"evmr_{uuid4().hex[:20]}"
        row=self.repository.create_mentor_request({"id":request_id,"student_id":student_id,"relationship_id":request.relationship_id,"skill_id":request.skill_id,"skill_name":skill_name,"status":"pending","request_note":request.request_note.strip(),"mentor_note":"","proficiency":None,"created_at":now.isoformat(),"responded_at":None})
        self.repository.audit(student_id,"student","mentor_validation_requested",[],f"Student explicitly asked mentor relationship {request.relationship_id} to review {skill_name} evidence.",now.isoformat())
        return self._mentor_request_view(row,relationship)

    def mentor_requests(self,student_id:str):
        return [self._mentor_request_view(row,row) for row in self.repository.mentor_requests(student_id)]

    def mentor_relationship_requests(self, access_token: str, relationship_id: str):
        now=self.now().astimezone(timezone.utc); relation=self.repository.mentor_relationship_by_token_hash(self._hash(access_token),now.isoformat())
        if not relation or relation["id"]!=relationship_id: raise HTTPException(403,"Mentor evidence access is denied for this relationship.")
        rows=self.repository.mentor_requests_for_relationship(relationship_id)
        return [self._mentor_request_view(row,row) for row in rows]

    def _mentor_request_view(self,row,relationship):
        return MentorValidationRequestView(id=row["id"],relationship_id=row["relationship_id"],mentor_label=(relationship["mentor_name"] or relationship["mentor_label"]),skill_id=row["skill_id"],skill_name=row["skill_name"],status=row["status"],request_note=row["request_note"],mentor_note=row["mentor_note"],created_at=datetime.fromisoformat(row["created_at"]),responded_at=datetime.fromisoformat(row["responded_at"]) if row["responded_at"] else None)

    def mentor_respond(self,access_token:str,request_id:str,request:MentorValidationResponseInput):
        now=self.now().astimezone(timezone.utc); relation=self.repository.mentor_relationship_by_token_hash(self._hash(access_token),now.isoformat())
        if not relation or relation["id"]!=request.relationship_id: raise HTTPException(403,"Mentor evidence access is denied for this relationship.")
        row=self.repository.mentor_request(request_id)
        if not row or row["relationship_id"]!=relation["id"]: raise HTTPException(404,"Mentor validation request not found.")
        if row["status"]!="pending": raise HTTPException(409,"This mentor validation request has already been answered.")
        row=self.repository.respond_mentor_request(request_id,request.decision,request.note.strip(),request.proficiency,now.isoformat())
        status={"validated":"reviewed","uncertain":"self_declared","disputed":"disputed"}[request.decision]
        confidence={"validated":0.72,"uncertain":0.38,"disputed":0.10}[request.decision]
        proficiency=request.proficiency if request.proficiency is not None else (70 if request.decision=="validated" else 50)
        source_ref=f"mentor-validation:{request_id}"
        title=f"Mentor validation · {relation['mentor_name'] or relation['mentor_label']}"
        values=self._values(row["student_id"],row["skill_id"],row["skill_name"],"mentor_validation",title,"mentor_validation",source_ref,None,relation["mentor_name"] or relation["mentor_label"],None,None,now.isoformat(),status,confidence,proficiency,{"relationship_id":relation["id"],"validation_request_id":request_id,"decision":request.decision},now.isoformat())
        evid=self.repository.upsert_evidence(values)
        self.repository.audit(row["student_id"],"mentor","mentor_validation_recorded",[evid["id"]],f"Mentor responded to explicit skill validation request {request_id} with {request.decision}.",now.isoformat())
        return self._view(evid)

    def _owned_selection(self,student_id:str,evidence_ids:list[str]):
        rows=self.repository.selected_evidence(student_id,evidence_ids)
        if len(rows)!=len(set(evidence_ids)): raise HTTPException(403,"Every selected evidence item must belong to the current student.")
        return rows

    def _public_view(self, row) -> PublicEvidenceRecord:
        owner=self._view(row)
        return PublicEvidenceRecord(
            id=owner.id, skill_id=owner.skill_id, skill_name=owner.skill_name, evidence_type=owner.evidence_type,
            title=owner.title, verification_status=owner.verification_status, confidence=owner.confidence,
            proficiency=owner.proficiency, freshness=owner.freshness,
            provenance=PublicEvidenceProvenance(
                source=owner.provenance.source, source_url=owner.provenance.source_url, issuer=owner.provenance.issuer,
                acquired_at=owner.provenance.acquired_at, expires_at=owner.provenance.expires_at,
                observed_at=owner.provenance.observed_at, last_reviewed_at=owner.provenance.last_reviewed_at,
                reference_hash=owner.provenance.reference_hash,
            ),
        )

    def export(self,student_id:str,request:ExportRequest):
        now=self.now().astimezone(timezone.utc); rows=self._owned_selection(student_id,request.evidence_ids); views=[self._view(r) for r in rows]
        lines=["LumaPath Evidence Passport","Selected evidence export",f"Generated: {now.isoformat()}","",PASSPORT_DISCLAIMER,""]
        current=None
        for item in views:
            if item.skill_name!=current:
                current=item.skill_name; lines.extend([f"## {current}"])
            lines.extend([f"- {item.title}",f"  Type: {item.evidence_type}",f"  Verification: {item.verification_status} · confidence {round(item.confidence*100)}%",f"  Provenance: {item.provenance.source} · {item.provenance.source_ref}",f"  Observed: {item.provenance.observed_at.isoformat()}"])
            if item.provenance.issuer: lines.append(f"  Issuer: {item.provenance.issuer}")
            if item.provenance.source_url: lines.append(f"  Source: {item.provenance.source_url}")
            lines.append("")
        self.repository.audit(student_id,"student","evidence_exported",request.evidence_ids,"Student created a recruiter-ready export containing only explicitly selected evidence summaries.",now.isoformat())
        return ExportResponse(filename=f"lumapath-evidence-{now.date().isoformat()}.txt",content_type="text/plain;charset=utf-8",content="\n".join(lines),generated_at=now,disclaimer=PASSPORT_DISCLAIMER)

    def create_share(self,student_id:str,request:ShareCreateRequest):
        now=self.now().astimezone(timezone.utc)
        expiry=request.expires_at.astimezone(timezone.utc)
        if expiry<=now: raise HTTPException(422,"Share expiry must be in the future.")
        if expiry>now+timedelta(days=30): raise HTTPException(422,"Evidence shares can be active for at most 30 days.")
        self._owned_selection(student_id,request.evidence_ids)
        token=secrets.token_urlsafe(32); share_id=f"eshare_{uuid4().hex[:20]}"
        row=self.repository.create_share({"id":share_id,"student_id":student_id,"token_hash":self._hash(token),"label":request.label.strip(),"evidence_ids_json":json.dumps(request.evidence_ids),"created_at":now.isoformat(),"expires_at":expiry.isoformat()})
        self.repository.audit(student_id,"student","share_created",request.evidence_ids,"Student created a scoped, expiring Evidence Passport share.",now.isoformat(),share_id)
        return ShareCreateResponse(share=self._share_view(row,now),share_token=token)

    def shares(self,student_id:str):
        now=self.now().astimezone(timezone.utc); return [self._share_view(r,now) for r in self.repository.list_shares(student_id)]

    def _share_view(self,row,now):
        expires=datetime.fromisoformat(row["expires_at"]); revoked=datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] else None
        status="revoked" if revoked else "expired" if expires<=now else "active"
        return ShareGrantView(id=row["id"],label=row["label"],evidence_ids=json.loads(row["evidence_ids_json"]),created_at=datetime.fromisoformat(row["created_at"]),expires_at=expires,revoked_at=revoked,status=status,access_count=row["access_count"])

    def revoke_share(self,student_id:str,share_id:str):
        now=self.now().astimezone(timezone.utc); row=self.repository.revoke_share(share_id,student_id,now.isoformat())
        if not row: raise HTTPException(404,"Active evidence share not found.")
        ids=json.loads(row["evidence_ids_json"]); self.repository.audit(student_id,"student","share_revoked",ids,"Student revoked Evidence Passport sharing immediately.",now.isoformat(),share_id)
        return self._share_view(row,now)

    def public_share(self,token:str):
        now=self.now().astimezone(timezone.utc); row=self.repository.share_by_hash(self._hash(token))
        if not row: raise HTTPException(404,"Evidence share is unavailable.")
        if row["revoked_at"]: raise HTTPException(403,"Evidence share has been revoked.")
        if datetime.fromisoformat(row["expires_at"])<=now: raise HTTPException(410,"Evidence share has expired.")
        ids=json.loads(row["evidence_ids_json"]); evidence=[self._public_view(r) for r in self.repository.selected_evidence(row["student_id"],ids)]
        self.repository.increment_share_access(row["id"]); self.repository.audit(row["student_id"],"share_recipient","share_viewed",ids,"Recipient opened the scoped Evidence Passport share.",now.isoformat(),row["id"])
        return PublicEvidenceShare(share_id=row["id"],label=row["label"],generated_at=now,expires_at=datetime.fromisoformat(row["expires_at"]),evidence=evidence,disclaimer=PASSPORT_DISCLAIMER)

    def audits(self,student_id:str):
        rows=self.repository.audit_history(student_id)
        return [AccessAuditView(id=r["id"],actor_type=r["actor_type"],event_type=r["event_type"],evidence_ids=json.loads(r["evidence_ids_json"]),detail=r["detail"],occurred_at=datetime.fromisoformat(r["occurred_at"])) for r in rows]
