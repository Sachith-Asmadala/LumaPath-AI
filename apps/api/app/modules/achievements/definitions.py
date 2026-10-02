from __future__ import annotations

from dataclasses import dataclass

CATALOGUE_VERSION = "2026-10-v1"
STREAK_RULE_VERSION = "2026-10-v1"


@dataclass(frozen=True, slots=True)
class AchievementDefinition:
    key: str
    category: str
    title: str
    description: str
    target: int
    unit: str
    optional_career: bool = False


DEFINITIONS: tuple[AchievementDefinition, ...] = (
    AchievementDefinition("planning.first_completion", "planning", "Plan item completed", "Completed your first recorded task from your personal plan.", 1, "completed task"),
    AchievementDefinition("planning.first_commitment", "planning", "Plan put into action", "Approved your first personal planning commitment.", 1, "approved plan item"),
    AchievementDefinition("planning.five_commitments", "planning", "Planning rhythm", "Approved five distinct personal planning commitments.", 5, "approved plan items"),
    AchievementDefinition("deadline.on_time", "deadline", "Deadline handled", "Completed a dated task on or before its recorded deadline.", 1, "on-time completion"),
    AchievementDefinition("study.consistency_three", "study", "Steady study rhythm", "Recorded focused study on three qualifying days, with one grace day allowed between study days.", 3, "qualifying study days"),
    AchievementDefinition("portfolio.first_review", "portfolio", "Portfolio progress recorded", "Completed a deterministic portfolio evidence review.", 1, "portfolio analysis", True),
    AchievementDefinition("cv.first_review", "cv", "CV progress recorded", "Completed a deterministic CV review for a selected role.", 1, "CV analysis", True),
    AchievementDefinition("application.first_applied", "application", "Application milestone", "Recorded the first internship application reaching Applied.", 1, "application milestone", True),
    AchievementDefinition("roadmap.first_milestone", "roadmap", "Roadmap milestone", "Completed or received verified credit for a career-learning roadmap milestone.", 1, "roadmap milestone", True),
)
