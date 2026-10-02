from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator, model_validator

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=220)]


class VerificationStatus(str, Enum):
    SELF_REPORTED = "self_reported"
    OBSERVED = "observed"
    NOT_DEMONSTRATED = "not_demonstrated"


class RecommendationStatus(str, Enum):
    PROPOSED = "proposed"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


class ProjectFacts(BaseModel):
    model_config = ConfigDict(extra="forbid")
    technologies: list[str] = Field(default_factory=list, max_length=40)
    languages: list[str] = Field(default_factory=list, max_length=30)
    topics: list[str] = Field(default_factory=list, max_length=30)
    has_readme: bool = False
    has_tests: bool = False
    has_documentation: bool = False
    has_ci: bool = False
    has_docker: bool = False
    has_iac: bool = False
    has_kubernetes: bool = False
    has_monitoring: bool = False
    last_activity_at: datetime | None = None


class CreatePortfolioProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText
    description: str = Field(min_length=1, max_length=5000)
    target_role: ShortText
    project_url: str | None = Field(default=None, max_length=1000)
    live_demo_url: str | None = Field(default=None, max_length=1000)
    facts: ProjectFacts = Field(default_factory=ProjectFacts)

    @field_validator("project_url", "live_demo_url")
    @classmethod
    def validate_links(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("Project links must use http:// or https://.")
        return value


class UpdatePortfolioProjectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText
    description: str = Field(min_length=1, max_length=5000)
    target_role: ShortText
    project_url: str | None = Field(default=None, max_length=1000)
    live_demo_url: str | None = Field(default=None, max_length=1000)
    facts: ProjectFacts = Field(default_factory=ProjectFacts)

    @field_validator("project_url", "live_demo_url")
    @classmethod
    def validate_links(cls, value: str | None) -> str | None:
        return CreatePortfolioProjectRequest.validate_links(value)


class RepositorySnapshotInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider: Literal["github", "gitlab", "bitbucket", "other"] = "github"
    external_repository_id: ShortText
    full_name: ShortText
    repository_url: str = Field(min_length=1, max_length=1000)
    live_demo_url: str | None = Field(default=None, max_length=1000)
    visibility: Literal["public", "private"]
    explicitly_selected: bool
    authorization_reference: str = Field(min_length=1, max_length=256)
    authorization_scope: Literal["read_selected_repository_metadata"]
    collected_at: datetime
    facts: ProjectFacts

    @field_validator("repository_url", "live_demo_url")
    @classmethod
    def validate_repository_url(cls, value: str | None) -> str | None:
        if value is None or not value.strip():
            return None
        value = value.strip()
        if not value.startswith(("https://", "http://")):
            raise ValueError("Repository links must use http:// or https://.")
        return value

    @model_validator(mode="after")
    def require_explicit_selection(self) -> "RepositorySnapshotInput":
        if not self.explicitly_selected:
            raise ValueError("Repository snapshots require explicit student selection.")
        return self


class ExternalRepositoryResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    provider: str
    external_repository_id: str
    full_name: str
    repository_url: str
    live_demo_url: str | None = None
    visibility: str
    access_status: Literal["active", "revoked"]
    collected_at: datetime
    imported_at: datetime
    revoked_at: datetime | None = None
    stale: bool
    facts: ProjectFacts


class CompletenessIndicator(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: str
    label: ShortText
    points: int = Field(ge=0, le=100)
    max_points: int = Field(ge=1, le=100)
    satisfied: bool
    evidence: str = Field(min_length=1, max_length=600)


class SkillEvidenceResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill_id: str
    skill_name: str
    status: VerificationStatus
    confidence: float = Field(ge=0, le=1)
    evidence: list[str] = Field(default_factory=list, max_length=16)
    source_type: Literal["manual_project", "repository_snapshot"]
    source_timestamp: datetime


class PortfolioRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["improvement", "description", "project_idea"]
    priority: Literal["high", "medium", "low"]
    title: ShortText
    rationale: str = Field(min_length=1, max_length=1800)
    evidence_refs: list[str] = Field(min_length=1, max_length=16)
    editable_text: str | None = Field(default=None, max_length=4000)
    status: RecommendationStatus = RecommendationStatus.PROPOSED


class PortfolioAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    project_id: str
    target_role: str
    source_kind: Literal["manual", "repository"]
    source_repository_id: str | None = None
    source_timestamp: datetime
    analyzed_at: datetime
    completeness_score: int = Field(ge=0, le=100)
    indicators: list[CompletenessIndicator]
    demonstrated_skills: list[SkillEvidenceResponse]
    not_demonstrated_skills: list[SkillEvidenceResponse]
    recommendations: list[PortfolioRecommendation]
    factual_description: str
    stale: bool
    disclaimer: str


class PortfolioProjectResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    title: str
    description: str
    target_role: str
    project_url: str | None
    live_demo_url: str | None
    facts: ProjectFacts
    created_at: datetime
    updated_at: datetime
    repositories: list[ExternalRepositoryResponse] = Field(default_factory=list)
    latest_analysis: PortfolioAnalysisResponse | None = None


class PortfolioProjectListResponse(BaseModel):
    items: list[PortfolioProjectResponse]


class RecommendationDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accepted", "dismissed"]
    edited_text: str | None = Field(default=None, max_length=4000)


class RepositoryRevocationResponse(BaseModel):
    repository_id: str
    access_status: Literal["revoked"]
    refresh_allowed: bool = False
    message: str


class DeleteImportedRepositoryResponse(BaseModel):
    repository_id: str
    deleted: bool
    project_preserved: bool = True
