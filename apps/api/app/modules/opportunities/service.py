from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException

from .definitions import (
    CATALOG,
    CATALOG_VERSION,
    ELIGIBILITY_ENGINE_VERSION,
    FRESHNESS_DAYS,
    PREPARATION_ENGINE_VERSION,
    REQUIREMENT_VERSION,
)
from .repository import OpportunityRepository
from .schemas import *


TRACKING_ORDER = {"interested": 0, "preparing": 1, "applied": 2, "follow_up": 3, "result": 4}
TRUSTED_EVIDENCE_STATUSES = {"verified", "observed", "reviewed"}
TRACKING_LABELS = {
    "interested": "Interested",
    "preparing": "Preparing",
    "applied": "Applied",
    "follow_up": "Follow-up",
    "result": "Result",
}


class OpportunityService:
    def __init__(
        self,
        repository: OpportunityRepository,
        now=lambda: datetime.now(timezone.utc),
        freshness_days: int = FRESHNESS_DAYS,
        pathway_repository=None,
        evidence_repository=None,
    ):
        self.repository = repository
        self._now = now
        self.freshness_days = max(1, freshness_days)
        self.pathway_repository = pathway_repository
        self.evidence_repository = evidence_repository
        self._seed()

    @staticmethod
    def _canonical_url(value: str) -> str:
        parts = urlsplit(value.strip())
        clean_query = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not k.lower().startswith("utm_") and k.lower() not in {"ref", "source", "fbclid", "gclid"}]
        path = parts.path.rstrip("/") or "/"
        return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), path, urlencode(sorted(clean_query)), ""))

    def _seed(self) -> None:
        now = self._now().astimezone(timezone.utc)
        rows: list[dict] = []
        requirements: dict[str, list[dict]] = {}
        for opportunity in CATALOG:
            checked = datetime.combine(opportunity.source_checked_on, time(12), tzinfo=timezone.utc)
            freshness_expiry = checked + timedelta(days=self.freshness_days)
            row = dict(
                id=opportunity.key,
                catalogue_version=CATALOG_VERSION,
                category=opportunity.category,
                title=opportunity.title,
                provider=opportunity.provider,
                summary=opportunity.summary,
                starts_on=opportunity.starts_on.isoformat() if opportunity.starts_on else None,
                closes_on=opportunity.closes_on.isoformat() if opportunity.closes_on else None,
                location_mode=opportunity.location_mode,
                location=opportunity.location,
                cost_type=opportunity.cost_type,
                cost_amount=opportunity.cost_amount,
                currency=opportunity.currency,
                target_roles_json=json.dumps(opportunity.target_roles),
                required_skills_json=json.dumps(opportunity.required_skills),
                useful_skills_json=json.dumps(opportunity.useful_skills),
                minimum_readiness=opportunity.minimum_readiness,
                eligibility_json=json.dumps(opportunity.eligibility),
                source_url=opportunity.source_url,
                canonical_url=self._canonical_url(opportunity.source_url),
                source_name=opportunity.source_name,
                source_checked_at=checked.isoformat(),
                source_expires_at=freshness_expiry.isoformat(),
                trust_status=opportunity.trust_status,
                application_steps_json=json.dumps(opportunity.application_steps),
                requirement_version=REQUIREMENT_VERSION,
                sponsored=int(opportunity.sponsored),
                sponsor_name=opportunity.sponsor_name,
                updated_at=now.isoformat(),
            )
            rows.append(row)
            reqs: list[dict] = []
            for skill in opportunity.required_skills:
                reqs.append(
                    self._requirement_row(
                        opportunity.key,
                        f"skill:{skill}",
                        "skill",
                        skill.replace("-", " ").title(),
                        "demonstrated",
                        {"skill_id": skill},
                        f"The source catalogue lists {skill} as a prerequisite skill.",
                        opportunity.source_url,
                        now,
                    )
                )
            for key, label, values in opportunity.eligibility:
                reqs.append(
                    self._requirement_row(
                        opportunity.key,
                        f"profile:{key}",
                        "profile",
                        label,
                        "in",
                        {"field": key, "values": list(values)},
                        f"The source catalogue lists {label.lower()} as an eligibility condition.",
                        opportunity.source_url,
                        now,
                    )
                )
            requirements[opportunity.key] = reqs
        self.repository.seed(rows, requirements)
        for row in self.repository.list_opportunities():
            self._ensure_catalogue_validation(row)

    def _requirement_row(self, opportunity_id, key, kind, label, operator, expected, source_text, source_reference, now):
        rid = f"req-{hashlib.sha256(f'{opportunity_id}|{REQUIREMENT_VERSION}|{key}'.encode()).hexdigest()[:20]}"
        return {
            "id": rid,
            "opportunity_id": opportunity_id,
            "requirement_version": REQUIREMENT_VERSION,
            "requirement_key": key,
            "kind": kind,
            "label": label,
            "operator": operator,
            "expected_json": json.dumps(expected, sort_keys=True),
            "required": 1,
            "source_text": source_text,
            "source_reference": source_reference,
            "created_at": now.isoformat(),
        }

    def browse(self, student_id: str, request: BrowseRequest) -> OpportunityBrowseResponse:
        now = self._now().astimezone(timezone.utc)
        context = request.context
        personalized = context is not None
        interactions = self.repository.interactions(student_id)
        state: dict[str, set[str]] = {}
        for interaction in interactions:
            state.setdefault(interaction["opportunity_id"], set()).add(interaction["action"])
        feedback = self._feedback_affinities(interactions)
        items: list[OpportunityView] = []
        expired = untrusted = stale = 0
        for row in self.repository.list_opportunities():
            if request.categories and row["category"] not in request.categories:
                continue
            actions = set(state.get(row["id"], set()))
            validation = self._ensure_catalogue_validation(row)
            if "report" in actions and validation["status"] != "reported":
                # A later governed source refresh resolves the student's old report without
                # erasing its audit history. The old interaction must not hide the refreshed item.
                actions.discard("report")
            if validation["status"] in {"untrusted", "quarantined", "reported"}:
                untrusted += 1
                continue
            if validation["status"] == "expired":
                expired += 1
                continue
            if validation["status"] == "stale":
                stale += 1
                continue
            if "dismiss" in actions:
                continue
            items.append(self._ranked(student_id, row, context, actions, feedback, validation) if personalized else self._unpersonalized(student_id, row, actions, None, validation))
        if personalized:
            items.sort(key=lambda item: (-(item.rank_score or 0), item.closes_on or date.max, item.title))
        else:
            items.sort(key=lambda item: (item.closes_on or date.max, item.title))
        self.repository.save_snapshot(
            dict(
                id=f"opp-snap-{uuid4().hex}",
                student_id=student_id,
                created_at=now.isoformat(),
                personalized=int(personalized),
                catalogue_version=CATALOG_VERSION,
                result_json=json.dumps([{"id": item.id, "score": item.rank_score, "eligibility": item.eligibility_status, "requirement_version": item.requirement_version} for item in items]),
                context_summary_json=json.dumps(self._context_summary(context)),
            )
        )
        message = (
            "Ranked using the limited goal, pathway/evidence signals, readiness, skill and preference context you approved. Eligibility remains requirement-by-requirement and never guarantees acceptance."
            if personalized
            else "Browsing without personalization. Eligibility-sensitive pathway/evidence checks are not used until you enable career context."
        )
        return OpportunityBrowseResponse(
            personalized=personalized,
            generated_at=now,
            catalogue_version=CATALOG_VERSION,
            eligibility_engine_version=ELIGIBILITY_ENGINE_VERSION,
            items=items,
            excluded_expired=expired,
            excluded_untrusted=untrusted,
            excluded_stale=stale,
            message=message,
        )

    def interact(self, student_id: str, opportunity_id: str, request: InteractionRequest) -> InteractionResponse:
        if request.action == "report":
            row = self.repository.get(opportunity_id)
            if not row:
                raise HTTPException(404, "Opportunity not found.")
        else:
            row = self._active_row(opportunity_id, student_id)
        now = self._now().astimezone(timezone.utc)
        self.repository.record_interaction(student_id, opportunity_id, request.action, (request.reason or "").strip() or None, now.isoformat())
        if request.action == "report":
            validation = self._ensure_catalogue_validation(row)
            reason = (request.reason or "").strip()
            fingerprint = hashlib.sha256(f"student-report|{student_id}|{opportunity_id}|{reason}".encode()).hexdigest()
            self.repository.record_source_validation(
                dict(
                    id=f"srcval-{uuid4().hex}", opportunity_id=opportunity_id, scope="student_report", student_id=student_id,
                    status="reported", source_url=row["source_url"], trust_status=row["trust_status"], checked_at=now.isoformat(),
                    freshness_expires_at=validation["freshness_expires_at"], opportunity_expires_on=row["closes_on"],
                    requirement_version=row["requirement_version"], detail=f"Student reported possible source/data issue: {reason}", fingerprint=fingerprint,
                )
            )
        actions = {r["action"] for r in self.repository.interactions(student_id) if r["opportunity_id"] == opportunity_id}
        return InteractionResponse(
            opportunity_id=opportunity_id,
            action=request.action,
            saved="save" in actions,
            dismissed="dismiss" in actions,
            reported="report" in actions,
            message={
                "save": "Saved privately.",
                "unsave": "Removed from saved opportunities.",
                "dismiss": "Dismissed. Similar opportunities will receive a small ranking penalty.",
                "report": "Reported and quarantined from active recommendations until the source is reviewed and revalidated. The report is retained for audit.",
            }[request.action],
        )

    # DOC-F28 compatibility bridge. DOC-F32 UI uses the preparation-plan proposal/approval flow below.
    def plan(self, student_id: str, opportunity_id: str, request: PreparationPlanRequest) -> PreparationPlanResponse:
        row = self._active_row(opportunity_id, student_id)
        if not request.confirmed:
            raise HTTPException(422, "Confirm the preparation date and time before adding it to Planner.")
        now = self._now().astimezone(timezone.utc)
        start = self._aware(request.start_at)
        if start < now - timedelta(minutes=1):
            raise HTTPException(422, "Preparation time cannot be in the past.")
        end = start + timedelta(minutes=request.duration_minutes)
        self._reject_overlap(start, end, request.existing_blocks)
        key = hashlib.sha256(f"{student_id}|{opportunity_id}|{request.title}|{start.isoformat()}|{request.duration_minutes}".encode()).hexdigest()
        saved = self.repository.save_plan_action(
            dict(id=f"opp-plan-{uuid4().hex}", student_id=student_id, opportunity_id=opportunity_id, idempotency_key=key, title=request.title.strip(), start_at=start.isoformat(), end_at=end.isoformat(), created_at=now.isoformat())
        )
        self.repository.record_interaction(student_id, opportunity_id, "planned", None, now.isoformat())
        return PreparationPlanResponse(
            opportunity_id=opportunity_id, action_id=saved["id"], title=saved["title"], start_at=datetime.fromisoformat(saved["start_at"]),
            end_at=datetime.fromisoformat(saved["end_at"]), source=f"Opportunity · {row['provider']}",
            description=f"Preparation for {row['title']}. Verify opportunity details at the original source before acting.", idempotency_key=key,
        )

    def propose_preparation(self, student_id: str, opportunity_id: str, request: PreparationProposalRequest) -> PreparationPlanView:
        row = self._active_row(opportunity_id, student_id)
        validation = self._ensure_catalogue_validation(row)
        evaluation = self.repository.evaluation_for_owner(request.eligibility_evaluation_id, student_id, opportunity_id)
        if not evaluation:
            raise HTTPException(404, "Eligibility evaluation not found for this opportunity.")
        if evaluation["requirement_version"] != row["requirement_version"]:
            raise HTTPException(409, "Opportunity requirements changed. Refresh the opportunity before preparing.")
        if evaluation["source_validation_id"] != validation["id"]:
            raise HTTPException(409, "Opportunity source validation changed. Refresh before preparing.")
        checks = json.loads(evaluation["result_json"])
        items: list[dict] = []
        now = self._now().astimezone(timezone.utc)
        for check in checks:
            if check["status"] == "met":
                continue
            kind = "gap" if check["status"] == "unmet" else "verification"
            minutes = 45 if kind == "gap" else 20
            verb = "Strengthen" if kind == "gap" else "Verify"
            items.append(
                {
                    "id": f"prepitem-{uuid4().hex}", "requirement_id": check["requirement_id"], "kind": kind,
                    "title": f"{verb}: {check['label']}", "rationale": check["explanation"], "estimated_minutes": minutes,
                    "suggested_start_at": None, "suggested_end_at": None, "approved_action_id": None, "created_at": now.isoformat(),
                }
            )
        for index, step in enumerate(json.loads(row["application_steps_json"])):
            items.append(
                {
                    "id": f"prepitem-{uuid4().hex}", "requirement_id": None, "kind": "application_step",
                    "title": step[:220], "rationale": "Application step from the current structured opportunity record. Confirm details at the source before acting.",
                    "estimated_minutes": 30 if index else 20, "suggested_start_at": None, "suggested_end_at": None,
                    "approved_action_id": None, "created_at": (now + timedelta(microseconds=index + 1)).isoformat(),
                }
            )
        items = items[:12]
        warnings = self._schedule_backwards(row, items, request)
        plan_id = f"prep-{uuid4().hex}"
        plan = dict(
            id=plan_id, student_id=student_id, opportunity_id=opportunity_id, eligibility_evaluation_id=evaluation["id"],
            source_validation_id=validation["id"], requirement_version=row["requirement_version"], proposal_version=PREPARATION_ENGINE_VERSION,
            status="draft", deadline=row["closes_on"], timezone=request.timezone, warnings_json=json.dumps(warnings), generated_at=now.isoformat(),
            approved_at=None, invalidated_at=None, invalidation_reason=None,
        )
        for item in items:
            item["plan_id"] = plan_id
        saved = self.repository.create_preparation_plan(plan, items)
        return self._preparation_view(saved)

    def approve_preparation(self, student_id: str, opportunity_id: str, plan_id: str, request: PreparationApproveRequest) -> PreparationApproveResponse:
        if not request.confirmed:
            raise HTTPException(422, "Explicit approval is required before preparation work can enter Planner.")
        row = self.repository.get(opportunity_id)
        if not row:
            raise HTTPException(404, "Opportunity not found.")
        plan = self.repository.preparation_plan_for_owner(plan_id, student_id, opportunity_id)
        if not plan:
            raise HTTPException(404, "Preparation plan not found.")
        if plan["status"] == "invalidated":
            raise HTTPException(409, "This preparation plan was invalidated. Refresh the opportunity and generate a new plan.")
        validation = self._ensure_catalogue_validation(row)
        if validation["status"] != "trusted":
            self._invalidate_plan(plan_id, "The source is no longer trusted/current for active preparation.")
            raise HTTPException(410, "The opportunity source is no longer current or trusted. Preparation approval was blocked.")
        if plan["source_validation_id"] != validation["id"] or plan["deadline"] != row["closes_on"] or plan["requirement_version"] != row["requirement_version"]:
            self._invalidate_plan(plan_id, "Source validation, deadline or parsed requirements changed after the proposal was generated.")
            raise HTTPException(409, "Opportunity details changed. Generate a fresh preparation plan before approval.")
        existing_items = {item["id"]: item for item in self.repository.preparation_items(plan_id)}
        if plan["status"] == "approved":
            return self._approved_response(row, plan, existing_items, newly_approved=False)
        now = self._now().astimezone(timezone.utc)
        validated = []
        internal_blocks: list[ExistingPlanBlock] = list(request.existing_blocks)
        included = [item for item in request.items if item.include]
        if not included:
            raise HTTPException(422, "Select at least one preparation item to approve.")
        for edit in included:
            stored = existing_items.get(edit.item_id)
            if not stored:
                raise HTTPException(422, "A preparation item does not belong to this plan.")
            if edit.start_at is None:
                raise HTTPException(422, f"Choose a start time for '{edit.title}'.")
            start = self._aware(edit.start_at)
            if start < now - timedelta(minutes=1):
                raise HTTPException(422, "Preparation work cannot be scheduled in the past.")
            end = start + timedelta(minutes=edit.duration_minutes)
            if row["closes_on"] and end.date() > date.fromisoformat(row["closes_on"]):
                raise HTTPException(422, "Preparation work must finish by the published closing date. Verify the source for the exact deadline time.")
            self._reject_overlap(start, end, internal_blocks)
            internal_blocks.append(ExistingPlanBlock(id=f"candidate:{edit.item_id}", start_at=start, end_at=end))
            validated.append((edit, start, end, stored))
        actions: list[PreparationPlannerAction] = []
        for edit, start, end, stored in validated:
            key = hashlib.sha256(f"{student_id}|{opportunity_id}|{plan_id}|{edit.item_id}".encode()).hexdigest()
            saved = self.repository.save_plan_action(
                dict(id=f"opp-plan-{uuid4().hex}", student_id=student_id, opportunity_id=opportunity_id, idempotency_key=key, title=edit.title.strip(), start_at=start.isoformat(), end_at=end.isoformat(), created_at=now.isoformat())
            )
            self.repository.mark_preparation_item_action(edit.item_id, saved["id"])
            actions.append(self._planner_action(row, edit.item_id, saved))
        self.repository.update_preparation_plan(plan_id, status="approved", approved_at=now.isoformat())
        self.repository.record_interaction(student_id, opportunity_id, "planned", None, now.isoformat())
        current_tracking = self.repository.tracking(student_id, opportunity_id)
        if not current_tracking or TRACKING_ORDER.get(current_tracking["status"], 0) < TRACKING_ORDER["preparing"]:
            self._write_tracking(student_id, row, "preparing", None, None, validation, now)
        return PreparationApproveResponse(plan_id=plan_id, opportunity_id=opportunity_id, newly_approved=True, actions=actions, warnings=json.loads(plan["warnings_json"]))

    def update_tracking(self, student_id: str, opportunity_id: str, request: TrackingUpdateRequest) -> ApplicationTrackingView:
        row = self.repository.get(opportunity_id)
        if not row:
            raise HTTPException(404, "Opportunity not found.")
        validation = self._ensure_catalogue_validation(row)
        if request.status in {"interested", "preparing"}:
            if validation["status"] != "trusted":
                raise HTTPException(410, "Expired, untrusted or reported sources cannot start active opportunity preparation.")
        if request.follow_up_at is not None and request.status not in {"applied", "follow_up", "result"}:
            raise HTTPException(422, "Follow-up timing is only available after an application is tracked.")
        now = self._now().astimezone(timezone.utc)
        return self._tracking_view(self._write_tracking(student_id, row, request.status, (request.result or "").strip() or None, request.follow_up_at, validation, now))

    def get_tracking(self, student_id: str, opportunity_id: str) -> ApplicationTrackingView | None:
        row = self.repository.tracking(student_id, opportunity_id)
        return self._tracking_view(row) if row else None

    def internship_handoff(self, student_id: str, opportunity_id: str) -> InternshipHandoffResponse:
        row = self._active_row(opportunity_id, student_id)
        if row["category"] != "internship":
            raise HTTPException(422, "Only internship opportunities can be handed to the Internship Tracker.")
        return InternshipHandoffResponse(
            opportunity_id=opportunity_id, source_reference=f"opportunity:{opportunity_id}", company=row["provider"], role=row["title"],
            source_url=row["source_url"], deadline=self._date(row["closes_on"]), requirements=json.loads(row["required_skills_json"]),
        )

    def _active_row(self, opportunity_id: str, student_id: str | None = None):
        row = self.repository.get(opportunity_id)
        if not row:
            raise HTTPException(404, "Opportunity not found.")
        validation = self._ensure_catalogue_validation(row)
        if validation["status"] == "expired":
            raise HTTPException(410, "This opportunity has expired.")
        if validation["status"] == "stale":
            raise HTTPException(410, "This opportunity source is stale and must be revalidated.")
        if validation["status"] != "trusted":
            raise HTTPException(410, "This opportunity is not trusted for active use.")
        return row

    def _ranked(self, student_id, row, ctx, actions, feedback, validation):
        base = self._unpersonalized(student_id, row, actions, ctx, validation)
        factors: list[RankingFactor] = []
        score = 0.0
        roles = json.loads(row["target_roles_json"])
        target_role = ctx.target_role
        pathway = self._pathway_snapshot(student_id)
        if pathway and not target_role:
            target_role = pathway["target_role"]
        role_points = 30 if target_role and target_role in roles else (8 if target_role and not roles else 0)
        factors.append(RankingFactor(key="goal_fit", label="Career-goal fit", points=role_points, max_points=30, explanation=("Matches your selected/active pathway career goal." if role_points == 30 else "This opportunity is broader than your selected goal." if role_points else "No career goal was provided.")))
        score += role_points
        skill_checks = [check for check in base.eligibility_checks if check.kind == "skill"]
        met_required = [check for check in skill_checks if check.status == "met"]
        denom = max(1, len(skill_checks))
        skill_points = 25 * (len(met_required) / denom) if skill_checks else 10
        factors.append(RankingFactor(key="skills", label="Requirement evidence", points=round(skill_points, 1), max_points=25, explanation=f"{len(met_required)} of {len(skill_checks)} structured skill prerequisites currently have supporting evidence; unknowns are not treated as failures."))
        score += skill_points
        min_readiness = row["minimum_readiness"]
        if ctx.readiness_score is None or min_readiness is None:
            readiness_points = 5 if min_readiness is None else 0
            readiness_explanation = "No internal preparation threshold is used for this item." if min_readiness is None else "Readiness was not provided, so this ranking factor is neutral."
        elif ctx.readiness_score >= min_readiness:
            readiness_points = 15
            readiness_explanation = f"Your provided readiness {ctx.readiness_score}% meets LumaPath's catalogue preparation threshold {min_readiness}%. This is not provider eligibility."
        else:
            readiness_points = max(0, 15 * (ctx.readiness_score / max(1, min_readiness)))
            readiness_explanation = f"Your provided readiness {ctx.readiness_score}% is below LumaPath's preparation threshold {min_readiness}%; use the preparation checklist rather than treating this as a rejection signal."
        factors.append(RankingFactor(key="readiness", label="Readiness alignment", points=round(readiness_points, 1), max_points=15, explanation=readiness_explanation))
        score += readiness_points
        preference_points = 10 if row["category"] in ctx.preferences.preferred_types else (3 if not ctx.preferences.preferred_types else 0)
        factors.append(RankingFactor(key="type_preference", label="Opportunity-type preference", points=preference_points, max_points=10, explanation="Matches a preferred opportunity type." if preference_points == 10 else "No type preference supplied." if preference_points == 3 else "Not one of your selected types."))
        score += preference_points
        location_points = 5 if row["location_mode"] in ctx.preferences.location_modes else (2 if not ctx.preferences.location_modes else 0)
        factors.append(RankingFactor(key="location_preference", label="Location preference", points=location_points, max_points=5, explanation="Matches your location-mode preference." if location_points == 5 else "No location-mode preference supplied." if location_points == 2 else "Location mode differs from your selected preference."))
        score += location_points
        cost_points = (5 if row["cost_type"] == "free" else 0) if ctx.preferences.cost_preference == "free_only" else (3 if ctx.preferences.cost_preference == "any" else 5)
        factors.append(RankingFactor(key="cost_preference", label="Cost preference", points=cost_points, max_points=5, explanation="Fits your cost preference." if cost_points >= 5 else "Cost preference is neutral." if cost_points == 3 else "This paid item does not match free-only preference."))
        score += cost_points
        fb = feedback.get((row["category"], row["provider"]), 0) + feedback.get((row["category"], "*"), 0)
        fb = max(-10, min(10, fb))
        factors.append(RankingFactor(key="feedback", label="Your prior feedback", points=fb, max_points=10, explanation="Small adjustment from your saved/dismissed items. Feedback never overrides trust, expiry or requirement status."))
        score += fb
        strengths = [check.label.lower().replace(" ", "-") for check in skill_checks if check.status == "met"]
        gaps = [check.label.lower().replace(" ", "-") for check in skill_checks if check.status == "unmet"]
        fit_bits = []
        if role_points == 30:
            fit_bits.append("active career goal")
        if strengths:
            fit_bits.append("recorded evidence")
        if preference_points == 10:
            fit_bits.append("preferred opportunity type")
        why = "Fits your " + ", ".join(fit_bits) + "." if fit_bits else "Shown because it remains current and trusted; personalization evidence is limited."
        return base.model_copy(update={"rank_score": round(max(0, min(100, score)), 1), "ranking_factors": factors, "strengths": strengths, "skill_gaps": gaps, "why_fit": why, "feedback_effect": "Ranking includes a small private feedback adjustment." if fb else None})

    def _unpersonalized(self, student_id, row, actions, ctx, validation):
        evaluation = self._evaluate(student_id, row, ctx, validation)
        tracking = self.repository.tracking(student_id, row["id"])
        strengths = [check.label.lower().replace(" ", "-") for check in evaluation["checks"] if check.kind == "skill" and check.status == "met"]
        gaps = [check.label.lower().replace(" ", "-") for check in evaluation["checks"] if check.kind == "skill" and check.status == "unmet"]
        return OpportunityView(
            id=row["id"], category=row["category"], title=row["title"], provider=row["provider"], summary=row["summary"],
            starts_on=self._date(row["starts_on"]), closes_on=self._date(row["closes_on"]), location_mode=row["location_mode"], location=row["location"],
            cost_type=row["cost_type"], cost_amount=row["cost_amount"], currency=row["currency"], required_skills=json.loads(row["required_skills_json"]),
            useful_skills=json.loads(row["useful_skills_json"]), source_url=row["source_url"], source_name=row["source_name"],
            source_checked_at=datetime.fromisoformat(row["source_checked_at"]), freshness_status="fresh", trust_status=row["trust_status"],
            source_validation=self._source_validation_view(validation), requirement_version=row["requirement_version"],
            application_steps=json.loads(row["application_steps_json"]), sponsored=bool(row["sponsored"]), sponsor_name=row["sponsor_name"],
            strengths=strengths, skill_gaps=gaps, eligibility_status=evaluation["status"], eligibility_checks=evaluation["checks"],
            eligibility_evaluation_id=evaluation["id"], missing_eligibility_data=evaluation["missing"], saved="save" in actions,
            dismissed="dismiss" in actions, reported="report" in actions, tracking=self._tracking_view(tracking) if tracking else None,
        )

    def _evaluate(self, student_id: str, row, context: RecommendationContext | None, validation) -> dict:
        requirements = self.repository.requirements(row["id"], row["requirement_version"])
        profile = context.eligibility if context else EligibilityProfile()
        context_skills = {skill.skill_id: skill for skill in (context.skills if context else [])}
        pathway = self._pathway_snapshot(student_id) if context else None
        pathway_steps = {step["skill_id"]: step for step in pathway["steps"]} if pathway else {}
        evidence_rows = self._evidence_snapshot(student_id) if context else []
        evidence_by_skill: dict[str, list] = {}
        for evidence in evidence_rows:
            evidence_by_skill.setdefault(evidence["skill_id"], []).append(evidence)
        checks: list[EligibilityCheck] = []
        missing: list[str] = []
        for requirement in requirements:
            expected = json.loads(requirement["expected_json"])
            evidence: list[RequirementEvidence] = []
            if requirement["kind"] == "profile":
                field = expected["field"]
                values = [str(value).casefold() for value in expected["values"]]
                actual = getattr(profile, field, None)
                if actual is None or (isinstance(actual, str) and not actual.strip()):
                    status = "unknown"
                    explanation = f"{requirement['label']} is not available in the approved eligibility context. Confirm it against the original source."
                    missing.append(requirement["label"])
                elif str(actual).casefold() in values:
                    status = "met"
                    explanation = f"Your confirmed {requirement['label'].lower()} matches the parsed source rule. This is only one requirement, not guaranteed eligibility."
                    evidence.append(RequirementEvidence(source_type="student_profile", label=f"Confirmed {requirement['label']}", reference=f"profile:{field}", verification="student-confirmed"))
                else:
                    status = "unmet"
                    explanation = f"Your confirmed {requirement['label'].lower()} does not match the parsed source rule. Check the source for exceptions or updated terms."
                    evidence.append(RequirementEvidence(source_type="student_profile", label=f"Confirmed {requirement['label']}", reference=f"profile:{field}", verification="student-confirmed"))
            else:
                skill_id = expected["skill_id"]
                trusted = [ev for ev in evidence_by_skill.get(skill_id, []) if not ev["source_missing"] and not ev["owner_disputed"] and ev["verification_status"] in TRUSTED_EVIDENCE_STATUSES]
                weak = [ev for ev in evidence_by_skill.get(skill_id, []) if ev not in trusted]
                step = pathway_steps.get(skill_id)
                skill = context_skills.get(skill_id)
                if trusted:
                    status = "met"
                    explanation = f"Current Evidence Passport records support {requirement['label']}. Verify the provider's exact proficiency expectation before applying."
                    for ev in trusted[:3]:
                        evidence.append(RequirementEvidence(source_type="evidence_passport", label=ev["title"] or f"Evidence Passport · {ev['verification_status']}", reference=ev["id"], verification=ev["verification_status"]))
                elif step and step["state"] in {"completed", "credited"}:
                    status = "met"
                    explanation = f"Your active pathway marks {requirement['label']} as {step['state']}. This supports preparation but is not a provider decision."
                    evidence.append(RequirementEvidence(source_type="pathway", label=f"Pathway step · {step['state']}", reference=step["id"], verification=step["state"]))
                elif skill and skill.demonstrated:
                    status = "met"
                    explanation = f"Your current approved skill context marks {requirement['label']} as demonstrated. Confirm the source's expected level."
                    evidence.append(RequirementEvidence(source_type="student_context", label="Current skill context", reference=f"skill:{skill_id}", verification="demonstrated"))
                elif step and step["state"] in {"in_progress", "available", "locked"}:
                    status = "unmet"
                    explanation = f"Your active pathway still has {requirement['label']} in {step['state'].replace('_', ' ')} state, so LumaPath treats it as a preparation gap rather than proof of eligibility."
                    evidence.append(RequirementEvidence(source_type="pathway", label=f"Pathway step · {step['state']}", reference=step["id"], verification=step["state"]))
                elif skill and not skill.demonstrated:
                    status = "unmet"
                    explanation = f"{requirement['label']} is present in your current skill context but is not yet demonstrated, so it remains a preparation gap."
                    evidence.append(RequirementEvidence(source_type="student_context", label="Current skill context", reference=f"skill:{skill_id}", verification="not-demonstrated"))
                else:
                    status = "unknown"
                    explanation = f"No current evidence proves or disproves the {requirement['label']} prerequisite. Confirm your evidence and the original source before acting."
                    missing.append(requirement["label"])
                    if weak:
                        evidence.append(RequirementEvidence(source_type="evidence_passport", label=f"Evidence exists but is {weak[0]['verification_status']}", reference=weak[0]["id"], verification=weak[0]["verification_status"]))
            checks.append(
                EligibilityCheck(
                    requirement_id=requirement["id"], key=requirement["requirement_key"], label=requirement["label"], kind=requirement["kind"],
                    status=status, explanation=explanation, evidence=evidence, source_text=requirement["source_text"], source_reference=requirement["source_reference"], required=bool(requirement["required"]),
                )
            )
        required_checks = [check for check in checks if check.required]
        if not required_checks:
            overall = "unknown"
        elif any(check.status == "unmet" for check in required_checks):
            overall = "unmet"
        elif any(check.status == "unknown" for check in required_checks):
            overall = "unknown"
        else:
            overall = "met"
        now = self._now().astimezone(timezone.utc)
        evaluation_id = f"elig-{uuid4().hex}"
        summary_refs = sorted({e.reference for check in checks for e in check.evidence})
        saved = self.repository.save_evaluation(
            dict(
                id=evaluation_id, student_id=student_id, opportunity_id=row["id"], requirement_version=row["requirement_version"],
                engine_version=ELIGIBILITY_ENGINE_VERSION, source_validation_id=validation["id"], pathway_id=pathway["id"] if pathway else None,
                pathway_version=pathway["version"] if pathway else None, overall_status=overall,
                result_json=json.dumps([check.model_dump(mode="json") for check in checks]),
                evidence_summary_json=json.dumps({"references": summary_refs, "count": len(summary_refs)}), evaluated_at=now.isoformat(),
            )
        )
        return {"id": saved["id"], "status": overall, "checks": checks, "missing": missing}

    def _pathway_snapshot(self, student_id: str):
        if not self.pathway_repository:
            return None
        try:
            row = self.pathway_repository.current_active(student_id)
            if not row:
                return None
            return {"id": row["id"], "version": row["version"], "target_role": row["target_role"], "steps": self.pathway_repository.steps(row["id"])}
        except Exception:
            return None

    def _evidence_snapshot(self, student_id: str):
        if not self.evidence_repository:
            return []
        try:
            return list(self.evidence_repository.list_evidence(student_id))
        except Exception:
            return []

    def _schedule_backwards(self, row, items: list[dict], request: PreparationProposalRequest) -> list[str]:
        warnings: list[str] = []
        if not row["closes_on"]:
            warnings.append("The source does not provide a closing date, so LumaPath did not fabricate preparation times. Set times manually after reviewing the source.")
            return warnings
        try:
            tz = ZoneInfo(request.timezone)
        except ZoneInfoNotFoundError:
            raise HTTPException(422, "Unknown timezone for preparation planning.")
        capacity = min(240, request.daily_available_minutes)
        if capacity < 10:
            warnings.append("No usable daily preparation capacity is available. Checklist items remain editable but unscheduled.")
            return warnings
        now_local = self._now().astimezone(tz)
        deadline = date.fromisoformat(row["closes_on"])
        last_day = deadline - timedelta(days=1)
        if last_day < now_local.date():
            warnings.append("The preparation window is too short for automatic backward scheduling. Review the deadline and choose only feasible actions.")
            return warnings
        occupied: list[tuple[datetime, datetime]] = []
        for block in request.existing_blocks:
            occupied.append((self._aware(block.start_at).astimezone(tz), self._aware(block.end_at).astimezone(tz)))
        unscheduled = 0
        for item in reversed(items):
            duration = timedelta(minutes=item["estimated_minutes"])
            if item["estimated_minutes"] > capacity:
                unscheduled += 1
                continue
            placed = False
            day = last_day
            while day >= now_local.date() and not placed:
                window_end = datetime.combine(day, time(20, 0), tzinfo=tz)
                window_start = window_end - timedelta(minutes=capacity)
                cursor_end = window_end
                while cursor_end - duration >= window_start:
                    start = cursor_end - duration
                    end = cursor_end
                    if start >= now_local + timedelta(minutes=15) and not any(start < other_end and end > other_start for other_start, other_end in occupied):
                        item["suggested_start_at"] = start.astimezone(timezone.utc).isoformat()
                        item["suggested_end_at"] = end.astimezone(timezone.utc).isoformat()
                        occupied.append((start, end))
                        placed = True
                        break
                    cursor_end -= timedelta(minutes=15)
                day -= timedelta(days=1)
            if not placed:
                unscheduled += 1
        if unscheduled:
            warnings.append(f"{unscheduled} preparation item(s) could not fit the approved daily capacity before the closing date. They remain unscheduled instead of being placed after the deadline.")
        warnings.append("The source provides a closing date but may provide a more precise closing time. LumaPath schedules conservatively before the closing date; verify the source before submission.")
        return warnings

    def _ensure_catalogue_validation(self, row):
        checked = datetime.fromisoformat(row["source_checked_at"])
        freshness_expiry = datetime.fromisoformat(row["source_expires_at"]) if row["source_expires_at"] else checked + timedelta(days=self.freshness_days)
        now = self._now().astimezone(timezone.utc)
        closes = self._date(row["closes_on"])
        if row["trust_status"] == "quarantined":
            status = "quarantined"
            detail = "Catalogue governance has quarantined this source."
        elif row["trust_status"] not in {"verified", "curated"}:
            status = "untrusted"
            detail = "Source trust is below the threshold for active recommendations."
        else:
            report = self.repository.latest_report(row["id"])
            source_checked_at = checked.astimezone(timezone.utc) if checked.tzinfo else checked.replace(tzinfo=timezone.utc)
            report_at = datetime.fromisoformat(report["checked_at"]).astimezone(timezone.utc) if report else None
            unresolved_report = bool(report_at and report_at >= source_checked_at)
            if unresolved_report:
                status = "reported"
                detail = "A student reported a possible source or requirement issue after the last verification. Active recommendations are quarantined until governed revalidation."
            elif closes and closes < now.date():
                status = "expired"
                detail = "The published opportunity closing date has passed."
            elif now > freshness_expiry:
                status = "stale"
                detail = "The source validation window expired and must be refreshed."
            else:
                status = "trusted"
                detail = "Source is inside the configured trust and freshness window. Eligibility must still be verified at the original source."
        fingerprint = hashlib.sha256(f"{row['source_url']}|{row['trust_status']}|{row['source_checked_at']}|{freshness_expiry.isoformat()}|{row['closes_on']}|{row['requirement_version']}|{status}".encode()).hexdigest()
        return self.repository.record_source_validation(
            dict(
                id=f"srcval-{uuid4().hex}", opportunity_id=row["id"], scope="catalogue", student_id=None, status=status,
                source_url=row["source_url"], trust_status=row["trust_status"], checked_at=row["source_checked_at"],
                freshness_expires_at=freshness_expiry.isoformat(), opportunity_expires_on=row["closes_on"],
                requirement_version=row["requirement_version"], detail=detail, fingerprint=fingerprint,
            )
        )

    def _source_validation_view(self, validation) -> SourceValidationView:
        return SourceValidationView(
            validation_id=validation["id"], status=validation["status"], last_verified_at=datetime.fromisoformat(validation["checked_at"]),
            freshness_expires_at=datetime.fromisoformat(validation["freshness_expires_at"]), opportunity_expires_on=self._date(validation["opportunity_expires_on"]),
            detail=validation["detail"],
        )

    def _write_tracking(self, student_id, row, status, result, follow_up_at, validation, now):
        current = self.repository.tracking(student_id, row["id"])
        tracking_id = current["id"] if current else f"track-{uuid4().hex}"
        follow = self._aware(follow_up_at).isoformat() if follow_up_at else None
        return self.repository.upsert_tracking(
            dict(
                id=tracking_id, student_id=student_id, opportunity_id=row["id"], status=status, result=result, follow_up_at=follow,
                source_validation_id=validation["id"], created_at=current["created_at"] if current else now.isoformat(), updated_at=now.isoformat(),
            )
        )

    def _tracking_view(self, row) -> ApplicationTrackingView:
        opportunity = self.repository.get(row["opportunity_id"])
        validation = self._ensure_catalogue_validation(opportunity) if opportunity else None
        source_status = validation["status"] if validation else "untrusted"
        return ApplicationTrackingView(
            id=row["id"], opportunity_id=row["opportunity_id"], status=row["status"], result=row["result"],
            follow_up_at=datetime.fromisoformat(row["follow_up_at"]) if row["follow_up_at"] else None,
            source_validation_id=row["source_validation_id"], source_status=source_status,
            active_deadline_alerts_allowed=source_status == "trusted", updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _preparation_view(self, plan) -> PreparationPlanView:
        items = self.repository.preparation_items(plan["id"])
        return PreparationPlanView(
            id=plan["id"], opportunity_id=plan["opportunity_id"], status=plan["status"], proposal_version=plan["proposal_version"],
            requirement_version=plan["requirement_version"], eligibility_evaluation_id=plan["eligibility_evaluation_id"],
            source_validation_id=plan["source_validation_id"], deadline=self._date(plan["deadline"]), generated_at=datetime.fromisoformat(plan["generated_at"]),
            approved_at=datetime.fromisoformat(plan["approved_at"]) if plan["approved_at"] else None,
            items=[
                PreparationChecklistItem(
                    id=item["id"], requirement_id=item["requirement_id"], kind=item["kind"], title=item["title"], rationale=item["rationale"],
                    estimated_minutes=item["estimated_minutes"], suggested_start_at=datetime.fromisoformat(item["suggested_start_at"]) if item["suggested_start_at"] else None,
                    suggested_end_at=datetime.fromisoformat(item["suggested_end_at"]) if item["suggested_end_at"] else None, editable=True, scheduled=bool(item["suggested_start_at"]),
                )
                for item in items
            ],
            warnings=json.loads(plan["warnings_json"]),
        )

    def _approved_response(self, row, plan, items, newly_approved: bool) -> PreparationApproveResponse:
        actions: list[PreparationPlannerAction] = []
        for item in items.values():
            if not item["approved_action_id"]:
                continue
            action_rows = self.repository.query("SELECT * FROM opportunity_plan_actions WHERE id=?", (item["approved_action_id"],))
            if action_rows:
                actions.append(self._planner_action(row, item["id"], action_rows[0]))
        return PreparationApproveResponse(plan_id=plan["id"], opportunity_id=row["id"], newly_approved=newly_approved, actions=actions, warnings=json.loads(plan["warnings_json"]))

    def _planner_action(self, row, item_id, saved) -> PreparationPlannerAction:
        return PreparationPlannerAction(
            plan_item_id=item_id, action_id=saved["id"], title=saved["title"], start_at=datetime.fromisoformat(saved["start_at"]),
            end_at=datetime.fromisoformat(saved["end_at"]), source=f"Opportunity · {row['provider']}",
            description=f"Preparation for {row['title']}. This task was student-approved from a versioned eligibility/preparation plan; verify current source details before acting.",
            idempotency_key=saved["idempotency_key"],
        )

    def _invalidate_plan(self, plan_id: str, reason: str) -> None:
        self.repository.update_preparation_plan(plan_id, status="invalidated", invalidated_at=self._now().astimezone(timezone.utc).isoformat(), invalidation_reason=reason)

    @staticmethod
    def _aware(value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)

    def _reject_overlap(self, start: datetime, end: datetime, blocks: list[ExistingPlanBlock]) -> None:
        for block in blocks:
            block_start = self._aware(block.start_at)
            block_end = self._aware(block.end_at)
            if start < block_end and end > block_start:
                raise HTTPException(409, "This preparation action overlaps an existing Planner block.")

    def _feedback_affinities(self, rows):
        result = {}
        for interaction in rows:
            opportunity = self.repository.get(interaction["opportunity_id"])
            if not opportunity:
                continue
            delta = 3 if interaction["action"] == "save" else -4 if interaction["action"] == "dismiss" else 0
            if delta:
                result[(opportunity["category"], opportunity["provider"])] = result.get((opportunity["category"], opportunity["provider"]), 0) + delta
                result[(opportunity["category"], "*")] = result.get((opportunity["category"], "*"), 0) + (1 if delta > 0 else -1)
        return result

    def _context_summary(self, context):
        if not context:
            return {"personalized": False}
        return {
            "target_role": context.target_role, "readiness_score": context.readiness_score, "skill_ids": [skill.skill_id for skill in context.skills],
            "preferred_types": context.preferences.preferred_types, "location_modes": context.preferences.location_modes,
            "cost_preference": context.preferences.cost_preference,
            "eligibility_fields_provided": [key for key, value in context.eligibility.model_dump().items() if value],
        }

    @staticmethod
    def _date(value):
        return date.fromisoformat(value) if value else None
