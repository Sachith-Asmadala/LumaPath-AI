from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ConsentCategory = Literal["academic_summary", "career_goal", "career_readiness", "roadmap"]
RelationshipStatus = Literal["pending", "active", "revoked", "expired"]
RecommendationKind = Literal["comment", "recommendation"]
RecommendationStatus = Literal["proposed", "accepted", "dismissed", "planned"]


class AcademicDeadlineSummary(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    module: str | None = Field(default=None, max_length=120)
    due_at: datetime


class AcademicSummaryInput(BaseModel):
    university: str = Field(default="", max_length=160)
    degree: str = Field(default="", max_length=160)
    academic_year: str = Field(default="", max_length=80)
    semester: str = Field(default="", max_length=80)
    current_modules: list[str] = Field(default_factory=list, max_length=20)
    open_academic_tasks: int = Field(default=0, ge=0, le=10000)
    completed_academic_tasks: int = Field(default=0, ge=0, le=10000)
    upcoming_deadlines: list[AcademicDeadlineSummary] = Field(default_factory=list, max_length=20)


class CareerGoalInput(BaseModel):
    target_role: str = Field(default="", max_length=120)
    career_goal: str = Field(default="", max_length=160)
    learning_goal: str | None = Field(default=None, max_length=220)


class ReadinessMetricInput(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    value: int = Field(ge=0, le=100)


class CareerReadinessInput(BaseModel):
    score: int = Field(ge=0, le=100)
    weekly_delta: int = Field(default=0, ge=-100, le=100)
    breakdown: list[ReadinessMetricInput] = Field(default_factory=list, max_length=20)


class StudentShareSnapshotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    academic_summary: AcademicSummaryInput | None = None
    career_goal: CareerGoalInput | None = None
    career_readiness: CareerReadinessInput | None = None


class ConsentPreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    purpose: str = Field(min_length=3, max_length=300)
    categories: list[ConsentCategory] = Field(min_length=1, max_length=4)
    snapshot: StudentShareSnapshotInput = Field(default_factory=StudentShareSnapshotInput)

    @field_validator("categories")
    @classmethod
    def unique_categories(cls, values):
        return list(dict.fromkeys(values))


class RoadmapMilestoneShare(BaseModel):
    skill_id: str
    name: str
    state: str
    proficiency: int
    transferable_credit: bool


class RoadmapShare(BaseModel):
    pathway_id: str
    version: int
    target_role: str
    goal: str
    milestones: list[RoadmapMilestoneShare]
    updated_at: datetime


class SharedSummary(BaseModel):
    academic_summary: AcademicSummaryInput | None = None
    career_goal: CareerGoalInput | None = None
    career_readiness: CareerReadinessInput | None = None
    roadmap: RoadmapShare | None = None


class ConsentPreviewResponse(BaseModel):
    purpose: str
    categories: list[ConsentCategory]
    shared: SharedSummary
    never_shared_by_default: list[str]


class CreateRelationshipRequest(ConsentPreviewRequest):
    mentor_label: str = Field(min_length=2, max_length=160)
    expires_at: datetime

    @field_validator("expires_at")
    @classmethod
    def aware_expiry(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Mentor relationship expiry must include a timezone.")
        return value


class RelationshipResponse(BaseModel):
    id: str
    student_id: str
    mentor_label: str
    mentor_name: str | None = None
    purpose: str
    status: RelationshipStatus
    categories: list[ConsentCategory]
    invite_expires_at: datetime
    expires_at: datetime
    accepted_at: datetime | None = None
    revoked_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class CreateRelationshipResponse(BaseModel):
    relationship: RelationshipResponse
    invitation_token: str


class UpdateConsentRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    categories: list[ConsentCategory] = Field(min_length=1, max_length=4)
    expires_at: datetime
    snapshot: StudentShareSnapshotInput = Field(default_factory=StudentShareSnapshotInput)

    @field_validator("categories")
    @classmethod
    def unique_categories(cls, values):
        return list(dict.fromkeys(values))

    @field_validator("expires_at")
    @classmethod
    def aware_expiry(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Mentor relationship expiry must include a timezone.")
        return value


class RevokeRelationshipRequest(BaseModel):
    reason: str = Field(default="Student revoked mentor access.", max_length=300)


class AcceptInvitationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    invitation_token: str = Field(min_length=20, max_length=200)
    mentor_name: str = Field(min_length=2, max_length=120)


class AcceptInvitationResponse(BaseModel):
    relationship: RelationshipResponse
    mentor_access_token: str


class GuidanceRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=3, max_length=180)
    question: str = Field(min_length=5, max_length=1800)
    context_note: str = Field(default="", max_length=800)


class GuidanceRequestResponse(BaseModel):
    id: str
    relationship_id: str
    title: str
    question: str
    context_note: str
    status: Literal["open", "answered", "closed"]
    created_at: datetime
    updated_at: datetime


class RecommendationCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    guidance_request_id: str | None = Field(default=None, max_length=160)
    kind: RecommendationKind = "recommendation"
    title: str = Field(min_length=3, max_length=180)
    rationale: str = Field(min_length=5, max_length=1800)
    suggested_action: str = Field(default="", max_length=1000)
    suggested_minutes: int | None = Field(default=None, ge=15, le=480)


class RecommendationResponse(BaseModel):
    id: str
    relationship_id: str
    guidance_request_id: str | None = None
    kind: RecommendationKind
    title: str
    rationale: str
    suggested_action: str
    suggested_minutes: int | None = None
    status: RecommendationStatus
    student_note: str = ""
    created_at: datetime
    decided_at: datetime | None = None
    planned_at: datetime | None = None


class RecommendationDecisionRequest(BaseModel):
    decision: Literal["accept", "dismiss"]
    note: str = Field(default="", max_length=600)


class PlannerBlockInput(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def order(self):
        if self.end_at <= self.start_at:
            raise ValueError("Planner block end must be after start.")
        return self


class MentorPlanActionRequest(BaseModel):
    start_at: datetime
    duration_minutes: int = Field(ge=15, le=480)
    planner_blocks: list[PlannerBlockInput] = Field(default_factory=list, max_length=1000)
    confirmed: bool
    idempotency_key: str = Field(min_length=8, max_length=120)

    @field_validator("start_at")
    @classmethod
    def aware_start(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Planner start time must include a timezone.")
        return value


class MentorPlanActionResponse(BaseModel):
    recommendation_id: str
    internal_task_id: str
    title: str
    start_at: datetime
    end_at: datetime
    planned_minutes: int
    source_label: str
    description: str


class AccessAuditResponse(BaseModel):
    id: int
    actor_type: str
    event_type: str
    categories: list[str]
    detail: str
    occurred_at: datetime


class MentorViewResponse(BaseModel):
    relationship: RelationshipResponse
    shared: SharedSummary
    guidance_requests: list[GuidanceRequestResponse]
    recommendations: list[RecommendationResponse]
    never_shared_by_default: list[str]
