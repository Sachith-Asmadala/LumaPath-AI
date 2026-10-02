from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Protocol

from .schemas import LocalePreferenceResponse, SupportedLocale


class ProfilePreferenceRepository(Protocol):
    def get_locale(self, student_id: str) -> LocalePreferenceResponse | None: ...
    def set_locale(self, student_id: str, locale: SupportedLocale, translation_version: str) -> LocalePreferenceResponse: ...
    def report_missing_translation(self, student_id: str, locale: SupportedLocale, key: str, translation_version: str) -> None: ...


class SqliteProfilePreferenceRepository:
    def __init__(self, database_path: str) -> None:
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._ensure_schema()

    def _connect(self):
        connection = sqlite3.connect(self.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _ensure_schema(self) -> None:
        with self._connect() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS profile_preferences (
                    student_id TEXT PRIMARY KEY,
                    locale TEXT NOT NULL CHECK(locale IN ('en','si-LK','ta-LK')),
                    translation_version TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS translation_missing_reports (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id TEXT NOT NULL,
                    locale TEXT NOT NULL,
                    message_key TEXT NOT NULL,
                    translation_version TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    UNIQUE(student_id, locale, message_key, translation_version)
                );
                CREATE INDEX IF NOT EXISTS idx_translation_reports_locale_key
                    ON translation_missing_reports(locale, message_key, translation_version);
                """
            )

    def get_locale(self, student_id: str) -> LocalePreferenceResponse | None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT student_id, locale, translation_version, updated_at FROM profile_preferences WHERE student_id = ?",
                (student_id,),
            ).fetchone()
        if not row:
            return None
        return LocalePreferenceResponse(
            student_id=row["student_id"], locale=row["locale"], translation_version=row["translation_version"], updated_at=datetime.fromisoformat(row["updated_at"])
        )

    def set_locale(self, student_id: str, locale: SupportedLocale, translation_version: str) -> LocalePreferenceResponse:
        now = datetime.now(timezone.utc)
        with self._connect() as connection:
            connection.execute(
                """
                INSERT INTO profile_preferences(student_id, locale, translation_version, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(student_id) DO UPDATE SET
                  locale = excluded.locale,
                  translation_version = excluded.translation_version,
                  updated_at = excluded.updated_at
                """,
                (student_id, locale, translation_version, now.isoformat()),
            )
        return LocalePreferenceResponse(student_id=student_id, locale=locale, translation_version=translation_version, updated_at=now)

    def report_missing_translation(self, student_id: str, locale: SupportedLocale, key: str, translation_version: str) -> None:
        now = datetime.now(timezone.utc).isoformat()
        with self._connect() as connection:
            connection.execute(
                """
                INSERT OR IGNORE INTO translation_missing_reports(student_id, locale, message_key, translation_version, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (student_id, locale, key, translation_version, now),
            )
