from __future__ import annotations

import json
from datetime import date, datetime, time, timedelta, timezone
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from .definitions import DEFINITION_VERSION, PathwaySkillDefinition, ResourceDefinition, pathway_for, resources_for, topological_order
from .repository import PathwayRepository
from .schemas import (
    ChangeSummary, CurrentRoadmapResponse, LearningResourceResponse, MilestoneUpdateRequest, PathwayContextRequest,
    PathwayDecisionRequest, PathwayResponse, PathwayStepResponse, PlannerApplyAction, PlannerApprovalRequest,
    PlannerApprovalResponse, RecalculateRequest, ResourceDecisionRequest, WeeklyActionResponse,
)


PACE_FACTORS = {"light": 0.50, "balanced": 0.75, "ambitious": 1.0}
PLANNING_HORIZON_WEEKS = 8


class PathwayService:
    def __init__(self, repository: PathwayRepository, now=lambda: datetime.now(timezone.utc), career_service=None):
        self.repository = repository
        self.now = now
        self.career_service = career_service

    def current(self, student_id: str) -> CurrentRoadmapResponse:
        active = self.repository.current_active(student_id)
        draft = self.repository.current_draft(student_id)
        return CurrentRoadmapResponse(
            active=self._response(active) if active else None,
            pending_draft=self._response(draft) if draft else None,
        )

    def generate(self, student_id: str, request: PathwayContextRequest) -> PathwayResponse:
        if self.repository.current_active(student_id):
            raise HTTPException(status_code=409, detail="An active roadmap already exists. Use recalculation to propose goal, evidence or capacity changes.")
        existing_draft = self.repository.current_draft(student_id)
        if existing_draft:
            self.repository.update_pathway(existing_draft["id"], status="rejected", rejected_at=self._iso(self.now()))
        return self._build_pathway(student_id, request, previous=None, reasons=[])

    def recalculate(self, student_id: str, pathway_id: str, request: RecalculateRequest) -> PathwayResponse:
        active = self._owned(student_id, pathway_id)
        if active["status"] != "active":
            raise HTTPException(status_code=409, detail="Only the active roadmap can be recalculated.")
        existing_draft = self.repository.current_draft(student_id)
        if existing_draft:
            self.repository.update_pathway(existing_draft["id"], status="rejected", rejected_at=self._iso(self.now()))
            recalc = self.repository.recalc_for_draft(existing_draft["id"])
            if recalc:
                self.repository.update_recalculation(recalc["id"], status="replaced", decided_at=self._iso(self.now()))
        effective_reasons = list(request.reasons)
        if self.career_service:
            assessed = {item.skill_id: item for item in self.career_service.pathway_skill_context(student_id, request.target_role, [])}
            prior = {row["skill_id"]: row for row in self.repository.steps(active["id"])}
            evidence_changed = any(
                skill_id not in prior
                or int(prior[skill_id]["proficiency"]) != int(context.proficiency)
                or ((prior[skill_id]["state"] in {"credited", "completed"}) != (context.status in {"verified", "completed"}))
                for skill_id, context in assessed.items()
            )
            if evidence_changed and not any("assessment" in reason.lower() or "evidence" in reason.lower() for reason in effective_reasons):
                effective_reasons.append("Latest DOC-F29 skill assessment evidence changed the current proficiency or requirement status.")
        draft = self._build_pathway(student_id, request, previous=active, reasons=effective_reasons)
        recalc_id = f"recalc_{uuid4().hex[:18]}"
        self.repository.create_recalculation({
            "id": recalc_id,
            "student_id": student_id,
            "source_pathway_id": active["id"],
            "draft_pathway_id": draft.id,
            "trigger_reasons_json": json.dumps(effective_reasons),
            "status": "pending",
            "created_at": self._iso(self.now()),
            "decided_at": None,
        })
        self.repository.audit(draft.id, student_id, "recalculation_drafted", self._iso(self.now()), "; ".join(effective_reasons))
        return self.get(student_id, draft.id)

    def decide(self, student_id: str, pathway_id: str, request: PathwayDecisionRequest) -> PathwayResponse:
        row = self._owned(student_id, pathway_id)
        if row["status"] != "draft":
            raise HTTPException(status_code=409, detail="Only a draft roadmap can be approved or rejected.")
        now = self._iso(self.now())
        recalc = self.repository.recalc_for_draft(pathway_id)
        if request.decision == "reject":
            self.repository.update_pathway(pathway_id, status="rejected", rejected_at=now)
            if recalc:
                self.repository.update_recalculation(recalc["id"], status="rejected", decided_at=now)
            self.repository.audit(pathway_id, student_id, "draft_rejected", now)
            return self.get(student_id, pathway_id)
        self.repository.supersede_active(student_id, except_pathway_id=pathway_id)
        self.repository.update_pathway(pathway_id, status="active", approved_at=now)
        if recalc:
            self.repository.update_recalculation(recalc["id"], status="approved", decided_at=now)
        self.repository.audit(pathway_id, student_id, "roadmap_approved", now)
        return self.get(student_id, pathway_id)

    def get(self, student_id: str, pathway_id: str) -> PathwayResponse:
        return self._response(self._owned(student_id, pathway_id))

    def update_resource(self, student_id: str, pathway_id: str, step_id: str, request: ResourceDecisionRequest) -> PathwayResponse:
        pathway = self._owned(student_id, pathway_id)
        if pathway["status"] not in {"draft", "active"}:
            raise HTTPException(status_code=409, detail="Resources can only be changed on a draft or active roadmap.")
        step = self._owned_step(pathway_id, step_id, student_id)
        alternatives = [LearningResourceResponse.model_validate(item) for item in json.loads(step["alternative_resources_json"])]
        selected = LearningResourceResponse.model_validate_json(step["selected_resource_json"]) if step["selected_resource_json"] else None
        now = self._iso(self.now())
        if request.action == "accept":
            if selected is None:
                raise HTTPException(status_code=409, detail="There is no ranked resource to accept for this milestone.")
            self.repository.update_step(pathway_id, step_id, resource_decision="accepted", resource_reason=request.reason.strip() or "Student accepted the ranked resource.", updated_at=now)
            self.repository.reactivate_step_plan_items(pathway_id, step_id, now)
        elif request.action == "defer":
            self.repository.update_step(pathway_id, step_id, resource_decision="deferred", resource_reason=request.reason.strip(), updated_at=now)
            self.repository.defer_step_plan_items(pathway_id, step_id, now)
        else:
            replacement = next((item for item in alternatives if item.id == request.resource_id), None)
            if replacement is None:
                raise HTTPException(status_code=422, detail="Replacement resource must come from the transparent ranked alternatives for this milestone.")
            new_alternatives = [item for item in alternatives if item.id != replacement.id]
            if selected and selected.id != replacement.id:
                new_alternatives.insert(0, selected)
            self.repository.update_step(
                pathway_id, step_id,
                selected_resource_id=replacement.id,
                selected_resource_json=replacement.model_dump_json(),
                alternative_resources_json=json.dumps([item.model_dump(mode="json") for item in new_alternatives]),
                resource_decision="replaced",
                resource_reason=request.reason.strip(),
                updated_at=now,
            )
            self.repository.reactivate_step_plan_items(pathway_id, step_id, now)
        self.repository.audit(pathway_id, student_id, f"resource_{request.action}", now, f"{step['skill_id']}: {request.reason.strip()}")
        return self.get(student_id, pathway_id)

    def update_milestone(self, student_id: str, pathway_id: str, step_id: str, request: MilestoneUpdateRequest) -> PathwayResponse:
        pathway = self._owned(student_id, pathway_id)
        if pathway["status"] != "active":
            raise HTTPException(status_code=409, detail="Milestones can only be updated on the active roadmap.")
        step = self._owned_step(pathway_id, step_id, student_id)
        if step["state"] == "credited" and request.state != "completed":
            raise HTTPException(status_code=409, detail="Evidence-credited milestones cannot be downgraded from this roadmap. Update the underlying evidence instead.")
        if request.state == "available" and step["state"] == "completed":
            raise HTTPException(status_code=409, detail="Completed roadmap work is preserved. Recalculate after correcting the underlying evidence instead of silently removing credit.")
        now = self._iso(self.now())
        completion_source = "student_confirmed" if request.state == "completed" else step["completion_source"]
        self.repository.update_step(pathway_id, step_id, state=request.state, completion_source=completion_source, updated_at=now)
        self._refresh_step_unlocks(pathway_id, now)
        self.repository.audit(pathway_id, student_id, "milestone_updated", now, f"{step['skill_id']} -> {request.state}; {request.note.strip()}")
        return self.get(student_id, pathway_id)

    def approve_weekly_actions(self, student_id: str, pathway_id: str, request: PlannerApprovalRequest) -> PlannerApprovalResponse:
        pathway = self._owned(student_id, pathway_id)
        if pathway["status"] != "active":
            raise HTTPException(status_code=409, detail="Approve the roadmap before adding weekly actions to Planner.")
        selected = []
        for action_id in request.action_ids:
            row = self.repository.plan_item(pathway_id, action_id)
            if row is None:
                raise HTTPException(status_code=404, detail="One or more weekly actions no longer exist.")
            if row["student_id"] != student_id:
                raise HTTPException(status_code=403, detail="You cannot approve another student's roadmap action.")
            if row["status"] == "approved":
                continue
            if row["status"] == "deferred":
                raise HTTPException(status_code=409, detail="A deferred resource action must be replaced or recalculated before planning.")
            step = self.repository.step(pathway_id, row["step_id"])
            if not step or step["state"] == "locked":
                raise HTTPException(status_code=409, detail=f"{row['title']} is still locked by a prerequisite milestone.")
            selected.append(row)
        if not selected:
            return PlannerApprovalResponse(pathway_id=pathway_id, actions=[], approved_count=0, warnings=[])

        self._validate_latest_capacity(selected, request)
        now = self._iso(self.now())
        actions: list[PlannerApplyAction] = []
        for row in selected:
            task_id = row["internal_task_id"] or f"roadmap-task-{row['id']}"
            self.repository.update_plan_item(pathway_id, row["id"], status="approved", internal_task_id=task_id, updated_at=now)
            actions.append(PlannerApplyAction(
                plan_item_id=row["id"], internal_task_id=task_id, pathway_id=pathway_id, pathway_version=pathway["version"],
                step_id=row["step_id"], skill_id=row["skill_id"], title=row["title"], start_at=datetime.fromisoformat(row["start_at"]),
                end_at=datetime.fromisoformat(row["end_at"]), planned_minutes=row["planned_minutes"], source_label=row["source_label"],
                description=f"Approved weekly roadmap commitment for {row['skill_id']}. This is a learning commitment, not proof that the skill is verified.",
            ))
        self.repository.audit(pathway_id, student_id, "weekly_actions_approved", now, ",".join(item.plan_item_id for item in actions))
        return PlannerApprovalResponse(pathway_id=pathway_id, actions=actions, approved_count=len(actions), warnings=[])

    def _build_pathway(self, student_id: str, request: PathwayContextRequest, previous, reasons: list[str]) -> PathwayResponse:
        try:
            zone = ZoneInfo(request.timezone)
        except ZoneInfoNotFoundError as exc:
            raise HTTPException(status_code=422, detail="Use a valid IANA timezone such as Asia/Colombo.") from exc
        definitions = self.career_service.pathway_definitions(request.target_role) if self.career_service else topological_order(list(pathway_for(request.target_role)))
        now = self.now()
        pathway_id = f"path_{uuid4().hex[:18]}"
        version = self.repository.latest_version(student_id) + 1
        previous_steps = {row["skill_id"]: row for row in self.repository.steps(previous["id"])} if previous else {}
        effective_skills = self.career_service.pathway_skill_context(student_id, request.target_role, request.skills) if self.career_service else request.skills
        skill_context = {item.skill_id: item for item in effective_skills}
        warnings: list[str] = []
        steps: list[dict] = []
        completed_or_credited: set[str] = set()

        for order, definition in enumerate(definitions, start=1):
            context = skill_context.get(definition.skill_id)
            previous_step = previous_steps.get(definition.skill_id)
            context_credit = bool(context and context.status in {"verified", "completed"})
            previous_credit = bool(previous_step and previous_step["state"] in {"credited", "completed"})
            transferable = bool(previous and previous["target_role"] != request.target_role and previous_credit)
            if context_credit or previous_credit:
                state = "credited" if context_credit or transferable else "completed"
                completed_or_credited.add(definition.skill_id)
                completion_source = "verified_evidence" if context_credit else ("prior_pathway" if transferable else previous_step["completion_source"] or "prior_pathway")
            elif context and context.status == "in-progress" and set(definition.prerequisites).issubset(completed_or_credited):
                state = "in_progress"
                completion_source = None
            elif set(definition.prerequisites).issubset(completed_or_credited):
                state = "available"
                completion_source = None
            else:
                state = "locked"
                completion_source = None

            selected_resource, alternatives, ranking_warning = self._rank_resources(definition.skill_id, request, previous_step)
            if ranking_warning:
                warnings.append(ranking_warning)
            step_id = f"step_{uuid4().hex[:18]}"
            steps.append({
                "id": step_id, "pathway_id": pathway_id, "student_id": student_id, "skill_id": definition.skill_id, "name": definition.name,
                "step_order": order, "prerequisites_json": json.dumps(list(definition.prerequisites)), "state": state,
                "proficiency": context.proficiency if context else (int(previous_step["proficiency"]) if previous_step else 0),
                "estimated_minutes": definition.estimated_minutes, "target_evidence_json": json.dumps(list(definition.target_evidence)),
                "evidence_refs_json": json.dumps(context.evidence_refs if context else (json.loads(previous_step["evidence_refs_json"]) if previous_step else [])),
                "transferable_credit": int(transferable), "completion_source": completion_source,
                "selected_resource_id": selected_resource.id if selected_resource else None,
                "selected_resource_json": selected_resource.model_dump_json() if selected_resource else None,
                "alternative_resources_json": json.dumps([item.model_dump(mode="json") for item in alternatives]),
                "resource_decision": previous_step["resource_decision"] if previous_step and previous_step["resource_decision"] in {"accepted", "replaced"} else "recommended",
                "resource_reason": previous_step["resource_reason"] if previous_step and previous_step["resource_decision"] in {"accepted", "replaced"} else None,
                "created_at": self._iso(now), "updated_at": self._iso(now),
            })

        weekly_actions, scheduling_warnings = self._schedule_weekly_actions(pathway_id, version, request, steps, zone, now)
        warnings.extend(scheduling_warnings)
        if self.career_service and request.target_date:
            remaining_effort = sum(int(step["estimated_minutes"]) for step in steps if step["state"] not in {"credited", "completed"})
            planning_start = request.planning_start or now.astimezone(zone).date()
            feasibility = self.career_service.feasibility(remaining_effort, int(request.weekly_learning_minutes * PACE_FACTORS[request.pace]), planning_start, request.target_date)
            if feasibility["feasible"] is False:
                warnings.append(feasibility["explanation"])
        change_summary = self._change_summary(previous, steps, weekly_actions, reasons) if previous else None
        values = {
            "id": pathway_id, "student_id": student_id, "version": version, "status": "draft", "target_role": request.target_role,
            "goal": request.goal, "pace": request.pace, "definition_version": (self.career_service.role_detail(request.target_role).version if self.career_service else DEFINITION_VERSION),
            "parent_pathway_id": previous["id"] if previous else None, "recalculation_reason_json": json.dumps(reasons),
            "weekly_learning_minutes": request.weekly_learning_minutes, "daily_available_minutes": request.daily_available_minutes,
            "timezone": request.timezone, "context_json": request.model_dump_json(), "warnings_json": json.dumps(sorted(set(warnings))),
            "change_summary_json": change_summary.model_dump_json() if change_summary else None,
            "created_at": self._iso(now), "approved_at": None, "rejected_at": None,
        }
        self.repository.create_pathway(values, steps, weekly_actions)
        self.repository.audit(pathway_id, student_id, "roadmap_drafted", self._iso(now), f"v{version} {request.target_role}")
        return self.get(student_id, pathway_id)

    def _rank_resources(self, skill_id: str, request: PathwayContextRequest, previous_step) -> tuple[LearningResourceResponse | None, list[LearningResourceResponse], str | None]:
        previous_id = previous_step["selected_resource_id"] if previous_step and previous_step["resource_decision"] in {"accepted", "replaced"} else None
        deferred_id = previous_step["selected_resource_id"] if previous_step and previous_step["resource_decision"] == "deferred" else None
        deferred_reason = previous_step["resource_reason"] if deferred_id else None

        if self.career_service:
            from ..careers.schemas import ResourcePreferencesInput
            budget = request.resource_preferences.budget.lower()
            max_price = None
            if budget == "free only":
                max_price = 0
            elif budget.startswith("under"):
                import re
                match = re.search(r"(\d+(?:\.\d+)?)", budget)
                max_price = float(match.group(1)) if match else 20
            ranked_source = self.career_service.ranked_resources(skill_id, ResourcePreferencesInput(
                languages=[request.resource_preferences.language], formats=list(request.resource_preferences.formats), max_price_usd=max_price,
            )).resources
            ranked: list[tuple[int, LearningResourceResponse]] = []
            for resource in ranked_source:
                score = resource.fit_score
                reasons = list(resource.ranking_factors)
                if previous_id and resource.id == previous_id:
                    score += 100; reasons.insert(0, "preserves your previously accepted resource")
                if deferred_id and resource.id == deferred_id:
                    score -= 150
                    reasons.insert(0, "deprioritized because you previously deferred this resource" + (f": {deferred_reason}" if deferred_reason else ""))
                ranked.append((score, LearningResourceResponse(
                    id=resource.id, title=resource.title, source=resource.source, source_url=resource.source_url,
                    cost_type=resource.cost_type, price_usd=resource.price_usd, language=resource.language, format=resource.format,
                    estimated_minutes=resource.estimated_minutes, resource_type=resource.resource_type, quality_score=resource.quality_score,
                    metadata_complete=resource.metadata_complete, ranking_reason="; ".join(reasons),
                )))
            ranked.sort(key=lambda item: (-item[0], item[1].id))
            viable = [item for score, item in ranked if score >= 20]
            if not viable:
                if deferred_id:
                    return None, [item for _, item in ranked[:3]], f"No alternative {skill_id} resource currently fits the selected preferences after honoring your previous defer decision; LumaPath left the resource unselected instead of recommending the same deferred option again."
                return None, [item for _, item in ranked[:3]], f"Available {skill_id} resources do not fit the selected budget/preferences; LumaPath left the resource unselected instead of guessing."
            return viable[0], [item for item in viable[1:4]], None

        catalog = resources_for(skill_id)
        if not catalog:
            return None, [], f"No curated resource with complete source/cost/language/format metadata is available for {skill_id}; LumaPath will not guess one."
        ranked: list[tuple[int, LearningResourceResponse]] = []
        for resource in catalog:
            metadata_complete = all(value is not None for value in (resource.cost_type, resource.language, resource.format)) and bool(resource.source)
            reasons = []
            score = 0
            if previous_id and resource.id == previous_id:
                score += 100; reasons.append("preserves your previously accepted resource")
            if deferred_id and resource.id == deferred_id:
                score -= 150
                reasons.append("deprioritized because you previously deferred this resource" + (f": {deferred_reason}" if deferred_reason else ""))
            if resource.language and resource.language.lower() == request.resource_preferences.language.lower():
                score += 20; reasons.append("matches your learning-language preference")
            if resource.format and resource.format in request.resource_preferences.formats:
                score += 15; reasons.append("matches a preferred learning format")
            budget = request.resource_preferences.budget.lower()
            within_budget = resource.cost_type == "free" or budget == "flexible" or (budget.startswith("under") and resource.price_usd is not None and resource.price_usd <= 20)
            if within_budget:
                score += 20; reasons.append("fits the selected budget")
            else:
                score -= 100; reasons.append("does not fit the selected budget")
            if metadata_complete:
                score += 10; reasons.append("has complete source, cost, language and format metadata")
            response = LearningResourceResponse(
                id=resource.id, title=resource.title, source=resource.source, source_url=resource.source_url, cost_type=resource.cost_type,
                price_usd=resource.price_usd, language=resource.language, format=resource.format, estimated_minutes=resource.estimated_minutes,
                metadata_complete=metadata_complete, ranking_reason="; ".join(reasons) if reasons else "Available curated resource.",
            )
            ranked.append((score, response))
        ranked.sort(key=lambda item: (-item[0], item[1].id))
        viable = [item for score, item in ranked if score > -50]
        if not viable:
            if deferred_id:
                return None, [item for _, item in ranked[:3]], f"No alternative {skill_id} resource currently fits the selected preferences after honoring your previous defer decision; LumaPath left the resource unselected instead of recommending the same deferred option again."
            return None, [item for _, item in ranked[:3]], f"Available {skill_id} resources do not fit the selected budget/preferences; LumaPath left the resource unselected instead of guessing."
        return viable[0], [item for item in viable[1:4]], None

    def _schedule_weekly_actions(self, pathway_id: str, version: int, request: PathwayContextRequest, steps: list[dict], zone: ZoneInfo, now: datetime) -> tuple[list[dict], list[str]]:
        if request.weekly_learning_minutes <= 0 or request.daily_available_minutes <= 0:
            return [], ["No weekly actions were scheduled because declared learning capacity is zero. Milestones remain available for manual review."]
        pace_budget = int(request.weekly_learning_minutes * PACE_FACTORS[request.pace])
        if pace_budget < 30:
            return [], ["Declared learning capacity is below one 30-minute planning block, so no automatic weekly commitment was created."]
        start = request.planning_start or self.now().astimezone(zone).date()
        monday = start - timedelta(days=start.weekday())
        busy = self._busy_intervals(request, zone)
        protected = self._protected_dates(request, zone)
        actions: list[dict] = []
        warnings: list[str] = []
        weekly_used: dict[date, int] = {}
        step_by_id = {step["id"]: step for step in steps}
        completed_skills = {step["skill_id"] for step in steps if step["state"] in {"credited", "completed"}}

        for step in steps:
            if step["state"] in {"credited", "completed"}:
                continue
            remaining = int(step["estimated_minutes"])
            week_index = 0
            while remaining >= 30 and week_index < PLANNING_HORIZON_WEEKS:
                week_start = monday + timedelta(weeks=week_index)
                budget_left = pace_budget - weekly_used.get(week_start, 0)
                if budget_left < 30:
                    week_index += 1; continue
                chunk = min(90, remaining, budget_left)
                chunk = int(chunk // 30 * 30)
                if chunk < 30:
                    week_index += 1; continue
                slot = self._find_slot(week_start, chunk, request.daily_available_minutes, busy, protected, zone)
                if slot is None:
                    week_index += 1; continue
                start_at, end_at = slot
                busy.setdefault(start_at.astimezone(zone).date(), []).append((start_at, end_at, "career-learning"))
                weekly_used[week_start] = weekly_used.get(week_start, 0) + chunk
                prerequisite_ready = set(json.loads(step["prerequisites_json"])).issubset(completed_skills)
                action_id = f"plan_{uuid4().hex[:18]}"
                actions.append({
                    "id": action_id, "pathway_id": pathway_id, "step_id": step["id"], "student_id": step["student_id"], "skill_id": step["skill_id"],
                    "title": f"{step['name']} · roadmap practice", "week_start": week_start.isoformat(), "start_at": self._iso(start_at), "end_at": self._iso(end_at),
                    "planned_minutes": chunk, "status": "draft", "prerequisite_ready": int(prerequisite_ready),
                    "rationale": self._weekly_rationale(step["name"], request.pace, protected, week_start),
                    "source_label": f"Roadmap · v{version}", "internal_task_id": None, "created_at": self._iso(now), "updated_at": self._iso(now),
                })
                remaining -= chunk
                # Spread repeated work across weeks instead of overloading one day/week.
                week_index += 1
            if remaining >= 30:
                warnings.append(f"{step['name']} has {remaining} unscheduled minutes beyond the {PLANNING_HORIZON_WEEKS}-week preview horizon. LumaPath did not exceed declared capacity to fit it.")
        if protected:
            warnings.append("Urgent academic due dates and the preceding day were protected from automatic career-learning commitments.")
        return actions, warnings

    def _busy_intervals(self, request: PathwayContextRequest, zone: ZoneInfo):
        busy: dict[date, list[tuple[datetime, datetime, str]]] = {}
        for block in request.planner_blocks:
            start = block.start_at.astimezone(zone); end = block.end_at.astimezone(zone)
            day = start.date()
            busy.setdefault(day, []).append((start, end, block.category))
        return busy

    def _protected_dates(self, request: PathwayContextRequest, zone: ZoneInfo) -> set[date]:
        protected: set[date] = set()
        for task in request.academic_tasks:
            if task.status == "completed" or not task.due_at or task.risk_score < 70:
                continue
            due = task.due_at.astimezone(zone).date()
            protected.add(due)
            protected.add(due - timedelta(days=1))
        return protected

    def _find_slot(self, week_start: date, minutes: int, daily_capacity: int, busy, protected: set[date], zone: ZoneInfo):
        for offset in range(7):
            day = week_start + timedelta(days=offset)
            if day in protected:
                continue
            day_busy = busy.get(day, [])
            used = int(sum(max(0, (end - start).total_seconds() / 60) for start, end, _ in day_busy))
            if used + minutes > daily_capacity:
                continue
            window_start = time(9, 0) if day.weekday() >= 5 else time(18, 0)
            window_end = time(18, 0) if day.weekday() >= 5 else time(21, 30)
            candidate = datetime.combine(day, window_start, zone)
            limit = datetime.combine(day, window_end, zone)
            while candidate + timedelta(minutes=minutes) <= limit:
                end = candidate + timedelta(minutes=minutes)
                overlaps = any(candidate < existing_end and end > existing_start for existing_start, existing_end, _ in day_busy)
                if not overlaps:
                    return candidate.astimezone(timezone.utc), end.astimezone(timezone.utc)
                candidate += timedelta(minutes=30)
        return None

    def _weekly_rationale(self, skill_name: str, pace: str, protected: set[date], week_start: date) -> str:
        text = f"{skill_name} is placed within the {pace} roadmap pace and declared weekly learning capacity."
        if any(week_start <= day <= week_start + timedelta(days=6) for day in protected):
            text += " An urgent academic deadline in this week is protected from displacement."
        return text

    def _change_summary(self, previous, new_steps: list[dict], new_actions: list[dict], reasons: list[str]) -> ChangeSummary:
        old_steps = {row["skill_id"]: row for row in self.repository.steps(previous["id"])}
        old_actions = self.repository.plan_items(previous["id"])
        new_by_skill = {row["skill_id"]: row for row in new_steps}
        old_skills = set(old_steps); new_skills = set(new_by_skill)
        preserved = [new_by_skill[skill]["name"] for skill in sorted(old_skills & new_skills) if old_steps[skill]["state"] in {"credited", "completed"} and new_by_skill[skill]["state"] in {"credited", "completed"}]
        old_first = {}
        for item in old_actions:
            old_first.setdefault(item["skill_id"], item["week_start"])
        new_first = {}
        for item in new_actions:
            new_first.setdefault(item["skill_id"], item["week_start"])
        moved = []
        for skill in sorted(set(old_first) & set(new_first)):
            if old_first[skill] != new_first[skill] and new_by_skill.get(skill, {}).get("state") not in {"credited", "completed"}:
                moved.append(f"{new_by_skill[skill]['name']}: {old_first[skill]} → {new_first[skill]}")
        resource_changes = []
        for skill in sorted(old_skills & new_skills):
            old_resource = old_steps[skill]["selected_resource_id"]
            new_resource = new_by_skill[skill]["selected_resource_id"]
            if old_resource != new_resource and new_by_skill[skill]["state"] not in {"credited", "completed"}:
                resource_changes.append(f"{new_by_skill[skill]['name']}: resource recommendation changed")
        explanations = list(reasons)
        if preserved:
            explanations.append("Completed transferable milestones were preserved and were not rescheduled.")
        return ChangeSummary(
            added_skills=[new_by_skill[skill]["name"] for skill in sorted(new_skills - old_skills)],
            removed_skills=[old_steps[skill]["name"] for skill in sorted(old_skills - new_skills)],
            preserved_completed_skills=preserved,
            moved_weekly_actions=moved,
            resource_changes=resource_changes,
            explanations=explanations,
        )

    def _refresh_step_unlocks(self, pathway_id: str, now: str) -> None:
        steps = self.repository.steps(pathway_id)
        complete = {row["skill_id"] for row in steps if row["state"] in {"credited", "completed"}}
        for row in steps:
            if row["state"] != "locked":
                continue
            if set(json.loads(row["prerequisites_json"])).issubset(complete):
                self.repository.update_step(pathway_id, row["id"], state="available", updated_at=now)
                # Existing forecast items become planner-eligible when their prerequisite unlocks.
                self.repository.mark_step_plan_items_ready(pathway_id, row["id"], now)

    def _validate_latest_capacity(self, selected, request: PlannerApprovalRequest) -> None:
        existing = [(block.start_at, block.end_at) for block in request.planner_blocks]
        selected_intervals: list[tuple[datetime, datetime]] = []
        daily_minutes: dict[date, int] = {}
        for block in request.planner_blocks:
            day = block.start_at.date()
            daily_minutes[day] = daily_minutes.get(day, 0) + int((block.end_at - block.start_at).total_seconds() / 60)
        for row in selected:
            start = datetime.fromisoformat(row["start_at"]); end = datetime.fromisoformat(row["end_at"])
            if start <= self.now():
                raise HTTPException(status_code=409, detail=f"{row['title']} is scheduled in the past. Recalculate the roadmap before adding it to Planner.")
            if any(start < other_end and end > other_start for other_start, other_end in [*existing, *selected_intervals]):
                raise HTTPException(status_code=409, detail=f"{row['title']} now overlaps an existing Planner block. Review capacity and recalculate before saving it.")
            minutes = int((end - start).total_seconds() / 60)
            day = start.date()
            if daily_minutes.get(day, 0) + minutes > request.daily_available_minutes:
                raise HTTPException(status_code=409, detail=f"{row['title']} would exceed the latest declared daily capacity. LumaPath did not add the overlapping commitment.")
            daily_minutes[day] = daily_minutes.get(day, 0) + minutes
            selected_intervals.append((start, end))

    def _response(self, row) -> PathwayResponse:
        steps = []
        for step in self.repository.steps(row["id"]):
            selected = LearningResourceResponse.model_validate_json(step["selected_resource_json"]) if step["selected_resource_json"] else None
            alternatives = [LearningResourceResponse.model_validate(item) for item in json.loads(step["alternative_resources_json"])]
            steps.append(PathwayStepResponse(
                id=step["id"], skill_id=step["skill_id"], name=step["name"], order=step["step_order"], prerequisites=json.loads(step["prerequisites_json"]),
                state=step["state"], proficiency=step["proficiency"], estimated_minutes=step["estimated_minutes"], target_evidence=json.loads(step["target_evidence_json"]),
                evidence_refs=json.loads(step["evidence_refs_json"]), transferable_credit=bool(step["transferable_credit"]), completion_source=step["completion_source"],
                selected_resource=selected, alternative_resources=alternatives, resource_decision=step["resource_decision"], resource_reason=step["resource_reason"],
            ))
        actions = [WeeklyActionResponse(
            id=item["id"], step_id=item["step_id"], skill_id=item["skill_id"], title=item["title"], week_start=date.fromisoformat(item["week_start"]),
            start_at=datetime.fromisoformat(item["start_at"]), end_at=datetime.fromisoformat(item["end_at"]), planned_minutes=item["planned_minutes"], status=item["status"],
            prerequisite_ready=bool(item["prerequisite_ready"]), rationale=item["rationale"], source_label=item["source_label"], internal_task_id=item["internal_task_id"],
        ) for item in self.repository.plan_items(row["id"])]
        return PathwayResponse(
            id=row["id"], version=row["version"], status=row["status"], target_role=row["target_role"], goal=row["goal"], pace=row["pace"], definition_version=row["definition_version"],
            parent_pathway_id=row["parent_pathway_id"], recalculation_reason=json.loads(row["recalculation_reason_json"]), weekly_learning_minutes=row["weekly_learning_minutes"],
            daily_available_minutes=row["daily_available_minutes"], timezone=row["timezone"], target_date=(date.fromisoformat(json.loads(row["context_json"]).get("target_date")) if json.loads(row["context_json"]).get("target_date") else None), steps=steps, weekly_actions=actions, warnings=json.loads(row["warnings_json"]),
            change_summary=ChangeSummary.model_validate_json(row["change_summary_json"]) if row["change_summary_json"] else None,
            created_at=datetime.fromisoformat(row["created_at"]), approved_at=datetime.fromisoformat(row["approved_at"]) if row["approved_at"] else None,
        )

    def _owned(self, student_id: str, pathway_id: str):
        row = self.repository.get_pathway(pathway_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Roadmap not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's roadmap.")
        return row

    def _owned_step(self, pathway_id: str, step_id: str, student_id: str):
        step = self.repository.step(pathway_id, step_id)
        if step is None:
            raise HTTPException(status_code=404, detail="Roadmap milestone not found.")
        if step["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's roadmap milestone.")
        return step

    @staticmethod
    def _iso(value: datetime) -> str:
        return value.astimezone(timezone.utc).isoformat()
