from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

ContentCategory = Literal["learning_article", "official_release", "security_update", "industry_news", "certification_change"]
Difficulty = Literal["beginner", "intermediate", "advanced"]
FeedView = Literal["today", "saved", "planned"]
InteractionAction = Literal["save", "unsave", "dismiss", "report"]


class ContentSkillInput(BaseModel):
    skill_id: str = Field(min_length=1, max_length=80)
    relationship: Literal["primary", "related"] = "related"


class IngestionCandidate(BaseModel):
    source_id: str = Field(min_length=1, max_length=120)
    category: ContentCategory
    title: str = Field(min_length=5, max_length=240)
    excerpt: str = Field(default="", max_length=2000)
    canonical_url: str = Field(min_length=8, max_length=1500)
    published_at: datetime
    expires_at: datetime | None = None
    topics: list[str] = Field(default_factory=list, max_length=20)
    skills: list[ContentSkillInput] = Field(default_factory=list, max_length=30)
    target_roles: list[str] = Field(default_factory=list, max_length=20)
    difficulty: Difficulty = "intermediate"
    reading_minutes: int = Field(default=10, ge=1, le=180)

    @field_validator("topics", "target_roles")
    @classmethod
    def clean_strings(cls, values: list[str]) -> list[str]:
        result: list[str] = []
        for value in values:
            cleaned = " ".join(value.strip().split())[:120]
            if cleaned and cleaned.lower() not in {item.lower() for item in result}:
                result.append(cleaned)
        return result


class IngestionResult(BaseModel):
    run_id: str
    source_id: str
    status: Literal["succeeded", "failed"]
    accepted: int = 0
    quarantined: int = 0
    duplicates: int = 0
    rejected: int = 0
    error_code: str | None = None
    error_message: str | None = None
    completed_at: datetime


class FeedSource(BaseModel):
    id: str
    name: str
    source_type: str
    trust_score: int = Field(ge=0, le=100)
    terms_url: str


class FeedPathwayStep(BaseModel):
    id: str
    skill_id: str
    name: str
    state: str
    proficiency: int = Field(ge=0, le=100)


class FeedPathwayContext(BaseModel):
    pathway_id: str
    pathway_version: int
    target_role: str
    current_step: FeedPathwayStep | None = None


class FeedIngestionStatus(BaseModel):
    state: Literal["healthy", "degraded", "never_run"]
    last_success_at: datetime | None = None
    last_attempt_at: datetime | None = None
    failed_sources: int = 0
    message: str


class FeedItem(BaseModel):
    recommendation_id: str
    article_id: str
    category: ContentCategory
    category_label: str
    title: str
    excerpt: str
    canonical_url: str
    source: FeedSource
    published_at: datetime
    expires_at: datetime
    fresh: bool
    topics: list[str]
    skills: list[str]
    difficulty: Difficulty
    reading_minutes: int
    relevance_score: float = Field(ge=0, le=100)
    why_this_matters: str
    ranking_version: str
    explanation_version: str
    interaction_state: Literal["new", "saved", "planned"]


class FeedResponse(BaseModel):
    state: Literal["ready", "no_pathway", "no_fresh_content", "ingestion_failure"]
    message: str
    feed_date: str
    generated_at: datetime
    pathway: FeedPathwayContext | None = None
    ingestion: FeedIngestionStatus
    items: list[FeedItem]
    freshness_policy: str


class InteractionRequest(BaseModel):
    action: InteractionAction
    reason: str = Field(default="", max_length=600)

    @model_validator(mode="after")
    def validate_reason(self):
        if self.action == "report" and len(self.reason.strip()) < 3:
            raise ValueError("A short report reason is required.")
        return self


class InteractionResponse(BaseModel):
    article_id: str
    action: InteractionAction
    state: Literal["new", "saved", "dismissed", "reported"]
    feed_invalidated: bool
    message: str


class PlannerBlockInput(BaseModel):
    id: str = Field(min_length=1, max_length=180)
    start_at: datetime
    end_at: datetime

    @model_validator(mode="after")
    def valid_range(self):
        if self.end_at <= self.start_at:
            raise ValueError("Planner block end must be after start.")
        return self


class AddToPlanRequest(BaseModel):
    idempotency_key: str = Field(min_length=4, max_length=180)
    preferred_start_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=10, le=180)
    existing_blocks: list[PlannerBlockInput] = Field(default_factory=list, max_length=1000)


class PlannerHandoffResponse(BaseModel):
    article_id: str
    recommendation_id: str
    title: str
    start_at: datetime
    end_at: datetime
    duration_minutes: int
    category: Literal["Career"] = "Career"
    description: str
    source: str
    source_url: str
    ranking_version: str
    explanation_version: str
    idempotent: bool = False
