from __future__ import annotations

import json
import math
from datetime import date, datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import HTTPException

from ..careers.catalog import topological_order, PathwaySkillDefinition
from ..careers.schemas import SkillAssessmentRequest
from ..careers.service import CareerService
from ..evidence_passport.repository import EvidencePassportRepository
from ..pathways.repository import PathwayRepository
from ..pathways.schemas import PathwayContextRequest, RecalculateRequest, ResourcePreferences
from ..pathways.service import PathwayService
from .repository import CareerScenarioRepository
from .schemas import (
    CostRoute, DurationEstimate, RoleScenarioResult, RouteResource, ScenarioCreateRequest,
    ScenarioInputView, ScenarioPreferences, ScenarioRecomputeRequest, ScenarioResultView,
    ScenarioSaveRequest, ScenarioSwitchRequest, ScenarioSwitchResponse, ScenarioView,
    SkillComparison, SnapshotEvidence,
)


SIMULATION_ENGINE_VERSION = "doc-f33-v1"
SIMULATION_DISCLAIMER = (
    "Career comparison estimates are planning ranges based on the current approved taxonomy, reusable evidence and declared capacity. "
    "They are not salary, employment, admission or completion guarantees."
)
LOW_COST_PER_SKILL_ENVELOPE_USD = 50.0
LOW_COST_TOTAL_ENVELOPE_USD = 150.0
CREDIT_CONFIDENCE_THRESHOLD = 0.55


class CareerScenarioService:
    def __init__(
        self,
        repository: CareerScenarioRepository,
        career_service: CareerService,
        evidence_repository: EvidencePassportRepository,
        pathway_repository: PathwayRepository,
        pathway_service: PathwayService,
        now=lambda: datetime.now(timezone.utc),
    ):
        self.repository = repository
        self.career_service = career_service
        self.evidence_repository = evidence_repository
        self.pathway_repository = pathway_repository
        self.pathway_service = pathway_service
        self.now = now

    def roles(self):
        return self.career_service.list_roles()

    def create(self, student_id: str, request: ScenarioCreateRequest) -> ScenarioView:
        roles = self._roles(request.role_ids)
        active = self.pathway_repository.current_active(student_id)
        weekly = request.weekly_learning_minutes
        if weekly is None:
            weekly = int(active["weekly_learning_minutes"]) if active else 300
        target_date = request.target_date if request.target_date is not None else self._active_target_date(active)
        now = self.now().astimezone(timezone.utc)
        scenario_id = f"scenario_{uuid4().hex[:18]}"
        self.repository.create_scenario({
            "id": scenario_id,
            "student_id": student_id,
            "selected_role_ids_json": json.dumps([role.id for role in roles]),
            "status": "saved" if request.save else "disposable",
            "created_at": now.isoformat(),
            "saved_at": now.isoformat() if request.save else None,
        })
        snapshot = self._snapshot(student_id, roles, weekly, target_date, request.preferences, context_refreshed=True)
        result = self._calculate_and_store(student_id, scenario_id, snapshot)
        self.repository.audit(scenario_id, student_id, "scenario_created", f"roles={','.join(request.role_ids)} engine={SIMULATION_ENGINE_VERSION}", now.isoformat())
        return self._scenario_view(student_id, self.repository.scenario(scenario_id), result)

    def get(self, student_id: str, scenario_id: str) -> ScenarioView:
        scenario = self._owned_scenario(student_id, scenario_id)
        result = self.repository.latest_result(scenario_id, student_id)
        if result is None:
            raise HTTPException(status_code=409, detail="Career scenario has no calculation result.")
        return self._scenario_view(student_id, scenario, self._result_view(result))

    def list_saved(self, student_id: str) -> list[ScenarioView]:
        views = []
        for scenario in self.repository.list_saved(student_id):
            result = self.repository.latest_result(scenario["id"], student_id)
            if result:
                views.append(self._scenario_view(student_id, scenario, self._result_view(result)))
        return views

    def save(self, student_id: str, scenario_id: str, request: ScenarioSaveRequest) -> ScenarioView:
        self._owned_scenario(student_id, scenario_id)
        now = self.now().astimezone(timezone.utc)
        row = self.repository.set_saved(scenario_id, student_id, request.saved, now.isoformat())
        if row is None:
            raise HTTPException(status_code=404, detail="Career scenario not found.")
        self.repository.audit(scenario_id, student_id, "scenario_saved" if request.saved else "scenario_unsaved", "Student changed scenario retention state.", now.isoformat())
        return self.get(student_id, scenario_id)

    def recompute(self, student_id: str, scenario_id: str, request: ScenarioRecomputeRequest) -> ScenarioView:
        scenario = self._owned_scenario(student_id, scenario_id)
        latest = self.repository.latest_result(scenario_id, student_id)
        if latest is None:
            raise HTTPException(status_code=409, detail="Career scenario has no baseline result to recompute.")
        prior_snapshot = json.loads(latest["input_snapshot_json"])
        role_ids = json.loads(scenario["selected_role_ids_json"])
        if request.refresh_context:
            roles = self._roles(role_ids)
            preferences = request.preferences or ScenarioPreferences.model_validate(prior_snapshot["inputs"]["preferences"])
            snapshot = self._snapshot(student_id, roles, request.weekly_learning_minutes, request.target_date, preferences, context_refreshed=True)
        else:
            snapshot = prior_snapshot
            snapshot = json.loads(json.dumps(snapshot))
            snapshot["inputs"]["weekly_learning_minutes"] = request.weekly_learning_minutes
            snapshot["inputs"]["target_date"] = request.target_date.isoformat() if request.target_date else None
            snapshot["inputs"]["context_refreshed"] = False
            if request.preferences is not None:
                snapshot["inputs"]["preferences"] = request.preferences.model_dump(mode="json")
        result = self._calculate_and_store(student_id, scenario_id, snapshot)
        self.repository.audit(
            scenario_id, student_id, "scenario_recomputed",
            f"weekly={request.weekly_learning_minutes}; target={request.target_date}; refresh_context={request.refresh_context}",
            self.now().astimezone(timezone.utc).isoformat(),
        )
        return self._scenario_view(student_id, scenario, result)

    def switch_draft(self, student_id: str, scenario_id: str, request: ScenarioSwitchRequest) -> ScenarioSwitchResponse:
        scenario = self._owned_scenario(student_id, scenario_id)
        result_row = self.repository.result(request.result_id)
        if result_row is None or result_row["scenario_id"] != scenario_id:
            raise HTTPException(status_code=404, detail="Scenario result not found.")
        if result_row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot use another student's career scenario result.")
        if result_row["taxonomy_version"] != self.career_service.current_taxonomy_version():
            raise HTTPException(status_code=409, detail="The career taxonomy changed after this simulation. Refresh the scenario before creating a pathway draft.")

        snapshot = json.loads(result_row["input_snapshot_json"])
        selected = {row["role"]["id"]: row for row in snapshot["roles"]}
        if request.role_id not in selected:
            raise HTTPException(status_code=422, detail="Choose a role that belongs to this comparison scenario.")
        role = self.career_service.role_detail(request.role_id)
        if role.version != snapshot["inputs"]["taxonomy_version"]:
            raise HTTPException(status_code=409, detail="The selected career definition changed. Refresh the comparison before switching.")

        active_before = self.pathway_repository.current_active(student_id)
        snapshot_active_id = snapshot["inputs"].get("active_pathway_id")
        snapshot_active_version = snapshot["inputs"].get("active_pathway_version")
        if active_before:
            if active_before["id"] != snapshot_active_id or int(active_before["version"]) != snapshot_active_version:
                raise HTTPException(status_code=409, detail="Your active roadmap changed after this simulation. Recompute before creating a switch draft.")
            if active_before["target_role"] == role.name:
                raise HTTPException(status_code=422, detail="The selected role is already your active roadmap target.")
        elif snapshot_active_id is not None:
            raise HTTPException(status_code=409, detail="Your active roadmap changed after this simulation. Recompute before creating a switch draft.")

        # Explicit switch confirmation permits a fresh evidence-only assessment for the chosen role.
        # No active pathway is modified by the assessment itself.
        self.career_service.assess(student_id, SkillAssessmentRequest(
            target_role=role.name,
            self_assessments=[], quiz_evidence=[], certificate_evidence=[],
            include_portfolio_evidence=True, include_cv_evidence=True,
        ))

        inputs = snapshot["inputs"]
        weekly = int(inputs["weekly_learning_minutes"])
        target_date = date.fromisoformat(inputs["target_date"]) if inputs.get("target_date") else None
        base_context = json.loads(active_before["context_json"]) if active_before else {}
        preference_values = base_context.get("resource_preferences") or {
            "language": inputs.get("preferences", {}).get("language", "English"),
            "budget": "free only",
            "formats": inputs.get("preferences", {}).get("formats", []),
        }
        daily = int(active_before["daily_available_minutes"]) if active_before else max(30, min(240, math.ceil(weekly / 5) if weekly else 30))
        common = dict(
            target_role=role.name,
            goal=request.goal,
            pace=active_before["pace"] if active_before else "balanced",
            timezone=active_before["timezone"] if active_before else "Asia/Colombo",
            planning_start=self.now().date(),
            target_date=target_date,
            weekly_learning_minutes=weekly,
            daily_available_minutes=daily,
            skills=[],
            academic_tasks=base_context.get("academic_tasks", []),
            planner_blocks=base_context.get("planner_blocks", []),
            resource_preferences=ResourcePreferences.model_validate(preference_values),
        )
        if active_before:
            draft = self.pathway_service.recalculate(
                student_id,
                active_before["id"],
                RecalculateRequest(**common, reasons=[
                    f"Student explicitly chose {role.name} from DOC-F33 career comparison {scenario_id}.",
                    "Transferable evidence and completed skills are preserved; the active roadmap remains unchanged until draft approval.",
                ]),
            )
        else:
            draft = self.pathway_service.generate(student_id, PathwayContextRequest(**common))

        active_after = self.pathway_repository.current_active(student_id)
        before_identity = (active_before["id"], int(active_before["version"])) if active_before else None
        after_identity = (active_after["id"], int(active_after["version"])) if active_after else None
        if before_identity != after_identity:
            raise RuntimeError("DOC-F33 switch draft unexpectedly changed the active roadmap.")

        role_result = next(item for item in self._result_view(result_row).roles if item.role_id == request.role_id)
        self.repository.audit(
            scenario_id, student_id, "switch_draft_created",
            f"role={role.name}; result={request.result_id}; draft={draft.id}; active_unchanged=true",
            self.now().astimezone(timezone.utc).isoformat(),
        )
        return ScenarioSwitchResponse(
            scenario_id=scenario_id,
            result_id=request.result_id,
            target_role=role.name,
            draft_pathway_id=draft.id,
            draft_pathway_version=draft.version,
            draft_status=draft.status,
            active_pathway_id=active_before["id"] if active_before else None,
            active_pathway_version=int(active_before["version"]) if active_before else None,
            active_pathway_unchanged=True,
            transferable_skill_ids=role_result.transferable_skill_ids,
            approval_required=True,
            explanation="A reviewable roadmap draft was created. Your active roadmap and career goal are unchanged until you approve that draft in Roadmap.",
        )

    def _snapshot(
        self,
        student_id: str,
        roles,
        weekly: int,
        target_date: date | None,
        preferences: ScenarioPreferences,
        *,
        context_refreshed: bool,
    ) -> dict[str, Any]:
        active = self.pathway_repository.current_active(student_id)
        role_snapshots: list[dict] = []
        relevant_skills: set[str] = set()
        for role in roles:
            detail = self.career_service.role_detail(role.id)
            definitions = topological_order([
                PathwaySkillDefinition(item.skill_id, item.name, tuple(item.prerequisites), item.estimated_minutes, tuple(item.recommended_evidence))
                for item in detail.skills
            ])
            by_id = {item.skill_id: item for item in detail.skills}
            ordered = [by_id[item.skill_id] for item in definitions]
            relevant_skills.update(item.skill_id for item in ordered)
            role_snapshots.append({
                "role": detail.model_dump(mode="json"),
                "ordered_skill_ids": [item.skill_id for item in ordered],
            })

        evidence = self._evidence_snapshot(student_id, relevant_skills, active)
        return {
            "engine_version": SIMULATION_ENGINE_VERSION,
            "inputs": {
                "role_ids": [role.id for role in roles],
                "taxonomy_version": self.career_service.current_taxonomy_version(),
                "active_pathway_id": active["id"] if active else None,
                "active_pathway_version": int(active["version"]) if active else None,
                "active_target_role": active["target_role"] if active else None,
                "weekly_learning_minutes": int(weekly),
                "target_date": target_date.isoformat() if target_date else None,
                "preferences": preferences.model_dump(mode="json"),
                "context_refreshed": context_refreshed,
            },
            "roles": role_snapshots,
            "evidence": evidence,
            "captured_at": self.now().astimezone(timezone.utc).isoformat(),
        }

    def _evidence_snapshot(self, student_id: str, relevant_skills: set[str], active) -> list[dict]:
        grouped: dict[str, list[dict]] = {skill: [] for skill in relevant_skills}
        seen_refs: dict[str, set[str]] = {skill: set() for skill in relevant_skills}
        for row in self.evidence_repository.list_evidence(student_id):
            skill = row["skill_id"]
            if skill not in relevant_skills or row["owner_disputed"] or row["source_missing"]:
                continue
            status = row["verification_status"]
            if status in {"disputed", "stale", "expired"}:
                continue
            if row["proficiency"] is None:
                continue
            ref = row["source_ref"]
            if ref in seen_refs[skill]:
                continue
            seen_refs[skill].add(ref)
            grouped[skill].append({
                "ref": ref,
                "proficiency": int(row["proficiency"]),
                "confidence": max(0.0, min(0.95, float(row["confidence"]))),
                "verification_status": status,
            })
        if active:
            for row in self.pathway_repository.steps(active["id"]):
                skill = row["skill_id"]
                if skill not in relevant_skills or row["state"] not in {"credited", "completed"}:
                    continue
                ref = f"pathway:{active['id']}:{row['id']}"
                if ref in seen_refs[skill]:
                    continue
                seen_refs[skill].add(ref)
                grouped[skill].append({
                    "ref": ref,
                    "proficiency": int(row["proficiency"] or 0),
                    "confidence": 0.82 if row["completion_source"] == "verified_evidence" else 0.60,
                    "verification_status": "verified" if row["completion_source"] == "verified_evidence" else "student_confirmed",
                })
        snapshots = []
        skill_names = {}
        for role in self.career_service.list_roles():
            for item in self.career_service.role_detail(role.id).skills:
                skill_names[item.skill_id] = item.name
        for skill in sorted(relevant_skills):
            rows = grouped[skill]
            if not rows:
                snapshots.append({"skill_id": skill, "skill_name": skill_names.get(skill, skill), "proficiency": 0, "confidence": 0.0, "evidence_refs": [], "uncertainty": "No reusable evidence was available in the snapshot."})
                continue
            total = sum(item["confidence"] for item in rows)
            proficiency = round(sum(item["proficiency"] * item["confidence"] for item in rows) / total) if total else 0
            confidence = min(0.95, max(item["confidence"] for item in rows) + min(0.15, 0.04 * (len(rows) - 1)))
            spread = max(item["proficiency"] for item in rows) - min(item["proficiency"] for item in rows)
            uncertainty = None
            if spread >= 35:
                confidence = min(confidence, 0.58)
                uncertainty = "Reusable evidence signals disagree materially; the estimate is deliberately conservative."
            elif confidence < CREDIT_CONFIDENCE_THRESHOLD:
                uncertainty = "Evidence confidence is limited; transferable credit is not assumed."
            snapshots.append({
                "skill_id": skill, "skill_name": skill_names.get(skill, skill),
                "proficiency": max(0, min(100, proficiency)), "confidence": round(confidence, 3),
                "evidence_refs": [item["ref"] for item in rows][:30], "uncertainty": uncertainty,
            })
        return snapshots

    def _calculate_and_store(self, student_id: str, scenario_id: str, snapshot: dict) -> ScenarioResultView:
        result = self._calculate(scenario_id, snapshot)
        now = self.now().astimezone(timezone.utc)
        result_id = f"result_{uuid4().hex[:18]}"
        result["id"] = result_id
        result["scenario_id"] = scenario_id
        result["created_at"] = now.isoformat()
        self.repository.create_result({
            "id": result_id,
            "scenario_id": scenario_id,
            "student_id": student_id,
            "taxonomy_version": snapshot["inputs"]["taxonomy_version"],
            "pathway_version": snapshot["inputs"].get("active_pathway_version"),
            "input_snapshot_json": json.dumps(snapshot, sort_keys=True),
            "result_json": json.dumps(result, sort_keys=True),
            "created_at": now.isoformat(),
        })
        return ScenarioResultView.model_validate(result)

    def _calculate(self, scenario_id: str, snapshot: dict) -> dict:
        inputs = snapshot["inputs"]
        weekly = int(inputs["weekly_learning_minutes"])
        target_date = date.fromisoformat(inputs["target_date"]) if inputs.get("target_date") else None
        evidence_by_skill = {item["skill_id"]: item for item in snapshot["evidence"]}
        role_skill_sets = {item["role"]["id"]: {skill["skill_id"] for skill in item["role"]["skills"]} for item in snapshot["roles"]}
        shared = set.intersection(*role_skill_sets.values()) if role_skill_sets else set()
        role_results = []
        preferences = ScenarioPreferences.model_validate(inputs.get("preferences", {}))
        global_uncertainty: list[str] = []
        for role_snapshot in snapshot["roles"]:
            role = role_snapshot["role"]
            role_id = role["id"]
            other_union = set().union(*(skills for rid, skills in role_skill_sets.items() if rid != role_id)) if len(role_skill_sets) > 1 else set()
            unique = role_skill_sets[role_id] - other_union
            role_results.append(self._role_result(role, role_snapshot["ordered_skill_ids"], evidence_by_skill, shared, unique, weekly, target_date, preferences))
        if weekly == 0:
            global_uncertainty.append("Weekly learning availability is zero, so LumaPath cannot calculate a completion-duration range.")
        if target_date is None:
            global_uncertainty.append("No target date is set; target-date fit is not calculated.")
        if any(role.missing_data for role in role_results):
            global_uncertainty.append("Some evidence or price metadata is missing. Missing values are shown explicitly rather than guessed.")
        return {
            "id": "pending",
            "scenario_id": scenario_id,
            "created_at": self.now().astimezone(timezone.utc).isoformat(),
            "inputs": {
                "role_ids": inputs["role_ids"],
                "taxonomy_version": inputs["taxonomy_version"],
                "active_pathway_id": inputs.get("active_pathway_id"),
                "active_pathway_version": inputs.get("active_pathway_version"),
                "active_target_role": inputs.get("active_target_role"),
                "weekly_learning_minutes": weekly,
                "target_date": inputs.get("target_date"),
                "preferences": inputs.get("preferences", {}),
                "context_refreshed": bool(inputs.get("context_refreshed")),
            },
            "shared_skill_ids": sorted(shared),
            "roles": [item.model_dump(mode="json") for item in role_results],
            "assumptions": [
                f"Role and prerequisite definitions use approved taxonomy {inputs['taxonomy_version']}.",
                "Reusable skill credit requires sufficient evidence confidence; missing evidence is never treated as proof of readiness.",
                "Time ranges scale prerequisite-ordered remaining work by evidence gap and declared weekly availability.",
                "Cost routes use catalogue price metadata where it exists and identify unknown prices instead of inventing them.",
            ],
            "uncertainty": global_uncertainty,
            "active_pathway_unchanged": True,
            "disclaimer": SIMULATION_DISCLAIMER,
        }

    def _role_result(self, role: dict, ordered_skill_ids: list[str], evidence_by_skill: dict, shared: set[str], unique: set[str], weekly: int, target_date: date | None, preferences: ScenarioPreferences) -> RoleScenarioResult:
        requirements = {item["skill_id"]: item for item in role["skills"]}
        skill_views: list[SkillComparison] = []
        credited: set[str] = set()
        missing_data: list[str] = []
        min_total = 0
        max_total = 0
        for skill_id in ordered_skill_ids:
            req = requirements[skill_id]
            ev = evidence_by_skill.get(skill_id) or {"skill_id": skill_id, "skill_name": req["name"], "proficiency": 0, "confidence": 0.0, "evidence_refs": [], "uncertainty": "No reusable evidence was available in the snapshot."}
            has_credit = int(ev["proficiency"]) >= int(req["required_proficiency"]) and float(ev["confidence"]) >= CREDIT_CONFIDENCE_THRESHOLD
            if has_credit:
                credited.add(skill_id)
            remaining_prereqs = [item for item in req["prerequisites"] if item not in credited]
            if has_credit:
                low = high = 0
            else:
                required = max(1, int(req["required_proficiency"]))
                gap_ratio = max(0.25, min(1.0, (required - min(required, int(ev["proficiency"]))) / required)) if int(ev["proficiency"]) > 0 else 1.0
                midpoint = int(math.ceil(int(req["estimated_minutes"]) * gap_ratio))
                low = int(math.ceil(midpoint * 0.85 / 15) * 15)
                uncertainty_factor = 1.25 if float(ev["confidence"]) >= 0.55 else 1.45
                high = int(math.ceil(midpoint * uncertainty_factor / 15) * 15)
                min_total += low
                max_total += high
                if not ev["evidence_refs"]:
                    missing_data.append(f"{req['name']}: no reusable evidence snapshot; full learning effort is assumed.")
            skill_views.append(SkillComparison(
                skill_id=skill_id,
                name=req["name"],
                required_proficiency=req["required_proficiency"],
                current_proficiency=ev["proficiency"],
                confidence=ev["confidence"],
                credited=has_credit,
                shared=skill_id in shared,
                unique_to_role=skill_id in unique,
                prerequisites=list(req["prerequisites"]),
                remaining_prerequisites=remaining_prereqs,
                estimated_minutes_min=low,
                estimated_minutes_max=high,
                evidence_refs=list(ev["evidence_refs"]),
                uncertainty=ev.get("uncertainty"),
            ))
        remaining = [item.skill_id for item in skill_views if not item.credited]
        duration = self._duration(min_total, max_total, weekly, target_date)
        routes = self._routes(remaining, preferences)
        for route in routes:
            missing_data.extend(route.missing_data)
        reusable = [SnapshotEvidence(
            skill_id=item.skill_id,
            skill_name=item.name,
            proficiency=item.current_proficiency,
            confidence=item.confidence,
            credited=item.credited,
            evidence_refs=item.evidence_refs,
            uncertainty=item.uncertainty,
        ) for item in skill_views if item.evidence_refs]
        return RoleScenarioResult(
            role_id=role["id"], role_name=role["name"], role_version=role["version"],
            shared_skill_ids=sorted(skill_id for skill_id in role_skill_setsafe(role) if skill_id in shared),
            unique_skill_ids=sorted(unique),
            transferable_skill_ids=[item.skill_id for item in skill_views if item.credited],
            remaining_skill_ids=remaining,
            skills=skill_views,
            effort_hours_min=round(min_total / 60, 1), effort_hours_max=round(max_total / 60, 1),
            duration=duration,
            routes=routes,
            reusable_evidence=reusable,
            assumptions=[
                "Credited skills meet the role's proficiency threshold with at least moderate reusable-evidence confidence.",
                "Partial evidence reduces estimated learning effort but never to zero unless the skill is credited.",
                "Prerequisite order is preserved when listing remaining work; completed transferable prerequisites stay credited.",
            ],
            missing_data=sorted(set(missing_data)),
        )

    def _duration(self, min_minutes: int, max_minutes: int, weekly: int, target_date: date | None) -> DurationEstimate:
        if weekly <= 0:
            return DurationEstimate(
                weeks_min=None, weeks_max=None, weekly_learning_minutes=weekly, target_date=target_date,
                target_fit="not_computable", available_weeks=self._available_weeks(target_date),
                explanation="Declared weekly availability is zero. LumaPath will not claim a completion duration.",
            )
        weeks_min = round(min_minutes / weekly, 1) if min_minutes else 0.0
        weeks_max = round(max_minutes / weekly, 1) if max_minutes else 0.0
        available = self._available_weeks(target_date)
        if target_date is None:
            fit = "not_computable"
            explanation = f"Estimated learning time is about {weeks_min:.1f}–{weeks_max:.1f} weeks at {weekly} min/week. No target-date fit is claimed because no target date is set."
        elif available is not None and weeks_max <= available:
            fit = "likely_fits"
            explanation = f"The current estimate ({weeks_min:.1f}–{weeks_max:.1f} weeks) fits inside about {available:.1f} weeks before the target date, subject to the listed assumptions."
        elif available is not None and weeks_min > available:
            fit = "unlikely"
            explanation = f"Even the lower estimate ({weeks_min:.1f} weeks) exceeds the roughly {available:.1f} weeks available before the target date."
        else:
            fit = "uncertain"
            explanation = f"The target date falls inside the estimate range ({weeks_min:.1f}–{weeks_max:.1f} weeks), so completion by that date is uncertain."
        return DurationEstimate(
            weeks_min=weeks_min, weeks_max=weeks_max, weekly_learning_minutes=weekly,
            target_date=target_date, target_fit=fit, available_weeks=available, explanation=explanation,
        )

    def _available_weeks(self, target_date: date | None) -> float | None:
        if target_date is None:
            return None
        days = max(0, (target_date - self.now().date()).days + 1)
        return round(days / 7, 1)

    def _routes(self, remaining_skill_ids: list[str], preferences: ScenarioPreferences) -> list[CostRoute]:
        free_resources: list[RouteResource] = []
        low_resources: list[RouteResource] = []
        cert_resources: list[RouteResource] = []
        free_missing: list[str] = []
        cert_missing: list[str] = []
        cert_unknown_prices = 0
        known_cert_cost = 0.0

        for skill_id in remaining_skill_ids:
            resources = list(self.career_service.repository.resources_for_skill(skill_id))
            resources.sort(key=lambda row: (-self._preference_score(row, preferences), -int(row["quality_score"]), row["id"]))
            free = next((row for row in resources if row["cost_type"] == "free"), None)
            if free:
                item = self._route_resource(skill_id, free)
                free_resources.append(item)
                low_resources.append(item)
            else:
                free_missing.append(f"{skill_id}: no approved free resource is currently catalogued.")

            paid_known = next((row for row in resources if row["cost_type"] == "paid" and row["price_usd"] is not None and float(row["price_usd"]) <= LOW_COST_PER_SKILL_ENVELOPE_USD), None)
            if paid_known:
                low_resources = [item for item in low_resources if item.skill_id != skill_id]
                low_resources.append(self._route_resource(skill_id, paid_known))

            cert = next((row for row in resources if row["resource_type"] == "certificate" or row["format"] == "exam"), None)
            if cert:
                cert_resources.append(self._route_resource(skill_id, cert))
                if cert["price_usd"] is None:
                    cert_unknown_prices += 1
                    cert_missing.append(f"{cert['title']}: current approved catalogue has no verified exam price.")
                else:
                    known_cert_cost += float(cert["price_usd"])
            elif skill_id in remaining_skill_ids:
                cert_missing.append(f"{skill_id}: no approved certification resource is catalogued; use the learning route for this skill.")

        low_envelope = min(LOW_COST_TOTAL_ENVELOPE_USD, LOW_COST_PER_SKILL_ENVELOPE_USD * len(remaining_skill_ids)) if remaining_skill_ids else 0.0
        return [
            CostRoute(
                route_type="free", known_cost_min_usd=0, known_cost_max_usd=0, planning_budget_max_usd=0,
                unknown_price_count=0, resources=free_resources,
                assumptions=["Only resources explicitly marked free in the approved catalogue are included.", "Time, device, internet and optional exam costs are not treated as zero-cost claims."],
                missing_data=free_missing,
            ),
            CostRoute(
                route_type="low_cost", known_cost_min_usd=0,
                known_cost_max_usd=round(sum(item.price_usd or 0 for item in low_resources), 2),
                planning_budget_max_usd=low_envelope, unknown_price_count=0, resources=low_resources,
                assumptions=[f"The planning envelope allows up to USD {LOW_COST_PER_SKILL_ENVELOPE_USD:.0f} per remaining skill and is capped at USD {LOW_COST_TOTAL_ENVELOPE_USD:.0f}; it is a budget assumption, not a publisher price quote.", "Free resources are preferred unless an approved paid resource has a verified price within the envelope."],
                missing_data=[],
            ),
            CostRoute(
                route_type="certification_focused", known_cost_min_usd=round(known_cert_cost, 2),
                known_cost_max_usd=None if cert_unknown_prices else round(known_cert_cost, 2),
                planning_budget_max_usd=None, unknown_price_count=cert_unknown_prices, resources=cert_resources,
                assumptions=["Certification is optional evidence, not a guarantee of employment or role readiness.", "Only approved certification resources mapped to remaining skills are shown; missing exam prices stay unknown and must be checked with the issuer."],
                missing_data=cert_missing,
            ),
        ]


    @staticmethod
    def _preference_score(row, preferences: ScenarioPreferences) -> int:
        score = 0
        if row["language"] and row["language"].lower() == preferences.language.lower():
            score += 2
        if preferences.formats and row["format"] in preferences.formats:
            score += 1
        return score

    @staticmethod
    def _route_resource(skill_id: str, row) -> RouteResource:
        return RouteResource(
            skill_id=skill_id, resource_id=row["id"], title=row["title"], source=row["source"],
            source_url=row["source_url"], cost_type=row["cost_type"], price_usd=row["price_usd"], format=row["format"],
        )

    def _roles(self, role_ids: list[str]):
        result = []
        for role_id in role_ids:
            result.append(self.career_service.role_detail(role_id))
        return result

    @staticmethod
    def _active_target_date(active) -> date | None:
        if not active:
            return None
        try:
            raw = json.loads(active["context_json"]).get("target_date")
            return date.fromisoformat(raw) if raw else None
        except (ValueError, TypeError, json.JSONDecodeError):
            return None

    def _owned_scenario(self, student_id: str, scenario_id: str):
        row = self.repository.scenario(scenario_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Career scenario not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's career scenario.")
        return row

    def _result_view(self, row) -> ScenarioResultView:
        return ScenarioResultView.model_validate(json.loads(row["result_json"]))

    def _scenario_view(self, student_id: str, scenario, result: ScenarioResultView) -> ScenarioView:
        if scenario["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's career scenario.")
        return ScenarioView(
            id=scenario["id"], status=scenario["status"], role_ids=json.loads(scenario["selected_role_ids_json"]),
            created_at=datetime.fromisoformat(scenario["created_at"]),
            saved_at=datetime.fromisoformat(scenario["saved_at"]) if scenario["saved_at"] else None,
            latest_result=result,
        )


def role_skill_setsafe(role: dict) -> set[str]:
    return {item["skill_id"] for item in role.get("skills", [])}
