from __future__ import annotations
import re
from dataclasses import dataclass
from .schemas import InterviewFeedback, InterviewFeedbackItem, RubricCriterionResult
from .templates import RUBRIC_VERSION

PROTECTED_TERMS = {'age','gender','race','religion','disability','married','pregnant','ethnicity','nationality','sexual orientation'}

@dataclass(slots=True)
class EvaluationContext:
    round_type: str
    responses: list[dict]
    questions: dict[str,dict]
    role: str

class DeterministicInterviewEvaluator:
    def evaluate(self, ctx: EvaluationContext, generated_at):
        results=[]; items=[]
        for response in ctx.responses:
            q=ctx.questions[response['question_id']]; raw=response['answer_text']; low=raw.lower()
            sanitized=' '.join(w for w in re.findall(r"[\w/+.#-]+", low) if w not in PROTECTED_TERMS)
            words=sanitized.split(); length=len(words)
            relevant_terms=[s.lower() for s in q.get('skill_names',[]) if s]
            relevance=min(5, 1 + (2 if length>=25 else 0) + (2 if any(term in low for term in relevant_terms) or not relevant_terms else 0))
            if ctx.round_type=='behavioral':
                markers=sum(1 for term in ('situation','task','action','result','learned','outcome') if term in low)
                structure=min(5, 1 + min(4, markers))
            else:
                markers=sum(1 for term in ('because','trade-off','verify','test','measure','alternative','result') if term in low)
                structure=min(5, 1 + min(4, markers))
            technical=2 if ctx.round_type=='behavioral' else min(5, 1 + min(4, sum(1 for term in relevant_terms if term in low) + (1 if any(x in low for x in ('test','verify','monitor','measure')) else 0)))
            communication=min(5, 1 + (2 if 35<=length<=280 else 1 if length>=15 else 0) + (1 if any(x in raw for x in ('.',';')) else 0) + (1 if not re.search(r'\b(um+|uh+|like like)\b',low) else 0))
            excerpt=' '.join(raw.strip().split())[:180]
            for criterion,score,rationale in [
                ('relevance',relevance,'Checks whether the response directly addresses the question and named skill evidence.'),
                ('structure',structure,'Checks for an understandable reasoning or STAR-like structure appropriate to the round.'),
                ('technical_content',technical,'Checks observable technical reasoning only; factual correctness is not independently verified.'),
                ('communication',communication,'Checks clarity and readable organization of the captured text, not accent or personality.'),
            ]:
                results.append(RubricCriterionResult(criterion=criterion,score=score,rationale=rationale,evidence_excerpt=excerpt,response_id=response['id']))
            avg=(relevance+structure+technical+communication)/4
            if avg>=3.5:
                items.append(InterviewFeedbackItem(kind='strength',title='A clear, relevant response',detail='This answer stayed reasonably focused and provided enough structure to follow the reasoning.',refs=[f"response:{response['id']}",f"rubric:relevance:{response['id']}"]))
            if structure<4:
                items.append(InterviewFeedbackItem(kind='improvement',title='Make the reasoning easier to follow',detail='Use a short context → action/decision → evidence/result structure and separate assumptions from verified facts.',refs=[f"response:{response['id']}",f"rubric:structure:{response['id']}"]))
            if ctx.round_type!='behavioral' and technical<4:
                topic=(q.get('skill_names') or ['technical verification'])[0]
                items.append(InterviewFeedbackItem(kind='study_topic',title=topic,detail=f'Review {topic} with emphasis on trade-offs, verification, and failure handling before the next attempt.',refs=[f"response:{response['id']}",f"rubric:technical_content:{response['id']}"]))
        score=round(sum(x.score for x in results)/(len(results)*5)*100) if results else 0
        return InterviewFeedback(rubric_version=RUBRIC_VERSION,generated_at=generated_at,overall_practice_score=score,rubric_results=results,items=items[:16],illustrative_answer_structure=['State the context or problem.','Explain your own decision or action.','Give factual evidence, verification, or a concrete result.','Close with the lesson, trade-off, or next step.'],disclaimer='This is automated practice feedback, not an employment decision, recruiter prediction, or verified factual assessment.',uncertainty_note='The evaluator only sees the captured answer text and rubric. It does not infer protected characteristics, personality, motivation, or employability, and it may miss valid reasoning that is not stated explicitly.')
