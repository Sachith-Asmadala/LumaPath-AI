from __future__ import annotations
from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
from ..portfolio.taxonomy import ROLE_TAXONOMY

RoundType = Literal['technical','behavioral','project']
Level = Literal['intern','junior','mid']
SessionStatus = Literal['ready','running','paused','completed','feedback_ready','feedback_failed']

class CreateInterviewSessionRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: str
    level: Level = 'intern'
    round_type: RoundType
    question_time_seconds: int = Field(default=180, ge=30, le=900)
    max_followups_per_question: int = Field(default=1, ge=0, le=2)
    retention_days: Literal[7,30,90] = 30
    recording_mode: Literal['text','audio','video'] = 'text'
    store_recordings: bool = False
    consent_acknowledged: bool
    locale: Literal['en','si-LK','ta-LK'] = 'en'

    @field_validator('role')
    @classmethod
    def role_supported(cls, v: str) -> str:
        if v not in ROLE_TAXONOMY:
            raise ValueError('Choose a supported role from the LumaPath role taxonomy.')
        return v

    @field_validator('store_recordings')
    @classmethod
    def storage_requires_non_text(cls, v: bool, info):
        mode = info.data.get('recording_mode')
        if v and mode == 'text':
            raise ValueError('Text-only practice does not create a recording to store.')
        return v

class SubmitInterviewAnswerRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    answer_text: str = Field(min_length=1, max_length=12000)

class InterviewQuestion(BaseModel):
    id: str
    prompt: str
    round_type: RoundType
    skill_ids: list[str]
    skill_names: list[str]
    evidence_refs: list[str] = Field(default_factory=list)
    is_followup: bool
    parent_question_id: str | None
    sequence: int
    time_limit_seconds: int

class InterviewResponseItem(BaseModel):
    id: str
    question_id: str
    answer_text: str
    started_at: datetime
    submitted_at: datetime
    active_seconds: int
    timed_out: bool

class RubricCriterionResult(BaseModel):
    criterion: Literal['relevance','structure','technical_content','communication']
    score: int = Field(ge=0, le=5)
    rationale: str
    evidence_excerpt: str
    response_id: str

class InterviewFeedbackItem(BaseModel):
    kind: Literal['strength','improvement','study_topic']
    title: str
    detail: str
    refs: list[str]

class InterviewFeedback(BaseModel):
    rubric_version: str
    generated_at: datetime
    overall_practice_score: int = Field(ge=0, le=100)
    rubric_results: list[RubricCriterionResult]
    items: list[InterviewFeedbackItem]
    illustrative_answer_structure: list[str]
    disclaimer: str
    uncertainty_note: str

class InterviewSessionResponse(BaseModel):
    id: str
    role: str
    level: Level
    round_type: RoundType
    template_version: str
    rubric_version: str
    status: SessionStatus
    question_time_seconds: int
    max_followups_per_question: int
    current_question_id: str | None
    current_question_started_at: datetime | None
    current_question_elapsed_seconds: int
    pause_count: int
    max_pause_count: int
    questions: list[InterviewQuestion]
    responses: list[InterviewResponseItem]
    feedback: InterviewFeedback | None
    feedback_error: str | None
    recording_mode: str
    store_recordings: bool
    recording_storage_status: Literal['not_applicable','not_stored','consented_no_media_uploaded']
    retention_days: int
    expires_at: datetime
    created_at: datetime
    updated_at: datetime

class InterviewSessionListResponse(BaseModel):
    items: list[InterviewSessionResponse]

class InterviewDeleteResponse(BaseModel):
    deleted: bool

class RoadmapTopicRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    feedback_refs: list[str] = Field(min_length=1, max_length=10)

class RoadmapTopicResponse(BaseModel):
    topics: list[dict]
