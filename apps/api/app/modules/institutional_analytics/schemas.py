from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class CohortSummary(BaseModel):
    id: str
    name: str
    institution_id: str
    definition: dict[str, str | int | bool]
    metric_version: str
    privacy_threshold: int
    privacy_status: Literal["eligible", "below_threshold"]


class MetricDefinitionResponse(BaseModel):
    key: str
    label: str
    category: str
    unit: str
    formula: str
    explanation: str
    source_domains: list[str]
    metric_version: str
    approved: bool
    approved_purpose: str


class AggregateTrendPoint(BaseModel):
    period: str
    value: float | None
    suppressed: bool = False


class AggregateMetric(BaseModel):
    key: str
    label: str
    category: str
    unit: str
    value: float | None
    sample_size: int | None = None
    suppressed: bool
    suppression_reason: str | None = None
    definition: str
    formula: str
    trend: list[AggregateTrendPoint] = Field(default_factory=list)


class AggregateSlice(BaseModel):
    metric_key: str
    dimension_key: str
    dimension_label: str
    value: float | None
    unit: str
    sample_size: int | None = None
    suppressed: bool
    suppression_reason: str | None = None


class AggregateFreshness(BaseModel):
    refreshed_at: datetime | None
    source_latest_at: datetime | None
    metric_version: str
    is_stale: bool
    retention_days: int
    purpose: str


class DashboardCapabilities(BaseModel):
    can_export: bool
    can_refresh: bool


class InstitutionalAnalyticsDashboard(BaseModel):
    cohort: CohortSummary
    start_date: date
    end_date: date
    timezone: str
    metrics: list[AggregateMetric]
    skill_slices: list[AggregateSlice]
    freshness: AggregateFreshness
    capabilities: DashboardCapabilities
    empty: bool
    message: str | None = None
    governance_notice: str


class RefreshResponse(BaseModel):
    cohort_id: str
    start_date: date
    end_date: date
    metric_version: str
    refreshed_at: datetime
    aggregate_rows: int
    suppressed_rows: int


class GovernanceResponse(BaseModel):
    purpose: str
    retention_days: int
    privacy_threshold: int
    metric_version: str
    approved_metrics: list[str]
    prohibited_uses: list[str]


class AuditEventResponse(BaseModel):
    id: int
    administrator_id: str
    administrator_role: str
    institution_id: str
    action: str
    cohort_id: str | None
    occurred_at: datetime
    purpose: str
    detail: dict[str, str | int | bool | list[str] | None]


class SupportSignalRequest(BaseModel):
    """Trusted server-to-server hook for explicit programme support interest.

    The repository immediately HMAC-pseudonymises student_id and never writes the direct
    identifier into the institutional analytics support-signal table.
    """

    model_config = ConfigDict(extra="forbid")
    institution_id: str = Field(min_length=1, max_length=128)
    student_id: str = Field(min_length=1, max_length=128)
    signal_type: Literal["workshop_interest"]
    occurred_at: datetime
    topic_key: str | None = Field(default=None, max_length=80)
