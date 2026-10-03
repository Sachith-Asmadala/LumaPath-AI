import pytest
from pydantic import ValidationError
from apps.api.app.core.quiz_responses import KNOWLEDGE_RESPONSES
from apps.api.app.modules.ai.study_assistant.schemas import QuizQuestion
from apps.api.app.modules.documents.schemas import DocumentQuizQuestion


@pytest.mark.parametrize("schema", [QuizQuestion, DocumentQuizQuestion])
def test_generated_quizzes_always_include_non_scoring_responses(schema):
    payload = {"id": "q1", "prompt": "Choose the correct response", "choices": ["Wrong", "Correct", "Another option"], "answer_index": 1}
    if schema is DocumentQuizQuestion:
        payload["source_refs"] = [{"chunk_id": "c1", "locator_type": "page", "locator": "1"}]
    quiz = schema.model_validate(payload)
    assert quiz.choices[-2:] == list(KNOWLEDGE_RESPONSES)
    assert quiz.choices[quiz.answer_index] == "Correct"
    assert schema.model_validate(quiz.model_dump()).model_dump() == quiz.model_dump()
    for answer_index in [3, 4]:
        with pytest.raises(ValidationError, match="Reflection responses cannot"):
            schema.model_validate({**quiz.model_dump(), "answer_index": answer_index})


@pytest.mark.parametrize("schema", [QuizQuestion, DocumentQuizQuestion])
def test_six_content_choices_survive_round_trip_with_reflection_choices(schema):
    payload = {"id": "q1", "prompt": "Choose one", "choices": list("ABCDEF"), "answer_index": 5}
    if schema is DocumentQuizQuestion:
        payload["source_refs"] = [{"chunk_id": "c1", "locator_type": "page", "locator": "1"}]
    quiz = schema.model_validate(payload)
    assert len(quiz.choices) == 8
    assert quiz.answer_index == 5
    assert schema.model_validate(quiz.model_dump()).model_dump() == quiz.model_dump()
