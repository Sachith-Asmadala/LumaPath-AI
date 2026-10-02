from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MeasurementKind(str, Enum):
    measured = "measured"
    estimated = "estimated"
    mixed = "mixed"


class TaskObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str = Field(min_length=1, max_length=160)
    status: Literal["upcoming", "in-progress", "completed", "missed"]
    category: str = Field(min_length=1, max_length=64)
    module: str | None = Field(default=None, max_length=120)
    estimated_minutes: int = Field(ge=0, le=10080)
    difficulty: int = Field(ge=1, le=5)
    due_at: datetime | None = None
    completed_at: datetime | None = None
    progress: int = Field(ge=0, le=100)


class PlanBlockObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str = Field(min_length=1, max_length=160)
    task_id: str | None = Field(default=None, max_length=160)
    category: str = Field(min_length=1, max_length=64)
    start_at: datetime
    end_at: datetime
    previous_start_at: datetime | None = None
    is_fixed: bool = False
    is_missed: bool = False
    is_conflict: bool = False

    @field_validator("end_at")
    @classmethod
    def end_must_be_present(cls, value: datetime) -> datetime:
        return value


class ReadinessObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    score: int = Field(ge=0, le=100)
    starting_score: int | None = Field(default=None, ge=0, le=100)
    breakdown: dict[str, int] = Field(default_factory=dict)

    @field_validator("breakdown")
    @classmethod
    def validate_breakdown(cls, value: dict[str, int]) -> dict[str, int]:
        for key, score in value.items():
            if not key or len(key) > 80 or score < 0 or score > 100:
                raise ValueError("Readiness breakdown is invalid.")
        return value


class SkillObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str = Field(min_length=1, max_length=160)
    status: str = Field(min_length=1, max_length=40)
    proficiency: int = Field(ge=0, le=100)


class HistoricalSkillObservation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    source_id: str = Field(min_length=1, max_length=160)
    proficiency: int = Field(ge=0, le=100)
    observed_at: datetime
    reason: str = Field(default="Recorded assessment", min_length=1, max_length=180)


class AnalyticsSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    observed_at: datetime
    productive_minutes_total: int = Field(ge=0, le=2_000_000)
    productive_measurement: MeasurementKind = MeasurementKind.mixed
    tasks: list[TaskObservation] = Field(default_factory=list, max_length=2000)
    plan_blocks: list[PlanBlockObservation] = Field(default_factory=list, max_length=4000)
    readiness: ReadinessObservation | None = None
    skills: list[SkillObservation] = Field(default_factory=list, max_length=1000)
    skill_history: list[HistoricalSkillObservation] = Field(default_factory=list, max_length=4000)
    deleted_sources: list[str] = Field(default_factory=list, max_length=1000)


class SyncResponse(BaseModel):
    accepted_events: int
    duplicate_events: int
    aggregation_queued: bool
    latest_event_at: datetime | None = None


class SourceReference(BaseModel):
    source_type: str
    source_id: str
    occurred_at: datetime
    module: str | None = None
    measurement_kind: MeasurementKind
    source_available: bool = True
    values: dict[str, Any] = Field(default_factory=dict)


class MetricValue(BaseModel):
    key: str
    label: str
    value: float | int | None
    unit: str | None = None
    measurement_kind: MeasurementKind
    data_status: Literal["complete", "partial", "empty"] = "complete"
    definition: str
    explanation: str
    source_count: int = 0


class TrendPoint(BaseModel):
    period: str
    value: float | int | None
    secondary_value: float | int | None = None
    measurement_kind: MeasurementKind = MeasurementKind.measured


class ModuleTrend(BaseModel):
    module: str
    workload_hours: float
    average_difficulty: float | None
    task_count: int
    source_ids: list[str] = Field(default_factory=list)
    history: list[TrendPoint] = Field(default_factory=list)


class SkillTrend(BaseModel):
    skill_id: str
    current_proficiency: int
    status: str
    history: list[TrendPoint] = Field(default_factory=list)


class ReadinessTrend(BaseModel):
    current_score: int | None
    movement: int | None
    history: list[TrendPoint] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)


class PlanPattern(BaseModel):
    reviewed: int
    accepted: int
    adjusted: int
    acceptance_rate: float | None
    adjustment_rate: float | None
    data_status: Literal["complete", "partial", "empty"]
    definition: str


class Freshness(BaseModel):
    latest_event_at: datetime | None
    aggregate_computed_at: datetime | None
    event_count: int
    is_partial: bool
    note: str


class AnalyticsDashboardResponse(BaseModel):
    student_id: str
    start_date: date
    end_date: date
    timezone: str
    metric_version: str
    headline: list[MetricValue]
    daily_completion: list[TrendPoint]
    module_trends: list[ModuleTrend]
    estimate_accuracy: MetricValue
    readiness: ReadinessTrend
    skills: list[SkillTrend]
    plan_patterns: PlanPattern
    freshness: Freshness
    empty: bool
    empty_message: str | None = None


class MetricDrilldownResponse(BaseModel):
    metric: str
    start_date: date
    end_date: date
    timezone: str
    definition: str
    explanation: str
    sources: list[SourceReference]
    freshness: Freshness
