from __future__ import annotations

from datetime import date, datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

OpportunityCategory = Literal["internship", "hackathon", "competition", "workshop", "scholarship", "certification", "university_event"]
EligibilityStatus = Literal["met", "unmet", "unknown"]
TrackingStatus = Literal["interested", "preparing", "applied", "follow_up", "result"]


class SkillContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill_id: str = Field(min_length=1, max_length=80)
    level: int = Field(ge=0, le=100)
    demonstrated: bool = False


class RecommendationPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preferred_types: list[OpportunityCategory] = Field(default_factory=list, max_length=7)
    location_modes: list[Literal["online", "onsite", "hybrid"]] = Field(default_factory=list, max_length=3)
    cost_preference: Literal["free_only", "paid_ok", "any"] = "any"


class EligibilityProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_status: Literal["undergraduate", "graduate", "other"] | None = None
    country: str | None = Field(default=None, max_length=120)
    academic_year: str | None = Field(default=None, max_length=80)


class RecommendationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    target_role: str | None = Field(default=None, max_length=120)
    readiness_score: int | None = Field(default=None, ge=0, le=100)
    skills: list[SkillContext] = Field(default_factory=list, max_length=60)
    preferences: RecommendationPreferences = Field(default_factory=RecommendationPreferences)
    eligibility: EligibilityProfile = Field(default_factory=EligibilityProfile)


class BrowseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    context: RecommendationContext | None = None
    categories: list[OpportunityCategory] = Field(default_factory=list, max_length=7)


class RankingFactor(BaseModel):
    key: str
    label: str
    points: float
    max_points: float
    explanation: str


class RequirementEvidence(BaseModel):
    source_type: Literal["pathway", "evidence_passport", "student_context", "student_profile"]
    label: str
    reference: str
    verification: str | None = None


class EligibilityCheck(BaseModel):
    requirement_id: str
    key: str
    label: str
    kind: Literal["skill", "profile"]
    status: EligibilityStatus
    explanation: str
    evidence: list[RequirementEvidence] = Field(default_factory=list)
    source_text: str
    source_reference: str
    required: bool = True


class SourceValidationView(BaseModel):
    validation_id: str
    status: Literal["trusted", "untrusted", "stale", "expired", "quarantined", "reported"]
    last_verified_at: datetime
    freshness_expires_at: datetime
    opportunity_expires_on: date | None = None
    detail: str


class ApplicationTrackingView(BaseModel):
    id: str
    opportunity_id: str
    status: TrackingStatus
    result: str | None = None
    follow_up_at: datetime | None = None
    source_validation_id: str | None = None
    source_status: Literal["trusted", "untrusted", "stale", "expired", "quarantined", "reported"]
    active_deadline_alerts_allowed: bool
    updated_at: datetime


class OpportunityView(BaseModel):
    id: str
    category: OpportunityCategory
    title: str
    provider: str
    summary: str
    starts_on: date | None
    closes_on: date | None
    location_mode: str
    location: str | None
    cost_type: str
    cost_amount: float | None
    currency: str | None
    required_skills: list[str]
    useful_skills: list[str]
    source_url: str
    source_name: str
    source_checked_at: datetime
    freshness_status: Literal["fresh", "stale"]
    trust_status: Literal["verified", "curated", "untrusted", "quarantined"]
    source_validation: SourceValidationView
    requirement_version: str
    application_steps: list[str]
    sponsored: bool
    sponsor_name: str | None
    rank_score: float | None = None
    ranking_factors: list[RankingFactor] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    skill_gaps: list[str] = Field(default_factory=list)
    eligibility_status: EligibilityStatus
    eligibility_checks: list[EligibilityCheck] = Field(default_factory=list)
    eligibility_evaluation_id: str
    missing_eligibility_data: list[str] = Field(default_factory=list)
    why_fit: str | None = None
    feedback_effect: str | None = None
    saved: bool = False
    dismissed: bool = False
    reported: bool = False
    tracking: ApplicationTrackingView | None = None


class OpportunityBrowseResponse(BaseModel):
    personalized: bool
    generated_at: datetime
    catalogue_version: str
    eligibility_engine_version: str
    items: list[OpportunityView]
    excluded_expired: int = 0
    excluded_untrusted: int = 0
    excluded_stale: int = 0
    message: str


class InteractionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: Literal["save", "unsave", "dismiss", "report"]
    reason: str | None = Field(default=None, max_length=600)

    @model_validator(mode="after")
    def report_needs_reason(self):
        if self.action == "report" and not (self.reason or "").strip():
            raise ValueError("A short reason is required when reporting an opportunity.")
        return self


class InteractionResponse(BaseModel):
    opportunity_id: str
    action: str
    saved: bool
    dismissed: bool
    reported: bool
    message: str


class ExistingPlanBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=1, max_length=160)
    start_at: datetime
    end_at: datetime


# F28 compatibility bridge retained for existing clients.
class PreparationPlanRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=220)
    start_at: datetime
    duration_minutes: int = Field(ge=10, le=480)
    confirmed: bool = False
    existing_blocks: list[ExistingPlanBlock] = Field(default_factory=list, max_length=300)


class PreparationPlanResponse(BaseModel):
    opportunity_id: str
    action_id: str
    title: str
    start_at: datetime
    end_at: datetime
    category: Literal["Career"] = "Career"
    source: str
    description: str
    idempotency_key: str


class PreparationProposalRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    eligibility_evaluation_id: str = Field(min_length=1, max_length=180)
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=80)
    daily_available_minutes: int = Field(ge=0, le=24 * 60)
    existing_blocks: list[ExistingPlanBlock] = Field(default_factory=list, max_length=600)


class PreparationChecklistItem(BaseModel):
    id: str
    requirement_id: str | None = None
    kind: Literal["gap", "verification", "application_step"]
    title: str
    rationale: str
    estimated_minutes: int
    suggested_start_at: datetime | None = None
    suggested_end_at: datetime | None = None
    editable: bool = True
    scheduled: bool


class PreparationPlanView(BaseModel):
    id: str
    opportunity_id: str
    status: Literal["draft", "approved", "invalidated"]
    proposal_version: str
    requirement_version: str
    eligibility_evaluation_id: str
    source_validation_id: str
    deadline: date | None = None
    generated_at: datetime
    approved_at: datetime | None = None
    items: list[PreparationChecklistItem]
    warnings: list[str] = Field(default_factory=list)


class PreparationApprovalItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    item_id: str = Field(min_length=1, max_length=180)
    include: bool = True
    title: str = Field(min_length=1, max_length=220)
    duration_minutes: int = Field(ge=10, le=480)
    start_at: datetime | None = None


class PreparationApproveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirmed: bool = False
    items: list[PreparationApprovalItem] = Field(min_length=1, max_length=20)
    existing_blocks: list[ExistingPlanBlock] = Field(default_factory=list, max_length=600)


class PreparationPlannerAction(BaseModel):
    plan_item_id: str
    action_id: str
    title: str
    start_at: datetime
    end_at: datetime
    category: Literal["Career"] = "Career"
    source: str
    description: str
    idempotency_key: str


class PreparationApproveResponse(BaseModel):
    plan_id: str
    opportunity_id: str
    status: Literal["approved"] = "approved"
    newly_approved: bool
    actions: list[PreparationPlannerAction]
    warnings: list[str] = Field(default_factory=list)


class TrackingUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: TrackingStatus
    result: str | None = Field(default=None, max_length=120)
    follow_up_at: datetime | None = None

    @model_validator(mode="after")
    def validate_result(self):
        if self.status == "result" and not (self.result or "").strip():
            raise ValueError("A result label is required when marking an opportunity as Result.")
        return self


class InternshipHandoffResponse(BaseModel):
    opportunity_id: str
    source_reference: str
    company: str
    role: str
    source_url: str
    deadline: date | None
    requirements: list[str]
