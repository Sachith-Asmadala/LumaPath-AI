from __future__ import annotations

from datetime import datetime, timedelta, timezone
from math import ceil
from uuid import uuid4

from fastapi import HTTPException, status

from .repository import FocusSessionRecord, FocusSessionRepository
from .schemas import EstimateFeedback, FinishFocusSessionRequest, FocusSessionResponse, FocusStatus, StartFocusSessionRequest


HEARTBEAT_INTERVAL_SECONDS = 15
HEARTBEAT_GRACE_SECONDS = 30
HEARTBEAT_STALE_SECONDS = 45


class FocusSessionService:
    def __init__(self, repository: FocusSessionRepository, now=lambda: datetime.now(timezone.utc)):
        self.repository = repository
        self.now = now

    @staticmethod
    def _aware(value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    def _current(self, value: datetime | None = None) -> datetime:
        return self._aware(value) if value else self._aware(self.now())

    def start(self, student_id: str, request: StartFocusSessionRequest) -> FocusSessionResponse:
        existing = self.repository.active_for_student(student_id)
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Finish or close your current focus session before starting another one.")
        started = self._current(request.started_at)
        now_iso = started.isoformat()
        record = FocusSessionRecord(
            id=f"focus_{uuid4().hex}", student_id=student_id, task_id=request.task_id,
            task_title=request.task_title.strip(), objective=request.objective.strip(),
            planned_work_minutes=request.planned_work_minutes, planned_break_minutes=request.planned_break_minutes,
            task_estimated_minutes=request.task_estimated_minutes, task_progress_before=request.task_progress_before,
            task_progress_after=None, timezone=request.timezone, status="running", started_at=now_iso,
            active_segment_started_at=now_iso, last_heartbeat_at=now_iso, paused_at=None, ended_at=None, accumulated_active_seconds=0,
            notes="", next_step="", result=None, estimate_feedback=None, suggested_estimated_minutes=None,
            estimate_explanation=None, productive_minutes=0, created_at=now_iso, updated_at=now_iso,
        )
        self.repository.create(record)
        self.repository.audit(record.id, student_id, "started", now_iso, f"task={record.task_id}")
        return self._response(record, started)

    def get(self, student_id: str, session_id: str, at: datetime | None = None) -> FocusSessionResponse:
        record = self._owned(student_id, session_id)
        current = self._current(at)
        if record.status == "running":
            return self.heartbeat(student_id, session_id, current)
        return self._response(record, current)

    def active(self, student_id: str, at: datetime | None = None) -> FocusSessionResponse | None:
        record = self.repository.active_for_student(student_id)
        if not record:
            return None
        current = self._current(at)
        if record.status == "running":
            return self.heartbeat(student_id, record.id, current)
        return self._response(record, current)

    def pause(self, student_id: str, session_id: str, at: datetime | None = None) -> FocusSessionResponse:
        record = self._owned(student_id, session_id)
        if record.status != "running":
            raise HTTPException(status_code=409, detail="Only a running focus session can be paused.")
        current = self._current(at)
        accumulated = self._elapsed(record, current)
        record.accumulated_active_seconds = accumulated
        record.active_segment_started_at = None
        record.last_heartbeat_at = current.isoformat()
        record.paused_at = current.isoformat()
        record.status = "paused"
        record.updated_at = current.isoformat()
        self.repository.save(record)
        self.repository.audit(record.id, student_id, "paused", current.isoformat())
        return self._response(record, current)

    def resume(self, student_id: str, session_id: str, at: datetime | None = None) -> FocusSessionResponse:
        record = self._owned(student_id, session_id)
        if record.status != "paused":
            raise HTTPException(status_code=409, detail="Only a paused focus session can be resumed.")
        current = self._current(at)
        record.active_segment_started_at = current.isoformat()
        record.last_heartbeat_at = current.isoformat()
        record.paused_at = None
        record.status = "running"
        record.updated_at = current.isoformat()
        self.repository.save(record)
        self.repository.audit(record.id, student_id, "resumed", current.isoformat())
        return self._response(record, current)

    def heartbeat(self, student_id: str, session_id: str, at: datetime | None = None) -> FocusSessionResponse:
        record = self._owned(student_id, session_id)
        current = self._current(at)
        if record.status != "running":
            return self._response(record, current)
        last = self._aware(datetime.fromisoformat(record.last_heartbeat_at or record.active_segment_started_at or record.started_at))
        gap = max(0, int((current - last).total_seconds()))
        if gap > HEARTBEAT_STALE_SECONDS:
            cutoff = last + timedelta(seconds=HEARTBEAT_GRACE_SECONDS)
            record.accumulated_active_seconds = self._elapsed(record, cutoff)
            record.active_segment_started_at = None
            record.paused_at = cutoff.isoformat()
            record.status = "paused"
            record.updated_at = current.isoformat()
            self.repository.save(record)
            self.repository.audit(record.id, student_id, "auto_paused_inactive_gap", current.isoformat(), f"gap_seconds={gap}")
            return self._response(record, current)
        record.last_heartbeat_at = current.isoformat()
        record.updated_at = current.isoformat()
        self.repository.save(record)
        return self._response(record, current)

    def finish(self, student_id: str, session_id: str, request: FinishFocusSessionRequest) -> FocusSessionResponse:
        record = self._owned(student_id, session_id)
        if record.status not in {"running", "paused"}:
            raise HTTPException(status_code=409, detail="This focus session has already ended.")
        current = self._current(request.ended_at)
        elapsed = self._elapsed(record, current)
        if request.task_progress_after < record.task_progress_before:
            raise HTTPException(status_code=422, detail="Task progress cannot move backwards when closing a focus session.")
        record.accumulated_active_seconds = elapsed
        record.active_segment_started_at = None
        record.last_heartbeat_at = current.isoformat()
        record.paused_at = None
        record.ended_at = current.isoformat()
        record.task_progress_after = request.task_progress_after
        record.notes = request.notes.strip()
        record.next_step = request.next_step.strip()
        record.result = request.result
        record.status = request.result
        record.estimate_feedback = request.estimate_feedback.value if request.estimate_feedback else None
        record.productive_minutes = max(1, round(elapsed / 60)) if request.result == "completed" and elapsed > 0 else 0
        suggested, explanation = self._estimate(record, request)
        record.suggested_estimated_minutes = suggested
        record.estimate_explanation = explanation
        record.updated_at = current.isoformat()
        self.repository.save(record)
        self.repository.audit(record.id, student_id, f"ended_{request.result}", current.isoformat(), f"productive_minutes={record.productive_minutes}")
        return self._response(record, current)

    def recent(self, student_id: str, limit: int = 20) -> list[FocusSessionResponse]:
        current = self._current()
        return [self._response(item, current) for item in self.repository.recent_for_student(student_id, max(1, min(limit, 50)))]

    def _owned(self, student_id: str, session_id: str) -> FocusSessionRecord:
        record = self.repository.get(session_id)
        if not record:
            raise HTTPException(status_code=404, detail="Focus session not found.")
        if record.student_id != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's focus session.")
        return record

    def _elapsed(self, record: FocusSessionRecord, current: datetime) -> int:
        seconds = int(record.accumulated_active_seconds)
        if record.status == "running" and record.active_segment_started_at:
            segment = self._aware(datetime.fromisoformat(record.active_segment_started_at))
            last = self._aware(datetime.fromisoformat(record.last_heartbeat_at or record.active_segment_started_at))
            safe_end = min(current, last + timedelta(seconds=HEARTBEAT_GRACE_SECONDS))
            seconds += max(0, int((safe_end - segment).total_seconds()))
        return max(0, seconds)

    def _response(self, record: FocusSessionRecord, current: datetime) -> FocusSessionResponse:
        elapsed = self._elapsed(record, current) if record.status in {"running", "paused"} else int(record.accumulated_active_seconds)
        planned = record.planned_work_minutes * 60
        break_due = record.status == "running" and elapsed >= planned
        public_status = FocusStatus.BREAK_DUE if break_due else FocusStatus(record.status)
        return FocusSessionResponse(
            id=record.id, task_id=record.task_id, task_title=record.task_title, objective=record.objective,
            planned_work_minutes=record.planned_work_minutes, planned_break_minutes=record.planned_break_minutes,
            task_estimated_minutes=record.task_estimated_minutes, task_progress_before=record.task_progress_before,
            task_progress_after=record.task_progress_after, status=public_status, persisted_status=record.status,
            started_at=datetime.fromisoformat(record.started_at),
            active_segment_started_at=datetime.fromisoformat(record.active_segment_started_at) if record.active_segment_started_at else None,
            last_heartbeat_at=datetime.fromisoformat(record.last_heartbeat_at) if record.last_heartbeat_at else None,
            paused_at=datetime.fromisoformat(record.paused_at) if record.paused_at else None,
            ended_at=datetime.fromisoformat(record.ended_at) if record.ended_at else None,
            accumulated_active_seconds=record.accumulated_active_seconds, elapsed_work_seconds=elapsed,
            remaining_work_seconds=max(0, planned - elapsed), break_due=break_due, notes=record.notes,
            next_step=record.next_step, result=record.result,
            estimate_feedback=EstimateFeedback(record.estimate_feedback) if record.estimate_feedback else None,
            suggested_estimated_minutes=record.suggested_estimated_minutes,
            estimate_explanation=record.estimate_explanation, productive_minutes=record.productive_minutes,
            updated_at=datetime.fromisoformat(record.updated_at),
        )

    @staticmethod
    def _estimate(record: FocusSessionRecord, request: FinishFocusSessionRequest) -> tuple[int | None, str | None]:
        if request.result != "completed" or record.productive_minutes <= 0:
            return None, "Interrupted or abandoned sessions do not change future duration estimates."
        if request.manual_estimated_minutes is not None:
            return request.manual_estimated_minutes, "Manual correction kept as the student's explicit future estimate."
        progress_delta = max(0, request.task_progress_after - record.task_progress_before)
        if progress_delta <= 0:
            return record.task_estimated_minutes, "No progress increase was recorded, so LumaPath kept the existing estimate."
        observed_total = ceil(record.productive_minutes * 100 / progress_delta)
        # Smooth one session into the estimate instead of replacing it with a noisy extrapolation.
        suggested = max(5, min(10080, round(record.task_estimated_minutes * 0.65 + observed_total * 0.35)))
        if request.estimate_feedback == EstimateFeedback.ABOUT_RIGHT:
            suggested = round(record.task_estimated_minutes * 0.8 + suggested * 0.2)
        return suggested, (
            f"{record.productive_minutes} measured focus minutes produced {progress_delta}% task progress. "
            f"That session implies about {observed_total} minutes for 100% at the same pace; LumaPath blends 35% of that observation with the existing {record.task_estimated_minutes}-minute estimate."
        )
