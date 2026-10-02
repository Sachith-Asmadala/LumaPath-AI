from __future__ import annotations

from datetime import datetime, timezone

from .repository import ProfilePreferenceRepository
from .schemas import LocalePreferenceResponse, SupportedLocale

DEFAULT_LOCALE: SupportedLocale = "en"
DEFAULT_TRANSLATION_VERSION = "2026-10-02.5"


class ProfilePreferenceService:
    def __init__(self, repository: ProfilePreferenceRepository) -> None:
        self.repository = repository

    def get_locale(self, student_id: str) -> LocalePreferenceResponse:
        existing = self.repository.get_locale(student_id)
        if existing:
            return existing
        return LocalePreferenceResponse(
            student_id=student_id,
            locale=DEFAULT_LOCALE,
            translation_version=DEFAULT_TRANSLATION_VERSION,
            updated_at=datetime.now(timezone.utc),
        )

    def set_locale(self, student_id: str, locale: SupportedLocale, translation_version: str) -> LocalePreferenceResponse:
        return self.repository.set_locale(student_id, locale, translation_version)

    def report_missing_translation(self, student_id: str, locale: SupportedLocale, key: str, translation_version: str) -> None:
        self.repository.report_missing_translation(student_id, locale, key, translation_version)
