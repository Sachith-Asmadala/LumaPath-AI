from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


EvidenceSource = Literal["self_assessment", "quiz", "certificate", "manual_project", "repository", "live_demo", "mentor_validation", "assessment", "cv", "pathway_completion"]
VerificationState = Literal["self_reported", "observed", "verified", "student_confirmed"]
ResourceType = Literal["course", "certificate", "tutorial", "project"]


class CareerRoleSummary(BaseModel):
    id: str
    name: str
    version: str
    level: str
    description: str
    quality_status: str
    skill_count: int


class RoleSkillRequirement(BaseModel):
    skill_id: str
    name: str
    required_proficiency: int = Field(ge=0, le=100)
    prerequisites: list[str]
    estimated_minutes: int = Field(ge=0)
    recommended_evidence: list[str]


class CareerRoleDetail(CareerRoleSummary):
    skills: list[RoleSkillRequirement]


class SelfAssessmentInput(BaseModel):
    skill_id: str = Field(min_length=1, max_length=80)
    proficiency: int = Field(ge=0, le=100)
    confidence: float = Field(default=0.35, ge=0.1, le=0.5)


class QuizEvidenceInput(BaseModel):
    skill_id: str = Field(min_length=1, max_length=80)
    score: int = Field(ge=0, le=100)
    quiz_id: str = Field(min_length=1, max_length=160)


class CertificateEvidenceInput(BaseModel):
    skill_id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    issuer: str = Field(min_length=2, max_length=160)
    reference: str | None = Field(default=None, max_length=300)


class SkillAssessmentRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=120)
    self_assessments: list[SelfAssessmentInput] = Field(default_factory=list, max_length=100)
    quiz_evidence: list[QuizEvidenceInput] = Field(default_factory=list, max_length=100)
    certificate_evidence: list[CertificateEvidenceInput] = Field(default_factory=list, max_length=100)
    include_portfolio_evidence: bool = True
    include_cv_evidence: bool = True


class SkillEvidenceView(BaseModel):
    id: str
    source_type: EvidenceSource
    verification_status: VerificationState
    proficiency: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    source_ref: str
    source_label: str
    observed_at: datetime


class StudentSkillView(BaseModel):
    skill_id: str
    name: str
    proficiency: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    required_proficiency: int = Field(ge=0, le=100)
    gap: int = Field(ge=0, le=100)
    meets_requirement: bool
    evidence: list[SkillEvidenceView]
    uncertainty: str | None = None


class SkillAssessmentResponse(BaseModel):
    id: str
    target_role: str
    taxonomy_version: str
    created_at: datetime
    skills: list[StudentSkillView]
    gap_order: list[str]
    conflicting_skills: list[str] = Field(default_factory=list)
    disclaimer: str


class ResourcePreferencesInput(BaseModel):
    languages: list[str] = Field(default_factory=lambda: ["English"], max_length=10)
    formats: list[str] = Field(default_factory=list, max_length=10)
    max_price_usd: float | None = Field(default=0, ge=0, le=100000)
    resource_types: list[ResourceType] = Field(default_factory=list, max_length=4)


class SkillResourceView(BaseModel):
    id: str
    skill_id: str
    title: str
    source: str
    source_url: str | None = None
    resource_type: ResourceType
    quality_score: int = Field(ge=0, le=100)
    cost_type: str | None = None
    price_usd: float | None = None
    language: str | None = None
    format: str | None = None
    estimated_minutes: int | None = None
    fit_score: int = Field(ge=0, le=100)
    ranking_factors: list[str]
    metadata_complete: bool
    quality_note: str


class SkillResourcesResponse(BaseModel):
    skill_id: str
    taxonomy_version: str
    resources: list[SkillResourceView]
    missing_metadata_warning: bool


class CareerPathwayGenerateRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=120)
    goal: str = Field(min_length=2, max_length=220)
    pace: Literal["light", "balanced", "ambitious"] = "balanced"
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=80)
    planning_start: date | None = None
    target_date: date | None = None
    weekly_learning_minutes: int = Field(ge=0, le=40 * 60)
    daily_available_minutes: int = Field(ge=0, le=24 * 60)
    resource_preferences: ResourcePreferencesInput = Field(default_factory=ResourcePreferencesInput)
    academic_tasks: list[dict] = Field(default_factory=list, max_length=300)
    planner_blocks: list[dict] = Field(default_factory=list, max_length=1000)

    @model_validator(mode="after")
    def target_after_start(self):
        if self.target_date and self.planning_start and self.target_date < self.planning_start:
            raise ValueError("Target date must be on or after the planning start date.")
        return self


class PathwayFeasibility(BaseModel):
    total_gap_minutes: int
    available_minutes_until_target: int | None
    feasible: bool | None
    explanation: str
