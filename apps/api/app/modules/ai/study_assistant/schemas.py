from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

NonEmpty = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]
AssistantLocale = Literal["en", "si-LK", "ta-LK"]


class AssistantMode(str, Enum):
    CONCEPT_EXPLANATION = "concept_explanation"
    REVISION_PLAN = "revision_plan"
    QUIZ = "quiz"
    ASSIGNMENT_BREAKDOWN = "assignment_breakdown"
    TODAY_SUGGESTION = "todays_study_suggestion"


class ContextKind(str, Enum):
    MODULE = "module"
    TASK = "task"
    LEARNING_OBJECTIVE = "learning_objective"


class AssistantContextRef(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: ContextKind
    id: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]
    label: ShortText


class ModuleContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    name: ShortText


class TaskContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: ShortText
    category: str
    status: str
    estimated_minutes: int = Field(ge=5, le=1440)
    due_at: datetime | None = None
    progress: int = Field(ge=0, le=100)
    risk_score: int = Field(ge=0, le=100)
    description: str = Field(default="", max_length=2000)
    module: str | None = Field(default=None, max_length=180)
    career_skill_ids: list[str] = Field(default_factory=list, max_length=30)


class LearningObjectiveContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: ShortText
    description: str = Field(default="", max_length=1500)
    status: str = Field(default="active", max_length=80)


class CapacityContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    available_minutes: int = Field(ge=0, le=1440)
    unexpected_commitment_minutes: int = Field(ge=0, le=1440)
    energy: int = Field(ge=1, le=5)
    focus: Literal["low", "medium", "high"]
    workload: Literal["light", "moderate", "heavy"]
    planning_minutes: int = Field(ge=0, le=1440)


class PlanBlockContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: ShortText
    start_at: datetime
    end_at: datetime
    is_fixed: bool = False

    @model_validator(mode="after")
    def validate_window(self) -> "PlanBlockContext":
        if self.end_at <= self.start_at:
            raise ValueError("Plan block end must be after start.")
        return self


class LearningMaterialContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: ShortText
    source: ShortText
    excerpt: str = Field(default="", max_length=4000)
    skill: str | None = Field(default=None, max_length=128)


class StudentAssistantContextSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    student_id: str
    target_role: ShortText
    student_goal: str = Field(default="", max_length=120)
    reference_date: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    modules: list[ModuleContext] = Field(default_factory=list, max_length=40)
    tasks: list[TaskContext] = Field(default_factory=list, max_length=250)
    learning_objectives: list[LearningObjectiveContext] = Field(default_factory=list, max_length=80)
    capacity: CapacityContext
    plan_blocks: list[PlanBlockContext] = Field(default_factory=list, max_length=300)
    materials: list[LearningMaterialContext] = Field(default_factory=list, max_length=50)


class ContextSyncResponse(BaseModel):
    student_id: str
    modules: int
    tasks: int
    learning_objectives: int
    materials: int


class StudyAssistantRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    session_id: str | None = Field(default=None, max_length=128)
    mode: AssistantMode
    context_ref: AssistantContextRef
    question: str = Field(default="", max_length=2000)
    locale: AssistantLocale = "en"

    @model_validator(mode="after")
    def mode_requirements(self) -> "StudyAssistantRequest":
        if self.mode == AssistantMode.CONCEPT_EXPLANATION and not self.question.strip():
            raise ValueError("A concept question is required.")
        if self.mode == AssistantMode.ASSIGNMENT_BREAKDOWN and self.context_ref.kind != ContextKind.TASK:
            raise ValueError("Assignment breakdown requires a task context.")
        return self


class ResponseItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: ShortText
    detail: str = Field(default="", max_length=1200)
    meta: str | None = Field(default=None, max_length=180)


class QuizQuestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    prompt: NonEmpty
    choices: list[NonEmpty] = Field(min_length=2, max_length=6)
    answer_index: int = Field(ge=0, le=5)
    explanation: str = Field(default="", max_length=1000)

    @model_validator(mode="after")
    def answer_in_range(self) -> "QuizQuestion":
        if self.answer_index >= len(self.choices):
            raise ValueError("Quiz answer index is outside the available choices.")
        return self


class ResponseBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["explanation", "steps", "plan", "quiz", "notice"]
    title: ShortText
    body: str = Field(default="", max_length=5000)
    items: list[ResponseItem] = Field(default_factory=list, max_length=20)
    quiz: list[QuizQuestion] = Field(default_factory=list, max_length=20)


class ProposedAction(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["task", "plan_item", "quiz_set"]
    title: ShortText
    source_context_ref: AssistantContextRef
    estimated_minutes: int | None = Field(default=None, ge=5, le=480)
    start_at: datetime | None = None
    due_at: datetime | None = None
    category: str | None = Field(default=None, max_length=80)
    description: str = Field(default="", max_length=2000)
    quiz: list[QuizQuestion] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_action_shape(self) -> "ProposedAction":
        if self.kind in {"task", "plan_item"} and self.estimated_minutes is None:
            raise ValueError("Plannable actions require an estimated duration.")
        if self.kind == "plan_item" and self.start_at is None:
            raise ValueError("Plan items require a start time.")
        if self.kind == "quiz_set" and not self.quiz:
            raise ValueError("Quiz actions require questions.")
        if self.start_at and self.due_at and self.start_at > self.due_at:
            raise ValueError("Action cannot start after its deadline.")
        return self


class AssistantCitation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    title: ShortText
    source: ShortText
    note: str = Field(default="", max_length=500)


class AssistantDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText
    summary: str = Field(min_length=1, max_length=2000)
    blocks: list[ResponseBlock] = Field(min_length=1, max_length=12)
    why_this: str = Field(min_length=1, max_length=1500)
    proposed_actions: list[ProposedAction] = Field(default_factory=list, max_length=20)
    citations: list[AssistantCitation] = Field(default_factory=list, max_length=12)
    warnings: list[str] = Field(default_factory=list, max_length=12)


class StudyAssistantResponse(AssistantDraft):
    response_id: str
    session_id: str
    mode: AssistantMode
    context_used: list[AssistantContextRef]
    general_guidance: bool = False
    requested_locale: AssistantLocale = "en"
    response_locale: AssistantLocale = "en"
    locale_fallback: bool = False


class ApproveActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response_id: str
    session_id: str
    action: ProposedAction


class ApproveActionResponse(BaseModel):
    saved: bool
    action_id: str
    kind: str
    message: str


class FeedbackRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response_id: str
    helpful: bool
    note: str = Field(default="", max_length=500)


class FeedbackResponse(BaseModel):
    saved: bool
