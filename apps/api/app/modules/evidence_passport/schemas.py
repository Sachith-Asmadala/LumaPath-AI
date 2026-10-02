from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

EvidenceType = Literal["manual_project", "repository", "live_demo", "certificate", "assessment", "mentor_validation"]
VerificationStatus = Literal["verified", "observed", "reviewed", "self_declared", "stale", "disputed", "expired"]
FreshnessState = Literal["fresh", "stale", "expired", "disputed"]


class EvidenceProvenance(BaseModel):
    source: str
    source_ref: str
    source_url: str | None = None
    issuer: str | None = None
    acquired_at: date | None = None
    expires_at: date | None = None
    observed_at: datetime
    last_reviewed_at: datetime | None = None
    reference_hash: str


class EvidenceRecord(BaseModel):
    id: str
    skill_id: str
    skill_name: str
    evidence_type: EvidenceType
    title: str
    verification_status: VerificationStatus
    confidence: float = Field(ge=0, le=1)
    proficiency: int | None = Field(default=None, ge=0, le=100)
    freshness: FreshnessState
    readiness_contribution: int = Field(ge=0, le=100)
    provenance: EvidenceProvenance
    correction_note: str = ""
    can_edit: bool = False
    can_revalidate: bool = False


class SkillPassport(BaseModel):
    skill_id: str
    skill_name: str
    required_proficiency: int | None = None
    assessed_proficiency: int | None = None
    readiness_score: int = Field(ge=0, le=100)
    status: Literal["supported", "limited", "unsupported", "disputed"]
    evidence: list[EvidenceRecord]
    gap_explanation: str


class PassportSummary(BaseModel):
    generated_at: datetime
    skills: list[SkillPassport]
    total_evidence: int
    verified_or_observed: int
    stale_or_expired: int
    disputed: int
    disclaimer: str


class CertificateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    skill_id: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=2, max_length=180)
    issuer: str = Field(min_length=2, max_length=180)
    acquired_at: date | None = None
    expires_at: date | None = None
    credential_reference: str = Field(default="", max_length=240)
    source_url: str | None = Field(default=None, max_length=500)
    proficiency: int | None = Field(default=None, ge=0, le=100)

    @field_validator("source_url")
    @classmethod
    def safe_url(cls, value: str | None):
        if value is None or value == "":
            return None
        if not (value.startswith("https://") or value.startswith("http://")):
            raise ValueError("Certificate source URL must use HTTP or HTTPS.")
        return value

    @model_validator(mode="after")
    def valid_dates(self):
        if self.acquired_at and self.expires_at and self.expires_at < self.acquired_at:
            raise ValueError("Certificate expiry cannot be before the acquired date.")
        return self


class EvidenceCorrectionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    disputed: bool
    note: str = Field(min_length=3, max_length=600)


class MentorValidationRequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    relationship_id: str = Field(min_length=1, max_length=160)
    skill_id: str = Field(min_length=1, max_length=80)
    request_note: str = Field(default="", max_length=600)


class MentorValidationRequestView(BaseModel):
    id: str
    relationship_id: str
    mentor_label: str
    skill_id: str
    skill_name: str
    status: Literal["pending", "validated", "uncertain", "disputed", "cancelled"]
    request_note: str
    mentor_note: str
    created_at: datetime
    responded_at: datetime | None = None


class MentorValidationResponseInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    relationship_id: str = Field(min_length=1, max_length=160)
    decision: Literal["validated", "uncertain", "disputed"]
    note: str = Field(min_length=3, max_length=800)
    proficiency: int | None = Field(default=None, ge=0, le=100)


class ShareCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_ids: list[str] = Field(min_length=1, max_length=100)
    expires_at: datetime
    label: str = Field(default="Recruiter evidence share", min_length=2, max_length=120)

    @field_validator("evidence_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        return list(dict.fromkeys(values))

    @field_validator("expires_at")
    @classmethod
    def aware_expiry(cls, value: datetime):
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("Share expiry must include a timezone.")
        return value


class ShareGrantView(BaseModel):
    id: str
    label: str
    evidence_ids: list[str]
    created_at: datetime
    expires_at: datetime
    revoked_at: datetime | None = None
    status: Literal["active", "expired", "revoked"]
    access_count: int = 0


class ShareCreateResponse(BaseModel):
    share: ShareGrantView
    share_token: str




class PublicEvidenceProvenance(BaseModel):
    source: str
    source_url: str | None = None
    issuer: str | None = None
    acquired_at: date | None = None
    expires_at: date | None = None
    observed_at: datetime
    last_reviewed_at: datetime | None = None
    reference_hash: str


class PublicEvidenceRecord(BaseModel):
    id: str
    skill_id: str
    skill_name: str
    evidence_type: EvidenceType
    title: str
    verification_status: VerificationStatus
    confidence: float = Field(ge=0, le=1)
    proficiency: int | None = Field(default=None, ge=0, le=100)
    freshness: FreshnessState
    provenance: PublicEvidenceProvenance


class PublicEvidenceShare(BaseModel):
    share_id: str
    label: str
    generated_at: datetime
    expires_at: datetime
    evidence: list[PublicEvidenceRecord]
    disclaimer: str


class ExportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_ids: list[str] = Field(min_length=1, max_length=100)

    @field_validator("evidence_ids")
    @classmethod
    def unique_ids(cls, values: list[str]):
        return list(dict.fromkeys(values))


class ExportResponse(BaseModel):
    filename: str
    content_type: str
    content: str
    generated_at: datetime
    disclaimer: str


class AccessAuditView(BaseModel):
    id: int
    actor_type: str
    event_type: str
    evidence_ids: list[str]
    detail: str
    occurred_at: datetime
