from __future__ import annotations
from dataclasses import dataclass
from .schemas import RoundType, Level
from ..portfolio.taxonomy import role_skills

TEMPLATE_VERSION = '2026-10-v1'
RUBRIC_VERSION = '2026-10-v1'

@dataclass(frozen=True, slots=True)
class TemplateQuestion:
    prompt: str
    skill_ids: tuple[str,...]
    skill_names: tuple[str,...]
    evidence_refs: tuple[str,...] = ()


def questions_for(role: str, level: Level, round_type: RoundType, priority_skill_ids: tuple[str,...] = (), evidence_refs_by_skill: dict[str, tuple[str,...]] | None = None, project_titles: tuple[str,...] = ()) -> list[TemplateQuestion]:
    skills = list(role_skills(role))
    priority = {skill_id: i for i, skill_id in enumerate(priority_skill_ids)}
    skills.sort(key=lambda skill: (priority.get(skill.skill_id, 10_000), list(role_skills(role)).index(skill)))
    lead = skills[:3]
    evidence_refs_by_skill = evidence_refs_by_skill or {}
    if round_type == 'technical':
        qs = []
        level_instruction = {
            'intern': 'Start from the fundamentals, then explain one safe verification step.',
            'junior': 'Explain implementation choices, one trade-off, failure handling, and verification.',
            'mid': 'Discuss architecture trade-offs, operational risk, rollback or recovery, and measurable verification.',
        }[level]
        for skill in lead:
            qs.append(TemplateQuestion(
                prompt=f"Explain how you would use {skill.name} in a realistic {role} task. {level_instruction}",
                skill_ids=(skill.skill_id,), skill_names=(skill.name,), evidence_refs=evidence_refs_by_skill.get(skill.skill_id, ())))
        qs.append(TemplateQuestion(
            prompt=f"A deployment or service for a {role} task is failing. {level_instruction} Walk through what you would check before changing anything.",
            skill_ids=tuple(s.skill_id for s in lead), skill_names=tuple(s.name for s in lead), evidence_refs=tuple(ref for s in lead for ref in evidence_refs_by_skill.get(s.skill_id, ()))))
        return qs
    if round_type == 'behavioral':
        scope = {'intern': 'Focus on your own actions and what you learned.', 'junior': 'Include how you coordinated with others and handled trade-offs.', 'mid': 'Include how you created clarity for others, managed risk, and adjusted the approach.'}[level]
        return [
            TemplateQuestion(f"Tell me about a time you had competing deadlines. Use a concrete situation and explain how you chose what to do next. {scope}", (), ()),
            TemplateQuestion(f"Describe a time you received difficult technical feedback. What did you change, and what did you learn? {scope}", (), ()),
            TemplateQuestion(f"Describe a team disagreement about a technical decision. How did you communicate your reasoning and reach a workable outcome? {scope}", (), ()),
            TemplateQuestion(f"Tell me about a task that did not go as planned. Explain the situation, your actions, the result, and what you would do differently. {scope}", (), ()),
        ]
    project_hint = f" One recorded project is {project_titles[0]}." if project_titles else ""
    project_scope = {'intern': 'Keep the scope concrete and distinguish what you personally implemented.', 'junior': 'Explain ownership, trade-offs, testing, and one improvement you would make.', 'mid': 'Explain architecture boundaries, operational trade-offs, team impact, and how you validated the design.'}[level]
    return [
        TemplateQuestion(f"Choose one project that genuinely demonstrates your work toward a {role} role. Explain the problem, your personal contribution, and the evidence that supports your claims. {project_scope}{project_hint}", tuple(s.skill_id for s in lead), tuple(s.name for s in lead), tuple(ref for s in lead for ref in evidence_refs_by_skill.get(s.skill_id, ()))),
        TemplateQuestion("Walk through one technical decision in that project. What alternatives did you consider and why did you choose the final approach?", tuple(s.skill_id for s in lead[:2]), tuple(s.name for s in lead[:2])),
        TemplateQuestion("How did you test or verify that the project worked as intended? Distinguish what you measured from what you assumed.", (), ()),
        TemplateQuestion("What is the most important improvement you would make to this project next, and what evidence makes that improvement worthwhile?", (), ()),
    ]
