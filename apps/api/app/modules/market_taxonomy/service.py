from __future__ import annotations

import hashlib
import json
import math
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException

from ...core.security import TaxonomyCuratorPrincipal
from ..careers.service import CareerService
from ..pathways.repository import PathwayRepository
from ..pathways.schemas import RecalculateRequest
from ..pathways.service import PathwayService
from ..notifications.schemas import CandidateInput, CandidateSyncRequest, NotificationType, Urgency
from ..notifications.service import NotificationService
from .repository import MarketTaxonomyRepository
from .schemas import (
    ApprovalView, ChangeProposalView, ImpactChange, MarketGovernanceView, MarketSourceUpsertRequest, MarketSourceView, SignalObservationView,
    ObservationIngestRequest, ObservationView, ProfileComparisonResponse, ProfileRoleView, ProfileSkillView,
    ProposalCreateRequest, ProposalDecisionRequest, SignalComputeRequest, SkillSignalView, StudentTaxonomyUpdateView,
    StudentUpdateDecisionRequest, TaxonomyVersionView, TaxonomyRollbackRequest, TaxonomyRollbackResponse,
)

METHODOLOGY_VERSION = "doc-f34-signal-v1"
MIN_SAMPLE_SIZE = 50
MIN_SOURCE_COUNT = 2
PUBLICATION_CONFIDENCE = 0.62
EMERGING_THRESHOLD = 0.08
DECLINING_THRESHOLD = -0.08
SIGNAL_TTL_DAYS = 45
TRUST_MINIMUM = 70


class MarketTaxonomyService:
    def __init__(self, repository: MarketTaxonomyRepository, career_service: CareerService, pathway_repository: PathwayRepository, pathway_service: PathwayService, now=lambda: datetime.now(timezone.utc), notification_service: NotificationService | None = None):
        self.repository=repository; self.career_service=career_service; self.pathway_repository=pathway_repository; self.pathway_service=pathway_service; self.now=now; self.notification_service=notification_service

    def governance(self) -> MarketGovernanceView:
        return MarketGovernanceView(methodology_version=METHODOLOGY_VERSION, minimum_sample_size=MIN_SAMPLE_SIZE, minimum_source_count=MIN_SOURCE_COUNT, publication_confidence=PUBLICATION_CONFIDENCE, emerging_delta_threshold=EMERGING_THRESHOLD, declining_delta_threshold=DECLINING_THRESHOLD, source_rules=[
            "Only approved job aggregates, official certification objectives and trusted technology sources are accepted.",
            "Sources must pass licensing, trust, freshness and bias review before observations can influence publishable signals.",
            "Individual job descriptions or student records are never stored in this market-signal pipeline.",
            "Regional profiles require explicit region scope; approved international taxonomy remains the default unless a student deliberately compares profiles.",
        ], ai_rule="AI may summarize already-grounded evidence, but approval/rejection and high-impact publication require a human taxonomy reviewer.")

    def upsert_source(self, principal: TaxonomyCuratorPrincipal, request: MarketSourceUpsertRequest) -> MarketSourceView:
        if principal.role not in {"taxonomy_curator","taxonomy_reviewer"}: raise HTTPException(status_code=403, detail="Taxonomy curator access is required.")
        requested_regions = request.regions
        if not self._all_regions_allowed(principal, requested_regions):
            raise HTTPException(status_code=403, detail="Curator is not authorised to administer one or more requested source regions.")
        now=self._now(); values=request.model_dump(mode="json"); values["regions_json"]=json.dumps(requested_regions); values["created_at"]=now.isoformat(); values["updated_at"]=now.isoformat()
        existing=self.repository.source(request.id)
        if existing:
            if not self._all_regions_allowed(principal, json.loads(existing["regions_json"])):
                raise HTTPException(status_code=403, detail="Curator is not authorised to modify this source because it is governed in another region scope.")
            values["created_at"]=existing["created_at"]
        row=self.repository.upsert_source(values); self.repository.audit(principal.curator_id,principal.role,"market_source_saved",request.id,f"status={request.status}; trust={request.trust_score}",now.isoformat())
        return self._source(row)

    def sources(self, principal: TaxonomyCuratorPrincipal):
        return [self._source(row) for row in self.repository.sources() if self._region_allowed(principal, json.loads(row["regions_json"]))]

    def ingest(self, principal: TaxonomyCuratorPrincipal, request: ObservationIngestRequest) -> list[ObservationView]:
        now=self._now(); accepted=[]
        purged = self.repository.purge_expired_observations(now.isoformat())
        if purged:
            self.repository.audit(principal.curator_id, principal.role, "market_retention_purge", "observations", f"purged={purged}", now.isoformat())
        for item in request.items:
            source=self.repository.source(item.source_id)
            if source is None: raise HTTPException(status_code=422, detail=f"Market source '{item.source_id}' is not registered.")
            if source["status"]!="approved" or source["bias_review_status"]!="approved" or int(source["trust_score"])<TRUST_MINIMUM:
                raise HTTPException(status_code=409, detail=f"Market source '{item.source_id}' is not approved for signal ingestion.")
            regions=json.loads(source["regions_json"])
            target_region=item.region_code or "international"
            if target_region not in regions and "all" not in regions:
                raise HTTPException(status_code=403, detail=f"Source '{item.source_id}' is not approved for the requested market region.")
            if not principal.can_access_region(target_region):
                raise HTTPException(status_code=403, detail="Curator is not authorised for this market profile.")
            observed=item.observed_at.astimezone(timezone.utc)
            if observed > now + timedelta(hours=24): raise HTTPException(status_code=422, detail="Observation date cannot be materially in the future.")
            if observed < now-timedelta(days=int(source["max_age_days"])): raise HTTPException(status_code=409, detail="Observation is stale for this governed source.")
            raw=f"{item.source_id}|{item.role_id}|{item.skill_id}|{item.profile_scope}|{item.region_code}|{item.period_start}|{item.period_end}|{item.sample_size}|{item.skill_share:.6f}|{item.provenance_url}"
            values={"id":f"obs_{uuid4().hex[:18]}",**item.model_dump(mode="json"),"observed_at":observed.isoformat(),"content_hash":hashlib.sha256(raw.encode()).hexdigest(),"expires_at":(observed+timedelta(days=int(source["max_age_days"]))).isoformat(),"retained_until":(now+timedelta(days=int(source["retention_days"]))).isoformat(),"ingested_at":now.isoformat()}
            if self.repository.insert_observation(values): accepted.append(ObservationView.model_validate(values))
        self.repository.audit(principal.curator_id,principal.role,"market_observations_ingested","batch",f"accepted={len(accepted)}",now.isoformat())
        return accepted

    def compute_signal(self, principal: TaxonomyCuratorPrincipal, request: SignalComputeRequest) -> SkillSignalView:
        requested_region = request.region_code if request.profile_scope == "regional" else "international"
        if not principal.can_access_region(requested_region): raise HTTPException(status_code=403, detail="Curator is not authorised for this market profile.")
        now=self._now(); rows=list(self.repository.observations(request.role_id,request.skill_id,request.profile_scope,request.region_code,now.isoformat()))
        rows=[r for r in rows if r["source_status"]=="approved" and r["bias_review_status"]=="approved" and int(r["trust_score"])>=TRUST_MINIMUM]
        if len(rows)<2: raise HTTPException(status_code=422, detail="At least two time-separated governed observations are required to calculate a market signal.")
        rows.sort(key=lambda r:(r["period_end"],r["observed_at"]))
        midpoint=max(1,len(rows)//2); prior=rows[:midpoint]; recent=rows[midpoint:]
        if not recent: recent=[rows[-1]]; prior=rows[:-1]
        prior_share=self._weighted_share(prior); recent_share=self._weighted_share(recent); delta=recent_share-prior_share
        total_sample=sum(int(r["sample_size"]) for r in rows); source_ids=sorted({r["source_id"] for r in rows}); source_count=len(source_ids)
        latest=max(datetime.fromisoformat(r["observed_at"]).astimezone(timezone.utc) for r in rows); recency_days=max(0.0,(now-latest).total_seconds()/86400)
        sample_factor=min(1.0,math.log10(total_sample+1)/3.0); source_factor=min(1.0,source_count/MIN_SOURCE_COUNT); trust_factor=sum(int(r["trust_score"]) for r in rows)/(100*len(rows)); recency_factor=max(0.2,1-min(recency_days/180,0.8))
        directions=[(float(r["skill_share"])-prior_share) for r in recent]; conflict_factor=0.85 if directions and any(v>0 for v in directions) and any(v<0 for v in directions) else 1.0
        confidence=max(0,min(0.99,sample_factor*0.30+source_factor*0.25+trust_factor*0.25+recency_factor*0.20)); confidence*=conflict_factor; confidence=round(confidence,3)
        label="emerging" if delta>=EMERGING_THRESHOLD else "declining" if delta<=DECLINING_THRESHOLD else "stable"
        limitations=[]
        if total_sample<MIN_SAMPLE_SIZE: limitations.append(f"Aggregate sample size {total_sample} is below publication threshold {MIN_SAMPLE_SIZE}.")
        if source_count<MIN_SOURCE_COUNT: limitations.append(f"Only {source_count} independent governed source is represented; {MIN_SOURCE_COUNT} are required for publication.")
        if confidence<PUBLICATION_CONFIDENCE: limitations.append("Confidence is below the publication threshold; keep this as an observed signal only.")
        if conflict_factor<1: limitations.append("Recent governed sources disagree on direction; confidence was reduced.")
        eligible=not limitations and label in {"emerging","declining"}
        methodology="Weighted recent-vs-prior skill-share change. Confidence combines aggregate sample size, independent-source count, source trust, recency and a disagreement penalty. Signals never publish taxonomy changes automatically."
        values={"id":f"signal_{uuid4().hex[:18]}","role_id":request.role_id,"skill_id":request.skill_id,"profile_scope":request.profile_scope,"region_code":request.region_code,"label":label,"delta":round(delta,4),"recent_share":round(recent_share,4),"prior_share":round(prior_share,4),"sample_size":total_sample,"source_count":source_count,"confidence":confidence,"recency_days":round(recency_days,2),"methodology_version":METHODOLOGY_VERSION,"methodology":methodology,"source_ids_json":json.dumps(source_ids),"observation_ids_json":json.dumps([r["id"] for r in rows]),"publication_eligible":int(eligible),"limitations_json":json.dumps(limitations),"created_at":now.isoformat(),"expires_at":(now+timedelta(days=SIGNAL_TTL_DAYS)).isoformat()}
        row=self.repository.create_signal(values); self.repository.audit(principal.curator_id,principal.role,"skill_signal_computed",row["id"],f"{label}; confidence={confidence}; eligible={eligible}",now.isoformat()); return self._signal(row)

    def signals(self, principal: TaxonomyCuratorPrincipal, profile_scope: str | None=None, region_code: str | None=None):
        if profile_scope == "international" and not principal.can_access_region("international"):
            raise HTTPException(status_code=403, detail="Curator is not authorised for the international profile.")
        if profile_scope=="regional" and not principal.can_access_region(region_code):
            raise HTTPException(status_code=403, detail="Curator is not authorised for this regional profile.")
        rows = self.repository.list_signals(profile_scope,region_code)
        return [self._signal(row) for row in rows if self._row_profile_allowed(principal, row)]

    def create_proposal(self, principal: TaxonomyCuratorPrincipal, request: ProposalCreateRequest) -> ChangeProposalView:
        signal=self.repository.signal(request.signal_id)
        if signal is None: raise HTTPException(status_code=404, detail="Market signal not found.")
        if not self._row_profile_allowed(principal, signal): raise HTTPException(status_code=403, detail="Curator is not authorised for this market profile.")
        if not signal["publication_eligible"]: raise HTTPException(status_code=409, detail="This observed signal does not meet publication thresholds and cannot become a taxonomy proposal.")
        if datetime.fromisoformat(signal["expires_at"])<=self._now(): raise HTTPException(status_code=409, detail="This market signal expired; recompute it from current evidence before proposing a change.")
        self._validate_signal_grounding(signal)
        version=self.repository.active_version(signal["profile_scope"],signal["region_code"])
        if version is None:
            if signal["profile_scope"]=="regional": version=self.repository.active_version("international",None)
            if version is None: raise HTTPException(status_code=409, detail="No approved taxonomy profile is available.")
        snapshot=json.loads(version["snapshot_json"]); role=self._role(snapshot,signal["role_id"]); skill=self._skill(role,signal["skill_id"])
        current=int(skill["required_proficiency"]) if skill else None
        if signal["label"]=="emerging":
            change_type="increase_priority" if skill else "add_requirement"; proposed=request.proposed_required_proficiency if request.proposed_required_proficiency is not None else (min(100,current+5) if current is not None else 55)
        elif signal["label"]=="declining":
            if not skill: raise HTTPException(status_code=409, detail="A declining signal cannot retire a skill that is not in the active profile.")
            change_type="retire_requirement" if request.proposed_required_proficiency==0 else "decrease_priority"; proposed=0 if change_type=="retire_requirement" else (request.proposed_required_proficiency if request.proposed_required_proficiency is not None else max(30,current-5))
        else: raise HTTPException(status_code=409, detail="Stable signals remain observations and do not generate taxonomy change proposals.")
        delta=abs((proposed or 0)-(current or 0)); impact="high" if change_type in {"add_requirement","retire_requirement"} or delta>=10 else "low"
        now=self._now()
        candidate_version=self._next_version(version["version"],signal["profile_scope"],signal["region_code"])
        values={"id":f"proposal_{uuid4().hex[:18]}","signal_id":signal["id"],"base_version":version["version"],"candidate_version":candidate_version,"role_id":role["id"],"role_name":role["name"],"skill_id":signal["skill_id"],"skill_name":skill["name"] if skill else signal["skill_id"].replace("-"," ").title(),"profile_scope":signal["profile_scope"],"region_code":signal["region_code"],"change_type":change_type,"current_required_proficiency":current,"proposed_required_proficiency":proposed,"impact_level":impact,"status":"draft","observed_signal":signal["label"],"signal_confidence":float(signal["confidence"]),"rationale":request.rationale,"created_by":principal.curator_id,"created_at":now.isoformat(),"decided_at":None,"decision_rationale":None,"resulting_version":None}
        candidate_snapshot=deepcopy(snapshot); self._apply(candidate_snapshot,values); candidate_snapshot["version"]=candidate_version
        candidate={"version":candidate_version,"status":"draft","profile_scope":signal["profile_scope"],"region_code":signal["region_code"],"parent_version":version["version"],"snapshot_json":json.dumps(candidate_snapshot,sort_keys=True),"methodology_version":METHODOLOGY_VERSION,"change_summary":f"Draft proposal: {self._change_summary(values)}","created_by":principal.curator_id,"created_at":now.isoformat(),"approved_by":None,"approved_at":None,"retired_at":None,"is_default":0}
        row=self.repository.create_proposal_with_candidate(values,candidate); self.repository.audit(principal.curator_id,principal.role,"taxonomy_proposal_created",row["id"],f"{change_type}; impact={impact}; candidate={candidate_version}",now.isoformat()); return self._proposal(row)

    def proposals(self, principal: TaxonomyCuratorPrincipal, status: str|None=None):
        rows=self.repository.proposals(status); return [self._proposal(r) for r in rows if self._row_profile_allowed(principal, r)]

    def submit(self, principal: TaxonomyCuratorPrincipal, proposal_id: str) -> ChangeProposalView:
        row=self._owned_proposal_region(principal,proposal_id)
        if row["status"]!="draft": raise HTTPException(status_code=409, detail="Only draft proposals can enter review.")
        row=self.repository.submit_proposal(proposal_id); self.repository.audit(principal.curator_id,principal.role,"taxonomy_proposal_submitted",proposal_id,"Human review required before publication.",self._now().isoformat()); return self._proposal(row)

    def decide(self, principal: TaxonomyCuratorPrincipal, proposal_id: str, request: ProposalDecisionRequest) -> ChangeProposalView:
        if principal.role!="taxonomy_reviewer": raise HTTPException(status_code=403, detail="Taxonomy reviewer role is required to approve or reject taxonomy changes.")
        proposal=self._owned_proposal_region(principal,proposal_id)
        if proposal["status"]!="review": raise HTTPException(status_code=409, detail="Only proposals in review can be decided.")
        now=self._now(); resulting=None
        if request.decision == "approve":
            signal = self.repository.signal(proposal["signal_id"])
            if signal is None or datetime.fromisoformat(signal["expires_at"]) <= now:
                raise HTTPException(status_code=409, detail="The proposal's market signal expired; recompute and re-review before publication.")
            self._validate_signal_grounding(signal)
        active=self.repository.active_version(proposal["profile_scope"],proposal["region_code"])
        if active is None and proposal["profile_scope"]=="regional": active=self.repository.active_version("international",None)
        if active is None or active["version"]!=proposal["base_version"]: raise HTTPException(status_code=409, detail="The source taxonomy changed while this proposal was under review. Rebase the proposal before approval.")
        candidate_version=proposal["candidate_version"]
        candidate=self.repository.version(candidate_version) if candidate_version else None
        if candidate is None or candidate["status"]!="review": raise HTTPException(status_code=409, detail="The immutable taxonomy candidate is unavailable or no longer in review.")
        if request.decision=="approve":
            resulting=candidate_version; snapshot=json.loads(candidate["snapshot_json"])
            retire=active["version"] if active["profile_scope"]==proposal["profile_scope"] else None
            self.repository.finalize_candidate_version(candidate_version,decision="approve",reviewer_id=principal.curator_id,at=now.isoformat(),retire_version=retire,is_default=proposal["profile_scope"]=="international")
            if proposal["profile_scope"]=="international": self.repository.publish_snapshot_to_career_tables(resulting,snapshot,active["version"],now.isoformat()); self._notify_impacted(proposal,active["version"],resulting,snapshot,now)
        else:
            self.repository.finalize_candidate_version(candidate_version,decision="reject",reviewer_id=principal.curator_id,at=now.isoformat())
        row=self.repository.record_decision(proposal_id,principal.curator_id,principal.role,request.decision,request.rationale,now.isoformat(),resulting)
        self.repository.audit(principal.curator_id,principal.role,f"taxonomy_proposal_{request.decision}",proposal_id,f"resulting_version={resulting or 'none'}",now.isoformat()); return self._proposal(row)

    def approvals(self, principal: TaxonomyCuratorPrincipal, proposal_id: str):
        self._owned_proposal_region(principal,proposal_id); return [ApprovalView(id=r["id"],proposal_id=r["proposal_id"],actor_id=r["actor_id"],actor_role=r["actor_role"],decision=r["decision"],rationale=r["rationale"],decided_at=r["decided_at"],resulting_version=r["resulting_version"]) for r in self.repository.approvals(proposal_id)]

    def versions(self, principal: TaxonomyCuratorPrincipal, profile_scope: str|None=None, region_code: str|None=None):
        if profile_scope == "international" and not principal.can_access_region("international"):
            raise HTTPException(status_code=403, detail="Curator is not authorised for the international profile.")
        if profile_scope=="regional" and not principal.can_access_region(region_code):
            raise HTTPException(status_code=403, detail="Curator is not authorised for this regional profile.")
        return [self._version(r) for r in self.repository.list_versions(profile_scope,region_code) if self._row_profile_allowed(principal, r)]

    def rollback(self, principal: TaxonomyCuratorPrincipal, request: TaxonomyRollbackRequest) -> TaxonomyRollbackResponse:
        if principal.role != "taxonomy_reviewer":
            raise HTTPException(status_code=403, detail="Taxonomy reviewer role is required for rollback.")
        if not principal.can_access_region("international"):
            raise HTTPException(status_code=403, detail="Reviewer is not authorised for the international taxonomy profile.")
        target = self.repository.version(request.target_version)
        if target is None:
            raise HTTPException(status_code=404, detail="Rollback target taxonomy version not found.")
        if target["profile_scope"] != "international":
            raise HTTPException(status_code=422, detail="This rollback endpoint restores the default international taxonomy only.")
        current = self.repository.active_version("international", None)
        if current is None:
            raise HTTPException(status_code=409, detail="No active international taxonomy exists.")
        if current["version"] == target["version"]:
            raise HTTPException(status_code=409, detail="The requested rollback target is already the active default taxonomy.")
        now = self._now()
        snapshot = deepcopy(json.loads(target["snapshot_json"]))
        new_version = self._next_version(current["version"], "international", None) + "-rollback"
        snapshot["version"] = new_version
        values = {
            "version": new_version, "status": "approved", "profile_scope": "international", "region_code": None,
            "parent_version": current["version"], "snapshot_json": json.dumps(snapshot, sort_keys=True),
            "methodology_version": METHODOLOGY_VERSION,
            "change_summary": f"Human-approved rollback restoring the reviewed snapshot from {target['version']}: {request.rationale}",
            "created_by": principal.curator_id, "created_at": now.isoformat(), "approved_by": principal.curator_id,
            "approved_at": now.isoformat(), "retired_at": None, "is_default": 1,
        }
        self.repository.create_taxonomy_version(values)
        self.repository.retire_version(current["version"], now.isoformat())
        self.repository.publish_snapshot_to_career_tables(new_version, snapshot, current["version"], now.isoformat())
        affected = self._notify_rollback_impacted(current, target, new_version, request.rationale, now)
        self.repository.audit(principal.curator_id, principal.role, "taxonomy_rollback_published", new_version, f"target={target['version']}; previous={current['version']}; affected={affected}", now.isoformat())
        return TaxonomyRollbackResponse(restored_from_version=target["version"], previous_default_version=current["version"], new_version=new_version, affected_pathways=affected, explanation="A new immutable taxonomy version was published from the selected historical snapshot. Existing pathways remain unchanged until their owners approve recalculation.")

    def compare_profiles(self, student_id: str, role_id: str, region_code: str|None) -> ProfileComparisonResponse:
        international=self.repository.active_version("international",None)
        if international is None: raise HTTPException(status_code=503, detail="Approved international taxonomy profile is unavailable.")
        irole=self._profile_role(international,role_id)
        regional=None
        if region_code:
            rv=self.repository.active_version("regional",region_code)
            if rv: regional=self._profile_role(rv,role_id)
        notes=["Comparing a regional profile does not change your active career goal or roadmap.","Existing completed or evidence-credited skills remain preserved unless you explicitly approve a later pathway recalculation."]
        if region_code and regional is None: notes.append(f"No approved regional profile is currently published for {region_code}; LumaPath shows the international profile only.")
        return ProfileComparisonResponse(role_id=role_id,international=irole,regional=regional,notes=notes)

    def student_updates(self, student_id: str): return [self._impact(r) for r in self.repository.impacts(student_id)]

    def decide_student_update(self, student_id: str, impact_id: str, request: StudentUpdateDecisionRequest) -> StudentTaxonomyUpdateView:
        row=self.repository.impact(impact_id)
        if row is None: raise HTTPException(status_code=404,detail="Taxonomy update not found.")
        if row["student_id"]!=student_id: raise HTTPException(status_code=403,detail="You cannot access another student's taxonomy update.")
        if row["status"]!="pending": raise HTTPException(status_code=409,detail="This taxonomy update was already decided.")
        now=self._now(); draft_id=None; status=request.decision
        if request.decision=="recalculate":
            active=self.pathway_repository.current_active(student_id)
            if active is None or active["id"]!=row["pathway_id"]: raise HTTPException(status_code=409,detail="Your active pathway changed. Refresh the impact preview before recalculating.")
            context=json.loads(active["context_json"]); context["reasons"]=[f"Approved taxonomy update {row['from_version']} → {row['to_version']}: {row['explanation']}"]
            draft=self.pathway_service.recalculate(student_id,active["id"],RecalculateRequest.model_validate(context)); draft_id=draft.id; status="recalculation_drafted"
        elif request.decision=="keep_current": status="kept_current"
        else: status="dismissed"
        if self.repository.decide_impact(impact_id,student_id,status,now.isoformat(),draft_id)!=1: raise HTTPException(status_code=409,detail="Taxonomy update state changed; refresh and try again.")
        self.repository.audit(student_id,"student",f"taxonomy_update_{status}",impact_id,f"draft={draft_id or 'none'}",now.isoformat()); return self._impact(self.repository.impact(impact_id))

    def _send_student_notification(self, *, student_id: str, impact_id: str, target_role: str, explanation: str, now: datetime) -> None:
        if self.notification_service is None:
            return
        self.notification_service.sync(student_id, CandidateSyncRequest(items=[CandidateInput(
            notification_type=NotificationType.ROADMAP_MILESTONE,
            source_type="roadmap",
            source_id=impact_id,
            display_label=f"{target_role} market taxonomy update",
            reason=explanation,
            action_href="/market-signals",
            urgency=Urgency.NORMAL,
            occurred_at=now,
            deliver_after=now,
            sensitive=False,
            idempotency_key=f"taxonomy-update:{impact_id}",
        )]))

    def _notify_rollback_impacted(self, current, target, to_version: str, rationale: str, now: datetime) -> int:
        current_snapshot = json.loads(current["snapshot_json"])
        target_snapshot = json.loads(target["snapshot_json"])
        affected = 0
        for role in current_snapshot.get("roles", []):
            target_role = next((r for r in target_snapshot.get("roles", []) if r["id"] == role["id"]), None)
            if target_role is None:
                continue
            before = {s["skill_id"]: s for s in role.get("skills", [])}
            after = {s["skill_id"]: s for s in target_role.get("skills", [])}
            changes = []
            for skill_id in sorted(set(before) | set(after)):
                b, a = before.get(skill_id), after.get(skill_id)
                if b and a and int(b["required_proficiency"]) == int(a["required_proficiency"]):
                    continue
                changes.append(ImpactChange(
                    skill_id=skill_id, skill_name=(a or b)["name"],
                    change=("Requirement restored by rollback." if b and a else "Requirement added by rollback." if a else "Requirement removed by rollback."),
                    before_required_proficiency=(int(b["required_proficiency"]) if b else None),
                    after_required_proficiency=(int(a["required_proficiency"]) if a else None),
                    completed_credit_preserved=True,
                ))
            if not changes:
                continue
            for pathway in self.repository.active_pathways_for_role(role["name"], current["version"]):
                impact_id = f"impact_{uuid4().hex[:18]}"
                explanation = f"A taxonomy reviewer rolled back the active market taxonomy to a previously reviewed snapshot. Reason: {rationale}. Your active roadmap remains unchanged until you choose to recalculate."
                self.repository.insert_impact({
                    "id": impact_id, "student_id": pathway["student_id"], "pathway_id": pathway["id"],
                    "target_role": pathway["target_role"], "from_version": current["version"], "to_version": to_version,
                    "proposal_id": f"rollback:{target['version']}", "explanation": explanation,
                    "preview_json": json.dumps([c.model_dump(mode="json") for c in changes]), "status": "pending",
                    "created_at": now.isoformat(), "decided_at": None, "draft_pathway_id": None,
                })
                self._send_student_notification(student_id=pathway["student_id"], impact_id=impact_id, target_role=pathway["target_role"], explanation=explanation, now=now)
                affected += 1
        return affected

    def _notify_impacted(self, proposal, from_version: str, to_version: str, snapshot: dict, now: datetime):
        new_role=self._role(snapshot,proposal["role_id"])
        new_skill=self._skill(new_role,proposal["skill_id"])
        before=proposal["current_required_proficiency"]; after=(new_skill["required_proficiency"] if new_skill else None)
        for pathway in self.repository.active_pathways_for_role(proposal["role_name"],from_version):
            change=ImpactChange(skill_id=proposal["skill_id"],skill_name=proposal["skill_name"],change=self._change_summary(proposal),before_required_proficiency=before,after_required_proficiency=after,completed_credit_preserved=True)
            explanation=f"The approved {proposal['role_name']} taxonomy changed after review of {proposal['observed_signal']} market evidence. Your current roadmap remains usable and unchanged until you choose to recalculate."
            impact_id=f"impact_{uuid4().hex[:18]}"
            self.repository.insert_impact({"id":impact_id,"student_id":pathway["student_id"],"pathway_id":pathway["id"],"target_role":pathway["target_role"],"from_version":from_version,"to_version":to_version,"proposal_id":proposal["id"],"explanation":explanation,"preview_json":json.dumps([change.model_dump(mode="json")]),"status":"pending","created_at":now.isoformat(),"decided_at":None,"draft_pathway_id":None})
            self._send_student_notification(student_id=pathway["student_id"], impact_id=impact_id, target_role=pathway["target_role"], explanation=explanation, now=now)

    def _apply(self,snapshot,proposal):
        role=self._role(snapshot,proposal["role_id"]); skill=self._skill(role,proposal["skill_id"])
        if proposal["change_type"]=="add_requirement":
            if skill: raise HTTPException(status_code=409,detail="Skill already exists in the selected role profile.")
            role["skills"].append({"skill_id":proposal["skill_id"],"name":proposal["skill_name"],"required_proficiency":int(proposal["proposed_required_proficiency"]),"estimated_minutes":600,"prerequisites":[],"recommended_evidence":["Provide evidence appropriate to this approved market requirement."],"skill_order":len(role["skills"])+1})
        elif proposal["change_type"]=="retire_requirement":
            if not skill: raise HTTPException(status_code=409,detail="Skill no longer exists in this role profile.")
            dependents=[s["skill_id"] for s in role["skills"] if proposal["skill_id"] in s.get("prerequisites",[])]
            if dependents: raise HTTPException(status_code=409,detail=f"Cannot retire a prerequisite still required by: {', '.join(dependents)}.")
            role["skills"]=[s for s in role["skills"] if s["skill_id"]!=proposal["skill_id"]]
        else:
            if not skill: raise HTTPException(status_code=409,detail="Skill no longer exists in this role profile.")
            skill["required_proficiency"]=int(proposal["proposed_required_proficiency"])

    def _next_version(self,parent,scope,region):
        suffix=f"r-{(region or 'global').lower()}" if scope=="regional" else "global"; count=len(self.repository.list_versions(scope,region))+1; return f"{parent}.f34-{suffix}-{count:03d}"
    def _change_summary(self,p):
        before=p["current_required_proficiency"]; after=p["proposed_required_proficiency"]
        if p["change_type"]=="add_requirement": return f"Added {p['skill_name']} as a reviewed requirement at {after}% target proficiency."
        if p["change_type"]=="retire_requirement": return f"Retired {p['skill_name']} from new pathway requirements; existing student credit remains in historical pathways."
        return f"Changed {p['skill_name']} required proficiency from {before}% to {after}% after human review."
    def _validate_signal_grounding(self, signal) -> None:
        now = self._now()
        source_ids = json.loads(signal["source_ids_json"])
        observation_ids = json.loads(signal["observation_ids_json"])
        for source_id in source_ids:
            source = self.repository.source(source_id)
            if source is None or source["status"] != "approved" or source["bias_review_status"] != "approved" or int(source["trust_score"]) < TRUST_MINIMUM:
                raise HTTPException(status_code=409, detail=f"Source '{source_id}' no longer satisfies taxonomy publication governance. Recompute the signal after source review.")
            if not str(source["licensing_policy"]).strip():
                raise HTTPException(status_code=409, detail=f"Source '{source_id}' has no reviewed licensing policy and cannot support publication.")
        observations = self.repository.observation_rows_by_ids(observation_ids)
        if len(observations) != len(observation_ids):
            raise HTTPException(status_code=409, detail="One or more source observations were removed by retention policy; recompute the signal before publication.")
        if any(datetime.fromisoformat(row["expires_at"]).astimezone(timezone.utc) <= now for row in observations):
            raise HTTPException(status_code=409, detail="One or more source observations are stale; recompute the signal before publication.")

    @staticmethod
    def _weighted_share(rows):
        total=sum(int(r["sample_size"]) for r in rows); return sum(float(r["skill_share"])*int(r["sample_size"]) for r in rows)/total if total else 0.0
    def _now(self): return self.now().astimezone(timezone.utc)
    @staticmethod
    def _role(snapshot,role_id):
        role=next((r for r in snapshot.get("roles",[]) if r["id"]==role_id),None)
        if role is None: raise HTTPException(status_code=404,detail="Role is not present in this taxonomy profile.")
        return role
    @staticmethod
    def _skill(role,skill_id): return next((s for s in role.get("skills",[]) if s["skill_id"]==skill_id),None)
    @staticmethod
    def _region_allowed(principal,regions):
        return "all" in principal.region_scope or "all" in regions or any(principal.can_access_region(r) for r in regions)
    @staticmethod
    def _all_regions_allowed(principal, regions):
        if "all" in principal.region_scope:
            return True
        return all(region != "all" and principal.can_access_region(region) for region in regions)
    @staticmethod
    def _row_profile_allowed(principal, row):
        region = row["region_code"] if row["profile_scope"] == "regional" else "international"
        return principal.can_access_region(region)
    def _owned_proposal_region(self,principal,pid):
        row=self.repository.proposal(pid)
        if row is None: raise HTTPException(status_code=404,detail="Taxonomy proposal not found.")
        if not self._row_profile_allowed(principal, row): raise HTTPException(status_code=403,detail="Curator is not authorised for this market profile.")
        return row
    @staticmethod
    def _source(r): return MarketSourceView(id=r["id"],name=r["name"],source_type=r["source_type"],canonical_url=r["canonical_url"],licensing_policy=r["licensing_policy"],trust_score=r["trust_score"],status=r["status"],bias_review_status=r["bias_review_status"],regions=json.loads(r["regions_json"]),retention_days=r["retention_days"],max_age_days=r["max_age_days"],created_at=r["created_at"],updated_at=r["updated_at"])
    def _signal(self, r):
        observation_ids = json.loads(r["observation_ids_json"])
        observations = [SignalObservationView(
            id=o["id"], source_id=o["source_id"], source_name=o["source_name"], source_type=o["source_type"], period_start=o["period_start"], period_end=o["period_end"],
            observed_at=o["observed_at"], sample_size=o["sample_size"], skill_share=o["skill_share"], provenance_url=o["provenance_url"],
        ) for o in self.repository.observation_rows_by_ids(observation_ids)]
        return SkillSignalView(id=r["id"],role_id=r["role_id"],skill_id=r["skill_id"],profile_scope=r["profile_scope"],region_code=r["region_code"],label=r["label"],delta=r["delta"],recent_share=r["recent_share"],prior_share=r["prior_share"],sample_size=r["sample_size"],source_count=r["source_count"],confidence=r["confidence"],recency_days=r["recency_days"],methodology_version=r["methodology_version"],methodology=r["methodology"],source_ids=json.loads(r["source_ids_json"]),observation_ids=observation_ids,observations=observations,publication_eligible=bool(r["publication_eligible"]),limitations=json.loads(r["limitations_json"]),created_at=r["created_at"],expires_at=r["expires_at"])
    @staticmethod
    def _proposal(r): return ChangeProposalView(id=r["id"],signal_id=r["signal_id"],base_version=r["base_version"],candidate_version=r["candidate_version"],role_id=r["role_id"],role_name=r["role_name"],skill_id=r["skill_id"],skill_name=r["skill_name"],profile_scope=r["profile_scope"],region_code=r["region_code"],change_type=r["change_type"],current_required_proficiency=r["current_required_proficiency"],proposed_required_proficiency=r["proposed_required_proficiency"],impact_level=r["impact_level"],status=r["status"],observed_signal=r["observed_signal"],signal_confidence=r["signal_confidence"],rationale=r["rationale"],created_by=r["created_by"],created_at=r["created_at"],decided_at=r["decided_at"],decision_rationale=r["decision_rationale"],resulting_version=r["resulting_version"])
    @staticmethod
    def _version(r): return TaxonomyVersionView(version=r["version"],status=r["status"],profile_scope=r["profile_scope"],region_code=r["region_code"],parent_version=r["parent_version"],methodology_version=r["methodology_version"],change_summary=r["change_summary"],created_by=r["created_by"],created_at=r["created_at"],approved_by=r["approved_by"],approved_at=r["approved_at"],retired_at=r["retired_at"],is_default=bool(r["is_default"]))
    def _profile_role(self,v,role_id):
        snap=json.loads(v["snapshot_json"]); role=self._role(snap,role_id); return ProfileRoleView(role_id=role["id"],role_name=role["name"],version=v["version"],profile_scope=v["profile_scope"],region_code=v["region_code"],skills=[ProfileSkillView(skill_id=s["skill_id"],name=s["name"],required_proficiency=s["required_proficiency"],estimated_minutes=s["estimated_minutes"],prerequisites=s.get("prerequisites",[])) for s in role["skills"]])
    @staticmethod
    def _impact(r): return StudentTaxonomyUpdateView(id=r["id"],pathway_id=r["pathway_id"],target_role=r["target_role"],from_version=r["from_version"],to_version=r["to_version"],proposal_id=r["proposal_id"],explanation=r["explanation"],changes=[ImpactChange.model_validate(x) for x in json.loads(r["preview_json"])],status=r["status"],created_at=r["created_at"],decided_at=r["decided_at"],draft_pathway_id=r["draft_pathway_id"])
