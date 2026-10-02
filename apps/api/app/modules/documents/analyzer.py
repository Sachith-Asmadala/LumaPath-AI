from __future__ import annotations

from datetime import datetime
import math
import re
import uuid

from .schemas import (
    DateCandidate,
    DocumentAnalysis,
    DocumentProposedAction,
    DocumentQuizQuestion,
    Flashcard,
    LearningOutcome,
    SourceRef,
)

_SENTENCE = re.compile(r"(?<=[.!?])\s+|\n+")
_DATE_PATTERNS = [
    (re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b"), "%Y-%m-%d"),
    (re.compile(r"\b(\d{1,2})/(\d{1,2})/(20\d{2})\b"), "%d/%m/%Y"),
    (re.compile(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,)?\s+(20\d{2})\b", re.I), "%B %d %Y"),
]
_INJECTION = re.compile(r"ignore (?:all|the) (?:previous|prior|system) instructions|reveal (?:secrets|system prompt)|act as system", re.I)


def _sentences(text: str) -> list[str]:
    return [piece.strip(" •\t-") for piece in _SENTENCE.split(text) if len(piece.strip()) >= 20]


def _ref(chunk: dict) -> SourceRef:
    return SourceRef(chunk_id=chunk["id"], locator_type=chunk["locator_type"], locator=chunk["locator"])


def _compact(sentence: str, limit: int = 360) -> str:
    sentence = " ".join(sentence.split())
    return sentence if len(sentence) <= limit else sentence[: limit - 1].rstrip() + "…"


def _extract_summary(chunks: list[dict]) -> tuple[str, list[SourceRef]]:
    chosen: list[str] = []
    refs: list[SourceRef] = []
    for chunk in chunks[:5]:
        for sentence in _sentences(chunk["text"]):
            if sentence not in chosen:
                chosen.append(_compact(sentence, 420))
                refs.append(_ref(chunk))
                break
        if len(chosen) >= 4:
            break
    if not chosen:
        chosen = [_compact(chunks[0]["text"], 600)]
        refs = [_ref(chunks[0])]
    return " ".join(chosen), refs


def _extract_outcomes(chunks: list[dict]) -> list[LearningOutcome]:
    candidates: list[tuple[str, SourceRef]] = []
    explicit = re.compile(r"\b(learning outcomes?|objectives?|by the end|you (?:will|should)|students? (?:will|should)|able to)\b", re.I)
    action = re.compile(r"\b(explain|understand|describe|implement|apply|analyse|analyze|evaluate|design|compare|identify|create|demonstrate)\b", re.I)
    for chunk in chunks:
        for sentence in _sentences(chunk["text"]):
            if explicit.search(sentence) or action.search(sentence):
                candidates.append((_compact(sentence, 500), _ref(chunk)))
                if len(candidates) >= 6:
                    break
        if len(candidates) >= 6:
            break
    derived = False
    if not candidates:
        derived = True
        for chunk in chunks[:3]:
            sentence = _sentences(chunk["text"])
            if sentence:
                candidates.append((f"Review and explain: {_compact(sentence[0], 320)}", _ref(chunk)))
    return [LearningOutcome(id=f"out_{index + 1}", text=text, source_refs=[ref], derived=derived) for index, (text, ref) in enumerate(candidates[:6])]


def _parse_date(raw: str, fmt: str) -> datetime | None:
    cleaned = re.sub(r"(st|nd|rd|th)", "", raw, flags=re.I).replace(",", "")
    try:
        return datetime.strptime(cleaned, fmt)
    except ValueError:
        return None


def _extract_dates(chunks: list[dict]) -> list[DateCandidate]:
    found: list[DateCandidate] = []
    seen: set[tuple[str, str]] = set()
    for chunk in chunks:
        text = chunk["text"]
        for pattern, fmt in _DATE_PATTERNS:
            for match in pattern.finditer(text):
                raw = match.group(0)
                key = (raw.lower(), chunk["id"])
                if key in seen:
                    continue
                seen.add(key)
                start, end = max(0, match.start() - 90), min(len(text), match.end() + 90)
                context = " ".join(text[start:end].split())
                has_deadline_word = bool(re.search(r"deadline|due|submit|submission|assessment|exam|quiz|lab|assignment", context, re.I))
                normalized = _parse_date(raw, fmt)
                confidence = 0.88 if normalized and has_deadline_word else 0.62 if normalized else 0.35
                label = "Possible deadline" if has_deadline_word else "Date mentioned"
                found.append(DateCandidate(
                    id=f"date_{len(found) + 1}", label=label, raw_text=_compact(context, 420),
                    normalized_date=normalized, confidence=confidence, source_refs=[_ref(chunk)],
                ))
                if len(found) >= 20:
                    return found
    return found


def _make_flashcards(chunks: list[dict]) -> list[Flashcard]:
    cards: list[Flashcard] = []
    definition = re.compile(r"^(.{3,80}?)\s+(?:is|are|means|refers to)\s+(.{10,500})$", re.I)
    for chunk in chunks:
        for sentence in _sentences(chunk["text"]):
            match = definition.match(" ".join(sentence.split()))
            if match:
                subject = match.group(1).strip(" :,-")
                cards.append(Flashcard(id=f"card_{len(cards) + 1}", front=f"What is {subject}?", back=_compact(match.group(2), 700), source_refs=[_ref(chunk)]))
            elif len(cards) < 3 and 30 <= len(sentence) <= 260:
                cards.append(Flashcard(id=f"card_{len(cards) + 1}", front=f"Explain this key idea from {chunk['locator']}.", back=_compact(sentence, 700), source_refs=[_ref(chunk)]))
            if len(cards) >= 8:
                return cards
    return cards


def _make_quiz(cards: list[Flashcard]) -> list[DocumentQuizQuestion]:
    quiz: list[DocumentQuizQuestion] = []
    for index, card in enumerate(cards[:6]):
        alternatives = [item.back for item in cards if item.id != card.id and item.back != card.back][:2]
        choices = [card.back, *alternatives]
        if len(choices) < 2:
            choices.append("This statement is not supported by the uploaded material.")
        quiz.append(DocumentQuizQuestion(
            id=f"quiz_{index + 1}", prompt=card.front, choices=choices, answer_index=0,
            explanation=f"The answer is grounded in {card.source_refs[0].locator}.", source_refs=card.source_refs,
        ))
    return quiz


def analyze_document(chunks: list[dict], original_name: str) -> DocumentAnalysis:
    summary, summary_refs = _extract_summary(chunks)
    outcomes = _extract_outcomes(chunks)
    dates = _extract_dates(chunks)
    cards = _make_flashcards(chunks)
    quiz = _make_quiz(cards)
    word_count = sum(len(chunk["text"].split()) for chunk in chunks)
    study_minutes = max(15, min(360, int(math.ceil(word_count / 180 * 1.45 / 5) * 5)))
    warnings: list[str] = []
    if any(_INJECTION.search(chunk["text"]) for chunk in chunks):
        warnings.append("Instruction-like text was detected inside the document and treated only as untrusted study content.")
    if dates:
        warnings.append("Dates extracted from documents are unconfirmed until you review them; LumaPath does not treat them as official automatically.")

    actions: list[DocumentProposedAction] = [DocumentProposedAction(
        id=f"act_{uuid.uuid4().hex[:12]}", kind="plan_item", title=f"Study {original_name}",
        description="Review the uploaded material using the extracted summary, outcomes and retrieval practice.",
        estimated_minutes=study_minutes, source_refs=summary_refs[:4],
    )]
    for candidate in dates[:5]:
        if candidate.normalized_date:
            actions.append(DocumentProposedAction(
                id=f"act_{uuid.uuid4().hex[:12]}", kind="task", title=f"Review {candidate.label.lower()} from {original_name}",
                description=candidate.raw_text, estimated_minutes=30, due_at=candidate.normalized_date,
                date_confirmed=False, source_refs=candidate.source_refs,
            ))
    if cards:
        actions.append(DocumentProposedAction(
            id=f"act_{uuid.uuid4().hex[:12]}", kind="flashcard_set", title=f"Flashcards · {original_name}",
            description="Editable flashcards grounded in the uploaded source.", flashcards=cards, source_refs=[ref for card in cards[:4] for ref in card.source_refs][:8],
        ))
    if quiz:
        actions.append(DocumentProposedAction(
            id=f"act_{uuid.uuid4().hex[:12]}", kind="quiz_set", title=f"Quiz · {original_name}",
            description="Editable retrieval questions grounded in the uploaded source.", quiz=quiz, source_refs=[ref for item in quiz[:4] for ref in item.source_refs][:8],
        ))
    return DocumentAnalysis(
        summary=summary,
        summary_source_refs=summary_refs[:8],
        learning_outcomes=outcomes,
        dates=dates,
        study_time_minutes=study_minutes,
        study_time_rationale=f"Estimated from about {word_count} extracted words plus time for active recall; adjust it before saving if your pace differs.",
        flashcards=cards,
        quiz=quiz,
        proposed_actions=actions,
        warnings=warnings,
    )
