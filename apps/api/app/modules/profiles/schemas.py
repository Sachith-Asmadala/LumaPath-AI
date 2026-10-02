from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field

SupportedLocale = Literal["en", "si-LK", "ta-LK"]


class LocalePreferenceRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: SupportedLocale
    translation_version: str = Field(min_length=1, max_length=64)


class LocalePreferenceResponse(BaseModel):
    student_id: str
    locale: SupportedLocale
    translation_version: str
    updated_at: datetime


class TranslationReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    locale: SupportedLocale
    key: str = Field(min_length=1, max_length=180, pattern=r"^[a-zA-Z0-9_.-]+$")
    translation_version: str = Field(min_length=1, max_length=64)


class TranslationReportResponse(BaseModel):
    saved: bool
