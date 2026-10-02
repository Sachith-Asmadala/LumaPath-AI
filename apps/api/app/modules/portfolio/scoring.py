from __future__ import annotations

from datetime import datetime, timezone

from .schemas import CompletenessIndicator, ProjectFacts, SkillEvidenceResponse, VerificationStatus
from .taxonomy import role_skills


def completeness(description: str, project_url: str | None, live_demo_url: str | None, facts: ProjectFacts) -> tuple[int, list[CompletenessIndicator]]:
    rules: list[tuple[str, str, int, bool, str]] = [
        ("description", "Clear project description", 15, len(description.strip()) >= 80, "Description has at least 80 characters." if len(description.strip()) >= 80 else "Description is shorter than 80 characters."),
        ("project_url", "Project link", 5, bool(project_url), "Project link is provided." if project_url else "No project link is provided."),
        ("live_demo", "Live demo", 10, bool(live_demo_url), "Live demo link is provided." if live_demo_url else "No live demo link is provided."),
        ("readme", "README", 20, facts.has_readme, "README is present." if facts.has_readme else "README is not evidenced."),
        ("tests", "Automated tests", 20, facts.has_tests, "Tests are present." if facts.has_tests else "Automated tests are not evidenced."),
        ("documentation", "Documentation", 15, facts.has_documentation, "Documentation is present." if facts.has_documentation else "Documentation beyond README is not evidenced."),
        ("activity", "Recent activity", 5, facts.last_activity_at is not None, f"Last activity recorded at {facts.last_activity_at.isoformat()}." if facts.last_activity_at else "No activity timestamp is available."),
        ("topics", "Project topics", 5, bool(facts.topics), f"{len(facts.topics)} topic(s) recorded." if facts.topics else "No project topics are recorded."),
        ("technology", "Technology evidence", 5, bool(facts.technologies or facts.languages), "Technology/language evidence is recorded." if facts.technologies or facts.languages else "No technology/language evidence is recorded."),
    ]
    indicators = [CompletenessIndicator(key=k, label=label, points=weight if ok else 0, max_points=weight, satisfied=ok, evidence=evidence) for k, label, weight, ok, evidence in rules]
    return sum(item.points for item in indicators), indicators


def map_skills(role: str, facts: ProjectFacts, source_type: str, source_timestamp: datetime) -> tuple[list[SkillEvidenceResponse], list[SkillEvidenceResponse]]:
    haystack = {item.strip().lower() for item in [*facts.technologies, *facts.languages, *facts.topics] if item.strip()}
    joined = " | ".join(sorted(haystack))
    demonstrated: list[SkillEvidenceResponse] = []
    missing: list[SkillEvidenceResponse] = []
    observed = source_type == "repository_snapshot"
    for rule in role_skills(role):
        matches = sorted({keyword for keyword in rule.keywords if keyword in joined})
        flags = [flag for flag in rule.indicators if bool(getattr(facts, flag, False))]
        evidence = [f"Observed keyword: {item}" for item in matches] + [f"Indicator present: {item.removeprefix('has_').replace('_', ' ')}" for item in flags]
        if evidence:
            demonstrated.append(SkillEvidenceResponse(
                skill_id=rule.skill_id, skill_name=rule.name,
                status=VerificationStatus.OBSERVED if observed else VerificationStatus.SELF_REPORTED,
                confidence=min(0.95 if observed else 0.65, 0.45 + 0.1 * len(evidence)),
                evidence=evidence, source_type="repository_snapshot" if observed else "manual_project", source_timestamp=source_timestamp,
            ))
        else:
            missing.append(SkillEvidenceResponse(
                skill_id=rule.skill_id, skill_name=rule.name, status=VerificationStatus.NOT_DEMONSTRATED,
                confidence=0.0, evidence=["No matching observable evidence in the current project facts."],
                source_type="repository_snapshot" if observed else "manual_project", source_timestamp=source_timestamp,
            ))
    return demonstrated, missing
