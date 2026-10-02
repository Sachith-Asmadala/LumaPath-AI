from __future__ import annotations

METRIC_VERSION = "2026-10-v1"

METRIC_DEFINITIONS: dict[str, tuple[str, str]] = {
    "completed_tasks": (
        "Distinct tasks with a recorded completion timestamp inside the selected local-date range.",
        "This counts recorded completion events only; it does not infer completion from progress percentages.",
    ),
    "missed_deadlines": (
        "Distinct tasks explicitly recorded with status 'missed' inside the selected range.",
        "LumaPath does not label an unfinished task as missed unless the source record says it was missed.",
    ),
    "completion_rate": (
        "Completed terminal task outcomes divided by completed plus explicitly missed outcomes in the selected range.",
        "Upcoming and in-progress tasks are excluded from the denominator so the rate does not punish unfinished future work.",
    ),
    "productive_hours": (
        "The latest cumulative productive-minute observation recorded inside the selected range, converted to hours.",
        "The current prototype mixes focus-session minutes with estimated remaining effort when a task is manually completed, so this metric is labelled mixed rather than purely measured.",
    ),
    "module_workload": (
        "Estimated minutes of active task workload grouped by module using the latest task observation available by the end of the selected range.",
        "This is planned workload, not a judgment about module quality, student ability or motivation.",
    ),
    "difficulty": (
        "Average student-facing task difficulty value for active tasks grouped by module.",
        "Difficulty comes from task records and is shown only as a planning signal; it is not an assessment of ability.",
    ),
    "estimate_accuracy": (
        "For completed tasks with planner blocks, compares estimated task minutes with scheduled planner minutes: 100 - absolute variance / estimate.",
        "Because per-task actual tracked time is not yet complete in the prototype, this is an estimated planning-alignment signal rather than measured time accuracy.",
    ),
    "readiness": (
        "Recorded career-readiness snapshots in time order, using the same versioned readiness score supplied by the Career Readiness feature.",
        "LumaPath reports movement and contributing recorded components; it does not infer employability, intelligence or personal worth.",
    ),
    "skill_progress": (
        "Recorded skill proficiency observations for the selected student, including historical assessment observations when available.",
        "A skill score is a product signal tied to recorded evidence or assessment state, not a general judgment about ability.",
    ),
    "plan_acceptance": (
        "Accepted planner blocks divided by reviewed planner proposals when both events are instrumented.",
        "The current prototype bridge observes retained planner blocks as reviewed and accepted; rejected-proposal coverage is partial until the server-owned planner emits those events directly.",
    ),
    "plan_adjustment": (
        "Accepted planner blocks whose current start differs from a recorded previous start, divided by accepted blocks.",
        "This shows how often retained plan blocks moved; it does not infer why a student changed a plan.",
    ),
}
