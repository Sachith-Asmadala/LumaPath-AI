from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Protocol

from .definitions import METRIC_VERSION
from .repository import AnalyticsRepository
from .timeutils import range_utc, week_start


class AnalyticsAggregationDispatcher(Protocol):
    def enqueue(self, student_id: str, affected_dates: set[date], timezone_name: str) -> None: ...


@dataclass(slots=True)
class AggregateJob:
    repository: AnalyticsRepository

    def rebuild(self, student_id: str, affected_dates: set[date], timezone_name: str) -> None:
        for day in sorted(affected_dates):
            self._build(student_id, "day", day, day, timezone_name)
            monday = week_start(day)
            self._build(student_id, "week", monday, monday + timedelta(days=6), timezone_name)

    def _build(self, student_id: str, grain: str, start: date, end: date, timezone_name: str) -> None:
        start_utc, end_utc = range_utc(start, end, timezone_name)
        events = self.repository.events(student_id, start_utc, end_utc)
        completed = len({event.source_id for event in events if event.event_type == "task_completed"})
        missed = len({event.source_id for event in events if event.event_type == "task_missed"})
        terminal = completed + missed
        productive = [event for event in events if event.event_type == "productive_minutes_observed"]
        readiness = [event for event in events if event.event_type == "readiness_observed"]
        metrics = {
            "completed_tasks": completed,
            "missed_deadlines": missed,
            "completion_rate": round(completed / terminal * 100, 1) if terminal else None,
            "productive_minutes_latest": int(productive[-1].payload.get("minutes_total", 0)) if productive else None,
            "readiness_score_latest": int(readiness[-1].payload.get("score", 0)) if readiness else None,
            "accepted_blocks": len({event.source_id for event in events if event.event_type == "plan_block_accepted"}),
            "adjusted_blocks": len({event.source_id for event in events if event.event_type == "plan_block_adjusted"}),
        }
        self.repository.append_aggregate(
            student_id=student_id, grain=grain, period_start=start.isoformat(), period_end=end.isoformat(),
            timezone_name=timezone_name, metric_version=METRIC_VERSION, metrics=metrics,
            source_event_count=len(events),
        )


class ThreadedAnalyticsAggregationDispatcher:
    def __init__(self, job: AggregateJob, max_workers: int = 1):
        self.job = job
        self.executor = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix="lumapath-analytics")

    def enqueue(self, student_id: str, affected_dates: set[date], timezone_name: str) -> None:
        if affected_dates:
            self.executor.submit(self.job.rebuild, student_id, set(affected_dates), timezone_name)


class InlineAnalyticsAggregationDispatcher:
    def __init__(self, job: AggregateJob):
        self.job = job

    def enqueue(self, student_id: str, affected_dates: set[date], timezone_name: str) -> None:
        self.job.rebuild(student_id, affected_dates, timezone_name)
