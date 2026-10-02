from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class ApplicationStatus(str, Enum):
    INTERESTED = "interested"
    PREPARING = "preparing"
    APPLIED = "applied"
    AWAITING_RESPONSE = "awaiting_response"
    INTERVIEWING = "interviewing"
    OFFER = "offer"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


CLOSED_STATUSES = {ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN}


class RequirementInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill_name: str = Field(min_length=1, max_length=120)
    detail: str = Field(default="", max_length=500)
    required: bool = True


class CreateApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company: str = Field(min_length=1, max_length=180)
    role: str = Field(min_length=1, max_length=180)
    source_type: Literal["manual", "recommendation"] = "manual"
    source_reference: str | None = Field(default=None, max_length=220)
    source_url: HttpUrl | None = None
    application_deadline: date | None = None
    application_deadline_confirmed: bool = False
    contact_name: str = Field(default="", max_length=160)
    contact_email: str = Field(default="", max_length=254)
    interview_at: datetime | None = None
    interview_at_confirmed: bool = False
    follow_up_at: datetime | None = None
    follow_up_at_confirmed: bool = False
    notes: str = Field(default="", max_length=5000)
    next_action: str = Field(default="", max_length=500)
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    requirements: list[RequirementInput] = Field(default_factory=list, max_length=30)
    idempotency_key: str = Field(min_length=8, max_length=160)

    @model_validator(mode="after")
    def recommendation_reference(self) -> "CreateApplicationRequest":
        if self.source_type == "recommendation" and not self.source_reference:
            raise ValueError("Recommendation imports require a source_reference.")
        return self


class UpdateApplicationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    company: str = Field(min_length=1, max_length=180)
    role: str = Field(min_length=1, max_length=180)
    source_url: HttpUrl | None = None
    application_deadline: date | None = None
    application_deadline_confirmed: bool = False
    contact_name: str = Field(default="", max_length=160)
    contact_email: str = Field(default="", max_length=254)
    interview_at: datetime | None = None
    interview_at_confirmed: bool = False
    follow_up_at: datetime | None = None
    follow_up_at_confirmed: bool = False
    notes: str = Field(default="", max_length=5000)
    next_action: str = Field(default="", max_length=500)
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    requirements: list[RequirementInput] = Field(default_factory=list, max_length=30)
    idempotency_key: str = Field(min_length=8, max_length=160)


class StatusTransitionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ApplicationStatus
    note: str = Field(default="", max_length=1000)
    idempotency_key: str = Field(min_length=8, max_length=160)


class ArchiveRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    archived: bool = True
    outcome_notes: str = Field(default="", max_length=3000)
    idempotency_key: str = Field(min_length=8, max_length=160)


class ReminderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["deadline", "interview", "follow_up", "custom"]
    title: str = Field(min_length=1, max_length=220)
    remind_at: datetime
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    enabled: bool = True
    notifications_enabled: bool = True
    quiet_hours_start: str | None = Field(default="22:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quiet_hours_end: str | None = Field(default="07:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    idempotency_key: str = Field(min_length=8, max_length=160)


class ReminderUpdateRequest(ReminderRequest):
    pass


class PlannerActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["deadline_prep", "interview_prep", "follow_up", "custom"]
    title: str = Field(min_length=1, max_length=220)
    start_at: datetime
    duration_minutes: int = Field(ge=5, le=480)
    confirmed: bool
    idempotency_key: str = Field(min_length=8, max_length=160)


class RequirementResponse(BaseModel):
    id: str
    skill_name: str
    detail: str
    required: bool
    evidence_status: Literal["demonstrated", "not_demonstrated", "unknown"]
    evidence_refs: list[str]


class ApplicationEventResponse(BaseModel):
    id: int
    event_type: str
    from_status: ApplicationStatus | None
    to_status: ApplicationStatus | None
    note: str
    occurred_at: datetime


class ReminderResponse(BaseModel):
    id: str
    kind: str
    title: str
    remind_at: datetime
    timezone: str
    enabled: bool
    notifications_enabled: bool
    quiet_hours_start: str | None
    quiet_hours_end: str | None
    effective_notification_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ReadinessActionResponse(BaseModel):
    skill_name: str
    status: Literal["evidence_available", "evidence_gap", "unknown"]
    title: str
    rationale: str
    evidence_refs: list[str]
    href: str


class PlannerActionResponse(BaseModel):
    id: str
    application_id: str
    kind: str
    title: str
    start_at: datetime
    duration_minutes: int
    category: Literal["Internship"] = "Internship"
    description: str
    idempotent_replay: bool = False


class ApplicationResponse(BaseModel):
    id: str
    company: str
    role: str
    source_type: str
    source_reference: str | None
    source_url: str | None
    application_deadline: date | None
    application_deadline_confirmed: bool
    deadline_state: Literal["missing", "unconfirmed", "past_due", "today", "upcoming"]
    contact_name: str
    contact_email: str
    interview_at: datetime | None
    interview_at_confirmed: bool
    follow_up_at: datetime | None
    follow_up_at_confirmed: bool
    notes: str
    next_action: str
    timezone: str
    status: ApplicationStatus
    archived: bool
    outcome_notes: str
    requirements: list[RequirementResponse]
    readiness_actions: list[ReadinessActionResponse]
    reminders: list[ReminderResponse]
    history: list[ApplicationEventResponse]
    created_at: datetime
    updated_at: datetime


class ApplicationListResponse(BaseModel):
    items: list[ApplicationResponse]
