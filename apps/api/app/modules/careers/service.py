from __future__ import annotations

import json
from dataclasses import replace
from datetime import date, datetime, timezone
from uuid import uuid4

from fastapi import HTTPException

from .catalog import (
    ROLE_METADATA, ROLE_PATHWAYS, TAXONOMY_VERSION, PathwaySkillDefinition, ResourceDefinition,
    resource_quality, resource_type, role_requirement, topological_order,
)
from .repository import CareerRepository
from .schemas import (
    CareerRoleDetail, CareerRoleSummary, ResourcePreferencesInput, RoleSkillRequirement, SkillAssessmentRequest,
    SkillAssessmentResponse, SkillEvidenceView, SkillResourceView, SkillResourcesResponse, StudentSkillView,
)


ASSESSMENT_DISCLAIMER = (
    "Skill estimates combine declared and available evidence with explicit confidence. "
    "They are planning signals, not hiring decisions or guarantees of professional proficiency."
)


class CareerService:
    def __init__(self, repository: CareerRepository, now=lambda: datetime.now(timezone.utc)):
        self.repository = repository
        self.now = now
        self.validate_published_taxonomy()

    def validate_published_taxonomy(self) -> None:
        for role, definitions in ROLE_PATHWAYS.items():
            if not definitions:
                raise RuntimeError(f"Approved role {role} has no skill requirements.")
            topological_order(list(definitions))
            skill_ids = {item.skill_id for item in definitions}
            requirements = {row.skill_id: role_requirement(role, row.skill_id) for row in definitions}
            if set(requirements) != skill_ids:
                raise RuntimeError(f"Approved role {role} has incomplete proficiency requirements.")
            if any(not 0 <= value <= 100 for value in requirements.values()):
                raise RuntimeError(f"Approved role {role} has invalid proficiency values.")

    def list_roles(self) -> list[CareerRoleSummary]:
        return [
            CareerRoleSummary(
                id=row["id"], name=row["name"], version=row["version"], level=row["level"],
                description=row["description"], quality_status=row["quality_status"],
                skill_count=len(self.repository.role_skill_rows(row["id"])),
            )
            for row in self.repository.list_roles()
        ]

    def role_detail(self, role_id_or_name: str) -> CareerRoleDetail:
        row = self.repository.role_by_id(role_id_or_name) or self.repository.role_by_name(role_id_or_name)
        if row is None:
            raise HTTPException(status_code=404, detail="Career role is not in the approved taxonomy.")
        deps: dict[str, list[str]] = {}
        for dep in self.repository.dependencies(row["id"]):
            deps.setdefault(dep["skill_id"], []).append(dep["prerequisite_skill_id"])
        skills = [
            RoleSkillRequirement(
                skill_id=item["skill_id"], name=item["name"], required_proficiency=item["required_proficiency"],
                prerequisites=sorted(deps.get(item["skill_id"], [])), estimated_minutes=item["estimated_minutes"],
                recommended_evidence=json.loads(item["evidence_json"]),
            )
            for item in self.repository.role_skill_rows(row["id"])
        ]
        # Validate persisted graph before exposing it. Publication failure is safer than a malformed path.
        definitions = [PathwaySkillDefinition(s.skill_id, s.name, tuple(s.prerequisites), s.estimated_minutes, tuple(s.recommended_evidence)) for s in skills]
        topological_order(definitions)
        return CareerRoleDetail(
            id=row["id"], name=row["name"], version=row["version"], level=row["level"],
            description=row["description"], quality_status=row["quality_status"], skill_count=len(skills), skills=skills,
        )

    def assess(self, student_id: str, request: SkillAssessmentRequest) -> SkillAssessmentResponse:
        role = self.role_detail(request.target_role)
        now = self.now().astimezone(timezone.utc)
        assessment_id = f"assess_{uuid4().hex[:18]}"
        self_by_skill = {item.skill_id: item for item in request.self_assessments}
        quiz_by_skill: dict[str, list] = {}
        for item in request.quiz_evidence:
            quiz_by_skill.setdefault(item.skill_id, []).append(item)
        cert_by_skill: dict[str, list] = {}
        for item in request.certificate_evidence:
            cert_by_skill.setdefault(item.skill_id, []).append(item)

        approved_skill_ids = {skill.skill_id for skill in role.skills}
        supplied_ids = set(self_by_skill) | set(quiz_by_skill) | set(cert_by_skill)
        unknown = supplied_ids - approved_skill_ids
        if unknown:
            raise HTTPException(status_code=422, detail=f"Assessment contains skills outside the approved {role.name} taxonomy: {', '.join(sorted(unknown))}.")

        cv_items = self.repository.latest_cv_role_skills(student_id, role.name) if request.include_cv_evidence else []
        cv_by_skill = {item.get("skill_id"): item for item in cv_items}
        evidence_rows: list[dict] = []
        skill_rows: list[dict] = []
        conflicts: list[str] = []

        for requirement in role.skills:
            evidence: list[dict] = []
            declared = self_by_skill.get(requirement.skill_id)
            if declared:
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, "self_assessment", "self_reported",
                    declared.proficiency, min(declared.confidence, 0.5), f"self:{requirement.skill_id}", "Student self-assessment", now,
                ))
            for quiz in quiz_by_skill.get(requirement.skill_id, []):
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, "quiz", "observed",
                    quiz.score, 0.68, f"quiz:{quiz.quiz_id}", "LumaPath quiz result", now,
                ))
            for cert in cert_by_skill.get(requirement.skill_id, []):
                # Until a certificate-verification service exists, certificate claims stay self-reported.
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, "certificate", "self_reported",
                    max(requirement.required_proficiency, 55), 0.50,
                    f"certificate:{cert.issuer}:{cert.title}", f"Self-reported certificate · {cert.issuer} · {cert.title}", now,
                ))
            if request.include_portfolio_evidence:
                for row in self.repository.latest_portfolio_evidence(student_id, requirement.skill_id):
                    repository_source = row["source_kind"] == "repository" or bool(row["source_repository_id"])
                    repository_active = (not repository_source) or row["repository_access_status"] == "active"
                    source_fresh = not bool(row["snapshot_stale"]) and repository_active
                    observed = row["status"] == "observed" and source_fresh
                    if not source_fresh:
                        confidence = min(0.25, max(0.10, float(row["confidence"])))
                        evidence_status = "self_reported"
                        source_type = "repository" if repository_source else "manual_project"
                        source_label = "Stale or revoked project evidence; refresh or re-authorize before treating it as observed"
                    else:
                        confidence = min(0.88 if observed else 0.58, max(0.35, float(row["confidence"])))
                        evidence_status = "observed" if observed else "self_reported"
                        source_type = "repository" if repository_source else "manual_project"
                        source_label = "Observed repository project evidence" if observed else "Student-recorded project evidence"
                    proficiency = min(90, max(45, int(45 + confidence * 45)))
                    evidence.append(self._evidence(
                        assessment_id, student_id, requirement.skill_id,
                        source_type, evidence_status,
                        proficiency, confidence, f"portfolio:{row['snapshot_id']}:{requirement.skill_id}",
                        source_label, datetime.fromisoformat(row["source_timestamp"]),
                    ))
            # DOC-F31 contributes owner-controlled evidence using its documented
            # verification status/confidence. Existing source refs are de-duplicated so
            # Portfolio/quiz evidence is never counted twice.
            known_refs = {item["source_ref"] for item in evidence}
            for row in self.repository.passport_evidence(student_id, requirement.skill_id):
                if row["source_ref"] in known_refs:
                    continue
                passport_status = row["verification_status"]
                if row["owner_disputed"] or passport_status == "disputed":
                    mapped_status, confidence = "self_reported", min(0.10, float(row["confidence"]))
                elif passport_status in {"verified"}:
                    mapped_status, confidence = "verified", float(row["confidence"])
                elif passport_status in {"observed", "reviewed"}:
                    mapped_status, confidence = "observed", float(row["confidence"])
                elif passport_status in {"stale", "expired"} or row["source_missing"]:
                    mapped_status, confidence = "self_reported", min(0.30, float(row["confidence"]))
                else:
                    mapped_status, confidence = "self_reported", float(row["confidence"])
                proficiency = int(row["proficiency"] if row["proficiency"] is not None else max(45, requirement.required_proficiency - 15))
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, row["evidence_type"], mapped_status,
                    proficiency, max(0.0, min(0.95, confidence)), row["source_ref"],
                    f"Evidence Passport · {row['title']}", datetime.fromisoformat(row["observed_at"]),
                ))
                known_refs.add(row["source_ref"])
            cv = cv_by_skill.get(requirement.skill_id)
            if cv and cv.get("status") != "not_demonstrated_in_cv":
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, "cv", "self_reported",
                    max(50, requirement.required_proficiency - 10), 0.45,
                    f"cv:{cv['analysis_id']}:{requirement.skill_id}", "Reviewed CV contains matching skill wording",
                    datetime.fromisoformat(cv["analyzed_at"]),
                ))
            for row in self.repository.latest_pathway_completion(student_id, requirement.skill_id):
                verified = row["completion_source"] == "verified_evidence"
                evidence.append(self._evidence(
                    assessment_id, student_id, requirement.skill_id, "pathway_completion",
                    "verified" if verified else "student_confirmed",
                    max(requirement.required_proficiency, int(row["proficiency"] or 0)), 0.82 if verified else 0.60,
                    f"pathway:{row['pathway_id']}:{row['id']}",
                    "Verified pathway evidence" if verified else "Student-confirmed roadmap milestone",
                    datetime.fromisoformat(row["updated_at"]),
                ))

            proficiency, confidence, uncertainty = self._aggregate(evidence)
            if self._is_conflicting(evidence):
                conflicts.append(requirement.skill_id)
                uncertainty = "Evidence sources disagree materially; keep this estimate under review."
                confidence = min(confidence, 0.58)
            meets = proficiency >= requirement.required_proficiency and confidence >= 0.55
            gap = max(0, requirement.required_proficiency - proficiency) if meets is False else 0
            skill_rows.append({
                "student_id": student_id, "assessment_id": assessment_id, "target_role": role.name,
                "skill_id": requirement.skill_id, "skill_name": requirement.name, "proficiency": proficiency,
                "confidence": confidence, "required_proficiency": requirement.required_proficiency, "gap": gap,
                "meets_requirement": int(meets), "uncertainty": uncertainty, "updated_at": now.isoformat(),
            })
            evidence_rows.extend(evidence)

        order = [item.skill_id for item in topological_order([
            PathwaySkillDefinition(s.skill_id, s.name, tuple(s.prerequisites), s.estimated_minutes, tuple(s.recommended_evidence)) for s in role.skills
        ])]
        by_skill = {row["skill_id"]: row for row in skill_rows}
        gap_order = [skill_id for skill_id in order if not bool(by_skill[skill_id]["meets_requirement"])]
        assessment = {
            "id": assessment_id, "student_id": student_id, "target_role": role.name, "taxonomy_version": role.version,
            "created_at": now.isoformat(), "conflicting_skills_json": json.dumps(conflicts), "disclaimer": ASSESSMENT_DISCLAIMER,
        }
        self.repository.create_assessment(assessment, skill_rows, evidence_rows)
        self.repository.audit(student_id, "skill_assessment_created", f"{role.name} {assessment_id}")
        return self.current_assessment(student_id, role.name)

    def current_assessment(self, student_id: str, target_role: str | None = None) -> SkillAssessmentResponse:
        row = self.repository.latest_assessment(student_id, target_role)
        if row is None:
            raise HTTPException(status_code=404, detail="No skill assessment exists for this career role yet.")
        role = self.role_detail(row["target_role"])
        requirement_by_skill = {item.skill_id: item for item in role.skills}
        skills: list[StudentSkillView] = []
        for item in self.repository.student_skills(row["id"]):
            evidence = [SkillEvidenceView(
                id=e["id"], source_type=e["source_type"], verification_status=e["verification_status"],
                proficiency=e["proficiency"], confidence=e["confidence"], source_ref=e["source_ref"], source_label=e["source_label"],
                observed_at=datetime.fromisoformat(e["observed_at"]),
            ) for e in self.repository.skill_evidence(row["id"], item["skill_id"])]
            skills.append(StudentSkillView(
                skill_id=item["skill_id"], name=item["skill_name"], proficiency=item["proficiency"], confidence=item["confidence"],
                required_proficiency=item["required_proficiency"], gap=item["gap"], meets_requirement=bool(item["meets_requirement"]),
                evidence=evidence, uncertainty=item["uncertainty"],
            ))
        definitions = [PathwaySkillDefinition(item.skill_id, item.name, tuple(item.prerequisites), item.estimated_minutes, tuple(item.recommended_evidence)) for item in role.skills]
        order = [definition.skill_id for definition in topological_order(definitions)]
        by_skill = {item.skill_id: item for item in skills}
        return SkillAssessmentResponse(
            id=row["id"], target_role=row["target_role"], taxonomy_version=row["taxonomy_version"],
            created_at=datetime.fromisoformat(row["created_at"]), skills=skills,
            gap_order=[skill_id for skill_id in order if skill_id in by_skill and not by_skill[skill_id].meets_requirement],
            conflicting_skills=json.loads(row["conflicting_skills_json"]), disclaimer=row["disclaimer"],
        )

    def ranked_resources(self, skill_id: str, preferences: ResourcePreferencesInput) -> SkillResourcesResponse:
        # Skill must exist in the approved taxonomy; do not let AI or callers invent high-impact skills.
        known = {skill.skill_id for role in self.list_roles() for skill in self.role_detail(role.id).skills}
        if skill_id not in known:
            raise HTTPException(status_code=404, detail="Skill is not in the approved taxonomy.")
        ranked: list[SkillResourceView] = []
        for row in self.repository.resources_for_skill(skill_id):
            factors: list[str] = []
            score = int(row["quality_score"] * 0.45)
            factors.append(f"editorial quality {row['quality_score']}/100")
            languages = {item.lower() for item in preferences.languages}
            if row["language"] and row["language"].lower() in languages:
                score += 20; factors.append("matches language preference")
            elif languages:
                factors.append("language preference does not match")
            if not preferences.formats or (row["format"] and row["format"] in preferences.formats):
                score += 15; factors.append("matches format preference")
            if not preferences.resource_types or row["resource_type"] in preferences.resource_types:
                score += 10; factors.append("matches resource-type preference")
            max_price = preferences.max_price_usd
            affordable = row["cost_type"] == "free" or max_price is None or (row["price_usd"] is not None and row["price_usd"] <= max_price)
            if affordable:
                score += 10; factors.append("fits declared cost preference")
            else:
                score -= 25; factors.append("cost is outside declared preference")
            metadata_complete = bool(row["source"] and row["language"] and row["format"] and row["cost_type"])
            ranked.append(SkillResourceView(
                id=row["id"], skill_id=skill_id, title=row["title"], source=row["source"], source_url=row["source_url"],
                resource_type=row["resource_type"], quality_score=row["quality_score"], cost_type=row["cost_type"], price_usd=row["price_usd"],
                language=row["language"], format=row["format"], estimated_minutes=row["estimated_minutes"], fit_score=max(0, min(100, score)),
                ranking_factors=factors, metadata_complete=metadata_complete,
                quality_note="Editorial quality is a catalogue signal, not a guarantee of learning or employment outcomes.",
            ))
        ranked.sort(key=lambda item: (-item.fit_score, -item.quality_score, item.id))
        return SkillResourcesResponse(skill_id=skill_id, taxonomy_version=self.repository.active_taxonomy_version(), resources=ranked, missing_metadata_warning=any(not item.metadata_complete for item in ranked))

    def current_taxonomy_version(self) -> str:
        return self.repository.active_taxonomy_version()

    def pathway_definitions(self, role_name: str) -> list[PathwaySkillDefinition]:
        role = self.role_detail(role_name)
        return topological_order([
            PathwaySkillDefinition(item.skill_id, item.name, tuple(item.prerequisites), item.estimated_minutes, tuple(item.recommended_evidence))
            for item in role.skills
        ])

    def pathway_resources(self, skill_id: str) -> list[ResourceDefinition]:
        rows = self.repository.resources_for_skill(skill_id)
        return [ResourceDefinition(
            id=row["id"], skill_id=skill_id, title=row["title"], source=row["source"], source_url=row["source_url"],
            cost_type=row["cost_type"], price_usd=row["price_usd"], language=row["language"], format=row["format"], estimated_minutes=row["estimated_minutes"],
        ) for row in rows]

    def pathway_skill_context(self, student_id: str, role_name: str, fallback: list) -> list:
        """Return F13-compatible SkillContext objects from the latest F29 assessment.

        The import is local to keep the career module independent of pathway persistence.
        """
        try:
            assessment = self.current_assessment(student_id, role_name)
        except HTTPException as exc:
            if exc.status_code == 404:
                raise HTTPException(status_code=409, detail="Complete the DOC-F29 skill assessment for this career role before generating or recalculating the roadmap.") from exc
            raise
        from ..pathways.schemas import SkillContext
        result = []
        for item in assessment.skills:
            if item.meets_requirement:
                status = "verified" if any(e.verification_status in {"verified", "observed"} and e.confidence >= 0.65 for e in item.evidence) else "completed"
            elif item.proficiency > 0:
                status = "in-progress"
            else:
                status = "locked"
            result.append(SkillContext(
                skill_id=item.skill_id, status=status, proficiency=item.proficiency,
                evidence_refs=[e.source_ref for e in item.evidence],
            ))
        return result

    def gap_effort_minutes(self, student_id: str, role_name: str) -> int:
        assessment = self.current_assessment(student_id, role_name)
        role = self.role_detail(role_name)
        missing = {item.skill_id for item in assessment.skills if not item.meets_requirement}
        return sum(skill.estimated_minutes for skill in role.skills if skill.skill_id in missing)

    @staticmethod
    def feasibility(total_gap_minutes: int, weekly_minutes: int, planning_start: date, target_date: date | None) -> dict:
        if target_date is None:
            return {"total_gap_minutes": total_gap_minutes, "available_minutes_until_target": None, "feasible": None, "explanation": "No target date was supplied; LumaPath will schedule within weekly capacity without claiming a completion date."}
        days = max(0, (target_date - planning_start).days + 1)
        available = int(weekly_minutes * (days / 7))
        feasible = total_gap_minutes <= available if weekly_minutes > 0 else total_gap_minutes == 0
        if weekly_minutes <= 0 and total_gap_minutes > 0:
            explanation = f"The pathway needs about {total_gap_minutes} learning minutes, but declared weekly learning capacity is zero."
        elif feasible:
            explanation = f"The current gap estimate ({total_gap_minutes} min) fits within about {available} declared learning minutes before the target date."
        else:
            explanation = f"The current gap estimate ({total_gap_minutes} min) exceeds the roughly {available} declared learning minutes before the target date. Reduce scope, move the date, or increase availability before activation."
        return {"total_gap_minutes": total_gap_minutes, "available_minutes_until_target": available, "feasible": feasible, "explanation": explanation}

    @staticmethod
    def _aggregate(evidence: list[dict]) -> tuple[int, float, str | None]:
        if not evidence:
            return 0, 0.0, "No assessment evidence is recorded yet."
        total_weight = sum(float(item["confidence"]) for item in evidence)
        proficiency = round(sum(int(item["proficiency"]) * float(item["confidence"]) for item in evidence) / total_weight) if total_weight else 0
        # Multiple independent sources increase confidence but never imply certainty.
        confidence = min(0.95, max(float(item["confidence"]) for item in evidence) + min(0.18, 0.04 * (len(evidence) - 1)))
        uncertainty = None if confidence >= 0.65 else "Evidence confidence is limited; treat this as a planning estimate."
        return max(0, min(100, proficiency)), round(confidence, 3), uncertainty

    @staticmethod
    def _is_conflicting(evidence: list[dict]) -> bool:
        strong = [int(item["proficiency"]) for item in evidence if float(item["confidence"]) >= 0.5]
        return bool(strong) and max(strong) - min(strong) >= 35

    @staticmethod
    def _evidence(assessment_id: str, student_id: str, skill_id: str, source_type: str, verification_status: str, proficiency: int, confidence: float, source_ref: str, source_label: str, observed_at: datetime) -> dict:
        return {
            "id": f"evid_{uuid4().hex[:18]}", "assessment_id": assessment_id, "student_id": student_id, "skill_id": skill_id,
            "source_type": source_type, "verification_status": verification_status, "proficiency": max(0, min(100, int(proficiency))),
            "confidence": max(0.0, min(1.0, float(confidence))), "source_ref": source_ref[:300], "source_label": source_label[:240],
            "observed_at": observed_at.astimezone(timezone.utc).isoformat(),
        }
