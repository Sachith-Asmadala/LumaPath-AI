from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from .repository import InternshipRepository
from .schemas import (
    ApplicationEventResponse, ApplicationListResponse, ApplicationResponse, ApplicationStatus, ArchiveRequest,
    CLOSED_STATUSES, CreateApplicationRequest, PlannerActionRequest, PlannerActionResponse, ReadinessActionResponse,
    ReminderRequest, ReminderResponse, RequirementInput, RequirementResponse, StatusTransitionRequest, UpdateApplicationRequest,
)


TRANSITIONS: dict[ApplicationStatus, set[ApplicationStatus]] = {
    ApplicationStatus.INTERESTED: {ApplicationStatus.PREPARING, ApplicationStatus.WITHDRAWN},
    ApplicationStatus.PREPARING: {ApplicationStatus.INTERESTED, ApplicationStatus.APPLIED, ApplicationStatus.WITHDRAWN},
    ApplicationStatus.APPLIED: {ApplicationStatus.AWAITING_RESPONSE, ApplicationStatus.INTERVIEWING, ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN},
    ApplicationStatus.AWAITING_RESPONSE: {ApplicationStatus.INTERVIEWING, ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN},
    ApplicationStatus.INTERVIEWING: {ApplicationStatus.AWAITING_RESPONSE, ApplicationStatus.OFFER, ApplicationStatus.REJECTED, ApplicationStatus.WITHDRAWN},
    ApplicationStatus.OFFER: set(),
    ApplicationStatus.REJECTED: set(),
    ApplicationStatus.WITHDRAWN: set(),
}


class InternshipService:
    def __init__(self, repository: InternshipRepository, now=lambda: datetime.now(timezone.utc)):
        self.repository = repository
        self.now = now

    def create(self, student_id: str, request: CreateApplicationRequest) -> ApplicationResponse:
        replay = self.repository.by_create_key(student_id, request.idempotency_key)
        if replay:
            return self._response(replay, student_id)
        if request.source_type == "recommendation" and request.source_reference:
            duplicate = self.repository.by_recommendation(student_id, request.source_reference)
            if duplicate:
                return self._response(duplicate, student_id)
        self._timezone(request.timezone)
        now = self._now()
        application_id = f"application_{uuid4().hex}"
        row = self.repository.create_application({
            "id": application_id, "student_id": student_id, "company": request.company.strip(), "role": request.role.strip(),
            "source_type": request.source_type, "source_reference": request.source_reference, "source_url": str(request.source_url) if request.source_url else None,
            "application_deadline": request.application_deadline.isoformat() if request.application_deadline else None,
            "application_deadline_confirmed": int(request.application_deadline_confirmed), "contact_name": request.contact_name.strip(),
            "contact_email": request.contact_email.strip(), "interview_at": self._iso(request.interview_at), "interview_at_confirmed": int(request.interview_at_confirmed),
            "follow_up_at": self._iso(request.follow_up_at), "follow_up_at_confirmed": int(request.follow_up_at_confirmed), "notes": request.notes.strip(),
            "next_action": request.next_action.strip(), "timezone": request.timezone, "status": ApplicationStatus.INTERESTED.value, "archived": 0,
            "outcome_notes": "", "create_idempotency_key": request.idempotency_key, "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        self._replace_requirements(application_id, student_id, request.requirements)
        self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "created", "from_status": None, "to_status": ApplicationStatus.INTERESTED.value, "note": request.source_type, "idempotency_key": f"created:{request.idempotency_key}", "occurred_at": now.isoformat()})
        return self._response(row, student_id)

    def list(self, student_id: str, include_archived: bool = False) -> ApplicationListResponse:
        return ApplicationListResponse(items=[self._response(row, student_id) for row in self.repository.list_applications(student_id, include_archived)])

    def get(self, student_id: str, application_id: str) -> ApplicationResponse:
        return self._response(self._owned(student_id, application_id), student_id)

    def update(self, student_id: str, application_id: str, request: UpdateApplicationRequest) -> ApplicationResponse:
        current = self._owned(student_id, application_id)
        prior = next((e for e in self.repository.events(application_id, student_id) if e["event_type"] == "application_updated" and e["idempotency_key"] == request.idempotency_key), None)
        if prior:
            return self._response(current, student_id)
        self._timezone(request.timezone)
        now = self._now()
        row = self.repository.update_application(application_id, student_id, {
            "company": request.company.strip(), "role": request.role.strip(), "source_url": str(request.source_url) if request.source_url else None,
            "application_deadline": request.application_deadline.isoformat() if request.application_deadline else None,
            "application_deadline_confirmed": int(request.application_deadline_confirmed), "contact_name": request.contact_name.strip(), "contact_email": request.contact_email.strip(),
            "interview_at": self._iso(request.interview_at), "interview_at_confirmed": int(request.interview_at_confirmed), "follow_up_at": self._iso(request.follow_up_at),
            "follow_up_at_confirmed": int(request.follow_up_at_confirmed), "notes": request.notes.strip(), "next_action": request.next_action.strip(), "timezone": request.timezone,
            "updated_at": now.isoformat(),
        })
        self._replace_requirements(application_id, student_id, request.requirements)
        self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "application_updated", "from_status": current["status"], "to_status": current["status"], "note": "Application details updated", "idempotency_key": request.idempotency_key, "occurred_at": now.isoformat()})
        return self._response(row, student_id)

    def transition(self, student_id: str, application_id: str, request: StatusTransitionRequest) -> ApplicationResponse:
        row = self._owned(student_id, application_id)
        current = ApplicationStatus(row["status"])
        if request.status == current:
            return self._response(row, student_id)
        replay = next((e for e in self.repository.events(application_id, student_id) if e["idempotency_key"] == request.idempotency_key), None)
        if replay:
            return self.get(student_id, application_id)
        if request.status not in TRANSITIONS[current]:
            raise HTTPException(status_code=409, detail=f"Status cannot move from {current.value} to {request.status.value}.")
        now = self._now()
        updated = self.repository.update_application(application_id, student_id, {"status": request.status.value, "updated_at": now.isoformat()})
        self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "status_changed", "from_status": current.value, "to_status": request.status.value, "note": request.note.strip(), "idempotency_key": request.idempotency_key, "occurred_at": now.isoformat()})
        return self._response(updated, student_id)

    def archive(self, student_id: str, application_id: str, request: ArchiveRequest) -> ApplicationResponse:
        row = self._owned(student_id, application_id)
        if request.archived and ApplicationStatus(row["status"]) not in CLOSED_STATUSES:
            raise HTTPException(status_code=409, detail="Only closed applications can be archived. Close the outcome first.")
        if any(e["idempotency_key"] == request.idempotency_key for e in self.repository.events(application_id, student_id)):
            return self.get(student_id, application_id)
        now = self._now()
        updated = self.repository.update_application(application_id, student_id, {"archived": int(request.archived), "outcome_notes": request.outcome_notes.strip(), "updated_at": now.isoformat()})
        self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "archived" if request.archived else "restored", "from_status": row["status"], "to_status": row["status"], "note": request.outcome_notes.strip(), "idempotency_key": request.idempotency_key, "occurred_at": now.isoformat()})
        return self._response(updated, student_id)

    def delete(self, student_id: str, application_id: str) -> None:
        self._owned(student_id, application_id)
        self.repository.delete_application(application_id, student_id)

    def create_reminder(self, student_id: str, application_id: str, request: ReminderRequest) -> ReminderResponse:
        app = self._owned(student_id, application_id)
        if request.enabled:
            self._validate_reminder_against_confirmed_dates(app, request)
        effective = self._effective_notification(request)
        now = self._now()
        row, replay = self.repository.upsert_reminder({
            "id": f"reminder_{uuid4().hex}", "application_id": application_id, "student_id": student_id, "kind": request.kind, "title": request.title.strip(),
            "remind_at": self._localized(request.remind_at, request.timezone).isoformat(), "timezone": request.timezone, "enabled": int(request.enabled), "notifications_enabled": int(request.notifications_enabled),
            "quiet_hours_start": request.quiet_hours_start, "quiet_hours_end": request.quiet_hours_end, "effective_notification_at": effective.isoformat() if effective else None,
            "idempotency_key": request.idempotency_key, "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        if not replay:
            self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "reminder_created", "from_status": app["status"], "to_status": app["status"], "note": request.title.strip(), "idempotency_key": f"reminder_event:{request.idempotency_key}", "occurred_at": now.isoformat()})
        return self._reminder(row)

    def update_reminder(self, student_id: str, application_id: str, reminder_id: str, request: ReminderRequest) -> ReminderResponse:
        app = self._owned(student_id, application_id)
        if request.enabled:
            self._validate_reminder_against_confirmed_dates(app, request)
        current = self.repository.get_reminder(reminder_id)
        if not current or current["student_id"] != student_id or current["application_id"] != application_id:
            raise HTTPException(status_code=404, detail="Reminder was not found.")
        effective = self._effective_notification(request)
        row = self.repository.update_reminder(reminder_id, application_id, student_id, {
            "kind": request.kind, "title": request.title.strip(), "remind_at": self._localized(request.remind_at, request.timezone).isoformat(), "timezone": request.timezone,
            "enabled": int(request.enabled), "notifications_enabled": int(request.notifications_enabled), "quiet_hours_start": request.quiet_hours_start,
            "quiet_hours_end": request.quiet_hours_end, "effective_notification_at": effective.isoformat() if effective else None, "updated_at": self._now().isoformat(),
        })
        self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "reminder_updated", "from_status": app["status"], "to_status": app["status"], "note": request.title.strip(), "idempotency_key": f"reminder_update:{request.idempotency_key}", "occurred_at": self._now().isoformat()})
        return self._reminder(row)

    def planner_action(self, student_id: str, application_id: str, request: PlannerActionRequest) -> PlannerActionResponse:
        app = self._owned(student_id, application_id)
        if not request.confirmed:
            raise HTTPException(status_code=422, detail="Planner timing must be explicitly confirmed before a task can be created.")
        self._validate_planner_against_confirmed_dates(app, request)
        now = self._now()
        normalized_start = self._localized(request.start_at, app["timezone"])
        row, replay = self.repository.create_planner_action({
            "id": f"planner_action_{uuid4().hex}", "application_id": application_id, "student_id": student_id, "kind": request.kind,
            "title": request.title.strip(), "start_at": normalized_start.isoformat(), "duration_minutes": request.duration_minutes,
            "description": f"Confirmed {request.kind.replace('_', ' ')} for {app['role']} at {app['company']}. Created from Internship Applications; no employer contact is performed.",
            "idempotency_key": request.idempotency_key, "created_at": now.isoformat(),
        })
        if not replay:
            self.repository.add_event({"application_id": application_id, "student_id": student_id, "event_type": "planner_action_approved", "from_status": app["status"], "to_status": app["status"], "note": request.title.strip(), "idempotency_key": f"planner_event:{request.idempotency_key}", "occurred_at": now.isoformat()})
        return PlannerActionResponse(id=row["id"], application_id=application_id, kind=row["kind"], title=row["title"], start_at=datetime.fromisoformat(row["start_at"]), duration_minutes=row["duration_minutes"], description=row["description"], idempotent_replay=replay)

    def _replace_requirements(self, application_id: str, student_id: str, requirements: list[RequirementInput]) -> None:
        rows = []
        for requirement in requirements:
            refs = self.repository.portfolio_evidence(student_id, requirement.skill_name)
            rows.append({"id": f"requirement_{uuid4().hex}", "application_id": application_id, "student_id": student_id, "skill_name": requirement.skill_name.strip(), "detail": requirement.detail.strip(), "required": int(requirement.required), "evidence_status": "demonstrated" if refs else "not_demonstrated", "evidence_refs_json": json.dumps(refs)})
        self.repository.replace_requirements(application_id, student_id, rows)

    def _response(self, row, student_id: str) -> ApplicationResponse:
        requirements = [self._requirement(item) for item in self.repository.requirements(row["id"], student_id)]
        actions: list[ReadinessActionResponse] = []
        for requirement in requirements[:8]:
            if len(actions) >= 3:
                break
            if requirement.evidence_status == "demonstrated":
                actions.append(ReadinessActionResponse(skill_name=requirement.skill_name, status="evidence_available", title=f"Prepare {requirement.skill_name} evidence", rationale="This requirement has project evidence. Review the source and prepare one factual example for the application or interview.", evidence_refs=requirement.evidence_refs, href="/portfolio"))
            else:
                actions.append(ReadinessActionResponse(skill_name=requirement.skill_name, status="evidence_gap", title=f"Review {requirement.skill_name}", rationale="No matching portfolio evidence is currently recorded for this application requirement. This is an evidence gap, not a claim that you lack the skill.", evidence_refs=[], href="/skills"))
        return ApplicationResponse(
            id=row["id"], company=row["company"], role=row["role"], source_type=row["source_type"], source_reference=row["source_reference"], source_url=row["source_url"],
            application_deadline=date.fromisoformat(row["application_deadline"]) if row["application_deadline"] else None, application_deadline_confirmed=bool(row["application_deadline_confirmed"]),
            deadline_state=self._deadline_state(row), contact_name=row["contact_name"], contact_email=row["contact_email"], interview_at=self._dt(row["interview_at"]), interview_at_confirmed=bool(row["interview_at_confirmed"]),
            follow_up_at=self._dt(row["follow_up_at"]), follow_up_at_confirmed=bool(row["follow_up_at_confirmed"]), notes=row["notes"], next_action=row["next_action"], timezone=row["timezone"], status=ApplicationStatus(row["status"]), archived=bool(row["archived"]), outcome_notes=row["outcome_notes"],
            requirements=requirements, readiness_actions=actions, reminders=[self._reminder(item) for item in self.repository.reminders(row["id"], student_id)], history=[ApplicationEventResponse(id=e["id"], event_type=e["event_type"], from_status=ApplicationStatus(e["from_status"]) if e["from_status"] else None, to_status=ApplicationStatus(e["to_status"]) if e["to_status"] else None, note=e["note"], occurred_at=datetime.fromisoformat(e["occurred_at"])) for e in self.repository.events(row["id"], student_id)], created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"])
        )

    def _owned(self, student_id: str, application_id: str):
        row = self.repository.get_application(application_id)
        if not row:
            raise HTTPException(status_code=404, detail="Application was not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="This application belongs to another student.")
        return row

    def _requirement(self, row) -> RequirementResponse:
        try: refs = json.loads(row["evidence_refs_json"])
        except Exception: refs = []
        return RequirementResponse(id=row["id"], skill_name=row["skill_name"], detail=row["detail"], required=bool(row["required"]), evidence_status=row["evidence_status"], evidence_refs=refs)

    def _reminder(self, row) -> ReminderResponse:
        return ReminderResponse(id=row["id"], kind=row["kind"], title=row["title"], remind_at=datetime.fromisoformat(row["remind_at"]), timezone=row["timezone"], enabled=bool(row["enabled"]), notifications_enabled=bool(row["notifications_enabled"]), quiet_hours_start=row["quiet_hours_start"], quiet_hours_end=row["quiet_hours_end"], effective_notification_at=self._dt(row["effective_notification_at"]), created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]))

    def _deadline_state(self, row) -> str:
        if not row["application_deadline"]: return "missing"
        if not row["application_deadline_confirmed"]: return "unconfirmed"
        tz = self._timezone(row["timezone"])
        today = self._now().astimezone(tz).date()
        deadline = date.fromisoformat(row["application_deadline"])
        if deadline < today: return "past_due"
        if deadline == today: return "today"
        return "upcoming"

    def _effective_notification(self, request: ReminderRequest) -> datetime | None:
        tz = self._timezone(request.timezone)
        remind = request.remind_at
        if remind.tzinfo is None:
            remind = remind.replace(tzinfo=tz)
        else:
            remind = remind.astimezone(tz)
        if not request.enabled or not request.notifications_enabled:
            return None
        if not request.quiet_hours_start or not request.quiet_hours_end:
            return remind
        start = time.fromisoformat(request.quiet_hours_start)
        end = time.fromisoformat(request.quiet_hours_end)
        local_t = remind.timetz().replace(tzinfo=None)
        in_quiet = (start < end and start <= local_t < end) or (start >= end and (local_t >= start or local_t < end))
        if not in_quiet:
            return remind
        target_date = remind.date()
        if start >= end and local_t >= start:
            target_date += timedelta(days=1)
        return datetime.combine(target_date, end, tzinfo=tz)

    def _validate_reminder_against_confirmed_dates(self, app, request: ReminderRequest) -> None:
        remind_at = self._localized(request.remind_at, request.timezone)
        if request.kind == "deadline":
            if not app["application_deadline"] or not app["application_deadline_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the application deadline before creating a deadline reminder.")
            deadline = date.fromisoformat(app["application_deadline"])
            if remind_at.date() > deadline:
                raise HTTPException(status_code=422, detail="A deadline reminder cannot be scheduled after the confirmed application deadline.")
        elif request.kind == "interview":
            if not app["interview_at"] or not app["interview_at_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the interview date before creating an interview reminder.")
            if remind_at > self._localized(datetime.fromisoformat(app["interview_at"]), request.timezone):
                raise HTTPException(status_code=422, detail="An interview reminder cannot be scheduled after the confirmed interview.")
        elif request.kind == "follow_up":
            if not app["follow_up_at"] or not app["follow_up_at_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the follow-up date before creating a follow-up reminder.")
            if remind_at > self._localized(datetime.fromisoformat(app["follow_up_at"]), request.timezone):
                raise HTTPException(status_code=422, detail="A follow-up reminder cannot be scheduled after the confirmed follow-up time.")

    def _validate_planner_against_confirmed_dates(self, app, request: PlannerActionRequest) -> None:
        start_at = self._localized(request.start_at, app["timezone"])
        if request.kind == "interview_prep":
            if not app["interview_at"] or not app["interview_at_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the interview date before scheduling interview preparation.")
            if start_at >= self._localized(datetime.fromisoformat(app["interview_at"]), app["timezone"]):
                raise HTTPException(status_code=422, detail="Interview preparation must be scheduled before the confirmed interview.")
        if request.kind == "follow_up":
            if not app["follow_up_at"] or not app["follow_up_at_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the follow-up date before scheduling a follow-up planner task.")
            expected = datetime.fromisoformat(app["follow_up_at"])
            if abs((start_at - self._localized(expected, app["timezone"])).total_seconds()) > 86400:
                raise HTTPException(status_code=422, detail="The follow-up planner task must stay within one day of the confirmed follow-up time.")
        if request.kind == "deadline_prep":
            if not app["application_deadline"] or not app["application_deadline_confirmed"]:
                raise HTTPException(status_code=409, detail="Confirm the application deadline before scheduling deadline preparation.")
            deadline = date.fromisoformat(app["application_deadline"])
            if start_at.date() > deadline:
                raise HTTPException(status_code=422, detail="Application preparation cannot be scheduled after the confirmed deadline.")

    def _now(self) -> datetime:
        value = self.now()
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    @staticmethod
    def _dt(value: str | None) -> datetime | None:
        return datetime.fromisoformat(value) if value else None

    @staticmethod
    def _iso(value: datetime | None) -> str | None:
        if not value: return None
        if value.tzinfo is None: value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    @staticmethod
    def _localized(value: datetime, timezone_name: str) -> datetime:
        tz = InternshipService._timezone(timezone_name)
        if value.tzinfo is None:
            return value.replace(tzinfo=tz)
        return value.astimezone(tz)

    @staticmethod
    def _required_iso(value: datetime) -> str:
        if value.tzinfo is None: value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()

    @staticmethod
    def _timezone(value: str) -> ZoneInfo:
        try: return ZoneInfo(value)
        except ZoneInfoNotFoundError as exc: raise HTTPException(status_code=422, detail="Timezone must be a valid IANA timezone.") from exc
