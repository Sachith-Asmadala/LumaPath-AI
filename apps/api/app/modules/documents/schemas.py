from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=220)]


class DocumentKind(str, Enum):
    PDF = "pdf"
    SLIDES = "slides"
    LAB_SHEET = "lab_sheet"
    RESEARCH_PAPER = "research_paper"
    NOTES = "notes"


class DocumentStatus(str, Enum):
    QUEUED = "queued"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class SourceRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    chunk_id: str
    locator_type: Literal["page", "slide", "section", "paragraphs"]
    locator: ShortText


class LearningOutcome(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    text: str = Field(min_length=1, max_length=800)
    source_refs: list[SourceRef] = Field(min_length=1, max_length=8)
    derived: bool = False


class DateCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    label: ShortText
    raw_text: str = Field(min_length=1, max_length=500)
    normalized_date: datetime | None = None
    confidence: float = Field(ge=0, le=1)
    official_status: Literal["unconfirmed"] = "unconfirmed"
    requires_confirmation: bool = True
    source_refs: list[SourceRef] = Field(min_length=1, max_length=8)


class Flashcard(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    front: str = Field(min_length=1, max_length=500)
    back: str = Field(min_length=1, max_length=1200)
    source_refs: list[SourceRef] = Field(min_length=1, max_length=8)


class DocumentQuizQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    prompt: str = Field(min_length=1, max_length=800)
    choices: list[str] = Field(min_length=2, max_length=6)
    answer_index: int = Field(ge=0, le=5)
    explanation: str = Field(default="", max_length=1200)
    source_refs: list[SourceRef] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def answer_in_range(self) -> "DocumentQuizQuestion":
        if self.answer_index >= len(self.choices):
            raise ValueError("Quiz answer index is outside the available choices.")
        return self


class DocumentProposedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["task", "plan_item", "flashcard_set", "quiz_set"]
    title: ShortText
    description: str = Field(default="", max_length=2400)
    estimated_minutes: int | None = Field(default=None, ge=5, le=480)
    start_at: datetime | None = None
    due_at: datetime | None = None
    category: str | None = Field(default="Academic", max_length=80)
    date_confirmed: bool = False
    approval_status: Literal["proposed", "approved"] = "proposed"
    source_refs: list[SourceRef] = Field(default_factory=list, max_length=16)
    flashcards: list[Flashcard] = Field(default_factory=list, max_length=40)
    quiz: list[DocumentQuizQuestion] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def validate_shape(self) -> "DocumentProposedAction":
        if self.kind in {"task", "plan_item"} and self.estimated_minutes is None:
            raise ValueError("Plannable actions require an estimated duration.")
        if self.kind == "flashcard_set" and not self.flashcards:
            raise ValueError("Flashcard actions require cards.")
        if self.kind == "quiz_set" and not self.quiz:
            raise ValueError("Quiz actions require questions.")
        if self.start_at and self.due_at and self.start_at > self.due_at:
            raise ValueError("Action cannot start after its deadline.")
        return self


class DocumentAnalysis(BaseModel):
    model_config = ConfigDict(extra="forbid")
    summary: str = Field(min_length=1, max_length=5000)
    summary_source_refs: list[SourceRef] = Field(min_length=1, max_length=12)
    learning_outcomes: list[LearningOutcome] = Field(min_length=1, max_length=20)
    dates: list[DateCandidate] = Field(default_factory=list, max_length=30)
    study_time_minutes: int = Field(ge=5, le=720)
    study_time_rationale: str = Field(min_length=1, max_length=800)
    flashcards: list[Flashcard] = Field(default_factory=list, max_length=40)
    quiz: list[DocumentQuizQuestion] = Field(default_factory=list, max_length=30)
    proposed_actions: list[DocumentProposedAction] = Field(default_factory=list, max_length=50)
    warnings: list[str] = Field(default_factory=list, max_length=20)


class DocumentRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    original_name: str
    kind: DocumentKind
    mime_type: str
    size_bytes: int
    sha256: str
    status: DocumentStatus
    scan_status: Literal["clean", "unavailable", "skipped"]
    module_id: str | None = None
    created_at: datetime
    updated_at: datetime
    retention_expires_at: datetime
    processing_attempts: int = 0
    error_code: str | None = None
    error_message: str | None = None
    duplicate: bool = False
    analysis: DocumentAnalysis | None = None


class DocumentListResponse(BaseModel):
    items: list[DocumentRecord]


class PlanValidationBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: ShortText
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def validate_window(self) -> "PlanValidationBlock":
        if self.end_at <= self.start_at:
            raise ValueError("Planner block end must be after start.")
        return self


class PlannerValidationContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str
    reference_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    planning_minutes: int = Field(ge=0, le=1440)
    plan_blocks: list[PlanValidationBlock] = Field(default_factory=list, max_length=300)


class ApproveDocumentActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    action: DocumentProposedAction
    planner_context: PlannerValidationContext


class ApproveDocumentActionResponse(BaseModel):
    saved: bool
    action_id: str
    kind: str
    message: str


class RetryDocumentResponse(BaseModel):
    document_id: str
    status: DocumentStatus
    message: str


class DeleteDocumentResponse(BaseModel):
    deleted: bool
    document_id: str
