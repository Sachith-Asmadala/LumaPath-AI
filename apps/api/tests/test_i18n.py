from __future__ import annotations

import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.profiles.repository import SqliteProfilePreferenceRepository
from apps.api.app.modules.profiles.service import ProfilePreferenceService


def test_locale_defaults_to_english_without_persisting(tmp_path: Path):
    repo = SqliteProfilePreferenceRepository(str(tmp_path / "locale.db"))
    service = ProfilePreferenceService(repo)
    result = service.get_locale("student-a")
    assert result.locale == "en"
    assert repo.get_locale("student-a") is None


def test_locale_persists_per_student(tmp_path: Path):
    repo = SqliteProfilePreferenceRepository(str(tmp_path / "locale.db"))
    service = ProfilePreferenceService(repo)
    service.set_locale("student-a", "si-LK", "v1")
    service.set_locale("student-b", "ta-LK", "v1")
    assert service.get_locale("student-a").locale == "si-LK"
    assert service.get_locale("student-b").locale == "ta-LK"



def test_locale_survives_repository_reopen(tmp_path: Path):
    path = tmp_path / "persisted-locale.db"
    first = ProfilePreferenceService(SqliteProfilePreferenceRepository(str(path)))
    first.set_locale("student-persist", "ta-LK", "2026-10-01.1")
    reopened = ProfilePreferenceService(SqliteProfilePreferenceRepository(str(path)))
    result = reopened.get_locale("student-persist")
    assert result.locale == "ta-LK"
    assert result.translation_version == "2026-10-01.1"

def test_translation_report_stores_no_user_content(tmp_path: Path):
    path = tmp_path / "locale.db"
    repo = SqliteProfilePreferenceRepository(str(path))
    repo.report_missing_translation("student-a", "si-LK", "nav.experimental", "v1")
    with sqlite3.connect(path) as connection:
        row = connection.execute("SELECT student_id, locale, message_key, translation_version FROM translation_missing_reports").fetchone()
        columns = {item[1] for item in connection.execute("PRAGMA table_info(translation_missing_reports)").fetchall()}
    assert row == ("student-a", "si-LK", "nav.experimental", "v1")
    assert not {"prompt", "content", "task_title", "document_text"} & columns


def test_profile_locale_http_is_owner_scoped_and_validated(monkeypatch, tmp_path: Path):
    import apps.api.app.modules.profiles.router as profile_router
    repo = SqliteProfilePreferenceRepository(str(tmp_path / "http.db"))
    monkeypatch.setattr(profile_router, "repository", repo)
    monkeypatch.setattr(profile_router, "service", ProfilePreferenceService(repo))
    client = TestClient(app)
    headers_a = {"X-Luma-Student-Id": "student-a"}
    headers_b = {"X-Luma-Student-Id": "student-b"}
    updated = client.put("/v1/profile/preferences/locale", headers=headers_a, json={"locale": "si-LK", "translation_version": "v1"})
    assert updated.status_code == 200
    assert updated.json()["locale"] == "si-LK"
    assert client.get("/v1/profile/preferences/locale", headers=headers_b).json()["locale"] == "en"
    invalid = client.put("/v1/profile/preferences/locale", headers=headers_a, json={"locale": "xx", "translation_version": "v1"})
    assert invalid.status_code == 422


def test_missing_translation_report_endpoint(monkeypatch, tmp_path: Path):
    import apps.api.app.modules.profiles.router as profile_router
    repo = SqliteProfilePreferenceRepository(str(tmp_path / "reports.db"))
    monkeypatch.setattr(profile_router, "repository", repo)
    monkeypatch.setattr(profile_router, "service", ProfilePreferenceService(repo))
    client = TestClient(app)
    response = client.post(
        "/v1/profile/preferences/translation-reports",
        headers={"X-Luma-Student-Id": "student-a"},
        json={"locale": "ta-LK", "key": "focus.experimental", "translation_version": "v1"},
    )
    assert response.status_code == 200
    assert response.json() == {"saved": True}
