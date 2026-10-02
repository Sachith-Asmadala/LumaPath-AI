from __future__ import annotations

from datetime import date, datetime, timezone
import sqlite3
from uuid import uuid4

import pytest
from fastapi import HTTPException

from apps.api.app.core.security import AdministratorPrincipal
from apps.api.app.modules.analytics.repository import ActivityEvent, AnalyticsRepository
from apps.api.app.modules.institutional_analytics.definitions import METRIC_VERSION
from apps.api.app.modules.institutional_analytics.repository import InstitutionalAnalyticsRepository
from apps.api.app.modules.institutional_analytics.service import InstitutionalAnalyticsService

START = date(2026, 10, 1)
END = date(2026, 10, 7)
NOW = datetime(2026, 10, 3, 12, 0, tzinfo=timezone.utc)


def admin(institution: str = "inst-a", role: str = "programme_admin") -> AdministratorPrincipal:
    return AdministratorPrincipal(administrator_id="admin-1", institution_id=institution, role=role)


def make_service(tmp_path, *, threshold: int = 3):
    db = str(tmp_path / "institutional.db")
    repo = InstitutionalAnalyticsRepository(db, "test-secret")
    service = InstitutionalAnalyticsService(
        repo,
        privacy_threshold=threshold,
        retention_days=365,
        freshness_hours=24,
        purpose="student_support_programme_improvement",
    )
    return service, repo, db


def event(student: str, event_type: str, source_type: str, source_id: str, payload: dict, when: datetime = NOW) -> ActivityEvent:
    return ActivityEvent(
        id=str(uuid4()), student_id=student, idempotency_key=str(uuid4()), event_type=event_type,
        occurred_at=when.isoformat(), timezone="UTC", source_type=source_type, source_id=source_id,
        module="Software Engineering" if source_type == "task" else None,
        measurement_kind="measured", payload=payload, created_at=when.isoformat(),
    )


def seed_sources(db: str, students: list[str]) -> None:
    analytics = AnalyticsRepository(db)
    rows: list[ActivityEvent] = []
    readiness = [60, 70, 80]
    skill = [50, 60, 70]
    for index, student in enumerate(students):
        rows.extend([
            event(student, "task_observed", "task", f"task-{index}", {"status": "in-progress", "estimated_minutes": 120, "difficulty": 3, "progress": 25}),
            event(student, "readiness_observed", "readiness", "career-readiness", {"score": readiness[index], "breakdown": {}}),
            event(student, "skill_observed", "skill", "docker", {"status": "in-progress", "proficiency": skill[index]}),
            event(student, "productive_minutes_observed", "productivity", "cumulative", {"minutes_total": 90 + index}),
        ])
    # A small skill slice deliberately has only two contributors and must be suppressed.
    rows.extend([
        event(students[0], "skill_observed", "skill", "kubernetes", {"status": "in-progress", "proficiency": 40}),
        event(students[1], "skill_observed", "skill", "kubernetes", {"status": "in-progress", "proficiency": 55}),
    ])
    analytics.append_events(rows)

    with sqlite3.connect(db) as connection:
        connection.executescript(
            """
            CREATE TABLE IF NOT EXISTS internship_applications(student_id TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS cv_analysis_snapshots(student_id TEXT NOT NULL, analyzed_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS interview_sessions(student_id TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS guidance_requests(student_id TEXT NOT NULL, created_at TEXT NOT NULL);
            """
        )
        for student in students:
            connection.execute("INSERT INTO internship_applications(student_id,created_at) VALUES (?,?)", (student, NOW.isoformat()))
            connection.execute("INSERT INTO guidance_requests(student_id,created_at) VALUES (?,?)", (student, NOW.isoformat()))
        connection.commit()


def seed_cohort(repo: InstitutionalAnalyticsRepository, students: list[str], cohort_id: str = "se-y3") -> None:
    repo.upsert_cohort(
        cohort_id=cohort_id,
        institution_id="inst-a",
        name="Software Engineering — Year 3",
        definition={"programme": "Software Engineering", "year": 3, "intake": "2024"},
        student_ids=students,
    )


def metric(dashboard, key: str):
    return next(item for item in dashboard.metrics if item.key == key)


def test_ac1_documented_skill_readiness_workload_and_engagement_aggregates(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)

    service.refresh(admin(), "se-y3", START, END, "UTC")
    dashboard = service.dashboard(admin(), "se-y3", START, END, "UTC")

    assert metric(dashboard, "skill_gap_points").value == 12.5
    assert metric(dashboard, "readiness_average").value == 70.0
    assert metric(dashboard, "workload_hours").value == 2.0
    assert metric(dashboard, "engagement_rate").value == 100.0
    assert all(item.definition and item.formula for item in dashboard.metrics)
    assert all(item.sample_size == 3 for item in dashboard.metrics[:4])


def test_ac2_internship_preparation_and_support_demand_metrics_are_supported(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    for student in students:
        repo.add_support_signal(institution_id="inst-a", student_id=student, signal_type="workshop_interest", occurred_at=NOW, topic_key="docker")

    service.refresh(admin(), "se-y3", START, END, "UTC")
    dashboard = service.dashboard(admin(), "se-y3", START, END, "UTC")

    assert metric(dashboard, "internship_preparation_rate").value == 100.0
    assert metric(dashboard, "mentoring_demand_rate").value == 100.0
    assert metric(dashboard, "workshop_interest_rate").value == 100.0


def test_ac3_small_cohort_and_small_skill_slice_are_suppressed(tmp_path):
    service, repo, db = make_service(tmp_path, threshold=3)
    seed_cohort(repo, ["student-1", "student-2"], cohort_id="too-small")
    seed_sources(db, ["student-1", "student-2", "student-x"])

    service.refresh(admin(), "too-small", START, END, "UTC")
    small = service.dashboard(admin(), "too-small", START, END, "UTC")
    assert small.cohort.privacy_status == "below_threshold"
    assert all(item.suppressed and item.value is None and item.sample_size is None for item in small.metrics)
    assert "privacy threshold" in (small.message or "").lower()

    students = ["student-1", "student-2", "student-x"]
    seed_cohort(repo, students, cohort_id="eligible")
    service.refresh(admin(), "eligible", START, END, "UTC")
    eligible = service.dashboard(admin(), "eligible", START, END, "UTC")
    kubernetes = next(item for item in eligible.skill_slices if item.dimension_key == "kubernetes")
    docker = next(item for item in eligible.skill_slices if item.dimension_key == "docker")
    assert kubernetes.suppressed is True and kubernetes.value is None and kubernetes.sample_size is None
    assert docker.suppressed is False and docker.sample_size == 3


def test_ac4_cross_institution_and_role_boundaries_are_server_enforced(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    service.refresh(admin(), "se-y3", START, END, "UTC")

    with pytest.raises(HTTPException) as cross:
        service.dashboard(admin("inst-b"), "se-y3", START, END, "UTC")
    assert cross.value.status_code == 403

    viewer = admin(role="analytics_viewer")
    dashboard = service.dashboard(viewer, "se-y3", START, END, "UTC")
    assert dashboard.capabilities.can_export is False
    assert dashboard.capabilities.can_refresh is False
    with pytest.raises(HTTPException) as export_denied:
        service.export_csv(viewer, "se-y3", START, END, "UTC")
    assert export_denied.value.status_code == 403
    with pytest.raises(HTTPException) as refresh_denied:
        service.refresh(viewer, "se-y3", START, END, "UTC")
    assert refresh_denied.value.status_code == 403


def test_ac5_freshness_cohort_definition_and_metric_version_are_visible(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    refresh = service.refresh(admin(), "se-y3", START, END, "UTC")
    dashboard = service.dashboard(admin(), "se-y3", START, END, "UTC")

    assert dashboard.cohort.definition["programme"] == "Software Engineering"
    assert dashboard.cohort.metric_version == METRIC_VERSION
    assert dashboard.freshness.metric_version == METRIC_VERSION
    assert dashboard.freshness.refreshed_at is not None
    assert dashboard.freshness.source_latest_at is not None
    assert refresh.metric_version == METRIC_VERSION


def test_ac6_export_contains_only_aggregates_and_is_audited(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    service.refresh(admin(), "se-y3", START, END, "UTC")

    content = service.export_csv(admin(), "se-y3", START, END, "UTC")
    assert "skill_gap_points" in content
    assert "student-1" not in content and "student-2" not in content and "student-3" not in content
    assert "source_id" not in content
    assert any(row["action"] == "aggregate_export" for row in repo.audits("inst-a"))


def test_institutional_tables_do_not_persist_direct_student_identifiers(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-secret-a", "student-secret-b", "student-secret-c"]
    seed_cohort(repo, students)
    for student in students:
        repo.add_support_signal(institution_id="inst-a", student_id=student, signal_type="workshop_interest", occurred_at=NOW)

    with sqlite3.connect(db) as connection:
        for table in ["institutional_analytics_cohort_subjects", "institutional_analytics_support_signals", "institutional_analytics_aggregates"]:
            rows = connection.execute(f"SELECT * FROM {table}").fetchall()
            text = repr(rows)
            for student in students:
                assert student not in text


def test_unapproved_metric_is_not_materialised(tmp_path):
    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    repo.set_metric_approval("engagement_rate", False)

    service.refresh(admin(), "se-y3", START, END, "UTC")
    dashboard = service.dashboard(admin(), "se-y3", START, END, "UTC")
    assert "engagement_rate" not in {item.key for item in dashboard.metrics}


def test_http_boundary_requires_admin_claims_and_blocks_cross_institution(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from apps.api.app.main import app
    from apps.api.app.modules.institutional_analytics import router as institutional_router

    service, repo, db = make_service(tmp_path)
    students = ["student-1", "student-2", "student-3"]
    seed_cohort(repo, students)
    seed_sources(db, students)
    service.refresh(admin(), "se-y3", START, END, "UTC")
    monkeypatch.setattr(institutional_router, "_service", service)
    monkeypatch.setattr(institutional_router, "_repository", repo)
    from apps.api.tests.entitlement_helpers import grant_test_plan
    grant_test_plan(app, monkeypatch, db, "institution-account", "institution")
    client = TestClient(app)

    path = "/v1/institutional-analytics/dashboard?cohort_id=se-y3&start=2026-10-01&end=2026-10-07&timezone=UTC"
    missing = client.get(path)
    assert missing.status_code == 401
    own = client.get(path, headers={
        "X-Luma-Student-Id": "institution-account",
        "X-Luma-Admin-Id": "admin-http",
        "X-Luma-Admin-Role": "programme_admin",
        "X-Luma-Institution-Id": "inst-a",
    })
    assert own.status_code == 200 and own.json()["cohort"]["id"] == "se-y3"
    cross = client.get(path, headers={
        "X-Luma-Student-Id": "institution-account",
        "X-Luma-Admin-Id": "admin-http",
        "X-Luma-Admin-Role": "programme_admin",
        "X-Luma-Institution-Id": "inst-b",
    })
    assert cross.status_code == 403


def test_reidentification_guard_rejects_sub_week_period(tmp_path):
    service, repo, _ = make_service(tmp_path)
    seed_cohort(repo, ["student-1", "student-2", "student-3"])
    with pytest.raises(HTTPException) as exc:
        service.dashboard(admin(), "se-y3", date(2026, 10, 1), date(2026, 10, 3), "UTC")
    assert exc.value.status_code == 422
    assert "at least 7" in exc.value.detail


def test_cohort_cannot_be_reassigned_to_another_institution(tmp_path):
    _, repo, _ = make_service(tmp_path)
    seed_cohort(repo, ["student-1", "student-2", "student-3"])
    with pytest.raises(ValueError):
        repo.upsert_cohort(
            cohort_id="se-y3",
            institution_id="inst-b",
            name="Attempted transfer",
            definition={"programme": "Other"},
            student_ids=["student-9", "student-10", "student-11"],
        )


def test_suppressed_export_does_not_leak_small_counts_or_values(tmp_path):
    service, repo, db = make_service(tmp_path, threshold=3)
    seed_cohort(repo, ["student-1", "student-2"], cohort_id="small-export")
    seed_sources(db, ["student-1", "student-2", "student-x"])
    service.refresh(admin(), "small-export", START, END, "UTC")

    content = service.export_csv(admin(), "small-export", START, END, "UTC")
    lines = [line for line in content.splitlines() if line and not line.startswith("cohort_id")]
    assert lines
    for line in lines:
        columns = line.split(",")
        assert columns[6] == ""  # value
        assert columns[8] == ""  # sample_size
        assert columns[9] == "true"
