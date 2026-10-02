from __future__ import annotations

# None means uncapped, zero means unavailable. All periods use UTC.
FREE = {
    "active_pathways": (1, "stock"), "saved_scenarios": (0, "stock"),
    "career_comparisons": (2, "month"), "comparison_roles": (2, "request"),
    "assistant_requests": (15, "day"), "intelligence_items": (3, "day"),
    "cv_analyses": (2, "month"), "document_analyses": (3, "month"),
    "opportunity_readiness": (3, "month"),
    "basic_planner": (None, "access"), "basic_next_action": (None, "access"),
    "evidence_passport": (None, "access"), "opportunity_browsing": (None, "access"),
    "international_profile": (None, "access"),
    "adaptive_automation": (0, "access"), "regional_comparison": (0, "access"),
    "scenario_history": (0, "access"), "advanced_opportunity_preparation": (0, "access"),
    "institutional_analytics": (0, "access"), "taxonomy_governance": (0, "access"),
    "institution_mentoring": (0, "access"),
}
PRO = {**FREE,
    "saved_scenarios": (3, "stock"), "career_comparisons": (30, "month"),
    "comparison_roles": (4, "request"), "assistant_requests": (100, "day"),
    "intelligence_items": (None, "day"), "cv_analyses": (15, "month"),
    "document_analyses": (25, "month"), "opportunity_readiness": (30, "month"),
    "adaptive_automation": (None, "access"), "regional_comparison": (None, "access"),
    "scenario_history": (None, "access"), "advanced_opportunity_preparation": (None, "access"),
}
INSTITUTION = {**PRO, "institutional_analytics": (None, "access"),
    "taxonomy_governance": (None, "access"), "institution_mentoring": (None, "access")}
PLAN_RULES = {"free": FREE, "pro": PRO, "institution": INSTITUTION}
PLAN_NAMES = {"free": "LumaPath Free", "pro": "LumaPath Pro", "institution": "LumaPath Institution"}
INSTITUTION_FEATURES = {"institutional_analytics", "taxonomy_governance", "institution_mentoring"}
