#!/usr/bin/env python3
"""Create an explicit synthetic DOC-F25 demo cohort and real aggregate snapshot.

This script is for local demonstrations only. It never runs automatically and uses student IDs
with the `doc-f25-demo-` prefix so synthetic records are easy to identify/remove.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import sqlite3
import sys
from pathlib import Path
from uuid import uuid5, NAMESPACE_URL

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from apps.api.app.core.config import settings
from apps.api.app.core.security import AdministratorPrincipal
from apps.api.app.modules.analytics.repository import ActivityEvent, AnalyticsRepository
from apps.api.app.modules.institutional_analytics.repository import InstitutionalAnalyticsRepository
from apps.api.app.modules.institutional_analytics.service import InstitutionalAnalyticsService
from apps.api.app.modules.internships.repository import InternshipRepository
from apps.api.app.modules.mentors.repository import MentorRepository


def uid(value: str) -> str:
    return str(uuid5(NAMESPACE_URL, f"lumapath-doc-f25-demo:{value}"))


def main() -> None:
    if settings.environment not in {"development", "demo", "test"}:
        raise SystemExit("Synthetic seed actions are disabled outside development/demo/test.")
    db = settings.database_path
    institution = "luma-demo-university"
    cohort_id = "demo-se-year-3"
    students = [f"doc-f25-demo-{index:02d}" for index in range(1, 13)]
    now = datetime.now(timezone.utc).replace(microsecond=0)
    observed = now - timedelta(days=1)
    start = now.date() - timedelta(days=29)
    end = now.date()

    institutional = InstitutionalAnalyticsRepository(db, settings.institutional_analytics_subject_key_secret)
    institutional.upsert_cohort(
        cohort_id=cohort_id,
        institution_id=institution,
        name="Software Engineering — Year 3 (Demo)",
        definition={"programme": "Software Engineering", "year": 3, "intake": "Demo"},
        student_ids=students,
    )

    analytics = AnalyticsRepository(db)
    events: list[ActivityEvent] = []
    for index, student in enumerate(students):
        proficiency = 48 + (index % 6) * 6
        readiness = 62 + (index % 6) * 4
        workload = 90 + (index % 4) * 30
        for event_type, source_type, source_id, payload in [
            ("task_observed", "task", f"demo-task-{index}", {"status": "in-progress", "estimated_minutes": workload, "difficulty": 3, "progress": 35}),
            ("skill_observed", "skill", "docker", {"status": "in-progress", "proficiency": proficiency, "reason": "Synthetic demo observation"}),
            ("readiness_observed", "readiness", "career-readiness", {"score": readiness, "breakdown": {}, "reason": "Synthetic demo observation"}),
            ("productive_minutes_observed", "productivity", "cumulative", {"minutes_total": 120 + index * 5}),
        ]:
            key = uid(f"{student}:{event_type}:{source_id}:{observed.date().isoformat()}")
            events.append(ActivityEvent(
                id=uid(f"event:{key}"), student_id=student, idempotency_key=key, event_type=event_type,
                occurred_at=observed.isoformat(), timezone="Asia/Colombo", source_type=source_type, source_id=source_id,
                module="Software Engineering" if source_type == "task" else None,
                measurement_kind="measured", payload=payload, created_at=now.isoformat(),
            ))
    analytics.append_events(events)

    InternshipRepository(db)
    MentorRepository(db)
    with sqlite3.connect(db) as connection:
        connection.execute("PRAGMA foreign_keys=ON")
        for index, student in enumerate(students):
            app_id = uid(f"internship:{student}")
            connection.execute(
                """INSERT OR IGNORE INTO internship_applications
                (id,student_id,company,role,source_type,source_reference,source_url,application_deadline,
                 application_deadline_confirmed,contact_name,contact_email,interview_at,interview_at_confirmed,
                 follow_up_at,follow_up_at_confirmed,notes,next_action,timezone,status,archived,outcome_notes,
                 create_idempotency_key,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    app_id, student, "Demo Employer", "Software Engineering Intern", "manual", None, None, None,
                    0, "", "", None, 0, None, 0, "", "Review role requirements", "Asia/Colombo", "draft", 0, "",
                    f"doc-f25-demo-{index}", observed.isoformat(), observed.isoformat(),
                ),
            )
            relationship_id = uid(f"mentor:{student}")
            connection.execute(
                """INSERT OR IGNORE INTO mentor_relationships
                (id,student_id,mentor_label,mentor_name,purpose,status,invitation_token_hash,mentor_access_token_hash,
                 invite_expires_at,expires_at,accepted_at,revoked_at,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    relationship_id, student, "Demo mentor", "Demo Mentor", "Synthetic DOC-F25 demo", "active",
                    uid(f"invite:{student}"), uid(f"access:{student}"), (now + timedelta(days=7)).isoformat(),
                    (now + timedelta(days=30)).isoformat(), observed.isoformat(), None, observed.isoformat(), observed.isoformat(),
                ),
            )
            connection.execute(
                """INSERT OR IGNORE INTO guidance_requests
                (id,relationship_id,student_id,title,question,context_note,status,created_at,updated_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (
                    uid(f"guidance:{student}"), relationship_id, student, "Demo guidance request",
                    "Synthetic demo request; content is never copied into DOC-F25 aggregates.", "", "open",
                    observed.isoformat(), observed.isoformat(),
                ),
            )
        connection.commit()

    for student in students:
        institutional.add_support_signal(
            institution_id=institution,
            student_id=student,
            signal_type="workshop_interest",
            occurred_at=observed,
            topic_key="docker",
        )

    service = InstitutionalAnalyticsService(
        institutional,
        privacy_threshold=settings.analytics_min_cohort_size,
        retention_days=settings.institutional_analytics_retention_days,
        freshness_hours=settings.institutional_analytics_freshness_hours,
        purpose=settings.institutional_analytics_purpose,
    )
    result = service.refresh(
        AdministratorPrincipal(administrator_id="programme-admin-demo", institution_id=institution, role="programme_admin"),
        cohort_id,
        start,
        end,
        "Asia/Colombo",
    )
    print(f"Seeded {cohort_id}: {result.aggregate_rows} aggregate rows ({result.suppressed_rows} suppressed).")
    print(f"Open /programme-analytics with period {start.isoformat()} to {end.isoformat()}.")


if __name__ == "__main__":
    main()
