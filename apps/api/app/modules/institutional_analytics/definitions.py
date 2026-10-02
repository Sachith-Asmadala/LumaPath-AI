from __future__ import annotations

from dataclasses import dataclass

METRIC_VERSION = "2026-10-doc-f25-v1"
SKILL_TARGET_PROFICIENCY = 70
PURPOSE_CODE = "student_support_programme_improvement"
ALLOWED_COHORT_DEFINITION_KEYS = frozenset({"programme", "year", "intake", "faculty", "campus", "study_mode"})


@dataclass(frozen=True, slots=True)
class MetricDefinition:
    key: str
    label: str
    category: str
    unit: str
    formula: str
    explanation: str
    source_domains: tuple[str, ...]
    high_stakes_prohibited: bool = True


METRIC_DEFINITIONS: dict[str, MetricDefinition] = {
    "skill_gap_points": MetricDefinition(
        key="skill_gap_points",
        label="Average skill gap",
        category="skills",
        unit="points",
        formula=(
            "For each contributor, take the latest recorded proficiency per skill in the selected period, "
            f"calculate max({SKILL_TARGET_PROFICIENCY} - proficiency, 0), then average those gap points."
        ),
        explanation=(
            "This is a programme-planning benchmark based on recorded skill observations. It is not an assessment "
            "of intelligence, potential or individual suitability, and no student-level values are exposed."
        ),
        source_domains=("DOC-F18 analytics skill observations",),
    ),
    "readiness_average": MetricDefinition(
        key="readiness_average",
        label="Average career readiness",
        category="readiness",
        unit="%",
        formula="Average of each contributor's latest recorded career-readiness score inside the selected period.",
        explanation=(
            "Shows cohort-level movement in the existing versioned readiness signal. It must not be used for admissions, "
            "discipline, grading, employment screening or other high-stakes decisions."
        ),
        source_domains=("DOC-F18 analytics readiness observations",),
    ),
    "workload_hours": MetricDefinition(
        key="workload_hours",
        label="Average active workload",
        category="workload",
        unit="h/student",
        formula=(
            "At the end of the selected period, take the latest recorded state of each task observed during the period, "
            "exclude completed or missed tasks, total estimated minutes per contributor, then average across contributors."
        ),
        explanation="This is planned workload from task estimates, not measured effort or a judgement about student performance.",
        source_domains=("DOC-F18 analytics task observations",),
    ),
    "engagement_rate": MetricDefinition(
        key="engagement_rate",
        label="Recorded engagement",
        category="engagement",
        unit="%",
        formula=(
            "Distinct cohort members with at least one approved analytics activity event in the selected period divided by "
            "eligible cohort members, multiplied by 100."
        ),
        explanation=(
            "Only product activity that already reaches the private analytics stream is counted. Absence of an event must not "
            "be interpreted as disengagement, motivation, wellbeing or misconduct."
        ),
        source_domains=("DOC-F18 analytics activity events",),
    ),
    "internship_preparation_rate": MetricDefinition(
        key="internship_preparation_rate",
        label="Internship preparation activity",
        category="internship_preparation",
        unit="%",
        formula=(
            "Distinct cohort members with an internship application, CV analysis, or interview-practice activity recorded in "
            "the selected period divided by eligible cohort members, multiplied by 100."
        ),
        explanation=(
            "This measures recorded preparation activity only. It does not score employability, application quality or likelihood "
            "of receiving an internship."
        ),
        source_domains=("Internship tracker", "CV Intelligence", "Interview Practice"),
    ),
    "mentoring_demand_rate": MetricDefinition(
        key="mentoring_demand_rate",
        label="Mentoring support demand",
        category="support_demand",
        unit="%",
        formula=(
            "Distinct cohort members who created a mentor guidance request in the selected period divided by eligible cohort "
            "members, multiplied by 100."
        ),
        explanation="Represents explicit recorded requests for mentoring support; it does not infer need from private content.",
        source_domains=("DOC-F24 Mentor Portal guidance requests",),
    ),
    "workshop_interest_rate": MetricDefinition(
        key="workshop_interest_rate",
        label="Workshop interest",
        category="support_demand",
        unit="%",
        formula=(
            "Distinct cohort members with an explicit workshop-interest support signal in the selected period divided by eligible "
            "cohort members, multiplied by 100."
        ),
        explanation=(
            "Only explicit support-interest signals are counted. LumaPath does not infer workshop demand from low scores, missed "
            "work or private messages."
        ),
        source_domains=("Approved programme support signals",),
    ),
}

APPROVED_METRIC_KEYS = tuple(METRIC_DEFINITIONS)
