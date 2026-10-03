"""Consistent, non-scoring reflection choices for every generated quiz."""

KNOWLEDGE_RESPONSES = (
    "I don’t know yet",
    "This is familiar, but I can’t recall the answer",
)


def with_knowledge_responses(choices: list[str], answer_index: int) -> tuple[list[str], int]:
    if answer_index >= len(choices):
        raise ValueError("Quiz answer index is outside the available choices.")
    if choices[answer_index] in KNOWLEDGE_RESPONSES:
        raise ValueError("Reflection responses cannot be marked as correct answers.")
    standard = [choice for choice in choices if choice not in KNOWLEDGE_RESPONSES]
    if not 2 <= len(standard) <= 6:
        raise ValueError("A quiz needs between two and six knowledge choices.")
    # Keep the same correct choice when normalizing an older or edited quiz.
    corrected_index = sum(choice not in KNOWLEDGE_RESPONSES for choice in choices[:answer_index])
    return [*standard, *KNOWLEDGE_RESPONSES], corrected_index
