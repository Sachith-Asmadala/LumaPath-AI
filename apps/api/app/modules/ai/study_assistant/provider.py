from __future__ import annotations

from datetime import datetime, time, timedelta
import re
from typing import Protocol

from .schemas import (
    AssistantCitation,
    AssistantContextRef,
    AssistantDraft,
    AssistantMode,
    AssistantLocale,
    ProposedAction,
    QuizQuestion,
    ResponseBlock,
    ResponseItem,
    StudentAssistantContextSnapshot,
    TaskContext,
)


class StructuredAssistantProvider(Protocol):
    def generate(self, *, mode: AssistantMode, context_ref: AssistantContextRef, question: str, context: dict, locale: AssistantLocale = "en", repair: bool = False) -> dict:
        ...


_CONCEPTS: dict[str, tuple[str, list[str]]] = {
    "index": (
        "A database index is an additional data structure that helps the database locate rows without scanning every row in a table.",
        ["Indexes speed up reads that match the indexed columns.", "They consume storage and add work to inserts, updates, and deletes.", "A useful index follows real query patterns rather than indexing every column."],
    ),
    "normalization": (
        "Normalization organizes relational data to reduce unnecessary duplication and update anomalies.",
        ["1NF focuses on atomic values.", "2NF removes partial dependency on a composite key.", "3NF removes transitive dependency on non-key attributes."],
    ),
    "docker networking": (
        "Docker networking controls how containers discover and communicate with each other and with external services.",
        ["User-defined bridge networks provide built-in DNS by container/service name.", "Published ports expose container services to the host.", "Container-to-container traffic usually uses the container port, not the published host port."],
    ),
    "iam": (
        "IAM controls who or what can perform actions on cloud resources.",
        ["Prefer least-privilege permissions.", "Use roles or temporary credentials instead of long-lived secrets where possible.", "Separate identity policies from resource policies when reviewing access paths."],
    ),
    "ci/cd": (
        "CI/CD automates integration checks and delivery steps so software changes move through a repeatable pipeline.",
        ["CI validates changes with builds and tests.", "Continuous delivery keeps deployable artifacts ready.", "Deployment automation should include rollback and approval controls where risk requires them."],
    ),
}


def _known_concept(question: str) -> tuple[str, list[str]] | None:
    lowered = question.lower()
    for key, value in _CONCEPTS.items():
        if key in lowered or (key == "index" and "indexing" in lowered):
            return value
    return None


def _safe_question(question: str) -> str:
    # Treat user/material text as data, not instructions. This intentionally removes common
    # prompt-injection framing even when a future model provider is introduced.
    text = re.sub(r"(?i)(ignore|disregard|override)\s+(all\s+)?(previous|system|developer)\s+instructions?", "[untrusted instruction removed]", question)
    return " ".join(text.split())[:600]


def _task_for_context(context: dict) -> TaskContext | None:
    value = context.get("selected_task")
    return value if isinstance(value, TaskContext) else None


def _citation_list(context: dict) -> list[AssistantCitation]:
    return [
        AssistantCitation(id=item["id"], title=item["title"], source=item["source"], note="Saved learning material available to cross-check terminology and examples.")
        for item in context.get("materials", [])[:3]
    ]


def _day_at(snapshot: StudentAssistantContextSnapshot, day_offset: int, hour: int, minute: int = 0) -> datetime:
    base = datetime.fromisoformat(snapshot.reference_date)
    return datetime.combine(base.date() + timedelta(days=day_offset), time(hour, minute))


def _find_open_starts(snapshot: StudentAssistantContextSnapshot, durations: list[int], due: datetime | None = None) -> list[datetime | None]:
    blocks = [(item.start_at, item.end_at) for item in snapshot.plan_blocks]
    reserved: list[tuple[datetime, datetime]] = []
    per_day: dict[str, int] = {}
    results: list[datetime | None] = []
    base = datetime.fromisoformat(snapshot.reference_date)
    for duration in durations:
        found: datetime | None = None
        for day_offset in range(0, 7):
            day = base.date() + timedelta(days=day_offset)
            for hour in range(16, 22):
                for minute in (0, 30):
                    start = datetime.combine(day, time(hour, minute))
                    end = start + timedelta(minutes=duration)
                    if end.hour > 22 or (end.hour == 22 and end.minute > 0):
                        continue
                    if due and end > due:
                        continue
                    key = day.isoformat()
                    if per_day.get(key, 0) + duration > snapshot.capacity.planning_minutes:
                        continue
                    if any(start < b_end and end > b_start for b_start, b_end in [*blocks, *reserved]):
                        continue
                    found = start
                    reserved.append((start, end))
                    per_day[key] = per_day.get(key, 0) + duration
                    break
                if found:
                    break
            if found:
                break
        results.append(found)
    return results


class DeterministicStudyAssistantProvider:
    """Safe competition provider.

    It produces the same structured contract a model provider must produce, while keeping the
    project runnable without an API key. Course-specific facts are only taken from supplied context.
    """

    def generate(self, *, mode: AssistantMode, context_ref: AssistantContextRef, question: str, context: dict, locale: AssistantLocale = "en", repair: bool = False) -> dict:
        snapshot: StudentAssistantContextSnapshot = context["snapshot"]
        task = _task_for_context(context)
        label = context_ref.label
        safe_question = _safe_question(question)
        warnings = list(context.get("warnings", []))
        if mode == AssistantMode.CONCEPT_EXPLANATION:
            known = _known_concept(safe_question)
            if known:
                summary, points = known
                body = summary
                items = [ResponseItem(id=f"concept-{i}", title=point, detail="") for i, point in enumerate(points, start=1)]
                general = "This explanation uses general technical knowledge; no course-specific requirement is inferred."
            else:
                body = "I can help you reason through the selected concept, but the authorised context does not contain authoritative teaching material for it."
                items = [
                    ResponseItem(id="concept-1", title="Start from your lecturer or module material", detail="Use the definition and terminology supplied by your module first."),
                    ResponseItem(id="concept-2", title="Connect it to one example", detail="Write a small example in your own words and check it against the supplied material."),
                    ResponseItem(id="concept-3", title="Identify what is still unclear", detail="Turn the unclear part into a narrower question for your next study pass."),
                ]
                general = "I am avoiding invented course facts because no matching module material was supplied."
                warnings.append("No authoritative module material matched this concept, so the response stays at a general-guidance level.")
            return AssistantDraft(
                title=f"Concept help · {label}",
                summary=body,
                blocks=[ResponseBlock(kind="explanation", title="Understand it", body=body, items=items), ResponseBlock(kind="notice", title="Source boundary", body=general)],
                why_this=f"You selected {label}. The assistant used only that authorised context plus general technical guidance.",
                citations=_citation_list(context), warnings=warnings,
            ).model_dump(mode="json")

        if mode == AssistantMode.REVISION_PLAN:
            relevant = context.get("relevant_tasks", [])
            due = min((item.due_at for item in relevant if item.due_at), default=task.due_at if task else None)
            capacity = snapshot.capacity.planning_minutes
            block = max(20, min(50, capacity // 3 if capacity else 25))
            starts = _find_open_starts(snapshot, [block, block, block], due)
            actions: list[ProposedAction] = []
            items: list[ResponseItem] = []
            first_material = context.get("materials", [None])[0] if context.get("materials") else None
            recall_detail = f"Write what you remember, then cross-check against saved material “{first_material['title']}”." if first_material else "Write what you remember before checking notes."
            for index, (title, detail) in enumerate([
                ("Recall the core ideas", recall_detail),
                ("Practice the weak spots", "Use one worked example or short practice exercise."),
                ("Close with retrieval", "Answer a few questions without notes and mark the gaps."),
            ], start=1):
                start = starts[index - 1]
                items.append(ResponseItem(id=f"revision-{index}", title=title, detail=detail, meta=f"{block} min"))
                if start is not None:
                    actions.append(ProposedAction(
                        id=f"revision-action-{index}", kind="plan_item", title=f"{label}: {title}", source_context_ref=context_ref,
                        estimated_minutes=block, start_at=start, due_at=due, category="Academic", description=detail,
                    ))
                else:
                    warnings.append(f"No conflict-free {block}-minute slot was available for “{title}”; keep it as an unscheduled revision suggestion.")
            return AssistantDraft(
                title=f"Revision plan · {label}",
                summary=f"A three-part revision plan sized to your current planning capacity of {capacity} minutes.",
                blocks=[ResponseBlock(kind="plan", title="Editable revision blocks", body="Review the blocks before saving them to your planner.", items=items)],
                why_this=f"The plan is short enough to fit your available capacity and keeps the selected {context_ref.kind.value.replace('_', ' ')} as the study anchor.",
                proposed_actions=actions,
                citations=_citation_list(context), warnings=warnings,
            ).model_dump(mode="json")

        if mode == AssistantMode.QUIZ:
            topic = label
            quiz = [
                QuizQuestion(id="q1", prompt=f"Which statement best captures the main idea you should be able to explain about {topic}?", choices=["A clear definition in your own words", "Only the exact wording from a source", "A deadline with no concept", "An unrelated career goal"], answer_index=0, explanation="Retrieval in your own words is a stronger revision check than copying wording."),
                QuizQuestion(id="q2", prompt=f"What is the safest next step when you are unsure about a course-specific claim for {label}?", choices=["Check the authorised module material", "Invent a plausible requirement", "Treat general guidance as the marking scheme", "Ignore uncertainty"], answer_index=0, explanation="Course-specific requirements should come from authorised module sources."),
                QuizQuestion(id="q3", prompt="Which revision action most directly tests recall?", choices=["Answer without notes, then check", "Re-read passively for the whole session", "Open unrelated material", "Skip the weak area"], answer_index=0, explanation="Retrieval practice exposes what you can recall before checking the source."),
            ]
            action = ProposedAction(id="quiz-action", kind="quiz_set", title=f"Quiz · {label}", source_context_ref=context_ref, quiz=quiz, description=f"Editable study quiz for {label}.")
            return AssistantDraft(
                title=f"Practice quiz · {label}", summary="An editable three-question retrieval quiz grounded in the selected study context.",
                blocks=[ResponseBlock(kind="quiz", title="Quiz", body="Edit the questions if you want them closer to your lecturer's terminology.", quiz=quiz)],
                why_this=f"A short retrieval quiz fits the selected objective without inventing assessment requirements.", proposed_actions=[action], citations=_citation_list(context), warnings=warnings,
            ).model_dump(mode="json")

        if mode == AssistantMode.ASSIGNMENT_BREAKDOWN:
            assert task is not None
            remaining = max(20, round(task.estimated_minutes * max(0.1, (100 - task.progress) / 100)))
            chunks = [
                ("Confirm the deliverables", "Read the authorised brief/rubric and list what must actually be submitted."),
                ("Complete the core work", task.description or "Work through the main implementation or analysis."),
                ("Verify and package", "Test the result, check the requirements again, then prepare the final submission files."),
            ]
            per_chunk = max(15, min(60, remaining // len(chunks)))
            starts = _find_open_starts(snapshot, [per_chunk] * len(chunks), task.due_at)
            actions = []
            for index, ((title, detail), start) in enumerate(zip(chunks, starts), start=1):
                if start is None:
                    warnings.append(f"No conflict-free slot was available for “{title}”; it remains review-only until capacity changes.")
                    continue
                actions.append(ProposedAction(
                    id=f"breakdown-action-{index}", kind="task", title=f"{task.title} · {title}", source_context_ref=context_ref,
                    estimated_minutes=per_chunk, start_at=start, due_at=task.due_at, category=task.category, description=detail,
                ))
            items = [ResponseItem(id=f"breakdown-{index}", title=title, detail=detail, meta=f"~{per_chunk} min") for index, (title, detail) in enumerate(chunks, start=1)]
            return AssistantDraft(
                title=f"Assignment breakdown · {task.title}",
                summary=f"Three reviewable steps for the remaining work. Nothing is created until you approve it.",
                blocks=[ResponseBlock(kind="steps", title="Proposed task breakdown", body="Keep, edit, or skip each item before saving.", items=items)],
                why_this=f"{task.title} is {task.progress}% complete with risk {task.risk_score}/100. The breakdown protects the known deadline without inventing hidden assessment requirements.",
                proposed_actions=actions, citations=_citation_list(context), warnings=warnings,
            ).model_dump(mode="json")

        relevant = [item for item in context.get("relevant_tasks", []) if item.status not in {"completed", "missed"}]
        relevant.sort(key=lambda item: (-item.risk_score, item.due_at or datetime.max))
        fitting = next((item for item in relevant if item.estimated_minutes <= max(25, snapshot.capacity.planning_minutes)), None) or (relevant[0] if relevant else task)
        if not fitting:
            return AssistantDraft(
                title="Today's study suggestion", summary="There is not enough authorised task or learning context to choose a study action.",
                blocks=[ResponseBlock(kind="notice", title="Add context first", body="Add an active task, module, or learning objective, then return to Study Assistant.")],
                why_this="LumaPath will not fabricate a deadline or study priority when no usable context exists.", citations=_citation_list(context), warnings=[*warnings, "No usable active task was available."],
            ).model_dump(mode="json")
        duration = min(fitting.estimated_minutes, max(25, min(75, snapshot.capacity.planning_minutes)))
        start = _find_open_starts(snapshot, [duration], fitting.due_at)[0]
        actions = []
        if start is not None:
            actions.append(ProposedAction(id="today-action", kind="plan_item", title=fitting.title, source_context_ref=context_ref, estimated_minutes=duration, start_at=start, due_at=fitting.due_at, category=fitting.category, description=fitting.description))
        else:
            warnings.append("No conflict-free slot fits this suggestion yet; adjust your planner or capacity before saving it.")
        return AssistantDraft(
            title="Today's study suggestion", summary=f"Spend {duration} minutes on {fitting.title}.",
            blocks=[ResponseBlock(kind="plan", title="Next study block", body=fitting.description, items=[ResponseItem(id="today-1", title=fitting.title, detail=f"Risk {fitting.risk_score}/100 · progress {fitting.progress}%", meta=f"{duration} min")])],
            why_this=f"It is one of your highest active deadline risks and the block fits within your {snapshot.capacity.planning_minutes}-minute planning capacity. Your current goal is {snapshot.student_goal or 'study progress'} toward {snapshot.target_role}.", proposed_actions=actions, citations=_citation_list(context), warnings=warnings,
        ).model_dump(mode="json")
