from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

ProfileScope = Literal["international", "regional"]
TaxonomyState = Literal["draft", "review", "approved", "retired"]
SourceType = Literal["job_aggregate", "certification_objectives", "technology_source"]
SourceStatus = Literal["approved", "review", "blocked"]
BiasReview = Literal["approved", "pending", "rejected"]
SignalLabel = Literal["emerging", "stable", "declining"]
ProposalStatus = Literal["draft", "review", "approved", "rejected"]
ProposalChange = Literal["increase_priority", "decrease_priority", "add_requirement", "retire_requirement"]


class MarketSourceUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9][a-z0-9._-]+$")
    name: str = Field(min_length=2, max_length=180)
    source_type: SourceType
    canonical_url: str = Field(min_length=8, max_length=500)
    licensing_policy: str = Field(min_length=3, max_length=500)
    trust_score: int = Field(ge=0, le=100)
    status: SourceStatus = "review"
    bias_review_status: BiasReview = "pending"
    regions: list[str] = Field(default_factory=lambda: ["international"], max_length=40)
    retention_days: int = Field(default=365, ge=30, le=3650)
    max_age_days: int = Field(default=120, ge=7, le=730)

    @field_validator("canonical_url")
    @classmethod
    def secure_url(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("Market source URLs must use HTTPS.")
        return value

    @field_validator("regions")
    @classmethod
    def normalize_regions(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for raw in values:
            value = raw.strip().lower()
            if not value or len(value) > 32 or any(char.isspace() for char in value):
                raise ValueError("Market source regions must be compact region codes without whitespace.")
            if value not in normalized:
                normalized.append(value)
        if not normalized:
            raise ValueError("At least one governed market region is required.")
        return normalized


class MarketSourceView(MarketSourceUpsertRequest):
    created_at: datetime
    updated_at: datetime


class ObservationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str = Field(min_length=2, max_length=100)
    role_id: str = Field(min_length=2, max_length=120)
    skill_id: str = Field(min_length=1, max_length=80)
    profile_scope: ProfileScope = "international"
    region_code: str | None = Field(default=None, max_length=32)
    period_start: date
    period_end: date
    observed_at: datetime
    sample_size: int = Field(ge=1, le=10_000_000)
    skill_share: float = Field(ge=0, le=1)
    methodology: str = Field(min_length=8, max_length=700)
    provenance_url: str = Field(min_length=8, max_length=700)

    @model_validator(mode="after")
    def validate_scope(self):
        if self.period_end < self.period_start:
            raise ValueError("Observation period_end must be on or after period_start.")
        if self.profile_scope == "regional" and not self.region_code:
            raise ValueError("Regional observations require region_code.")
        if self.profile_scope == "international":
            self.region_code = None
        if not self.provenance_url.startswith("https://"):
            raise ValueError("Observation provenance URLs must use HTTPS.")
        return self


class ObservationIngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[ObservationInput] = Field(min_length=1, max_length=500)


class ObservationView(BaseModel):
    id: str
    source_id: str
    role_id: str
    skill_id: str
    profile_scope: ProfileScope
    region_code: str | None
    period_start: date
    period_end: date
    observed_at: datetime
    sample_size: int
    skill_share: float
    methodology: str
    provenance_url: str
    expires_at: datetime
    retained_until: datetime
    ingested_at: datetime


class SignalComputeRequest(BaseModel):
    role_id: str = Field(min_length=2, max_length=120)
    skill_id: str = Field(min_length=1, max_length=80)
    profile_scope: ProfileScope = "international"
    region_code: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def validate_scope(self):
        if self.profile_scope == "regional" and not self.region_code:
            raise ValueError("Regional signals require region_code.")
        if self.profile_scope == "international":
            self.region_code = None
        return self


class SignalObservationView(BaseModel):
    id: str
    source_id: str
    source_name: str
    source_type: SourceType
    period_start: date
    period_end: date
    observed_at: datetime
    sample_size: int
    skill_share: float
    provenance_url: str


class SkillSignalView(BaseModel):
    id: str
    role_id: str
    skill_id: str
    profile_scope: ProfileScope
    region_code: str | None
    label: SignalLabel
    delta: float
    recent_share: float
    prior_share: float
    sample_size: int
    source_count: int
    confidence: float = Field(ge=0, le=1)
    recency_days: float
    methodology_version: str
    methodology: str
    source_ids: list[str]
    observation_ids: list[str]
    observations: list[SignalObservationView] = Field(default_factory=list)
    publication_eligible: bool
    limitations: list[str]
    created_at: datetime
    expires_at: datetime


class ProposalCreateRequest(BaseModel):
    signal_id: str = Field(min_length=1, max_length=120)
    rationale: str = Field(min_length=8, max_length=900)
    proposed_required_proficiency: int | None = Field(default=None, ge=0, le=100)


class ProposalDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]
    rationale: str = Field(min_length=5, max_length=900)


class ChangeProposalView(BaseModel):
    id: str
    signal_id: str
    base_version: str
    candidate_version: str | None = None
    role_id: str
    role_name: str
    skill_id: str
    skill_name: str
    profile_scope: ProfileScope
    region_code: str | None
    change_type: ProposalChange
    current_required_proficiency: int | None
    proposed_required_proficiency: int | None
    impact_level: Literal["low", "high"]
    status: ProposalStatus
    observed_signal: SignalLabel
    signal_confidence: float
    rationale: str
    created_by: str
    created_at: datetime
    decided_at: datetime | None = None
    decision_rationale: str | None = None
    resulting_version: str | None = None


class ApprovalView(BaseModel):
    id: int
    proposal_id: str
    actor_id: str
    actor_role: str
    decision: Literal["approve", "reject"]
    rationale: str
    decided_at: datetime
    resulting_version: str | None = None


class TaxonomyVersionView(BaseModel):
    version: str
    status: TaxonomyState
    profile_scope: ProfileScope
    region_code: str | None
    parent_version: str | None
    methodology_version: str
    change_summary: str
    created_by: str
    created_at: datetime
    approved_by: str | None = None
    approved_at: datetime | None = None
    retired_at: datetime | None = None
    is_default: bool


class ProfileSkillView(BaseModel):
    skill_id: str
    name: str
    required_proficiency: int
    estimated_minutes: int
    prerequisites: list[str]


class ProfileRoleView(BaseModel):
    role_id: str
    role_name: str
    version: str
    profile_scope: ProfileScope
    region_code: str | None
    skills: list[ProfileSkillView]


class ProfileComparisonResponse(BaseModel):
    role_id: str
    international: ProfileRoleView
    regional: ProfileRoleView | None
    notes: list[str]


class ImpactChange(BaseModel):
    skill_id: str
    skill_name: str
    change: str
    before_required_proficiency: int | None = None
    after_required_proficiency: int | None = None
    completed_credit_preserved: bool = True


class StudentTaxonomyUpdateView(BaseModel):
    id: str
    pathway_id: str
    target_role: str
    from_version: str
    to_version: str
    proposal_id: str
    explanation: str
    changes: list[ImpactChange]
    status: Literal["pending", "kept_current", "recalculation_drafted", "dismissed"]
    created_at: datetime
    decided_at: datetime | None = None
    draft_pathway_id: str | None = None


class StudentUpdateDecisionRequest(BaseModel):
    decision: Literal["keep_current", "recalculate", "dismiss"]
    confirmed: bool = False

    @model_validator(mode="after")
    def require_recalc_confirmation(self):
        if self.decision == "recalculate" and not self.confirmed:
            raise ValueError("Explicit confirmation is required before creating a recalculated pathway draft.")
        return self


class MarketGovernanceView(BaseModel):
    methodology_version: str
    minimum_sample_size: int
    minimum_source_count: int
    publication_confidence: float
    emerging_delta_threshold: float
    declining_delta_threshold: float
    source_rules: list[str]
    ai_rule: str


class TaxonomyRollbackRequest(BaseModel):
    target_version: str = Field(min_length=2, max_length=180)
    rationale: str = Field(min_length=8, max_length=900)


class TaxonomyRollbackResponse(BaseModel):
    restored_from_version: str
    previous_default_version: str
    new_version: str
    affected_pathways: int
    explanation: str
