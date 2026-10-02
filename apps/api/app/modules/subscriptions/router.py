from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ...core.security import Principal, current_principal
from .definitions import PLAN_NAMES, PLAN_RULES
from .service import EntitlementService, get_entitlements

router = APIRouter(prefix="/v1/subscriptions", tags=["subscriptions"])

class DemoPlanRequest(BaseModel):
    plan: Literal["free", "pro", "institution"]

@router.get("/plans")
def plans():
    return [{"id": key, "name": PLAN_NAMES[key], "entitlements": {feature: {"limit": limit, "period": period} for feature, (limit, period) in rules.items()}} for key, rules in PLAN_RULES.items()]

@router.get("/me")
def me(p: Principal = Depends(current_principal), service: EntitlementService = Depends(get_entitlements)):
    return service.snapshot(p.student_id)

@router.post("/demo-plan")
def demo_plan(request: DemoPlanRequest, p: Principal = Depends(current_principal), service: EntitlementService = Depends(get_entitlements)):
    return service.set_demo_plan(p.student_id, request.plan)


@router.post("/automation/authorize")
def authorize_automation(p: Principal = Depends(current_principal), service: EntitlementService = Depends(get_entitlements)):
    # The existing Planner is browser-local. Authorize its advanced replan action
    # through the server rather than inventing another planner implementation.
    service.require(p.student_id, "adaptive_automation")
    with service.repository.connect(write=True) as db:
        service._event(db, p.student_id, "automation_authorized", "adaptive_automation", None, 0, service._plan(db, p.student_id))
    return {"authorized": True, "feature": "adaptive_automation"}
