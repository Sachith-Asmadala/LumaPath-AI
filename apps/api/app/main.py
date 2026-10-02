from __future__ import annotations

from fastapi import FastAPI, Request
from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.exception_handlers import http_exception_handler
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .modules.competition_demo.router import router as competition_demo_router
from .modules.subscriptions.router import router as subscriptions_router
from .modules.ai.study_assistant.router import router as study_assistant_router
from .modules.documents.router import router as documents_router
from .modules.analytics.router import router as analytics_router
from .modules.focus.router import router as focus_router
from .modules.profiles.router import router as profile_preferences_router
from .modules.portfolio.router import router as portfolio_router
from .modules.cv.router import router as cv_router
from .modules.internships.router import router as internships_router
from .modules.interviews.router import router as interviews_router
from .modules.notifications.router import router as notifications_router
from .modules.calendar.router import router as calendar_router
from .modules.pathways.router import router as pathways_router
from .modules.mentors.router import student_router as mentors_router, mentor_router as mentor_access_router
from .modules.achievements.router import router as achievements_router
from .modules.opportunities.router import router as opportunities_router
from .modules.careers.router import router as careers_router
from .modules.evidence_passport.router import router as evidence_passport_router, public_router as evidence_share_router, mentor_router as evidence_mentor_router
from .modules.teams.router import router as teams_router, invite_router as team_invitations_router
from .modules.institutional_analytics.router import router as institutional_analytics_router
from .modules.intelligence.router import router as intelligence_router
from .modules.career_scenarios.router import router as career_scenarios_router
from .modules.market_taxonomy.router import router as market_taxonomy_router

RELEASE_VERSION = "1.0.0-competition"
app = FastAPI(title=settings.app_name, version=RELEASE_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Content-Type",
        "X-Luma-Student-Id",
        "X-Luma-Mentor-Token",
        "X-Luma-Admin-Id",
        "X-Luma-Admin-Role",
        "X-Luma-Institution-Id",
        "X-Luma-Curator-Id",
        "X-Luma-Curator-Role",
        "X-Luma-Region-Scope",
    ],
)
app.include_router(competition_demo_router)
app.include_router(subscriptions_router)
app.include_router(study_assistant_router)
app.include_router(documents_router)
app.include_router(analytics_router)
app.include_router(focus_router)
app.include_router(profile_preferences_router)
app.include_router(portfolio_router)
app.include_router(cv_router)
app.include_router(internships_router)
app.include_router(interviews_router)
app.include_router(notifications_router)
app.include_router(calendar_router)
app.include_router(pathways_router)
app.include_router(mentors_router)
app.include_router(mentor_access_router)
app.include_router(achievements_router)
app.include_router(opportunities_router)
app.include_router(careers_router)
app.include_router(evidence_passport_router)
app.include_router(evidence_share_router)
app.include_router(evidence_mentor_router)
app.include_router(teams_router)
app.include_router(team_invitations_router)
app.include_router(institutional_analytics_router)
app.include_router(intelligence_router)
app.include_router(career_scenarios_router)
app.include_router(market_taxonomy_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "version": RELEASE_VERSION, "service": "lumapath-api"}


@app.exception_handler(StarletteHTTPException)
async def subscription_errors(request: Request, exc: StarletteHTTPException):
    if isinstance(exc.detail, dict) and str(exc.detail.get("code", "")).startswith("PLAN_"):
        return JSONResponse(exc.detail, status_code=exc.status_code, headers={"Cache-Control": "no-store", **(exc.headers or {})})
    return await http_exception_handler(request, exc)
