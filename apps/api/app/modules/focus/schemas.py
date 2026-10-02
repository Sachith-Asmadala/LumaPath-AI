from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class FocusStatus(str, Enum):
    RUNNING = "running"
    PAUSED = "paused"
    BREAK_DUE = "break_due"
    COMPLETED = "completed"
    INTERRUPTED = "interrupted"
    ABANDONED = "abandoned"


class EstimateFeedback(str, Enum):
    MUCH_LESS = "much_less"
    SLIGHTLY_LESS = "slightly_less"
    ABOUT_RIGHT = "about_right"
    SLIGHTLY_MORE = "slightly_more"
    MUCH_MORE = "much_more"


class StartFocusSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str = Field(min_length=1, max_length=160)
    task_title: str = Field(min_length=1, max_length=220)
    objective: str = Field(min_length=3, max_length=500)
    planned_work_minutes: int = Field(ge=5, le=240)
    planned_break_minutes: int = Field(default=5, ge=0, le=60)
    task_estimated_minutes: int = Field(ge=5, le=10080)
    task_progress_before: int = Field(ge=0, le=100)
    timezone: str = Field(default="Asia/Colombo", min_length=1, max_length=64)
    started_at: datetime | None = None


class FocusSessionResponse(BaseModel):
    id: str
    task_id: str
    task_title: str
    objective: str
    planned_work_minutes: int
    planned_break_minutes: int
    task_estimated_minutes: int
    task_progress_before: int
    task_progress_after: int | None
    status: FocusStatus
    persisted_status: Literal["running", "paused", "completed", "interrupted", "abandoned"]
    started_at: datetime
    active_segment_started_at: datetime | None
    last_heartbeat_at: datetime | None
    paused_at: datetime | None
    ended_at: datetime | None
    accumulated_active_seconds: int
    elapsed_work_seconds: int
    remaining_work_seconds: int
    break_due: bool
    notes: str
    next_step: str
    result: str | None
    estimate_feedback: EstimateFeedback | None
    suggested_estimated_minutes: int | None
    estimate_explanation: str | None
    productive_minutes: int
    updated_at: datetime


class FinishFocusSessionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    result: Literal["completed", "interrupted", "abandoned"]
    task_progress_after: int = Field(ge=0, le=100)
    notes: str = Field(default="", max_length=2000)
    next_step: str = Field(default="", max_length=500)
    estimate_feedback: EstimateFeedback | None = None
    manual_estimated_minutes: int | None = Field(default=None, ge=5, le=10080)
    ended_at: datetime | None = None

    @model_validator(mode="after")
    def validate_completed_feedback(self) -> "FinishFocusSessionRequest":
        if self.result == "completed" and self.estimate_feedback is None:
            raise ValueError("Completed focus sessions require estimate feedback.")
        return self


class FocusSessionListResponse(BaseModel):
    sessions: list[FocusSessionResponse]
