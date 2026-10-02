from __future__ import annotations

from collections import defaultdict
import csv
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from typing import Any, Iterable

from fastapi import HTTPException, status

from ...core.security import AdministratorPrincipal
from ..analytics.timeutils import range_utc, zone
from .definitions import METRIC_DEFINITIONS, METRIC_VERSION, SKILL_TARGET_PROFICIENCY
from .repository import InstitutionalAnalyticsRepository
from .schemas import (
    AggregateFreshness,
    AggregateMetric,
    AggregateSlice,
    AggregateTrendPoint,
    CohortSummary,
    DashboardCapabilities,
    GovernanceResponse,
    InstitutionalAnalyticsDashboard,
    MetricDefinitionResponse,
    RefreshResponse,
)


class InstitutionalAnalyticsService:
    def __init__(
        self,
        repository: InstitutionalAnalyticsRepository,
        *,
        privacy_threshold: int,
        retention_days: int,
        freshness_hours: int,
        purpose: str,
    ) -> None:
        self.repository = repository
        self.privacy_threshold = max(2, privacy_threshold)
        self.retention_days = max(1, retention_days)
        self.freshness_hours = max(1, freshness_hours)
        self.purpose = purpose

    def _validate_range(self, start: date, end: date, timezone_name: str) -> tuple[datetime, datetime]:
        zone(timezone_name)
        if start > end:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Start date must be on or before end date.")
        if (end - start).days < 6:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Institutional analytics requires a period of at least 7 calendar days to reduce re-identification risk.")
        if (end - start).days > 366:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Institutional analytics periods are limited to 367 days.")
        return range_utc(start, end, timezone_name)

    def _cohort_for_principal(self, principal: AdministratorPrincipal, cohort_id: str) -> dict[str, Any]:
        cohort = self.repository.get_cohort(cohort_id)
        if not cohort:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cohort was not found.")
        if cohort["institution_id"] != principal.institution_id:
            self.repository.audit(
                administrator_id=principal.administrator_id,
                administrator_role=principal.role,
                institution_id=principal.institution_id,
                action="cross_institution_access_denied",
                cohort_id=cohort_id,
                purpose=self.purpose,
                detail={"requested_institution": cohort["institution_id"]},
            )
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cohort is outside the administrator's institution boundary.")
        return cohort

    def _cohort_summary(self, cohort: dict[str, Any]) -> CohortSummary:
        eligible = cohort["member_count"] >= self.privacy_threshold
        return CohortSummary(
            id=cohort["id"],
            name=cohort["name"],
            institution_id=cohort["institution_id"],
            definition=cohort["definition"],
            metric_version=METRIC_VERSION,
            privacy_threshold=self.privacy_threshold,
            privacy_status="eligible" if eligible else "below_threshold",
        )

    def list_cohorts(self, principal: AdministratorPrincipal) -> list[CohortSummary]:
        cohorts = [self._cohort_summary(item) for item in self.repository.list_cohorts(principal.institution_id)]
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="cohort_catalog_viewed",
            cohort_id=None,
            purpose=self.purpose,
            detail={"cohort_count": len(cohorts)},
        )
        return cohorts

    def definitions(self, principal: AdministratorPrincipal) -> list[MetricDefinitionResponse]:
        approved = self.repository.approved_metric_keys(self.purpose)
        response = [
            MetricDefinitionResponse(
                key=definition.key,
                label=definition.label,
                category=definition.category,
                unit=definition.unit,
                formula=definition.formula,
                explanation=definition.explanation,
                source_domains=list(definition.source_domains),
                metric_version=METRIC_VERSION,
                approved=definition.key in approved,
                approved_purpose=self.purpose,
            )
            for definition in METRIC_DEFINITIONS.values()
        ]
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="metric_definitions_viewed",
            cohort_id=None,
            purpose=self.purpose,
            detail={"metric_version": METRIC_VERSION, "approved_metrics": sorted(approved)},
        )
        return response

    def governance(self, principal: AdministratorPrincipal) -> GovernanceResponse:
        approved = sorted(self.repository.approved_metric_keys(self.purpose))
        response = GovernanceResponse(
            purpose=self.purpose,
            retention_days=self.retention_days,
            privacy_threshold=self.privacy_threshold,
            metric_version=METRIC_VERSION,
            approved_metrics=approved,
            prohibited_uses=[
                "individual student surveillance or identifiable drill-down",
                "automated disciplinary scoring or enforcement",
                "grading, admissions, employability screening or other high-stakes decisions",
                "searching private messages, documents or mentor content",
            ],
        )
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="analytics_governance_viewed",
            cohort_id=None,
            purpose=self.purpose,
            detail={"metric_version": METRIC_VERSION},
        )
        return response

    def refresh(
        self,
        principal: AdministratorPrincipal,
        cohort_id: str,
        start: date,
        end: date,
        timezone_name: str,
    ) -> RefreshResponse:
        if not principal.can_refresh_institutional_analytics:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This administrator role has read-only analytics access.")
        start_utc, end_utc = self._validate_range(start, end, timezone_name)
        cohort = self._cohort_for_principal(principal, cohort_id)
        subject_keys = self.repository.cohort_subject_keys(cohort_id)
        approved = self.repository.approved_metric_keys(self.purpose)
        refreshed_at = datetime.now(timezone.utc)

        if cohort["member_count"] < self.privacy_threshold:
            reason = f"Privacy threshold not met. At least {self.privacy_threshold} cohort members are required."
            rows = [
                self._row(key, value=None, sample_size=None, suppressed=True, suppression_reason=reason, trend=[])
                for key in METRIC_DEFINITIONS
                if key in approved
            ]
            source_latest_at = None
        else:
            events = self._cohort_events(cohort["institution_id"], subject_keys, self.repository.analytics_events_before(end_utc))
            prep = self._cohort_identified_rows(
                cohort["institution_id"], subject_keys, self.repository.internship_preparation_activity(start_utc, end_utc)
            )
            mentoring = self._cohort_identified_rows(
                cohort["institution_id"], subject_keys, self.repository.mentor_guidance_activity(start_utc, end_utc)
            )
            workshop = [
                row for row in self.repository.support_signals(cohort["institution_id"], "workshop_interest", start_utc, end_utc)
                if row["subject_key"] in subject_keys
            ]
            rows = self._calculate_rows(
                cohort_member_count=cohort["member_count"],
                start=start,
                end=end,
                timezone_name=timezone_name,
                start_utc=start_utc,
                end_utc=end_utc,
                events=events,
                preparation_rows=prep,
                mentoring_rows=mentoring,
                workshop_rows=workshop,
                approved=approved,
            )
            source_times = [row["occurred_at"] for row in events + prep + mentoring + workshop if row.get("occurred_at")]
            source_latest_at = max(source_times) if source_times else None

        revision = self.repository.next_revision(cohort_id, start.isoformat(), end.isoformat(), timezone_name)
        self.repository.save_aggregate_rows(
            institution_id=principal.institution_id,
            cohort_id=cohort_id,
            period_start=start.isoformat(),
            period_end=end.isoformat(),
            timezone_name=timezone_name,
            revision=revision,
            rows=rows,
            purpose=self.purpose,
            source_latest_at=source_latest_at,
            refreshed_at=refreshed_at.isoformat(),
        )
        self.repository.purge_expired_aggregates(self.retention_days, refreshed_at)
        suppressed_rows = sum(1 for row in rows if row.get("suppressed"))
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="aggregate_refresh",
            cohort_id=cohort_id,
            purpose=self.purpose,
            detail={
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "metric_version": METRIC_VERSION,
                "aggregate_rows": len(rows),
                "suppressed_rows": suppressed_rows,
            },
        )
        return RefreshResponse(
            cohort_id=cohort_id,
            start_date=start,
            end_date=end,
            metric_version=METRIC_VERSION,
            refreshed_at=refreshed_at,
            aggregate_rows=len(rows),
            suppressed_rows=suppressed_rows,
        )

    def dashboard(
        self,
        principal: AdministratorPrincipal,
        cohort_id: str,
        start: date,
        end: date,
        timezone_name: str,
    ) -> InstitutionalAnalyticsDashboard:
        self._validate_range(start, end, timezone_name)
        cohort = self._cohort_for_principal(principal, cohort_id)
        rows = self.repository.latest_aggregate_rows(
            institution_id=principal.institution_id,
            cohort_id=cohort_id,
            period_start=start.isoformat(),
            period_end=end.isoformat(),
            timezone_name=timezone_name,
        )
        approved = self.repository.approved_metric_keys(self.purpose)
        rows = [row for row in rows if row["metric_key"] in approved and row["purpose"] == self.purpose]
        metric_rows = [row for row in rows if not row["dimension_key"]]
        slice_rows = [row for row in rows if row["dimension_key"]]
        metrics: list[AggregateMetric] = []
        for row in metric_rows:
            definition = METRIC_DEFINITIONS.get(row["metric_key"])
            if not definition:
                continue
            metrics.append(
                AggregateMetric(
                    key=definition.key,
                    label=definition.label,
                    category=definition.category,
                    unit=row["unit"],
                    value=row["value"],
                    sample_size=row["sample_size"],
                    suppressed=row["suppressed"],
                    suppression_reason=row["suppression_reason"],
                    definition=definition.explanation,
                    formula=definition.formula,
                    trend=[AggregateTrendPoint.model_validate(point) for point in row["trend"]],
                )
            )
        skill_slices = [
            AggregateSlice(
                metric_key=row["metric_key"],
                dimension_key=row["dimension_key"],
                dimension_label=row["dimension_label"],
                value=row["value"],
                unit=row["unit"],
                sample_size=row["sample_size"],
                suppressed=row["suppressed"],
                suppression_reason=row["suppression_reason"],
            )
            for row in slice_rows
            if row["metric_key"] == "skill_gap_points"
        ]
        refreshed_at = datetime.fromisoformat(rows[0]["refreshed_at"]) if rows else None
        source_latest_at = datetime.fromisoformat(rows[0]["source_latest_at"]) if rows and rows[0]["source_latest_at"] else None
        stale = refreshed_at is None or datetime.now(timezone.utc) - refreshed_at.astimezone(timezone.utc) > timedelta(hours=self.freshness_hours)
        message = None
        if not rows:
            message = "No aggregate snapshot exists for this cohort and period. Refresh aggregates to calculate approved metrics."
        elif all(row["suppressed"] for row in metric_rows):
            message = f"Aggregate results are suppressed because the configured privacy threshold ({self.privacy_threshold}) was not met."
        dashboard = InstitutionalAnalyticsDashboard(
            cohort=self._cohort_summary(cohort),
            start_date=start,
            end_date=end,
            timezone=timezone_name,
            metrics=metrics,
            skill_slices=skill_slices,
            freshness=AggregateFreshness(
                refreshed_at=refreshed_at,
                source_latest_at=source_latest_at,
                metric_version=METRIC_VERSION,
                is_stale=stale,
                retention_days=self.retention_days,
                purpose=self.purpose,
            ),
            capabilities=DashboardCapabilities(
                can_export=principal.can_export_institutional_analytics,
                can_refresh=principal.can_refresh_institutional_analytics,
            ),
            empty=not bool(rows),
            message=message,
            governance_notice=(
                "Anonymous aggregate trends are for student-support programme improvement only. "
                "Do not use them for individual surveillance, disciplinary action or other high-stakes decisions."
            ),
        )
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="aggregate_dashboard_view",
            cohort_id=cohort_id,
            purpose=self.purpose,
            detail={
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "metric_version": METRIC_VERSION,
                "visible_metrics": [metric.key for metric in metrics],
                "suppressed_metrics": [metric.key for metric in metrics if metric.suppressed],
            },
        )
        return dashboard

    def export_csv(
        self,
        principal: AdministratorPrincipal,
        cohort_id: str,
        start: date,
        end: date,
        timezone_name: str,
    ) -> str:
        if not principal.can_export_institutional_analytics:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This administrator role is not permitted to export aggregates.")
        dashboard = self.dashboard(principal, cohort_id, start, end, timezone_name)
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "cohort_id", "cohort_name", "period_start", "period_end", "metric_key", "dimension",
            "value", "unit", "sample_size", "suppressed", "suppression_reason", "metric_version", "refreshed_at",
        ])
        for metric in dashboard.metrics:
            writer.writerow([
                dashboard.cohort.id, dashboard.cohort.name, start.isoformat(), end.isoformat(), metric.key, "",
                "" if metric.suppressed or metric.value is None else metric.value,
                metric.unit,
                "" if metric.suppressed or metric.sample_size is None else metric.sample_size,
                str(metric.suppressed).lower(), metric.suppression_reason or "", METRIC_VERSION,
                dashboard.freshness.refreshed_at.isoformat() if dashboard.freshness.refreshed_at else "",
            ])
        for item in dashboard.skill_slices:
            writer.writerow([
                dashboard.cohort.id, dashboard.cohort.name, start.isoformat(), end.isoformat(), item.metric_key,
                item.dimension_label,
                "" if item.suppressed or item.value is None else item.value,
                item.unit,
                "" if item.suppressed or item.sample_size is None else item.sample_size,
                str(item.suppressed).lower(), item.suppression_reason or "", METRIC_VERSION,
                dashboard.freshness.refreshed_at.isoformat() if dashboard.freshness.refreshed_at else "",
            ])
        self.repository.audit(
            administrator_id=principal.administrator_id,
            administrator_role=principal.role,
            institution_id=principal.institution_id,
            action="aggregate_export",
            cohort_id=cohort_id,
            purpose=self.purpose,
            detail={
                "period_start": start.isoformat(),
                "period_end": end.isoformat(),
                "format": "csv",
                "metric_version": METRIC_VERSION,
                "rows": len(dashboard.metrics) + len(dashboard.skill_slices),
            },
        )
        return output.getvalue()

    def _cohort_events(self, institution_id: str, subject_keys: set[str], events: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for event in events:
            subject_key = self.repository.subject_key(institution_id, event["student_id"])
            if subject_key not in subject_keys:
                continue
            safe = {key: value for key, value in event.items() if key != "student_id"}
            safe["subject_key"] = subject_key
            result.append(safe)
        return result

    def _cohort_identified_rows(self, institution_id: str, subject_keys: set[str], rows: Iterable[dict[str, str]]) -> list[dict[str, str]]:
        result: list[dict[str, str]] = []
        for row in rows:
            subject_key = self.repository.subject_key(institution_id, row["student_id"])
            if subject_key in subject_keys:
                safe = {key: value for key, value in row.items() if key != "student_id"}
                safe["subject_key"] = subject_key
                result.append(safe)
        return result

    def _calculate_rows(
        self,
        *,
        cohort_member_count: int,
        start: date,
        end: date,
        timezone_name: str,
        start_utc: datetime,
        end_utc: datetime,
        events: list[dict[str, Any]],
        preparation_rows: list[dict[str, str]],
        mentoring_rows: list[dict[str, str]],
        workshop_rows: list[dict[str, str]],
        approved: set[str],
    ) -> list[dict[str, Any]]:
        in_range = [event for event in events if start_utc.isoformat() <= event["occurred_at"] < end_utc.isoformat()]
        rows: list[dict[str, Any]] = []

        if "skill_gap_points" in approved:
            skill_rows, slices = self._skill_gap_rows(in_range, start, end, timezone_name)
            rows.append(skill_rows)
            rows.extend(slices)
        if "readiness_average" in approved:
            rows.append(self._readiness_row(in_range, start, end, timezone_name))
        if "workload_hours" in approved:
            rows.append(self._workload_row(in_range, start, end, timezone_name))
        if "engagement_rate" in approved:
            rows.append(self._activity_rate_row("engagement_rate", in_range, cohort_member_count, start, end, timezone_name))
        if "internship_preparation_rate" in approved:
            rows.append(self._rate_from_rows("internship_preparation_rate", preparation_rows, cohort_member_count, start, end, timezone_name))
        if "mentoring_demand_rate" in approved:
            rows.append(self._rate_from_rows("mentoring_demand_rate", mentoring_rows, cohort_member_count, start, end, timezone_name))
        if "workshop_interest_rate" in approved:
            rows.append(self._rate_from_rows("workshop_interest_rate", workshop_rows, cohort_member_count, start, end, timezone_name))
        return rows

    def _privacy_value(self, *, metric_key: str, value: float | None, contributors: int, trend: list[dict[str, Any]]) -> dict[str, Any]:
        if contributors < self.privacy_threshold:
            reason = f"Suppressed: fewer than {self.privacy_threshold} distinct contributors supplied this aggregate signal."
            return self._row(metric_key, value=None, sample_size=None, suppressed=True, suppression_reason=reason, trend=self._suppress_trend(trend))
        return self._row(metric_key, value=value, sample_size=contributors, suppressed=False, suppression_reason=None, trend=trend)

    def _row(
        self,
        metric_key: str,
        *,
        value: float | None,
        sample_size: int | None,
        suppressed: bool,
        suppression_reason: str | None,
        trend: list[dict[str, Any]],
        dimension_key: str = "",
        dimension_label: str = "",
    ) -> dict[str, Any]:
        definition = METRIC_DEFINITIONS[metric_key]
        return {
            "metric_key": metric_key,
            "dimension_key": dimension_key,
            "dimension_label": dimension_label,
            "value": value,
            "unit": definition.unit,
            "sample_size": sample_size,
            "suppressed": suppressed,
            "suppression_reason": suppression_reason,
            "trend": trend,
        }

    @staticmethod
    def _suppress_trend(trend: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{"period": point["period"], "value": None, "suppressed": True} for point in trend]

    def _skill_gap_rows(self, events: list[dict[str, Any]], start: date, end: date, timezone_name: str) -> tuple[dict[str, Any], list[dict[str, Any]]]:
        skill_events = [event for event in events if event["event_type"] == "skill_observed"]
        latest: dict[tuple[str, str], dict[str, Any]] = {}
        for event in skill_events:
            latest[(event["subject_key"], event["source_id"])] = event
        per_subject: dict[str, list[float]] = defaultdict(list)
        per_skill: dict[str, list[float]] = defaultdict(list)
        for (subject_key, skill_id), event in latest.items():
            proficiency = float(event["payload"].get("proficiency", 0))
            gap = max(float(SKILL_TARGET_PROFICIENCY) - proficiency, 0.0)
            per_subject[subject_key].append(gap)
            per_skill[skill_id].append(gap)
        subject_values = [sum(values) / len(values) for values in per_subject.values() if values]
        value = round(sum(subject_values) / len(subject_values), 1) if subject_values else None
        trend = self._weekly_trend(
            start,
            end,
            timezone_name,
            events,
            lambda subset: self._skill_gap_for_subset(subset),
        )
        primary = self._privacy_value(metric_key="skill_gap_points", value=value, contributors=len(subject_values), trend=trend)
        slices: list[dict[str, Any]] = []
        for skill_id, values in sorted(per_skill.items()):
            if len(values) < self.privacy_threshold:
                slices.append(self._row(
                    "skill_gap_points", value=None, sample_size=None, suppressed=True,
                    suppression_reason=f"Suppressed: fewer than {self.privacy_threshold} contributors for this skill slice.",
                    trend=[], dimension_key=skill_id, dimension_label=self._humanize(skill_id),
                ))
            else:
                slices.append(self._row(
                    "skill_gap_points", value=round(sum(values) / len(values), 1), sample_size=len(values), suppressed=False,
                    suppression_reason=None, trend=[], dimension_key=skill_id, dimension_label=self._humanize(skill_id),
                ))
        return primary, slices

    @staticmethod
    def _skill_gap_for_subset(events: list[dict[str, Any]]) -> tuple[float | None, int]:
        latest: dict[tuple[str, str], dict[str, Any]] = {}
        for event in events:
            if event["event_type"] == "skill_observed":
                latest[(event["subject_key"], event["source_id"])] = event
        per_subject: dict[str, list[float]] = defaultdict(list)
        for (subject_key, _), event in latest.items():
            per_subject[subject_key].append(max(float(SKILL_TARGET_PROFICIENCY) - float(event["payload"].get("proficiency", 0)), 0.0))
        values = [sum(items) / len(items) for items in per_subject.values() if items]
        return (round(sum(values) / len(values), 1), len(values)) if values else (None, 0)

    def _readiness_row(self, events: list[dict[str, Any]], start: date, end: date, timezone_name: str) -> dict[str, Any]:
        latest: dict[str, dict[str, Any]] = {}
        for event in events:
            if event["event_type"] == "readiness_observed":
                latest[event["subject_key"]] = event
        values = [float(event["payload"].get("score", 0)) for event in latest.values()]
        value = round(sum(values) / len(values), 1) if values else None
        trend = self._weekly_trend(start, end, timezone_name, events, self._readiness_for_subset)
        return self._privacy_value(metric_key="readiness_average", value=value, contributors=len(values), trend=trend)

    @staticmethod
    def _readiness_for_subset(events: list[dict[str, Any]]) -> tuple[float | None, int]:
        latest: dict[str, dict[str, Any]] = {}
        for event in events:
            if event["event_type"] == "readiness_observed":
                latest[event["subject_key"]] = event
        values = [float(item["payload"].get("score", 0)) for item in latest.values()]
        return (round(sum(values) / len(values), 1), len(values)) if values else (None, 0)

    def _workload_row(self, events: list[dict[str, Any]], start: date, end: date, timezone_name: str) -> dict[str, Any]:
        value, contributors = self._workload_for_subset(events)
        trend = self._weekly_trend(start, end, timezone_name, events, self._workload_for_subset)
        return self._privacy_value(metric_key="workload_hours", value=value, contributors=contributors, trend=trend)

    @staticmethod
    def _workload_for_subset(events: list[dict[str, Any]]) -> tuple[float | None, int]:
        latest: dict[tuple[str, str], dict[str, Any]] = {}
        for event in events:
            if event["event_type"] == "task_observed":
                latest[(event["subject_key"], event["source_id"])] = event
        per_subject: dict[str, int] = defaultdict(int)
        seen_subjects: set[str] = set()
        for (subject_key, _), event in latest.items():
            seen_subjects.add(subject_key)
            if event["payload"].get("status") in {"completed", "missed"}:
                continue
            per_subject[subject_key] += max(0, int(event["payload"].get("estimated_minutes", 0)))
        if not seen_subjects:
            return None, 0
        values = [per_subject.get(subject_key, 0) / 60 for subject_key in seen_subjects]
        return round(sum(values) / len(values), 1), len(values)

    def _activity_rate_row(self, metric_key: str, events: list[dict[str, Any]], cohort_member_count: int, start: date, end: date, timezone_name: str) -> dict[str, Any]:
        contributors = {event["subject_key"] for event in events}
        value = round(len(contributors) / cohort_member_count * 100, 1) if cohort_member_count else None
        trend = self._weekly_trend(
            start,
            end,
            timezone_name,
            events,
            lambda subset: self._rate_for_subset(subset, cohort_member_count),
        )
        return self._privacy_value(metric_key=metric_key, value=value, contributors=len(contributors), trend=trend)

    @staticmethod
    def _rate_for_subset(rows: list[dict[str, Any]], cohort_member_count: int) -> tuple[float | None, int]:
        contributors = {row["subject_key"] for row in rows}
        if not cohort_member_count:
            return None, 0
        return round(len(contributors) / cohort_member_count * 100, 1), len(contributors)

    def _rate_from_rows(self, metric_key: str, rows: list[dict[str, str]], cohort_member_count: int, start: date, end: date, timezone_name: str) -> dict[str, Any]:
        contributors = {row["subject_key"] for row in rows}
        value = round(len(contributors) / cohort_member_count * 100, 1) if cohort_member_count else None
        trend = self._weekly_row_trend(start, end, timezone_name, rows, cohort_member_count)
        return self._privacy_value(metric_key=metric_key, value=value, contributors=len(contributors), trend=trend)

    def _weekly_trend(
        self,
        start: date,
        end: date,
        timezone_name: str,
        events: list[dict[str, Any]],
        calculator,
    ) -> list[dict[str, Any]]:
        points: list[dict[str, Any]] = []
        for bucket_start, bucket_end in self._buckets(start, end):
            bucket_start_utc, bucket_end_utc = range_utc(bucket_start, bucket_end, timezone_name)
            subset = [event for event in events if bucket_start_utc.isoformat() <= event["occurred_at"] < bucket_end_utc.isoformat()]
            value, contributors = calculator(subset)
            suppressed = contributors < self.privacy_threshold
            points.append({"period": bucket_start.isoformat(), "value": None if suppressed else value, "suppressed": suppressed})
        return points

    def _weekly_row_trend(self, start: date, end: date, timezone_name: str, rows: list[dict[str, str]], cohort_member_count: int) -> list[dict[str, Any]]:
        points: list[dict[str, Any]] = []
        for bucket_start, bucket_end in self._buckets(start, end):
            bucket_start_utc, bucket_end_utc = range_utc(bucket_start, bucket_end, timezone_name)
            subset = [row for row in rows if bucket_start_utc.isoformat() <= row["occurred_at"] < bucket_end_utc.isoformat()]
            value, contributors = self._rate_for_subset(subset, cohort_member_count)
            suppressed = contributors < self.privacy_threshold
            points.append({"period": bucket_start.isoformat(), "value": None if suppressed else value, "suppressed": suppressed})
        return points

    @staticmethod
    def _buckets(start: date, end: date) -> list[tuple[date, date]]:
        buckets: list[tuple[date, date]] = []
        cursor = start
        while cursor <= end:
            bucket_end = min(end, cursor + timedelta(days=6))
            buckets.append((cursor, bucket_end))
            cursor = bucket_end + timedelta(days=1)
        return buckets

    @staticmethod
    def _humanize(value: str) -> str:
        return value.replace("_", " ").replace("-", " ").strip().title()
