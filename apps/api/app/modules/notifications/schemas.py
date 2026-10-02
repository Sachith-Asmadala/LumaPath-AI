from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class NotificationType(str, Enum):
    DEADLINE = "deadline"
    RISK = "risk"
    TOP_PRIORITY = "top_priority"
    MISSED_WORK = "missed_work"
    STUDY_SESSION = "study_session"
    APPLICATION_DATE = "application_date"
    ROADMAP_MILESTONE = "roadmap_milestone"
    CALENDAR_EVENT = "calendar_event"


class Urgency(str, Enum):
    CRITICAL = "critical"
    HIGH = "high"
    NORMAL = "normal"
    LOW = "low"


class Channel(str, Enum):
    IN_APP = "in_app"
    PUSH = "push"
    EMAIL = "email"


DEFAULT_CATEGORIES = {kind.value: True for kind in NotificationType}


class NotificationPreferencesRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    quiet_hours_enabled: bool = True
    quiet_hours_start: str = Field(default="22:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    quiet_hours_end: str = Field(default="07:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    mute_non_critical: bool = False
    max_non_critical_per_day: int = Field(default=6, ge=1, le=24)
    max_non_critical_per_hour: int = Field(default=3, ge=1, le=12)
    in_app_enabled: bool = True
    push_enabled: bool = False
    push_permission_granted: bool = False
    email_enabled: bool = False
    email_consent: bool = False
    categories: dict[str, bool] = Field(default_factory=lambda: dict(DEFAULT_CATEGORIES))

    @field_validator("categories")
    @classmethod
    def validate_categories(cls, value: dict[str, bool]) -> dict[str, bool]:
        unknown = set(value) - set(DEFAULT_CATEGORIES)
        if unknown:
            raise ValueError(f"Unknown notification categories: {', '.join(sorted(unknown))}")
        return {**DEFAULT_CATEGORIES, **value}

    @model_validator(mode="after")
    def validate_consent_and_quiet_hours(self) -> "NotificationPreferencesRequest":
        if self.quiet_hours_enabled and self.quiet_hours_start == self.quiet_hours_end:
            raise ValueError("Quiet-hours start and end must be different when quiet hours are enabled.")
        if self.push_enabled and not self.push_permission_granted:
            raise ValueError("Push notifications require explicit browser permission.")
        if self.email_enabled and not self.email_consent:
            raise ValueError("Email notifications require explicit consent.")
        return self


class NotificationPreferencesResponse(NotificationPreferencesRequest):
    student_id: str
    updated_at: datetime
    push_provider_available: bool = False
    email_provider_available: bool = False


class CandidateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    notification_type: NotificationType
    source_type: Literal["task", "planner", "internship", "roadmap", "calendar", "system"]
    source_id: str = Field(min_length=1, max_length=220)
    source_state: Literal["active", "resolved"] = "active"
    display_label: str = Field(default="", max_length=220)
    reason: str = Field(min_length=1, max_length=700)
    action_href: str = Field(min_length=1, max_length=300)
    urgency: Urgency = Urgency.NORMAL
    occurred_at: datetime
    deliver_after: datetime | None = None
    expires_at: datetime | None = None
    sensitive: bool = False
    idempotency_key: str = Field(min_length=8, max_length=200)

    @field_validator("action_href")
    @classmethod
    def validate_href(cls, value: str) -> str:
        if not value.startswith("/") or value.startswith("//"):
            raise ValueError("Notification actions must use an internal LumaPath path.")
        return value


class CandidateSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[CandidateInput] = Field(default_factory=list, max_length=100)


class DeliveryResponse(BaseModel):
    id: str
    candidate_id: str
    channel: Channel
    status: Literal["pending", "delivered", "failed", "opened", "dismissed", "acted"]
    attempt_count: int
    delivered_at: datetime | None
    opened_at: datetime | None
    dismissed_at: datetime | None
    acted_at: datetime | None
    error_code: str | None


class InboxItemResponse(BaseModel):
    id: str
    delivery_id: str
    notification_type: NotificationType
    urgency: Urgency
    title: str
    description: str
    reason: str
    action_href: str
    source_type: str
    source_id: str
    created_at: datetime
    delivered_at: datetime
    expires_at: datetime | None
    opened_at: datetime | None
    dismissed_at: datetime | None
    acted_at: datetime | None


class InboxResponse(BaseModel):
    items: list[InboxItemResponse]
    unread_count: int
    generated_at: datetime
    partial: bool = False
    calendar_integration_available: bool = False


class SyncResultResponse(BaseModel):
    accepted: int
    deduplicated: int
    resolved: int
    expired: int
    delivered: int
    suppressed: int
    failed: int


class ActionResponse(BaseModel):
    saved: bool = True


class RetryResponse(BaseModel):
    attempted: int
    delivered: int
    failed: int
