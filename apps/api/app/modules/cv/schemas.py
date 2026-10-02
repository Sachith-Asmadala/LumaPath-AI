from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ..portfolio.taxonomy import ROLE_TAXONOMY

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=220)]
RetentionDays = Literal[7, 30, 90]
SectionKey = Literal["contact", "summary", "education", "experience", "projects", "skills", "certifications", "other"]
SuggestionStatus = Literal["proposed", "accepted", "dismissed"]


class CvSection(BaseModel):
    model_config = ConfigDict(extra="forbid")
    key: SectionKey
    title: ShortText
    content: str = Field(default="", max_length=20000)


class CreatePastedCvRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: ShortText = "Pasted CV"
    target_role: ShortText
    retention_days: RetentionDays = 30
    source_text: str = Field(min_length=20, max_length=120000)

    @field_validator("target_role")
    @classmethod
    def supported_target_role(cls, value: str) -> str:
        if value not in ROLE_TAXONOMY:
            raise ValueError("Choose a supported target role from the LumaPath role taxonomy.")
        return value


class UpdateCvSectionsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    sections: list[CvSection] = Field(min_length=1, max_length=16)
    confirmed: bool = True

    @field_validator("sections")
    @classmethod
    def unique_section_keys(cls, sections: list[CvSection]) -> list[CvSection]:
        keys = [section.key for section in sections]
        if len(keys) != len(set(keys)):
            raise ValueError("Each CV section can appear only once.")
        return sections


class CvFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    category: Literal["structure", "readability", "skills", "projects", "experience", "ats", "privacy"]
    severity: Literal["high", "medium", "low"]
    title: ShortText
    rationale: str = Field(min_length=1, max_length=2200)
    source_section: SectionKey | None = None
    proposed_action: str = Field(min_length=1, max_length=2200)


class CvRoleSkill(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill_id: str
    skill_name: str
    status: Literal["cv_evidenced", "portfolio_evidenced", "not_demonstrated_in_cv"]
    evidence: list[str] = Field(default_factory=list, max_length=20)


class CvSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Literal["wording", "evidence_request"]
    section_key: SectionKey
    title: ShortText
    rationale: str = Field(min_length=1, max_length=2200)
    evidence_refs: list[str] = Field(min_length=1, max_length=20)
    draft_text: str = Field(min_length=1, max_length=5000)
    status: SuggestionStatus = "proposed"


class CvAnalysisResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    document_id: str
    analysis_version: str
    target_role: str
    analyzed_at: datetime
    word_count: int = Field(ge=0)
    findings: list[CvFinding]
    role_skills: list[CvRoleSkill]
    suggestions: list[CvSuggestion]
    ats_disclaimer: str
    evidence_disclaimer: str


class CvDocumentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    owner_id: str
    source_type: Literal["upload", "paste"]
    title: str
    original_filename: str | None = None
    canonical_mime: str | None = None
    target_role: str
    retention_days: RetentionDays
    expires_at: datetime
    created_at: datetime
    updated_at: datetime
    parse_status: Literal["parsed", "parse_failed", "source_deleted"]
    parse_error: str | None = None
    source_deleted_at: datetime | None = None
    sections_confirmed: bool
    sections: list[CvSection]
    latest_analysis: CvAnalysisResponse | None = None


class CvDocumentListResponse(BaseModel):
    items: list[CvDocumentResponse]


class CvSuggestionDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    decision: Literal["accepted", "dismissed"]
    edited_text: str | None = Field(default=None, max_length=5000)


class CvExportResponse(BaseModel):
    filename: str
    media_type: Literal["text/plain"] = "text/plain"
    content: str
    accepted_suggestion_count: int


class CvDeleteResponse(BaseModel):
    deleted: bool
    source_deleted: bool = False
    analysis_deleted: bool = False
