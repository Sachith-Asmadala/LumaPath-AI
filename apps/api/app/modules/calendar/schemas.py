from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CalendarItemKind(str, Enum):
    LECTURE = "lecture"
    EXAM = "exam"
    DEADLINE = "deadline"
    EVENT = "event"
    WORKSHOP = "workshop"


class ConnectionStatus(str, Enum):
    ACTIVE = "active"
    REVOKED = "revoked"


class ExistingRecordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    internal_id: str = Field(min_length=1, max_length=180)
    record_type: Literal["task", "planner_event"]
    title: str = Field(min_length=1, max_length=300)
    start_at: datetime | None = None
    end_at: datetime | None = None
    due_at: datetime | None = None
    external_item_id: str | None = Field(default=None, max_length=180)


class PreviewItem(BaseModel):
    preview_key: str
    external_id: str
    recurrence_key: str = ""
    kind: CalendarItemKind
    title: str
    description: str = ""
    start_at: datetime
    end_at: datetime | None = None
    timezone: str
    confidence: float = Field(ge=0, le=1)
    source_updated_at: datetime | None = None
    change_type: Literal["new", "unchanged", "changed", "duplicate", "conflict", "deleted"]
    matched_internal_id: str | None = None
    mapped_record_type: Literal["task", "planner_event"] | None = None
    conflict_internal_ids: list[str] = Field(default_factory=list)
    override_fields: list[Literal["title", "start_at", "end_at", "due_at"]] = Field(default_factory=list)
    source_warning: str | None = None
    selected_by_default: bool = True


class PreviewResponse(BaseModel):
    sync_run_id: str
    connection_id: str
    connection_name: str
    source_format: Literal["ics", "csv", "provider"]
    timezone: str
    status: Literal["preview_ready"] = "preview_ready"
    items: list[PreviewItem]
    new_count: int
    changed_count: int
    duplicate_count: int
    conflict_count: int
    deleted_count: int
    unchanged_count: int
    generated_at: datetime


class CommitDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    preview_key: str = Field(min_length=1, max_length=260)
    action: Literal["import", "update", "link_existing", "skip", "keep_personal", "remove_internal"]


class CommitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decisions: list[CommitDecision] = Field(min_length=1, max_length=600)
    idempotency_key: str = Field(min_length=8, max_length=180)


class CalendarApplyAction(BaseModel):
    operation: Literal["create", "update", "tag", "delete", "detach"]
    external_item_id: str
    internal_record_id: str | None = None
    record_type: Literal["task", "planner_event"] | None = None
    title: str | None = None
    kind: CalendarItemKind | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    due_at: datetime | None = None
    source_label: str | None = None
    override_fields: list[str] = Field(default_factory=list)


class CommitResponse(BaseModel):
    sync_run_id: str
    connection_id: str
    committed: bool = True
    actions: list[CalendarApplyAction]
    imported: int
    updated: int
    linked: int
    skipped: int
    removed: int
    kept_personal: int
    committed_at: datetime


class ConnectionResponse(BaseModel):
    id: str
    source_type: Literal["manual_ics", "manual_csv", "provider"]
    display_name: str
    status: ConnectionStatus
    default_timezone: str
    scopes: list[str]
    last_sync_at: datetime | None
    revoked_at: datetime | None
    created_at: datetime
    updated_at: datetime
    provider_connected: bool = False


class CalendarItemResponse(BaseModel):
    id: str
    connection_id: str
    external_id: str
    recurrence_key: str
    kind: CalendarItemKind
    title: str
    description: str
    start_at: datetime
    end_at: datetime | None
    timezone: str
    confidence: float
    source_updated_at: datetime | None
    source_state: Literal["active", "deleted"]
    import_status: Literal["imported", "linked", "ignored", "detached"]
    mapped_record_type: Literal["task", "planner_event"] | None
    mapped_internal_id: str | None
    override_fields: list[str]
    last_sync_at: datetime
    source_badge: str


class ConnectionListResponse(BaseModel):
    items: list[ConnectionResponse]


class ItemListResponse(BaseModel):
    items: list[CalendarItemResponse]


class RevokeResponse(BaseModel):
    connection: ConnectionResponse
    sync_stopped: bool = True


class CleanupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    remove_internal_records: bool = False


class CleanupResponse(BaseModel):
    connection_id: str
    deleted_imported_items: int
    actions: list[CalendarApplyAction]
    internal_records_removed: bool


class OverrideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fields: list[Literal["title", "start_at", "end_at", "due_at"]] = Field(default_factory=list, max_length=4)

    @field_validator("fields")
    @classmethod
    def unique_fields(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))
