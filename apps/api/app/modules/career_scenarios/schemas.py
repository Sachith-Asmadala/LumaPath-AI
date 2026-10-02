from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator


ScenarioStatus = Literal["disposable", "saved"]
TargetFit = Literal["likely_fits", "uncertain", "unlikely", "not_computable"]
RouteType = Literal["free", "low_cost", "certification_focused"]


class ScenarioPreferences(BaseModel):
    language: str = Field(default="English", min_length=1, max_length=80)
    formats: list[str] = Field(default_factory=list, max_length=10)


class ScenarioCreateRequest(BaseModel):
    role_ids: list[str] = Field(min_length=2, max_length=4)
    weekly_learning_minutes: int | None = Field(default=None, ge=0, le=40 * 60)
    target_date: date | None = None
    preferences: ScenarioPreferences = Field(default_factory=ScenarioPreferences)
    save: bool = False

    @model_validator(mode="after")
    def validate_roles(self):
        cleaned = [role.strip() for role in self.role_ids if role.strip()]
        if len(cleaned) < 2:
            raise ValueError("Select at least two supported careers to compare.")
        if len(set(cleaned)) != len(cleaned):
            raise ValueError("Career comparison roles must be unique.")
        self.role_ids = cleaned
        return self


class ScenarioRecomputeRequest(BaseModel):
    weekly_learning_minutes: int = Field(ge=0, le=40 * 60)
    target_date: date | None = None
    preferences: ScenarioPreferences | None = None
    refresh_context: bool = False


class SnapshotEvidence(BaseModel):
    skill_id: str
    skill_name: str
    proficiency: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    credited: bool
    evidence_refs: list[str] = Field(default_factory=list)
    uncertainty: str | None = None


class SkillComparison(BaseModel):
    skill_id: str
    name: str
    required_proficiency: int = Field(ge=0, le=100)
    current_proficiency: int = Field(ge=0, le=100)
    confidence: float = Field(ge=0, le=1)
    credited: bool
    shared: bool
    unique_to_role: bool
    prerequisites: list[str]
    remaining_prerequisites: list[str]
    estimated_minutes_min: int = Field(ge=0)
    estimated_minutes_max: int = Field(ge=0)
    evidence_refs: list[str] = Field(default_factory=list)
    uncertainty: str | None = None


class DurationEstimate(BaseModel):
    weeks_min: float | None = None
    weeks_max: float | None = None
    weekly_learning_minutes: int = Field(ge=0)
    target_date: date | None = None
    target_fit: TargetFit
    available_weeks: float | None = None
    explanation: str


class RouteResource(BaseModel):
    skill_id: str
    resource_id: str
    title: str
    source: str
    source_url: str | None = None
    cost_type: str | None = None
    price_usd: float | None = None
    format: str | None = None


class CostRoute(BaseModel):
    route_type: RouteType
    known_cost_min_usd: float = Field(ge=0)
    known_cost_max_usd: float | None = Field(default=None, ge=0)
    planning_budget_max_usd: float | None = Field(default=None, ge=0)
    unknown_price_count: int = Field(default=0, ge=0)
    resources: list[RouteResource] = Field(default_factory=list)
    assumptions: list[str] = Field(default_factory=list)
    missing_data: list[str] = Field(default_factory=list)


class RoleScenarioResult(BaseModel):
    role_id: str
    role_name: str
    role_version: str
    shared_skill_ids: list[str]
    unique_skill_ids: list[str]
    transferable_skill_ids: list[str]
    remaining_skill_ids: list[str]
    skills: list[SkillComparison]
    effort_hours_min: float = Field(ge=0)
    effort_hours_max: float = Field(ge=0)
    duration: DurationEstimate
    routes: list[CostRoute]
    reusable_evidence: list[SnapshotEvidence]
    assumptions: list[str]
    missing_data: list[str]


class ScenarioInputView(BaseModel):
    role_ids: list[str]
    taxonomy_version: str
    active_pathway_id: str | None = None
    active_pathway_version: int | None = None
    active_target_role: str | None = None
    weekly_learning_minutes: int = Field(ge=0)
    target_date: date | None = None
    preferences: ScenarioPreferences
    context_refreshed: bool = False


class ScenarioResultView(BaseModel):
    id: str
    scenario_id: str
    created_at: datetime
    inputs: ScenarioInputView
    shared_skill_ids: list[str]
    roles: list[RoleScenarioResult]
    assumptions: list[str]
    uncertainty: list[str]
    active_pathway_unchanged: bool = True
    disclaimer: str


class ScenarioView(BaseModel):
    id: str
    status: ScenarioStatus
    role_ids: list[str]
    created_at: datetime
    saved_at: datetime | None = None
    latest_result: ScenarioResultView


class ScenarioSaveRequest(BaseModel):
    saved: bool


class ScenarioSwitchRequest(BaseModel):
    result_id: str = Field(min_length=1, max_length=120)
    role_id: str = Field(min_length=1, max_length=120)
    confirmed: bool
    goal: str = Field(default="Prepare for the selected career direction", min_length=2, max_length=220)

    @model_validator(mode="after")
    def require_confirmation(self):
        if not self.confirmed:
            raise ValueError("Explicit confirmation is required before creating a pathway switch draft.")
        return self


class ScenarioSwitchResponse(BaseModel):
    scenario_id: str
    result_id: str
    target_role: str
    draft_pathway_id: str
    draft_pathway_version: int
    draft_status: str
    active_pathway_id: str | None
    active_pathway_version: int | None
    active_pathway_unchanged: bool
    transferable_skill_ids: list[str]
    approval_required: bool = True
    explanation: str
