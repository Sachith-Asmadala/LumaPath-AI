from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, status

from .definitions import METRIC_DEFINITIONS, METRIC_VERSION
from .repository import ActivityEvent, AnalyticsRepository
from .schemas import (
    AnalyticsDashboardResponse,
    AnalyticsSyncRequest,
    Freshness,
    MeasurementKind,
    MetricDrilldownResponse,
    MetricValue,
    ModuleTrend,
    PlanPattern,
    ReadinessTrend,
    SkillTrend,
    SourceReference,
    SyncResponse,
    TrendPoint,
)
from .timeutils import aware, local_date, range_utc, zone


class AnalyticsService:
    def __init__(self, repository: AnalyticsRepository):
        self.repository = repository

    def sync(self, student_id: str, request: AnalyticsSyncRequest) -> SyncResponse:
        # Validate timezone before writing anything.
        zone(request.timezone)
        created_at = datetime.now(timezone.utc).isoformat()
        events: list[ActivityEvent] = []

        def append(
            event_type: str,
            occurred_at: datetime,
            source_type: str,
            source_id: str,
            payload: dict[str, Any],
            measurement: MeasurementKind = MeasurementKind.measured,
            module: str | None = None,
            stable_suffix: str = "",
        ) -> None:
            occurred = aware(occurred_at, request.timezone).astimezone(timezone.utc).isoformat()
            canonical = json.dumps(payload, separators=(",", ":"), sort_keys=True)
            occurrence_key = stable_suffix or occurred
            key_material = f"{event_type}|{source_type}|{source_id}|{occurrence_key}|{canonical}"
            key = hashlib.sha256(key_material.encode("utf-8")).hexdigest()
            events.append(ActivityEvent(
                id=str(uuid4()), student_id=student_id, idempotency_key=key, event_type=event_type,
                occurred_at=occurred, timezone=request.timezone, source_type=source_type, source_id=source_id,
                module=module, measurement_kind=measurement.value, payload=payload, created_at=created_at,
            ))

        for task in request.tasks:
            payload = {
                "status": task.status,
                "category": task.category,
                "estimated_minutes": task.estimated_minutes,
                "difficulty": task.difficulty,
                "progress": task.progress,
                "due_at": task.due_at.isoformat() if task.due_at else None,
                "completed_at": task.completed_at.isoformat() if task.completed_at else None,
            }
            append("task_observed", request.observed_at, "task", task.source_id, payload, module=task.module, stable_suffix=local_date(request.observed_at, request.timezone).isoformat())
            if task.completed_at:
                append("task_completed", task.completed_at, "task", task.source_id, {
                    "estimated_minutes": task.estimated_minutes,
                    "difficulty": task.difficulty,
                    "category": task.category,
                }, module=task.module)
            if task.status == "missed":
                occurred = task.due_at or request.observed_at
                append("task_missed", occurred, "task", task.source_id, {
                    "estimated_minutes": task.estimated_minutes,
                    "difficulty": task.difficulty,
                    "category": task.category,
                }, module=task.module)

        for block in request.plan_blocks:
            duration = max(0, round((aware(block.end_at, request.timezone) - aware(block.start_at, request.timezone)).total_seconds() / 60))
            payload = {
                "task_id": block.task_id,
                "category": block.category,
                "start_at": block.start_at.isoformat(),
                "end_at": block.end_at.isoformat(),
                "previous_start_at": block.previous_start_at.isoformat() if block.previous_start_at else None,
                "duration_minutes": duration,
                "is_fixed": block.is_fixed,
                "is_missed": block.is_missed,
                "is_conflict": block.is_conflict,
            }
            if not block.is_fixed:
                plan_version = f"{block.start_at.isoformat()}|{block.previous_start_at.isoformat() if block.previous_start_at else ''}"
                append("plan_block_reviewed", request.observed_at, "plan_block", block.source_id, payload, MeasurementKind.estimated, stable_suffix=plan_version)
                append("plan_block_accepted", request.observed_at, "plan_block", block.source_id, payload, MeasurementKind.estimated, stable_suffix=plan_version)
                if block.previous_start_at and block.previous_start_at != block.start_at:
                    append("plan_block_adjusted", request.observed_at, "plan_block", block.source_id, payload, MeasurementKind.estimated, stable_suffix=plan_version)

        append(
            "productive_minutes_observed",
            request.observed_at,
            "productivity",
            "cumulative",
            {"minutes_total": request.productive_minutes_total},
            request.productive_measurement,
            stable_suffix=local_date(request.observed_at, request.timezone).isoformat(),
        )

        if request.readiness:
            if request.readiness.starting_score is not None:
                local_observed = aware(request.observed_at, request.timezone)
                start_of_week = (local_observed - timedelta(days=local_observed.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
                append(
                    "readiness_observed",
                    start_of_week,
                    "readiness",
                    "career-readiness",
                    {"score": request.readiness.starting_score, "breakdown": {}, "reason": "Start-of-week recorded baseline"},
                stable_suffix=start_of_week.date().isoformat(),
                )
            append(
                "readiness_observed",
                request.observed_at,
                "readiness",
                "career-readiness",
                {
                    "score": request.readiness.score,
                    "breakdown": request.readiness.breakdown,
                    "reason": "Current Career Readiness snapshot",
                },
                stable_suffix=local_date(request.observed_at, request.timezone).isoformat(),
            )

        for skill in request.skills:
            append(
                "skill_observed",
                request.observed_at,
                "skill",
                skill.source_id,
                {"status": skill.status, "proficiency": skill.proficiency, "reason": "Current skill snapshot"},
                stable_suffix=local_date(request.observed_at, request.timezone).isoformat(),
            )
        for history in request.skill_history:
            append(
                "skill_observed",
                history.observed_at,
                "skill",
                history.source_id,
                {"status": "assessment", "proficiency": history.proficiency, "reason": history.reason},
            )

        for source in request.deleted_sources:
            append("source_deleted", request.observed_at, "source", source, {"deleted": True})

        accepted, duplicates = self.repository.append_events(events)
        return SyncResponse(
            accepted_events=accepted,
            duplicate_events=duplicates,
            aggregation_queued=accepted > 0,
            latest_event_at=self.repository.latest_event_at(student_id),
        )

    def dashboard(self, student_id: str, start: date, end: date, timezone_name: str) -> AnalyticsDashboardResponse:
        start_utc, end_utc = range_utc(start, end, timezone_name)
        events = self.repository.events(student_id, start_utc, end_utc)
        historical = self.repository.all_events_until(student_id, end_utc)
        deleted = self._deleted_sources(historical)
        latest_event = self.repository.latest_event_at(student_id)

        if not historical:
            freshness = Freshness(
                latest_event_at=None, aggregate_computed_at=None, event_count=0, is_partial=True,
                note="No analytics events are available for this student yet.",
            )
            return AnalyticsDashboardResponse(
                student_id=student_id, start_date=start, end_date=end, timezone=timezone_name,
                metric_version=METRIC_VERSION, headline=self._empty_headline(), daily_completion=[], module_trends=[],
                estimate_accuracy=self._metric("estimate_accuracy", None, "%", MeasurementKind.estimated, "empty", 0),
                readiness=ReadinessTrend(current_score=None, movement=None), skills=[],
                plan_patterns=PlanPattern(reviewed=0, accepted=0, adjusted=0, acceptance_rate=None, adjustment_rate=None, data_status="empty", definition=METRIC_DEFINITIONS["plan_acceptance"][0]),
                freshness=freshness, empty=True,
                empty_message="No recorded activity is available for this period yet. Complete or plan work to build your private trend history.",
            )

        completed_events = self._distinct_sources(events, "task_completed")
        missed_events = self._distinct_sources(events, "task_missed")
        completed = len(completed_events)
        missed = len(missed_events)
        terminal = completed + missed
        completion_rate = round(completed / terminal * 100, 1) if terminal else None

        product_events = [event for event in events if event.event_type == "productive_minutes_observed"]
        product_latest = product_events[-1] if product_events else None
        product_before = [event for event in historical if event.event_type == "productive_minutes_observed" and event.occurred_at < start_utc.isoformat()]
        product_baseline = product_before[-1] if product_before else None
        productive_hours = None
        if product_latest:
            latest_total = int(product_latest.payload.get("minutes_total", 0))
            baseline_total = int(product_baseline.payload.get("minutes_total", 0)) if product_baseline else 0
            productive_hours = round(max(0, latest_total - baseline_total) / 60, 1)
        product_kind = MeasurementKind(product_latest.measurement_kind) if product_latest else MeasurementKind.mixed
        productive_status = "complete" if product_latest and product_baseline else "partial"

        headline = [
            self._metric("completed_tasks", completed, "tasks", MeasurementKind.measured, "complete" if completed else "partial", completed),
            self._metric("missed_deadlines", missed, "tasks", MeasurementKind.measured, "complete" if events else "partial", missed),
            self._metric("completion_rate", completion_rate, "%", MeasurementKind.measured, "complete" if terminal else "partial", terminal),
            self._metric("productive_hours", productive_hours, "h", product_kind, productive_status, len(product_events)),
        ]

        daily_completion = self._daily_completion(events, start, end, timezone_name)
        module_trends = self._module_trends(historical, start, end, end_utc, timezone_name, deleted)
        estimate_accuracy = self._estimate_accuracy(historical, start_utc, end_utc, deleted)
        readiness = self._readiness(historical, start_utc, end_utc, timezone_name)
        skills = self._skills(historical, start_utc, end_utc, timezone_name, deleted)
        plan_patterns = self._plan_patterns(events)

        metrics_snapshot = {
            "completed_tasks": completed,
            "missed_deadlines": missed,
            "completion_rate": completion_rate,
            "productive_hours": productive_hours,
            "module_count": len(module_trends),
            "readiness": readiness.current_score,
            "plan_accepted": plan_patterns.accepted,
            "plan_adjusted": plan_patterns.adjusted,
        }
        aggregate = self.repository.latest_aggregate(student_id, "range", start.isoformat(), timezone_name, METRIC_VERSION)
        if not aggregate or aggregate["metrics"] != metrics_snapshot or aggregate["source_event_count"] != len(events):
            self.repository.append_aggregate(
                student_id=student_id, grain="range", period_start=start.isoformat(), period_end=end.isoformat(),
                timezone_name=timezone_name, metric_version=METRIC_VERSION, metrics=metrics_snapshot,
                source_event_count=len(events),
            )
            aggregate = self.repository.latest_aggregate(student_id, "range", start.isoformat(), timezone_name, METRIC_VERSION)
        aggregate_time = datetime.fromisoformat(aggregate["computed_at"]) if aggregate else None
        is_partial = any(item.data_status != "complete" for item in headline) or estimate_accuracy.data_status != "complete" or plan_patterns.data_status != "complete"
        freshness = Freshness(
            latest_event_at=latest_event,
            aggregate_computed_at=aggregate_time,
            event_count=len(events),
            is_partial=is_partial,
            note="Fresh from append-only private activity events." if not is_partial else "Some metrics are partial or estimated; labels explain where coverage is incomplete.",
        )
        return AnalyticsDashboardResponse(
            student_id=student_id, start_date=start, end_date=end, timezone=timezone_name,
            metric_version=METRIC_VERSION, headline=headline, daily_completion=daily_completion,
            module_trends=module_trends, estimate_accuracy=estimate_accuracy, readiness=readiness,
            skills=skills, plan_patterns=plan_patterns, freshness=freshness,
            empty=len(events) == 0,
            empty_message="No events fall inside this selected period. Historical source state may still appear where explicitly labelled." if len(events) == 0 else None,
        )

    def drilldown(self, student_id: str, metric: str, start: date, end: date, timezone_name: str) -> MetricDrilldownResponse:
        if metric not in METRIC_DEFINITIONS:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown analytics metric.")
        start_utc, end_utc = range_utc(start, end, timezone_name)
        range_events = self.repository.events(student_id, start_utc, end_utc)
        historical = self.repository.all_events_until(student_id, end_utc)
        deleted = self._deleted_sources(historical)
        event_types = {
            "completed_tasks": {"task_completed"},
            "missed_deadlines": {"task_missed"},
            "completion_rate": {"task_completed", "task_missed"},
            "productive_hours": {"productive_minutes_observed"},
            "module_workload": {"task_observed"},
            "difficulty": {"task_observed"},
            "estimate_accuracy": {"task_completed", "plan_block_accepted"},
            "readiness": {"readiness_observed"},
            "skill_progress": {"skill_observed"},
            "plan_acceptance": {"plan_block_reviewed", "plan_block_accepted"},
            "plan_adjustment": {"plan_block_adjusted"},
        }[metric]
        candidates = historical if metric in {"module_workload", "difficulty", "estimate_accuracy", "readiness", "skill_progress"} else range_events
        sources: list[SourceReference] = []
        seen: set[tuple[str, str, str]] = set()
        for event in reversed(candidates):
            if event.event_type not in event_types:
                continue
            key = (event.event_type, event.source_type, event.source_id)
            if key in seen:
                continue
            seen.add(key)
            values = self._safe_source_values(event)
            sources.append(SourceReference(
                source_type=event.source_type,
                source_id=event.source_id,
                occurred_at=datetime.fromisoformat(event.occurred_at),
                module=event.module,
                measurement_kind=MeasurementKind(event.measurement_kind),
                source_available=event.source_id not in deleted,
                values=values,
            ))
        definition, explanation = METRIC_DEFINITIONS[metric]
        latest = self.repository.latest_event_at(student_id)
        return MetricDrilldownResponse(
            metric=metric, start_date=start, end_date=end, timezone=timezone_name,
            definition=definition, explanation=explanation,
            sources=sources[:250],
            freshness=Freshness(
                latest_event_at=latest, aggregate_computed_at=None, event_count=len(range_events),
                is_partial=not bool(sources),
                note="Source records are private to this student. Deleted sources are shown as unavailable without exposing their content.",
            ),
        )

    def _metric(self, key: str, value: float | int | None, unit: str | None, measurement: MeasurementKind, data_status: str, source_count: int) -> MetricValue:
        definition, explanation = METRIC_DEFINITIONS[key]
        labels = {
            "completed_tasks": "Completed tasks", "missed_deadlines": "Missed deadlines",
            "completion_rate": "Completion rate", "productive_hours": "Productive hours",
            "estimate_accuracy": "Estimate accuracy",
        }
        return MetricValue(
            key=key, label=labels.get(key, key.replace("_", " ").title()), value=value, unit=unit,
            measurement_kind=measurement, data_status=data_status, definition=definition,
            explanation=explanation, source_count=source_count,
        )

    def _empty_headline(self) -> list[MetricValue]:
        return [
            self._metric("completed_tasks", None, "tasks", MeasurementKind.measured, "empty", 0),
            self._metric("missed_deadlines", None, "tasks", MeasurementKind.measured, "empty", 0),
            self._metric("completion_rate", None, "%", MeasurementKind.measured, "empty", 0),
            self._metric("productive_hours", None, "h", MeasurementKind.mixed, "empty", 0),
        ]

    @staticmethod
    def _distinct_sources(events: list[ActivityEvent], event_type: str) -> dict[str, ActivityEvent]:
        result: dict[str, ActivityEvent] = {}
        for event in events:
            if event.event_type == event_type:
                result[event.source_id] = event
        return result

    def _daily_completion(self, events: list[ActivityEvent], start: date, end: date, timezone_name: str) -> list[TrendPoint]:
        counts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
        for event in events:
            day = datetime.fromisoformat(event.occurred_at).astimezone(zone(timezone_name)).date().isoformat()
            if event.event_type == "task_completed": counts[day][0] += 1
            if event.event_type == "task_missed": counts[day][1] += 1
        points: list[TrendPoint] = []
        day = start
        while day <= end:
            completed, missed = counts[day.isoformat()]
            points.append(TrendPoint(period=day.isoformat(), value=completed, secondary_value=missed, measurement_kind=MeasurementKind.measured))
            day += timedelta(days=1)
        return points

    def _latest_by_source(self, events: list[ActivityEvent], event_type: str) -> dict[str, ActivityEvent]:
        latest: dict[str, ActivityEvent] = {}
        for event in events:
            if event.event_type == event_type:
                latest[event.source_id] = event
        return latest

    def _module_trends(self, historical: list[ActivityEvent], start: date, end: date, end_utc: datetime, timezone_name: str, deleted: set[str]) -> list[ModuleTrend]:
        task_events = [event for event in historical if event.event_type == "task_observed" and event.source_id not in deleted]
        latest_tasks = self._latest_by_source(task_events, "task_observed")
        grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"minutes": 0, "difficulties": [], "sources": []})
        for source_id, event in latest_tasks.items():
            if event.payload.get("status") == "completed":
                continue
            module = event.module or event.payload.get("category") or "Unassigned"
            grouped[module]["minutes"] += int(event.payload.get("estimated_minutes", 0))
            grouped[module]["difficulties"].append(int(event.payload.get("difficulty", 0)))
            grouped[module]["sources"].append(source_id)

        history_by_module: dict[str, list[TrendPoint]] = defaultdict(list)
        cursor = start
        latest_state: dict[str, ActivityEvent] = {}
        event_index = 0
        task_events.sort(key=lambda event: event.occurred_at)
        while cursor <= end:
            day_end = datetime.combine(cursor + timedelta(days=1), datetime.min.time(), tzinfo=zone(timezone_name)).astimezone(timezone.utc).isoformat()
            while event_index < len(task_events) and task_events[event_index].occurred_at < day_end:
                event = task_events[event_index]
                latest_state[event.source_id] = event
                event_index += 1
            day_groups: dict[str, dict[str, Any]] = defaultdict(lambda: {"minutes": 0, "difficulties": []})
            for event in latest_state.values():
                if event.payload.get("status") == "completed":
                    continue
                module = event.module or event.payload.get("category") or "Unassigned"
                day_groups[module]["minutes"] += int(event.payload.get("estimated_minutes", 0))
                day_groups[module]["difficulties"].append(int(event.payload.get("difficulty", 0)))
            for module, values in day_groups.items():
                difficulties = values["difficulties"]
                history_by_module[module].append(TrendPoint(
                    period=cursor.isoformat(),
                    value=round(values["minutes"] / 60, 1),
                    secondary_value=round(sum(difficulties) / len(difficulties), 1) if difficulties else None,
                    measurement_kind=MeasurementKind.estimated,
                ))
            cursor += timedelta(days=1)

        rows = []
        for module, values in grouped.items():
            difficulty = round(sum(values["difficulties"]) / len(values["difficulties"]), 1) if values["difficulties"] else None
            rows.append(ModuleTrend(
                module=module,
                workload_hours=round(values["minutes"] / 60, 1),
                average_difficulty=difficulty,
                task_count=len(values["sources"]), source_ids=values["sources"],
                history=history_by_module.get(module, []),
            ))
        return sorted(rows, key=lambda row: (-row.workload_hours, row.module))

    def _estimate_accuracy(self, historical: list[ActivityEvent], start_utc: datetime, end_utc: datetime, deleted: set[str]) -> MetricValue:
        completed = {e.source_id: e for e in historical if e.event_type == "task_completed" and start_utc.isoformat() <= e.occurred_at < end_utc.isoformat() and e.source_id not in deleted}
        plan_by_task: dict[str, int] = defaultdict(int)
        latest_blocks = self._latest_by_source(historical, "plan_block_accepted")
        for event in latest_blocks.values():
            task_id = event.payload.get("task_id")
            if task_id:
                plan_by_task[str(task_id)] += int(event.payload.get("duration_minutes", 0))
        scores = []
        for task_id, event in completed.items():
            estimate = int(event.payload.get("estimated_minutes", 0))
            scheduled = plan_by_task.get(task_id, 0)
            if estimate > 0 and scheduled > 0:
                scores.append(max(0.0, 100 - abs(scheduled - estimate) / estimate * 100))
        value = round(sum(scores) / len(scores), 1) if scores else None
        return self._metric("estimate_accuracy", value, "%", MeasurementKind.estimated, "partial" if scores else "empty", len(scores))

    def _readiness(self, historical: list[ActivityEvent], start_utc: datetime, end_utc: datetime, timezone_name: str) -> ReadinessTrend:
        rows = [e for e in historical if e.event_type == "readiness_observed" and e.occurred_at < end_utc.isoformat()]
        if not rows:
            return ReadinessTrend(current_score=None, movement=None)
        history = [TrendPoint(
            period=datetime.fromisoformat(event.occurred_at).astimezone(zone(timezone_name)).isoformat(),
            value=int(event.payload.get("score", 0)), measurement_kind=MeasurementKind.measured,
        ) for event in rows]
        in_range = [event for event in rows if event.occurred_at >= start_utc.isoformat()]
        start_score = int((in_range[0] if in_range else rows[0]).payload.get("score", 0))
        current = int(rows[-1].payload.get("score", 0))
        breakdown = rows[-1].payload.get("breakdown") or {}
        reasons = [f"{key.replace('_', ' ').title()}: {value}% recorded" for key, value in sorted(breakdown.items(), key=lambda item: item[1], reverse=True)[:3]]
        if not reasons:
            reasons = [str(rows[-1].payload.get("reason", "Recorded readiness snapshot"))]
        return ReadinessTrend(current_score=current, movement=current - start_score, history=history[-40:], reasons=reasons)

    def _skills(self, historical: list[ActivityEvent], start_utc: datetime, end_utc: datetime, timezone_name: str, deleted: set[str]) -> list[SkillTrend]:
        grouped: dict[str, list[ActivityEvent]] = defaultdict(list)
        for event in historical:
            if event.event_type == "skill_observed" and event.occurred_at < end_utc.isoformat() and event.source_id not in deleted:
                grouped[event.source_id].append(event)
        result: list[SkillTrend] = []
        for skill_id, rows in grouped.items():
            rows.sort(key=lambda event: event.occurred_at)
            latest = rows[-1]
            result.append(SkillTrend(
                skill_id=skill_id,
                current_proficiency=int(latest.payload.get("proficiency", 0)),
                status=str(latest.payload.get("status", "recorded")),
                history=[TrendPoint(
                    period=datetime.fromisoformat(event.occurred_at).astimezone(zone(timezone_name)).isoformat(),
                    value=int(event.payload.get("proficiency", 0)), measurement_kind=MeasurementKind.measured,
                ) for event in rows[-30:]],
            ))
        return sorted(result, key=lambda item: (-item.current_proficiency, item.skill_id))

    def _plan_patterns(self, events: list[ActivityEvent]) -> PlanPattern:
        reviewed = len(self._distinct_sources(events, "plan_block_reviewed"))
        accepted = len(self._distinct_sources(events, "plan_block_accepted"))
        adjusted = len(self._distinct_sources(events, "plan_block_adjusted"))
        acceptance = round(accepted / reviewed * 100, 1) if reviewed else None
        adjustment = round(adjusted / accepted * 100, 1) if accepted else None
        return PlanPattern(
            reviewed=reviewed, accepted=accepted, adjusted=adjusted,
            acceptance_rate=acceptance, adjustment_rate=adjustment,
            data_status="partial" if reviewed else "empty",
            definition=METRIC_DEFINITIONS["plan_acceptance"][0] + " " + METRIC_DEFINITIONS["plan_adjustment"][0],
        )

    def _deleted_sources(self, historical: list[ActivityEvent]) -> set[str]:
        return {event.source_id for event in historical if event.event_type == "source_deleted"}

    @staticmethod
    def _safe_source_values(event: ActivityEvent) -> dict[str, Any]:
        allow = {
            "status", "estimated_minutes", "difficulty", "progress", "due_at", "completed_at",
            "duration_minutes", "start_at", "end_at", "previous_start_at", "score", "proficiency",
            "minutes_total", "category", "reason",
        }
        return {key: value for key, value in event.payload.items() if key in allow}
