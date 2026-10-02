from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


Pace = Literal["light", "balanced", "ambitious"]
PathwayStatus = Literal["draft", "active", "superseded", "rejected"]
MilestoneState = Literal["credited", "completed", "in_progress", "available", "locked"]
ResourceDecision = Literal["recommended", "accepted", "deferred", "replaced"]


class SkillContext(BaseModel):
    skill_id: str = Field(min_length=1, max_length=80)
    status: str = Field(min_length=1, max_length=40)
    proficiency: int = Field(default=0, ge=0, le=100)
    evidence_refs: list[str] = Field(default_factory=list, max_length=30)


class AcademicTaskContext(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    title: str = Field(default="Academic task", max_length=240)
    due_at: datetime | None = None
    remaining_minutes: int = Field(default=0, ge=0, le=10080)
    risk_score: int = Field(default=0, ge=0, le=100)
    status: str = Field(default="upcoming", max_length=40)


class PlannerBlockContext(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    start_at: datetime
    end_at: datetime
    category: str = Field(default="Academic", max_length=60)
    is_fixed: bool = False

    @model_validator(mode="after")
    def validate_order(self):
        if self.end_at <= self.start_at:
            raise ValueError("Planner block end must be after start.")
        return self


class ResourcePreferences(BaseModel):
    language: str = Field(default="English", min_length=1, max_length=80)
    budget: str = Field(default="free only", min_length=1, max_length=80)
    formats: list[str] = Field(default_factory=list, max_length=10)


class PathwayContextRequest(BaseModel):
    target_role: str = Field(min_length=2, max_length=120)
    goal: str = Field(min_length=2, max_length=220)
    pace: Pace = "balanced"
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=80)
    planning_start: date | None = None
    target_date: date | None = None
    weekly_learning_minutes: int = Field(ge=0, le=40 * 60)
    daily_available_minutes: int = Field(ge=0, le=24 * 60)
    skills: list[SkillContext] = Field(default_factory=list, max_length=100)
    academic_tasks: list[AcademicTaskContext] = Field(default_factory=list, max_length=300)
    planner_blocks: list[PlannerBlockContext] = Field(default_factory=list, max_length=1000)
    resource_preferences: ResourcePreferences = Field(default_factory=ResourcePreferences)

    @model_validator(mode="after")
    def validate_target_date(self):
        if self.target_date and self.planning_start and self.target_date < self.planning_start:
            raise ValueError("Target date must be on or after the planning start date.")
        return self


class RecalculateRequest(PathwayContextRequest):
    reasons: list[str] = Field(min_length=1, max_length=10)

    @field_validator("reasons")
    @classmethod
    def clean_reasons(cls, values: list[str]) -> list[str]:
        cleaned = [value.strip() for value in values if value.strip()]
        if not cleaned:
            raise ValueError("At least one recalculation reason is required.")
        return cleaned


class LearningResourceResponse(BaseModel):
    id: str
    title: str
    source: str
    source_url: str | None = None
    cost_type: str | None = None
    price_usd: float | None = None
    language: str | None = None
    format: str | None = None
    estimated_minutes: int | None = None
    resource_type: str | None = None
    quality_score: int | None = Field(default=None, ge=0, le=100)
    metadata_complete: bool
    ranking_reason: str


class PathwayStepResponse(BaseModel):
    id: str
    skill_id: str
    name: str
    order: int
    prerequisites: list[str]
    state: MilestoneState
    proficiency: int
    estimated_minutes: int
    target_evidence: list[str]
    evidence_refs: list[str]
    transferable_credit: bool
    completion_source: str | None = None
    selected_resource: LearningResourceResponse | None = None
    alternative_resources: list[LearningResourceResponse] = Field(default_factory=list)
    resource_decision: ResourceDecision = "recommended"
    resource_reason: str | None = None


class WeeklyActionResponse(BaseModel):
    id: str
    step_id: str
    skill_id: str
    title: str
    week_start: date
    start_at: datetime
    end_at: datetime
    planned_minutes: int
    status: Literal["draft", "approved", "deferred"]
    prerequisite_ready: bool
    rationale: str
    source_label: str
    internal_task_id: str | None = None


class ChangeSummary(BaseModel):
    added_skills: list[str] = Field(default_factory=list)
    removed_skills: list[str] = Field(default_factory=list)
    preserved_completed_skills: list[str] = Field(default_factory=list)
    moved_weekly_actions: list[str] = Field(default_factory=list)
    resource_changes: list[str] = Field(default_factory=list)
    explanations: list[str] = Field(default_factory=list)


class PathwayResponse(BaseModel):
    id: str
    version: int
    status: PathwayStatus
    target_role: str
    goal: str
    pace: Pace
    definition_version: str
    parent_pathway_id: str | None = None
    recalculation_reason: list[str] = Field(default_factory=list)
    weekly_learning_minutes: int
    daily_available_minutes: int
    timezone: str
    target_date: date | None = None
    steps: list[PathwayStepResponse]
    weekly_actions: list[WeeklyActionResponse]
    warnings: list[str] = Field(default_factory=list)
    change_summary: ChangeSummary | None = None
    created_at: datetime
    approved_at: datetime | None = None


class CurrentRoadmapResponse(BaseModel):
    active: PathwayResponse | None = None
    pending_draft: PathwayResponse | None = None


class PathwayDecisionRequest(BaseModel):
    decision: Literal["approve", "reject"]


class ResourceDecisionRequest(BaseModel):
    action: Literal["accept", "defer", "replace"]
    resource_id: str | None = Field(default=None, max_length=160)
    reason: str = Field(default="", max_length=500)

    @model_validator(mode="after")
    def validate_decision(self):
        if self.action == "replace" and not self.resource_id:
            raise ValueError("Replacement resource is required.")
        if self.action in {"defer", "replace"} and len(self.reason.strip()) < 3:
            raise ValueError("Record a short reason for deferring or replacing a resource.")
        return self


class MilestoneUpdateRequest(BaseModel):
    state: Literal["in_progress", "completed", "available"]
    note: str = Field(default="", max_length=500)


class PlannerApprovalRequest(BaseModel):
    action_ids: list[str] = Field(min_length=1, max_length=30)
    planner_blocks: list[PlannerBlockContext] = Field(default_factory=list, max_length=1000)
    daily_available_minutes: int = Field(ge=0, le=24 * 60)


class PlannerApplyAction(BaseModel):
    plan_item_id: str
    internal_task_id: str
    pathway_id: str
    pathway_version: int
    step_id: str
    skill_id: str
    title: str
    start_at: datetime
    end_at: datetime
    planned_minutes: int
    source_label: str
    description: str


class PlannerApprovalResponse(BaseModel):
    pathway_id: str
    actions: list[PlannerApplyAction]
    approved_count: int
    warnings: list[str] = Field(default_factory=list)
