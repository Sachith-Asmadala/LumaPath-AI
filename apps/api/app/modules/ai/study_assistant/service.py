from __future__ import annotations

from datetime import datetime, timedelta
import hashlib
import re
import uuid
from pydantic import ValidationError

from .provider import StructuredAssistantProvider
from .repository import AssistantRepository
from .schemas import (
    ApproveActionRequest,
    ApproveActionResponse,
    AssistantContextRef,
    AssistantDraft,
    AssistantMode,
    ContextKind,
    ContextSyncResponse,
    FeedbackRequest,
    ProposedAction,
    StudentAssistantContextSnapshot,
    StudyAssistantRequest,
    StudyAssistantResponse,
)


class AssistantError(Exception):
    status_code = 400


class ContextNotFoundError(AssistantError):
    status_code = 404


class ContextForbiddenError(AssistantError):
    status_code = 403


class InvalidProviderOutputError(AssistantError):
    status_code = 502


class InvalidActionError(AssistantError):
    status_code = 422


class ProviderUnavailableError(AssistantError):
    status_code = 503


_INJECTION_LINE = re.compile(r"(?i)(ignore|disregard|override).{0,40}(instruction|system|developer|policy)")


def _validated_response_locale(draft: AssistantDraft, requested_locale: str) -> str:
    """Validate target-language coverage in generated explanatory fields.

    Citations, source labels and proposed-action titles are intentionally excluded because they may
    be authoritative/user-authored text that must remain unchanged. Technical Latin terms are allowed,
    but a response cannot claim Sinhala/Tamil merely because a heading contains a few target-script chars.
    """
    if requested_locale == "en":
        return "en"

    parts = [draft.title, draft.summary, draft.why_this]
    for block in draft.blocks:
        parts.extend([block.title, block.body])
        for item in block.items:
            parts.extend([item.title, item.detail])
        for question in block.quiz:
            parts.extend([question.prompt, question.explanation])
    text = " ".join(part for part in parts if part)
    latin = sum(1 for char in text if char.isascii() and char.isalpha())

    if requested_locale == "si-LK":
        target = sum(1 for char in text if "\u0D80" <= char <= "\u0DFF")
        total = target + latin
        return "si-LK" if target >= 20 and total and target / total >= 0.35 else "en"
    if requested_locale == "ta-LK":
        target = sum(1 for char in text if "\u0B80" <= char <= "\u0BFF")
        total = target + latin
        return "ta-LK" if target >= 20 and total and target / total >= 0.35 else "en"
    return "en"


class StudyAssistantService:
    def __init__(self, repository: AssistantRepository, provider: StructuredAssistantProvider) -> None:
        self.repository = repository
        self.provider = provider

    def sync_context(self, student_id: str, snapshot: StudentAssistantContextSnapshot) -> ContextSyncResponse:
        if snapshot.student_id != student_id:
            raise ContextForbiddenError("You cannot sync another student's context.")
        collections = [snapshot.modules, snapshot.tasks, snapshot.learning_objectives, snapshot.plan_blocks, snapshot.materials]
        if any(getattr(item, "owner_id", student_id) != student_id for collection in collections for item in collection):
            raise ContextForbiddenError("Context contains a reference owned by another student.")
        self.repository.sync_context(student_id, snapshot)
        self.repository.audit(student_id, "assistant_context_synced", {"modules": str(len(snapshot.modules)), "tasks": str(len(snapshot.tasks)), "objectives": str(len(snapshot.learning_objectives))})
        return ContextSyncResponse(student_id=student_id, modules=len(snapshot.modules), tasks=len(snapshot.tasks), learning_objectives=len(snapshot.learning_objectives), materials=len(snapshot.materials))

    @staticmethod
    def _lookup_context(snapshot: StudentAssistantContextSnapshot, ref: AssistantContextRef):
        collection = {
            ContextKind.MODULE: snapshot.modules,
            ContextKind.TASK: snapshot.tasks,
            ContextKind.LEARNING_OBJECTIVE: snapshot.learning_objectives,
        }[ref.kind]
        match = next((item for item in collection if item.id == ref.id), None)
        if not match:
            raise ContextNotFoundError("The selected study context is missing or no longer available.")
        if match.owner_id != snapshot.student_id:
            raise ContextForbiddenError("The selected study context belongs to another student.")
        return match

    @staticmethod
    def _clean_material_excerpt(text: str) -> str:
        lines = []
        for line in text.splitlines():
            if _INJECTION_LINE.search(line):
                lines.append("[untrusted instruction-like text removed]")
            else:
                lines.append(line)
        return "\n".join(lines)[:2000]

    def _provider_context(self, snapshot: StudentAssistantContextSnapshot, request: StudyAssistantRequest) -> dict:
        selected = self._lookup_context(snapshot, request.context_ref)
        selected_task = selected if request.context_ref.kind == ContextKind.TASK else None
        relevant_tasks = []
        if request.context_ref.kind == ContextKind.MODULE:
            relevant_tasks = [task for task in snapshot.tasks if task.module and task.module.casefold() == selected.name.casefold()]
        elif request.context_ref.kind == ContextKind.TASK:
            relevant_tasks = [selected]
        else:
            tokens = set(re.findall(r"[a-z0-9+#.-]+", selected.title.casefold()))
            relevant_tasks = [task for task in snapshot.tasks if tokens.intersection(re.findall(r"[a-z0-9+#.-]+", f"{task.title} {task.description}".casefold()))]
        # Today's mode may consider all active tasks, because deadline/capacity context is explicitly part of the story.
        if request.mode == AssistantMode.TODAY_SUGGESTION:
            relevant_tasks = [task for task in snapshot.tasks if task.status not in {"completed", "missed"}]

        relevant_skills: set[str] = set()
        for item in relevant_tasks:
            relevant_skills.update(item.career_skill_ids)
        if request.context_ref.kind == ContextKind.LEARNING_OBJECTIVE and request.context_ref.id.startswith("skill-"):
            relevant_skills.add(request.context_ref.id.removeprefix("skill-"))
        materials = []
        for material in snapshot.materials:
            if material.owner_id != snapshot.student_id:
                continue
            if not material.skill or material.skill not in relevant_skills:
                continue
            materials.append({"id": material.id, "title": material.title, "source": material.source, "excerpt": self._clean_material_excerpt(material.excerpt), "skill": material.skill})
        warnings: list[str] = []
        if not materials:
            warnings.append("No relevant saved learning material was available; course-specific claims are intentionally avoided.")
        return {
            "snapshot": snapshot,
            "selected": selected,
            "selected_task": selected_task,
            "relevant_tasks": relevant_tasks,
            "materials": materials,
            "warnings": warnings,
        }

    def respond(self, student_id: str, request: StudyAssistantRequest) -> StudyAssistantResponse:
        snapshot = self.repository.get_context(student_id)
        if not snapshot:
            raise ContextNotFoundError("No authorised student context is available. Sync the current workspace first.")
        selected = self._lookup_context(snapshot, request.context_ref)
        if selected.owner_id != student_id:
            raise ContextForbiddenError("You cannot access another student's context.")
        session_id = request.session_id or f"asst_{uuid.uuid4().hex}"
        try:
            session = self.repository.get_or_create_session(session_id, student_id)
        except PermissionError as exc:
            raise ContextForbiddenError(str(exc)) from exc

        provider_context = self._provider_context(snapshot, request)
        draft: AssistantDraft | None = None
        last_error: Exception | None = None
        for repair in (False, True):
            try:
                raw = self.provider.generate(mode=request.mode, context_ref=request.context_ref, question=request.question, context=provider_context, locale=request.locale, repair=repair)
                draft = AssistantDraft.model_validate(raw)
                break
            except (ValidationError, ValueError, TypeError) as exc:
                last_error = exc
            except (TimeoutError, ConnectionError, OSError) as exc:
                raise ProviderUnavailableError("The assistant provider is temporarily unavailable. No response was saved.") from exc
            except Exception as exc:
                raise ProviderUnavailableError("The assistant provider failed safely. No response was saved.") from exc
        if draft is None:
            raise InvalidProviderOutputError("The assistant returned an invalid structured response and it was not saved.") from last_error

        response_locale = _validated_response_locale(draft, request.locale)
        response = StudyAssistantResponse(
            **draft.model_dump(), response_id=f"resp_{uuid.uuid4().hex}", session_id=session_id, mode=request.mode,
            context_used=[request.context_ref], general_guidance=request.mode in {AssistantMode.CONCEPT_EXPLANATION, AssistantMode.QUIZ},
            requested_locale=request.locale, response_locale=response_locale, locale_fallback=response_locale != request.locale,
        )
        digest = hashlib.sha256(request.question.strip().encode("utf-8")).hexdigest() if request.question.strip() else ""
        self.repository.save_response(session, response, digest)
        self.repository.audit(student_id, "assistant_response_created", {"response_id": response.response_id, "session_id": session_id, "mode": request.mode.value, "context_kind": request.context_ref.kind.value, "context_id": request.context_ref.id, "requested_locale": request.locale, "response_locale": response_locale, "locale_fallback": str(response.locale_fallback).lower()})
        return response

    def _validate_action_against_context(self, snapshot: StudentAssistantContextSnapshot, action: ProposedAction) -> None:
        selected = self._lookup_context(snapshot, action.source_context_ref)
        if selected.owner_id != snapshot.student_id:
            raise ContextForbiddenError("The proposed action references another student's context.")
        if action.kind in {"task", "plan_item"}:
            assert action.estimated_minutes is not None
            if action.estimated_minutes > max(30, snapshot.capacity.planning_minutes):
                raise InvalidActionError("This action is larger than the student's current planning capacity. Split or shorten it before saving.")
            reference_start = datetime.fromisoformat(snapshot.reference_date)
            if action.start_at and action.start_at < reference_start:
                raise InvalidActionError("The proposed study block is before the current planning date.")
            if action.due_at and action.start_at and action.start_at > action.due_at:
                raise InvalidActionError("The proposed study block starts after its deadline.")
            if action.source_context_ref.kind == ContextKind.TASK and getattr(selected, "due_at", None):
                source_due = selected.due_at
                if action.due_at and action.due_at > source_due:
                    raise InvalidActionError("A suggested subtask cannot move the known assignment deadline later.")
                if action.start_at and action.start_at > source_due:
                    raise InvalidActionError("A suggested subtask cannot be scheduled after the known assignment deadline.")
            if action.start_at:
                end_at = action.start_at + timedelta(minutes=action.estimated_minutes)
                for block in snapshot.plan_blocks:
                    if action.start_at < block.end_at and end_at > block.start_at:
                        raise InvalidActionError(f"The proposed study block conflicts with existing planner item “{block.title}”.")
        if action.kind == "quiz_set" and len(action.quiz) > 12:
            raise InvalidActionError("A saved quiz is limited to 12 questions.")

    def approve_action(self, student_id: str, request: ApproveActionRequest) -> ApproveActionResponse:
        snapshot = self.repository.get_context(student_id)
        if not snapshot:
            raise ContextNotFoundError("No authorised student context is available.")
        try:
            response = self.repository.get_response(request.session_id, request.response_id, student_id)
        except PermissionError as exc:
            raise ContextForbiddenError(str(exc)) from exc
        if not response:
            raise ContextNotFoundError("The assistant response is missing or expired.")
        original = next((item for item in response.proposed_actions if item.id == request.action.id), None)
        if not original:
            raise InvalidActionError("This action was not proposed by the selected assistant response.")
        if original.kind != request.action.kind or original.source_context_ref.kind != request.action.source_context_ref.kind or original.source_context_ref.id != request.action.source_context_ref.id:
            raise InvalidActionError("The edited action changed protected proposal fields.")
        self._validate_action_against_context(snapshot, request.action)
        try:
            self.repository.save_action(request.session_id, student_id, request.action)
        except PermissionError as exc:
            raise ContextForbiddenError(str(exc)) from exc
        self.repository.audit(student_id, "assistant_action_approved", {"response_id": request.response_id, "action_id": request.action.id, "kind": request.action.kind})
        return ApproveActionResponse(saved=True, action_id=request.action.id, kind=request.action.kind, message="Approved action saved after ownership, date and capacity validation.")

    def save_feedback(self, student_id: str, session_id: str, request: FeedbackRequest) -> None:
        try:
            self.repository.save_feedback(session_id, request.response_id, student_id, request.helpful, request.note)
            self.repository.audit(student_id, "assistant_feedback_saved", {"response_id": request.response_id, "helpful": str(request.helpful).lower()})
        except PermissionError as exc:
            raise ContextForbiddenError(str(exc)) from exc
        except KeyError as exc:
            raise ContextNotFoundError(str(exc)) from exc
