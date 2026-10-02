from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status

from ..pathways.repository import PathwayRepository
from .repository import MentorRepository
from .schemas import (
    AcceptInvitationRequest, AcceptInvitationResponse, AccessAuditResponse, AcademicSummaryInput, CareerGoalInput,
    CareerReadinessInput, ConsentPreviewRequest, ConsentPreviewResponse, CreateRelationshipRequest,
    CreateRelationshipResponse, GuidanceRequestCreate, GuidanceRequestResponse, MentorPlanActionRequest,
    MentorPlanActionResponse, MentorViewResponse, RecommendationCreate, RecommendationDecisionRequest,
    RecommendationResponse, RelationshipResponse, RoadmapMilestoneShare, RoadmapShare, SharedSummary,
    StudentShareSnapshotInput, UpdateConsentRequest,
)

NEVER_SHARED_DEFAULT = [
    "Private capacity/check-in notes",
    "Raw CV documents or CV source text",
    "Interview recordings or raw interview answers",
    "Private task descriptions and personal notes",
    "Uploaded study-document contents",
]


class MentorService:
    def __init__(self, repository: MentorRepository, pathway_repository: PathwayRepository, now=None):
        self.repository = repository
        self.pathway_repository = pathway_repository
        self.now = now or (lambda: datetime.now(timezone.utc))

    @staticmethod
    def _hash_token(token: str) -> str:
        return hashlib.sha256(f"lumapath-mentor-v1:{token}".encode()).hexdigest()

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat()

    def _expire_if_due(self, row):
        if not row:
            return row
        now = self.now().astimezone(timezone.utc)
        expires = datetime.fromisoformat(row["expires_at"])
        if row["status"] not in {"revoked", "expired"} and expires <= now:
            row = self.repository.update_relationship(row["id"], status="expired", updated_at=self._iso(now))
            self.repository.audit(row["id"], row["student_id"], "system", "relationship_expired", "[]", "Relationship expired at its student-selected boundary.", self._iso(now))
        return row

    def _student_relationship(self, student_id: str, relationship_id: str):
        row = self._expire_if_due(self.repository.relationship(relationship_id))
        if not row:
            raise HTTPException(status_code=404, detail="Mentor relationship not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="This mentor relationship belongs to another student.")
        return row

    def _mentor_relationship(self, relationship_id: str, access_token: str):
        if not access_token or len(access_token) < 20:
            raise HTTPException(status_code=401, detail="Mentor access token is required.")
        token_hash = self._hash_token(access_token)
        row = self.repository.by_access_hash(token_hash)
        if not row or row["id"] != relationship_id:
            raise HTTPException(status_code=403, detail="Mentor access is invalid for this relationship.")
        row = self._expire_if_due(row)
        if row["status"] != "active":
            self.repository.audit(row["id"], row["student_id"], "mentor", "access_denied", "[]", f"Access denied because relationship status is {row['status']}.", self._iso(self.now()))
            raise HTTPException(status_code=403, detail="Mentor access has expired or been revoked.")
        return row

    def _relationship_response(self, row) -> RelationshipResponse:
        return RelationshipResponse(
            id=row["id"], student_id=row["student_id"], mentor_label=row["mentor_label"], mentor_name=row["mentor_name"],
            purpose=row["purpose"], status=row["status"], categories=self.repository.active_categories(row["id"]),
            invite_expires_at=datetime.fromisoformat(row["invite_expires_at"]), expires_at=datetime.fromisoformat(row["expires_at"]),
            accepted_at=datetime.fromisoformat(row["accepted_at"]) if row["accepted_at"] else None,
            revoked_at=datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] else None,
            created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _snapshot_columns(self, snapshot: StudentShareSnapshotInput, categories: list[str]):
        return {
            "academic_json": snapshot.academic_summary.model_dump_json() if "academic_summary" in categories and snapshot.academic_summary else None,
            "career_json": snapshot.career_goal.model_dump_json() if "career_goal" in categories and snapshot.career_goal else None,
            "readiness_json": snapshot.career_readiness.model_dump_json() if "career_readiness" in categories and snapshot.career_readiness else None,
        }

    def _roadmap_share(self, student_id: str):
        row = self.pathway_repository.current_active(student_id)
        if not row:
            return None
        steps = self.pathway_repository.steps(row["id"])
        return RoadmapShare(
            pathway_id=row["id"], version=row["version"], target_role=row["target_role"], goal=row["goal"],
            milestones=[RoadmapMilestoneShare(skill_id=s["skill_id"], name=s["name"], state=s["state"], proficiency=s["proficiency"], transferable_credit=bool(s["transferable_credit"])) for s in steps],
            updated_at=datetime.fromisoformat(row["approved_at"] or row["created_at"]),
        )

    def _shared_summary(self, student_id: str, relationship_id: str, categories: list[str], snapshot_row=None):
        snapshot_row = snapshot_row or self.repository.latest_snapshot(relationship_id)
        academic = AcademicSummaryInput.model_validate_json(snapshot_row["academic_json"]) if snapshot_row and snapshot_row["academic_json"] and "academic_summary" in categories else None
        career = CareerGoalInput.model_validate_json(snapshot_row["career_json"]) if snapshot_row and snapshot_row["career_json"] and "career_goal" in categories else None
        readiness = CareerReadinessInput.model_validate_json(snapshot_row["readiness_json"]) if snapshot_row and snapshot_row["readiness_json"] and "career_readiness" in categories else None
        roadmap = self._roadmap_share(student_id) if "roadmap" in categories else None
        return SharedSummary(academic_summary=academic, career_goal=career, career_readiness=readiness, roadmap=roadmap)

    def consent_preview(self, student_id: str, request: ConsentPreviewRequest):
        shared = SharedSummary(
            academic_summary=request.snapshot.academic_summary if "academic_summary" in request.categories else None,
            career_goal=request.snapshot.career_goal if "career_goal" in request.categories else None,
            career_readiness=request.snapshot.career_readiness if "career_readiness" in request.categories else None,
            roadmap=self._roadmap_share(student_id) if "roadmap" in request.categories else None,
        )
        return ConsentPreviewResponse(purpose=request.purpose, categories=request.categories, shared=shared, never_shared_by_default=NEVER_SHARED_DEFAULT)

    def create_relationship(self, student_id: str, request: CreateRelationshipRequest):
        now = self.now().astimezone(timezone.utc)
        expires = request.expires_at.astimezone(timezone.utc)
        if expires <= now + timedelta(minutes=10):
            raise HTTPException(status_code=422, detail="Mentor relationship expiry must be at least 10 minutes in the future.")
        if expires > now + timedelta(days=365):
            raise HTTPException(status_code=422, detail="Mentor relationship expiry cannot exceed one year.")
        invitation_token = secrets.token_urlsafe(32)
        relationship_id = f"mentor_{uuid4().hex[:20]}"
        created = self._iso(now)
        invite_expires = min(expires, now + timedelta(days=7))
        values = {
            "id": relationship_id, "student_id": student_id, "mentor_label": request.mentor_label.strip(), "mentor_name": None,
            "purpose": request.purpose.strip(), "status": "pending", "invitation_token_hash": self._hash_token(invitation_token),
            "mentor_access_token_hash": None, "invite_expires_at": self._iso(invite_expires), "expires_at": self._iso(expires),
            "accepted_at": None, "revoked_at": None, "created_at": created, "updated_at": created,
        }
        row = self.repository.create_relationship(values, request.categories, self._snapshot_columns(request.snapshot, request.categories))
        self.repository.audit(relationship_id, student_id, "student", "mentor_invited", json.dumps(request.categories), "Student created a scoped, expiring mentor invitation.", created)
        return CreateRelationshipResponse(relationship=self._relationship_response(row), invitation_token=invitation_token)

    def list_relationships(self, student_id: str):
        return [self._relationship_response(self._expire_if_due(row)) for row in self.repository.relationships_for_student(student_id)]

    def get_relationship(self, student_id: str, relationship_id: str):
        return self._relationship_response(self._student_relationship(student_id, relationship_id))

    def update_consent(self, student_id: str, relationship_id: str, request: UpdateConsentRequest):
        row = self._student_relationship(student_id, relationship_id)
        if row["status"] in {"revoked", "expired"}:
            raise HTTPException(status_code=409, detail="Revoked or expired mentor access cannot be expanded. Create a new relationship.")
        now = self.now().astimezone(timezone.utc)
        expires = request.expires_at.astimezone(timezone.utc)
        if expires <= now:
            raise HTTPException(status_code=422, detail="Relationship expiry must be in the future.")
        if expires > now + timedelta(days=365):
            raise HTTPException(status_code=422, detail="Mentor relationship expiry cannot exceed one year.")
        self.repository.update_categories(relationship_id, student_id, request.categories, self._iso(now))
        self.repository.add_snapshot(relationship_id, student_id, self._snapshot_columns(request.snapshot, request.categories), self._iso(now))
        row = self.repository.update_relationship(relationship_id, expires_at=self._iso(expires), updated_at=self._iso(now))
        self.repository.audit(relationship_id, student_id, "student", "consent_updated", json.dumps(request.categories), "Student changed mentor sharing scope and/or expiry.", self._iso(now))
        return self._relationship_response(row)

    def revoke(self, student_id: str, relationship_id: str, reason: str):
        row = self._student_relationship(student_id, relationship_id)
        now = self.now().astimezone(timezone.utc)
        if row["status"] == "revoked":
            return self._relationship_response(row)
        self.repository.update_categories(relationship_id, student_id, [], self._iso(now))
        row = self.repository.update_relationship(relationship_id, status="revoked", revoked_at=self._iso(now), updated_at=self._iso(now))
        self.repository.audit(relationship_id, student_id, "student", "relationship_revoked", "[]", reason.strip() or "Student revoked mentor access.", self._iso(now))
        return self._relationship_response(row)

    def accept_invitation(self, request: AcceptInvitationRequest):
        now = self.now().astimezone(timezone.utc)
        row = self.repository.by_invitation_hash(self._hash_token(request.invitation_token))
        if not row:
            raise HTTPException(status_code=404, detail="Mentor invitation is invalid or no longer available.")
        row = self._expire_if_due(row)
        if row["status"] != "pending":
            raise HTTPException(status_code=409, detail="Mentor invitation is no longer pending.")
        if datetime.fromisoformat(row["invite_expires_at"]) <= now:
            raise HTTPException(status_code=410, detail="Mentor invitation has expired.")
        access_token = secrets.token_urlsafe(40)
        row = self.repository.update_relationship(
            row["id"], status="active", mentor_name=request.mentor_name.strip(), mentor_access_token_hash=self._hash_token(access_token),
            accepted_at=self._iso(now), invitation_token_hash=self._hash_token(secrets.token_urlsafe(32)), updated_at=self._iso(now),
        )
        self.repository.audit(row["id"], row["student_id"], "mentor", "invitation_accepted", json.dumps(self.repository.active_categories(row["id"])), "Mentor accepted the student's scoped invitation.", self._iso(now))
        return AcceptInvitationResponse(relationship=self._relationship_response(row), mentor_access_token=access_token)

    def create_guidance_request(self, student_id: str, relationship_id: str, request: GuidanceRequestCreate):
        row = self._student_relationship(student_id, relationship_id)
        if row["status"] not in {"pending", "active"}:
            raise HTTPException(status_code=409, detail="Guidance requests require a pending or active mentor relationship.")
        now = self._iso(self.now())
        request_id = f"guide_{uuid4().hex[:20]}"
        values = {"id": request_id, "relationship_id": relationship_id, "student_id": student_id, "title": request.title.strip(), "question": request.question.strip(), "context_note": request.context_note.strip(), "status": "open", "created_at": now, "updated_at": now}
        result = self._guidance_response(self.repository.create_guidance_request(values))
        self.repository.audit(relationship_id, student_id, "student", "guidance_requested", "[]", f"Guidance request created: {request_id}", now)
        return result

    def guidance_requests(self, student_id: str, relationship_id: str):
        self._student_relationship(student_id, relationship_id)
        return [self._guidance_response(row) for row in self.repository.guidance_requests(relationship_id)]

    def _guidance_response(self, row):
        return GuidanceRequestResponse(id=row["id"], relationship_id=row["relationship_id"], title=row["title"], question=row["question"], context_note=row["context_note"], status=row["status"], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]))

    def _recommendation_response(self, row):
        return RecommendationResponse(id=row["id"], relationship_id=row["relationship_id"], guidance_request_id=row["guidance_request_id"], kind=row["kind"], title=row["title"], rationale=row["rationale"], suggested_action=row["suggested_action"], suggested_minutes=row["suggested_minutes"], status=row["status"], student_note=row["student_note"], created_at=datetime.fromisoformat(row["created_at"]), decided_at=datetime.fromisoformat(row["decided_at"]) if row["decided_at"] else None, planned_at=datetime.fromisoformat(row["planned_at"]) if row["planned_at"] else None)

    def recommendations(self, student_id: str, relationship_id: str):
        self._student_relationship(student_id, relationship_id)
        return [self._recommendation_response(row) for row in self.repository.recommendations(relationship_id)]

    def mentor_view(self, relationship_id: str, access_token: str):
        row = self._mentor_relationship(relationship_id, access_token)
        categories = self.repository.active_categories(relationship_id)
        shared = self._shared_summary(row["student_id"], relationship_id, categories)
        requests = [self._guidance_response(item) for item in self.repository.guidance_requests(relationship_id)]
        recommendations = [self._recommendation_response(item) for item in self.repository.recommendations(relationship_id)]
        now = self._iso(self.now())
        self.repository.audit(relationship_id, row["student_id"], "mentor", "shared_summary_viewed", json.dumps(categories), f"Mentor viewed {len(categories)} consented categories and {len(requests)} guidance requests.", now)
        return MentorViewResponse(relationship=self._relationship_response(row), shared=shared, guidance_requests=requests, recommendations=recommendations, never_shared_by_default=NEVER_SHARED_DEFAULT)

    def mentor_recommend(self, relationship_id: str, access_token: str, request: RecommendationCreate):
        row = self._mentor_relationship(relationship_id, access_token)
        if request.guidance_request_id:
            guidance = self.repository.guidance_request(request.guidance_request_id)
            if not guidance or guidance["relationship_id"] != relationship_id:
                raise HTTPException(status_code=404, detail="Guidance request is not available in this mentor relationship.")
        now = self._iso(self.now())
        recommendation_id = f"mentrec_{uuid4().hex[:20]}"
        values = {"id": recommendation_id, "relationship_id": relationship_id, "student_id": row["student_id"], "guidance_request_id": request.guidance_request_id, "kind": request.kind, "title": request.title.strip(), "rationale": request.rationale.strip(), "suggested_action": request.suggested_action.strip(), "suggested_minutes": request.suggested_minutes, "status": "proposed", "student_note": "", "created_at": now, "decided_at": None, "planned_at": None, "plan_idempotency_key": None, "plan_action_json": None}
        result = self._recommendation_response(self.repository.create_recommendation(values))
        if request.guidance_request_id:
            self.repository.update_guidance_request(request.guidance_request_id, status="answered", updated_at=now)
        self.repository.audit(relationship_id, row["student_id"], "mentor", "recommendation_added", "[]", f"Mentor added {request.kind} {recommendation_id}.", now)
        return result

    def decide_recommendation(self, student_id: str, relationship_id: str, recommendation_id: str, request: RecommendationDecisionRequest):
        self._student_relationship(student_id, relationship_id)
        row = self.repository.recommendation(recommendation_id)
        if not row or row["relationship_id"] != relationship_id:
            raise HTTPException(status_code=404, detail="Mentor recommendation not found.")
        if row["status"] == "planned":
            raise HTTPException(status_code=409, detail="A planned recommendation cannot be dismissed or re-accepted.")
        now = self._iso(self.now())
        next_status = "accepted" if request.decision == "accept" else "dismissed"
        row = self.repository.update_recommendation(recommendation_id, status=next_status, student_note=request.note.strip(), decided_at=now)
        self.repository.audit(relationship_id, student_id, "student", f"recommendation_{next_status}", "[]", f"Student {next_status} mentor recommendation {recommendation_id}.", now)
        return self._recommendation_response(row)

    def approve_plan_action(self, student_id: str, relationship_id: str, recommendation_id: str, request: MentorPlanActionRequest):
        relationship = self._student_relationship(student_id, relationship_id)
        row = self.repository.recommendation(recommendation_id)
        if not row or row["relationship_id"] != relationship_id:
            raise HTTPException(status_code=404, detail="Mentor recommendation not found.")
        if row["kind"] != "recommendation":
            raise HTTPException(status_code=409, detail="Comments cannot be converted into Planner actions.")
        if row["status"] not in {"accepted", "planned"}:
            raise HTTPException(status_code=409, detail="Accept the mentor recommendation before adding it to Planner.")
        if not request.confirmed:
            raise HTTPException(status_code=422, detail="Planner timing must be explicitly confirmed by the student.")
        if row["plan_idempotency_key"]:
            if row["plan_idempotency_key"] != request.idempotency_key:
                raise HTTPException(status_code=409, detail="This recommendation already has a Planner action.")
            return MentorPlanActionResponse.model_validate_json(row["plan_action_json"])
        start = request.start_at.astimezone(timezone.utc)
        now = self.now().astimezone(timezone.utc)
        if start < now - timedelta(minutes=1):
            raise HTTPException(status_code=409, detail="Mentor guidance cannot be scheduled in the past.")
        end = start + timedelta(minutes=request.duration_minutes)
        for block in request.planner_blocks:
            bs, be = block.start_at.astimezone(timezone.utc), block.end_at.astimezone(timezone.utc)
            if start < be and end > bs:
                raise HTTPException(status_code=409, detail="The selected mentor-guidance time overlaps an existing Planner block.")
        action = MentorPlanActionResponse(
            recommendation_id=recommendation_id, internal_task_id=f"task-mentor-{recommendation_id[-10:]}", title=row["suggested_action"] or row["title"],
            start_at=start, end_at=end, planned_minutes=request.duration_minutes,
            source_label=f"Mentor guidance · {relationship['mentor_name'] or relationship['mentor_label']}",
            description=f"Student-approved mentor recommendation. Rationale: {row['rationale']}",
        )
        planned_at = self._iso(now)
        self.repository.update_recommendation(recommendation_id, status="planned", planned_at=planned_at, plan_idempotency_key=request.idempotency_key, plan_action_json=action.model_dump_json())
        self.repository.audit(relationship_id, student_id, "student", "recommendation_planned", "[]", f"Student approved mentor recommendation {recommendation_id} for Planner.", planned_at)
        return action

    def access_history(self, student_id: str, relationship_id: str):
        self._student_relationship(student_id, relationship_id)
        return [AccessAuditResponse(id=row["id"], actor_type=row["actor_type"], event_type=row["event_type"], categories=json.loads(row["categories_json"]), detail=row["detail"], occurred_at=datetime.fromisoformat(row["occurred_at"])) for row in self.repository.audit_history(relationship_id, student_id)]
