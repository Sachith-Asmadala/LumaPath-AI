from __future__ import annotations

from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class AchievementEvidence(BaseModel):
    source_type: str
    source_id: str
    occurred_at: datetime
    href: str
    label: str
    verified: bool = True


class AchievementDefinitionView(BaseModel):
    key: str
    version: str
    category: Literal["planning", "deadline", "study", "portfolio", "cv", "application", "roadmap"]
    title: str
    description: str
    target: int
    unit: str
    optional_career: bool = False


class AwardedAchievementView(BaseModel):
    id: str
    definition_key: str
    definition_version: str
    title: str
    description: str
    category: str
    awarded_at: datetime
    evidence_status: Literal["active", "withdrawn"]
    evidence: list[AchievementEvidence]
    restored_at: datetime | None = None


class AchievementProgressView(BaseModel):
    definition: AchievementDefinitionView
    current: int
    target: int
    complete: bool
    evidence: list[AchievementEvidence] = Field(default_factory=list)


class StreakView(BaseModel):
    current_count: int
    longest_count: int
    last_qualifying_date: str | None
    grace_days_used: int
    state: Literal["active", "grace", "resting", "empty"]
    rule_version: str
    explanation: str
    qualifying_dates: list[str] = Field(default_factory=list)


class AchievementPreferencesView(BaseModel):
    student_id: str
    feature_visible: bool
    celebrations_enabled: bool
    streak_visible: bool
    updated_at: datetime


class AchievementPreferencesUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    feature_visible: bool
    celebrations_enabled: bool
    streak_visible: bool


class AchievementDashboardView(BaseModel):
    student_id: str
    catalogue_version: str
    preferences: AchievementPreferencesView
    awards: list[AwardedAchievementView]
    progress: list[AchievementProgressView]
    streak: StreakView
    new_awards: list[AwardedAchievementView] = Field(default_factory=list)
    private_only: bool = True
    comparison_enabled: bool = False
    generated_at: datetime
