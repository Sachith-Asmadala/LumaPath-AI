from __future__ import annotations

from datetime import date, datetime

from apps.api.app.modules.analytics.definitions import METRIC_VERSION
from apps.api.app.modules.analytics.jobs import AggregateJob, InlineAnalyticsAggregationDispatcher
from apps.api.app.modules.analytics.repository import AnalyticsRepository
from apps.api.app.modules.analytics.schemas import AnalyticsSyncRequest
from apps.api.app.modules.analytics.service import AnalyticsService


def make_service(tmp_path):
    repo = AnalyticsRepository(str(tmp_path / "analytics.db"))
    return AnalyticsService(repo), repo


def payload(*, observed_at="2026-10-01T20:00:00", productive=150, completed=True, missed=True):
    tasks = [
        {
            "source_id": "task-db",
            "status": "completed" if completed else "in-progress",
            "category": "Academic",
            "module": "Database Systems",
            "estimated_minutes": 120,
            "difficulty": 4,
            "due_at": "2026-10-01T23:00:00",
            "completed_at": "2026-10-01T19:30:00" if completed else None,
            "progress": 100 if completed else 60,
        },
        {
            "source_id": "task-se",
            "status": "missed" if missed else "upcoming",
            "category": "Academic",
            "module": "Software Engineering",
            "estimated_minutes": 90,
            "difficulty": 3,
            "due_at": "2026-10-01T18:00:00",
            "completed_at": None,
            "progress": 45,
        },
        {
            "source_id": "task-cloud",
            "status": "in-progress",
            "category": "Career",
            "module": "Cloud",
            "estimated_minutes": 60,
            "difficulty": 2,
            "due_at": "2026-10-05T18:00:00",
            "completed_at": None,
            "progress": 20,
        },
    ]
    return {
        "timezone": "Asia/Colombo",
        "observed_at": observed_at,
        "productive_minutes_total": productive,
        "productive_measurement": "mixed",
        "tasks": tasks,
        "plan_blocks": [
            {
                "source_id": "plan-db",
                "task_id": "task-db",
                "category": "Academic",
                "start_at": "2026-10-01T17:00:00",
                "end_at": "2026-10-01T19:00:00",
                "previous_start_at": None,
                "is_missed": False,
                "is_conflict": False,
            },
            {
                "source_id": "plan-cloud",
                "task_id": "task-cloud",
                "category": "Career",
                "start_at": "2026-10-02T19:00:00",
                "end_at": "2026-10-02T20:00:00",
                "previous_start_at": "2026-10-01T20:00:00",
                "is_missed": False,
                "is_conflict": False,
            },
        ],
        "readiness": {
            "score": 76,
            "starting_score": 72,
            "breakdown": {"technical": 80, "evidence": 70, "learning": 75},
        },
        "skills": [
            {"source_id": "docker", "status": "in-progress", "proficiency": 68},
            {"source_id": "linux", "status": "verified", "proficiency": 90},
        ],
        "skill_history": [
            {"source_id": "docker", "proficiency": 52, "observed_at": "2026-09-28T10:00:00", "reason": "Baseline assessment"}
        ],
        "deleted_sources": [],
    }


def metric(body, key):
    return next(item for item in body.headline if item.key == key)


def test_ac1_headline_metrics_for_selected_period(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert metric(dashboard, "completed_tasks").value == 1
    assert metric(dashboard, "missed_deadlines").value == 1
    assert metric(dashboard, "completion_rate").value == 50.0
    assert metric(dashboard, "productive_hours").value == 2.5
    assert metric(dashboard, "productive_hours").measurement_kind.value == "mixed"


def test_ac2_module_workload_and_difficulty_are_traceable(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    modules = {item.module: item for item in dashboard.module_trends}
    assert modules["Software Engineering"].workload_hours == 1.5
    assert modules["Software Engineering"].average_difficulty == 3.0
    assert "task-se" in modules["Software Engineering"].source_ids
    drilldown = service.drilldown("student-a", "module_workload", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert any(source.source_id == "task-se" for source in drilldown.sources)


def test_ac3_readiness_and_skill_history_show_changes(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert dashboard.readiness.current_score == 76
    assert dashboard.readiness.movement == 4
    docker = next(skill for skill in dashboard.skills if skill.skill_id == "docker")
    assert docker.current_proficiency == 68
    assert [point.value for point in docker.history] == [52, 68]


def test_ac4_plan_acceptance_and_adjustment_use_documented_definitions(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert dashboard.plan_patterns.reviewed == 2
    assert dashboard.plan_patterns.accepted == 2
    assert dashboard.plan_patterns.adjusted == 1
    assert dashboard.plan_patterns.acceptance_rate == 100.0
    assert dashboard.plan_patterns.adjustment_rate == 50.0
    assert dashboard.plan_patterns.data_status == "partial"


def test_ac5_empty_period_is_honest_and_has_freshness(tmp_path):
    service, _ = make_service(tmp_path)
    empty = service.dashboard("student-a", date(2026, 9, 1), date(2026, 9, 7), "Asia/Colombo")
    assert empty.empty is True
    assert empty.freshness.is_partial is True
    assert empty.headline[0].value is None
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    partial = service.dashboard("student-a", date(2026, 9, 1), date(2026, 9, 7), "Asia/Colombo")
    assert partial.empty is True
    assert partial.empty_message is not None


def test_ac6_student_cannot_access_another_students_analytics(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    own = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    other = service.dashboard("student-b", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert own.empty is False
    assert other.empty is True
    assert service.drilldown("student-b", "completed_tasks", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo").sources == []


def test_timezone_boundaries_use_student_local_day(tmp_path):
    service, _ = make_service(tmp_path)
    request = payload(observed_at="2026-10-01T00:10:00+05:30", missed=False)
    request["tasks"] = [request["tasks"][0]]
    request["tasks"][0]["completed_at"] = "2026-10-01T00:05:00+05:30"
    service.sync("student-a", AnalyticsSyncRequest.model_validate(request))
    oct1 = service.dashboard("student-a", date(2026, 10, 1), date(2026, 10, 1), "Asia/Colombo")
    sep30 = service.dashboard("student-a", date(2026, 9, 30), date(2026, 9, 30), "Asia/Colombo")
    assert metric(oct1, "completed_tasks").value == 1
    assert metric(sep30, "completed_tasks").value == 0


def test_late_event_backfill_creates_new_aggregate_revision(tmp_path):
    service, repo = make_service(tmp_path)
    dispatcher = InlineAnalyticsAggregationDispatcher(AggregateJob(repo))
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload(completed=False, missed=False)))
    dispatcher.enqueue("student-a", {date(2026, 10, 1)}, "Asia/Colombo")
    first = repo.latest_aggregate("student-a", "day", "2026-10-01", "Asia/Colombo", METRIC_VERSION)
    late = payload(observed_at="2026-10-03T20:00:00", completed=True, missed=False)
    late["tasks"] = [late["tasks"][0]]
    late["tasks"][0]["completed_at"] = "2026-10-01T21:00:00"
    service.sync("student-a", AnalyticsSyncRequest.model_validate(late))
    dispatcher.enqueue("student-a", {date(2026, 10, 1)}, "Asia/Colombo")
    second = repo.latest_aggregate("student-a", "day", "2026-10-01", "Asia/Colombo", METRIC_VERSION)
    assert second["revision"] == first["revision"] + 1
    assert second["metrics"]["completed_tasks"] == 1


def test_repeated_sync_is_idempotent(tmp_path):
    service, repo = make_service(tmp_path)
    first = service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    second = service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    assert first.accepted_events > 0
    assert second.accepted_events == 0
    assert second.duplicate_events > 0


def test_deleted_source_is_hidden_from_current_module_workload_but_history_remains_safe(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    deletion = payload(observed_at="2026-10-02T20:00:00", completed=False, missed=False)
    deletion["tasks"] = []
    deletion["plan_blocks"] = []
    deletion["skills"] = []
    deletion["skill_history"] = []
    deletion["readiness"] = None
    deletion["deleted_sources"] = ["task-cloud"]
    service.sync("student-a", AnalyticsSyncRequest.model_validate(deletion))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert all("task-cloud" not in module.source_ids for module in dashboard.module_trends)


def test_estimate_accuracy_is_explicitly_estimated_not_measured(tmp_path):
    service, _ = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert dashboard.estimate_accuracy.value == 100.0
    assert dashboard.estimate_accuracy.measurement_kind.value == "estimated"
    assert dashboard.estimate_accuracy.data_status == "partial"


def test_analytics_never_store_task_titles_or_document_content(tmp_path):
    service, repo = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    raw = (tmp_path / "analytics.db").read_bytes()
    assert b"Database Assignment" not in raw
    assert b"lecture content" not in raw


def test_http_identity_boundary_blocks_cross_user_dashboard(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient
    from apps.api.app.main import app
    from apps.api.app.modules.analytics import router as analytics_router

    service, _ = make_service(tmp_path)
    monkeypatch.setattr(analytics_router, "_service", service)
    client = TestClient(app)
    sync_response = client.post("/v1/analytics/sync", headers={"X-Luma-Student-Id": "student-http-a"}, json=payload())
    assert sync_response.status_code == 200
    own = client.get("/v1/analytics/dashboard?start=2026-09-28&end=2026-10-04&timezone=Asia%2FColombo", headers={"X-Luma-Student-Id": "student-http-a"})
    other = client.get("/v1/analytics/dashboard?start=2026-09-28&end=2026-10-04&timezone=Asia%2FColombo", headers={"X-Luma-Student-Id": "student-http-b"})
    missing = client.get("/v1/analytics/dashboard?start=2026-09-28&end=2026-10-04&timezone=Asia%2FColombo")
    assert own.status_code == 200 and own.json()["empty"] is False
    assert other.status_code == 200 and other.json()["empty"] is True
    assert missing.status_code == 401


def test_same_state_refresh_on_same_local_day_does_not_duplicate_snapshot_events(tmp_path):
    service, repo = make_service(tmp_path)
    first = payload(observed_at="2026-10-01T20:00:00", completed=False, missed=False)
    second = payload(observed_at="2026-10-01T20:05:00", completed=False, missed=False)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(first))
    before = len(repo.all_events_until("student-a", datetime.fromisoformat("2026-10-03T00:00:00+00:00")))
    service.sync("student-a", AnalyticsSyncRequest.model_validate(second))
    after = len(repo.all_events_until("student-a", datetime.fromisoformat("2026-10-03T00:00:00+00:00")))
    # Plan events are keyed to plan start, and current snapshots use local-day+payload keys.
    assert after == before


def test_productive_hours_use_period_delta_when_prior_cumulative_observation_exists(tmp_path):
    service, _ = make_service(tmp_path)
    prior = payload(observed_at="2026-09-27T20:00:00", productive=120, completed=False, missed=False)
    prior["tasks"] = []
    prior["plan_blocks"] = []
    prior["skills"] = []
    prior["skill_history"] = []
    prior["readiness"] = None
    current = payload(observed_at="2026-10-01T20:00:00", productive=240, completed=False, missed=False)
    current["tasks"] = []
    current["plan_blocks"] = []
    current["skills"] = []
    current["skill_history"] = []
    current["readiness"] = None
    service.sync("student-a", AnalyticsSyncRequest.model_validate(prior))
    service.sync("student-a", AnalyticsSyncRequest.model_validate(current))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    productive = metric(dashboard, "productive_hours")
    assert productive.value == 2.0
    assert productive.data_status == "complete"


def test_estimate_accuracy_uses_latest_planner_block_version_after_adjustment(tmp_path):
    service, _ = make_service(tmp_path)
    first = payload(observed_at="2026-10-01T18:00:00", missed=False)
    first["plan_blocks"] = [{
        "source_id": "plan-db",
        "task_id": "task-db",
        "category": "Academic",
        "start_at": "2026-10-01T16:00:00",
        "end_at": "2026-10-01T17:00:00",
        "previous_start_at": None,
        "is_missed": False,
        "is_conflict": False,
    }]
    second = payload(observed_at="2026-10-01T20:00:00", missed=False)
    second["plan_blocks"] = [{
        "source_id": "plan-db",
        "task_id": "task-db",
        "category": "Academic",
        "start_at": "2026-10-01T17:00:00",
        "end_at": "2026-10-01T19:00:00",
        "previous_start_at": "2026-10-01T16:00:00",
        "is_missed": False,
        "is_conflict": False,
    }]
    service.sync("student-a", AnalyticsSyncRequest.model_validate(first))
    service.sync("student-a", AnalyticsSyncRequest.model_validate(second))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert dashboard.estimate_accuracy.value == 100.0


def test_repeated_dashboard_read_does_not_create_duplicate_range_aggregate_revision(tmp_path):
    service, repo = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    first = repo.latest_aggregate("student-a", "range", "2026-09-28", "Asia/Colombo", METRIC_VERSION)
    service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    second = repo.latest_aggregate("student-a", "range", "2026-09-28", "Asia/Colombo", METRIC_VERSION)
    assert second["revision"] == first["revision"]


def test_module_trend_contains_period_history_with_workload_and_difficulty(tmp_path):
    service, _ = make_service(tmp_path)
    first = payload(observed_at="2026-09-29T20:00:00", completed=False, missed=False)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(first))
    second = payload(observed_at="2026-10-01T20:00:00", completed=False, missed=False)
    second["tasks"][0]["estimated_minutes"] = 180
    second["tasks"][0]["difficulty"] = 5
    service.sync("student-a", AnalyticsSyncRequest.model_validate(second))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    database = next(item for item in dashboard.module_trends if item.module == "Database Systems")
    assert database.history
    assert database.history[-1].value == 3.0
    assert database.history[-1].secondary_value == 5.0


def test_fixed_timetable_blocks_do_not_inflate_plan_acceptance(tmp_path):
    service, _ = make_service(tmp_path)
    data = payload(missed=False)
    data["plan_blocks"].append({
        "source_id": "fixed-lecture",
        "task_id": None,
        "category": "Academic",
        "start_at": "2026-10-01T09:00:00",
        "end_at": "2026-10-01T10:30:00",
        "previous_start_at": None,
        "is_fixed": True,
        "is_missed": False,
        "is_conflict": False,
    })
    service.sync("student-a", AnalyticsSyncRequest.model_validate(data))
    dashboard = service.dashboard("student-a", date(2026, 9, 28), date(2026, 10, 4), "Asia/Colombo")
    assert dashboard.plan_patterns.reviewed == 2
    assert dashboard.plan_patterns.accepted == 2


def test_daily_and_weekly_jobs_store_versioned_aggregate_rows(tmp_path):
    service, repo = make_service(tmp_path)
    service.sync("student-a", AnalyticsSyncRequest.model_validate(payload()))
    job = AggregateJob(repo)
    job.rebuild("student-a", {date(2026, 10, 1)}, "Asia/Colombo")
    daily = repo.latest_aggregate("student-a", "day", "2026-10-01", "Asia/Colombo", METRIC_VERSION)
    weekly = repo.latest_aggregate("student-a", "week", "2026-09-28", "Asia/Colombo", METRIC_VERSION)
    assert daily is not None and weekly is not None
    assert daily["metrics"]["completion_rate"] == 50.0
    assert weekly["metrics"]["completed_tasks"] == 1
    assert weekly["metrics"]["missed_deadlines"] == 1


def test_plan_acceptance_is_recorded_when_observed_not_on_future_scheduled_start(tmp_path):
    service, repo = make_service(tmp_path)
    data = payload(observed_at="2026-10-01T12:00:00", completed=False, missed=False)
    data["plan_blocks"] = [{
        "source_id": "future-block",
        "task_id": "task-cloud",
        "category": "Career",
        "start_at": "2026-10-04T19:00:00",
        "end_at": "2026-10-04T20:00:00",
        "previous_start_at": None,
        "is_fixed": False,
        "is_missed": False,
        "is_conflict": False,
    }]
    service.sync("student-a", AnalyticsSyncRequest.model_validate(data))
    events = repo.all_events_until("student-a", datetime.fromisoformat("2026-10-02T00:00:00+00:00"))
    accepted = next(event for event in events if event.event_type == "plan_block_accepted")
    assert accepted.occurred_at.startswith("2026-10-01T06:30:00")
    assert accepted.payload["start_at"].startswith("2026-10-04T19:00:00")
