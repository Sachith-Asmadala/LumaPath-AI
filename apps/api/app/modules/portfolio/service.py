from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status

from .repository import PortfolioRepository
from .schemas import (
    CreatePortfolioProjectRequest, DeleteImportedRepositoryResponse, ExternalRepositoryResponse,
    PortfolioAnalysisResponse, PortfolioProjectListResponse, PortfolioProjectResponse, PortfolioRecommendation,
    ProjectFacts, RecommendationDecisionRequest, RecommendationStatus, RepositoryRevocationResponse,
    RepositorySnapshotInput, SkillEvidenceResponse, UpdatePortfolioProjectRequest,
)
from .scoring import completeness, map_skills


STALE_AFTER_DAYS = 7
DEFAULT_ANALYSES_PER_MINUTE = 10


class PortfolioService:
    def __init__(self, repository: PortfolioRepository, now=lambda: datetime.now(timezone.utc), analyses_per_minute: int = DEFAULT_ANALYSES_PER_MINUTE):
        self.repository = repository
        self.now = now
        self.analyses_per_minute = analyses_per_minute

    def create(self, student_id: str, request: CreatePortfolioProjectRequest) -> PortfolioProjectResponse:
        now = self._now()
        project_id = f"portfolio_{uuid4().hex}"
        self.repository.create_project({
            "id": project_id, "student_id": student_id, "title": request.title, "description": request.description.strip(),
            "target_role": request.target_role, "project_url": request.project_url, "live_demo_url": request.live_demo_url,
            "facts_json": request.facts.model_dump_json(), "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        self.repository.audit(project_id, student_id, "project_created", "manual project")
        return self.get(student_id, project_id)

    def list(self, student_id: str) -> PortfolioProjectListResponse:
        return PortfolioProjectListResponse(items=[self._project_response(row, student_id) for row in self.repository.list_projects(student_id)])

    def get(self, student_id: str, project_id: str) -> PortfolioProjectResponse:
        return self._project_response(self._owned_project(student_id, project_id), student_id)

    def update(self, student_id: str, project_id: str, request: UpdatePortfolioProjectRequest) -> PortfolioProjectResponse:
        self._owned_project(student_id, project_id)
        now = self._now()
        self.repository.update_project(project_id, student_id, {
            "title": request.title, "description": request.description.strip(), "target_role": request.target_role,
            "project_url": request.project_url, "live_demo_url": request.live_demo_url,
            "facts_json": request.facts.model_dump_json(), "updated_at": now.isoformat(),
        })
        self.repository.audit(project_id, student_id, "project_updated")
        return self.get(student_id, project_id)

    def delete(self, student_id: str, project_id: str) -> bool:
        self._owned_project(student_id, project_id)
        deleted = self.repository.delete_project(project_id, student_id)
        return deleted

    def import_repository_snapshot(self, student_id: str, project_id: str, request: RepositorySnapshotInput) -> ExternalRepositoryResponse:
        self._owned_project(student_id, project_id)
        now = self._now()
        row = self.repository.upsert_repository({
            "id": f"repo_{uuid4().hex}", "project_id": project_id, "student_id": student_id,
            "provider": request.provider, "external_repository_id": request.external_repository_id,
            "full_name": request.full_name, "repository_url": request.repository_url, "live_demo_url": request.live_demo_url, "visibility": request.visibility,
            "access_status": "active", "authorization_reference": request.authorization_reference,
            "authorization_scope": request.authorization_scope, "collected_at": self._aware(request.collected_at).isoformat(),
            "imported_at": now.isoformat(), "revoked_at": None, "facts_json": request.facts.model_dump_json(),
        })
        self.repository.audit(project_id, student_id, "repository_snapshot_imported", f"provider={request.provider};repo={request.full_name}")
        return self._repository_response(row)

    def refresh_repository_snapshot(self, student_id: str, project_id: str, repository_id: str, request: RepositorySnapshotInput) -> ExternalRepositoryResponse:
        self._owned_project(student_id, project_id)
        repo = self._owned_repository(student_id, project_id, repository_id)
        if repo["access_status"] != "active":
            raise HTTPException(status_code=409, detail="Repository access is revoked. Re-authorisation is required before refresh.")
        if request.provider != repo["provider"] or request.external_repository_id != repo["external_repository_id"]:
            raise HTTPException(status_code=422, detail="A refresh must refer to the same selected repository.")
        row = self.repository.refresh_repository(repository_id, student_id, {
            "full_name": request.full_name, "repository_url": request.repository_url, "live_demo_url": request.live_demo_url, "visibility": request.visibility,
            "collected_at": self._aware(request.collected_at).isoformat(), "facts_json": request.facts.model_dump_json(),
        })
        self.repository.audit(project_id, student_id, "repository_snapshot_refreshed", f"repo={request.full_name}")
        return self._repository_response(row)

    def revoke_repository(self, student_id: str, project_id: str, repository_id: str) -> RepositoryRevocationResponse:
        self._owned_project(student_id, project_id)
        self._owned_repository(student_id, project_id, repository_id)
        row = self.repository.revoke_repository(repository_id, student_id, self._now().isoformat())
        if not row:
            raise HTTPException(status_code=404, detail="Repository reference not found.")
        self.repository.audit(project_id, student_id, "repository_access_revoked", f"repository_id={repository_id}")
        return RepositoryRevocationResponse(
            repository_id=repository_id, access_status="revoked",
            message="Refresh is disabled. Existing imported facts remain private until you choose to delete them.",
        )

    def delete_repository_data(self, student_id: str, project_id: str, repository_id: str) -> DeleteImportedRepositoryResponse:
        self._owned_project(student_id, project_id)
        self._owned_repository(student_id, project_id, repository_id)
        deleted = self.repository.delete_repository_and_imported_data(repository_id, student_id)
        self.repository.audit(project_id, student_id, "repository_import_deleted", f"repository_id={repository_id}")
        return DeleteImportedRepositoryResponse(repository_id=repository_id, deleted=deleted)

    def analyze(self, student_id: str, project_id: str, repository_id: str | None = None) -> PortfolioAnalysisResponse:
        project = self._owned_project(student_id, project_id)
        now = self._now()
        since = (now - timedelta(minutes=1)).isoformat()
        if self.repository.analysis_count_since(student_id, since) >= self.analyses_per_minute:
            raise HTTPException(status_code=429, detail="Portfolio analysis rate limit reached. Try again shortly.")

        if repository_id:
            repo = self._owned_repository(student_id, project_id, repository_id)
            facts = ProjectFacts.model_validate_json(repo["facts_json"])
            source_kind = "repository"
            source_type = "repository_snapshot"
            source_timestamp = datetime.fromisoformat(repo["collected_at"])
            stale = repo["access_status"] == "revoked" or now - self._aware(source_timestamp) > timedelta(days=STALE_AFTER_DAYS)
            source_repository_id = repository_id
        else:
            facts = ProjectFacts.model_validate_json(project["facts_json"])
            source_kind = "manual"
            source_type = "manual_project"
            source_timestamp = datetime.fromisoformat(project["updated_at"])
            stale = False
            source_repository_id = None

        effective_demo_url = repo["live_demo_url"] if repository_id and repo["live_demo_url"] else project["live_demo_url"]
        score, indicators = completeness(project["description"], project["project_url"], effective_demo_url, facts)
        demonstrated, missing = map_skills(project["target_role"], facts, source_type, source_timestamp)
        factual_description = self._factual_description(project, facts, source_kind)
        snapshot_id = f"analysis_{uuid4().hex}"
        recommendations = self._recommendations(snapshot_id, project, indicators, demonstrated, missing, factual_description, stale)
        disclaimer = "Skills marked not demonstrated mean this project snapshot has no matching observable evidence; they are not judgments about the student's ability."

        self.repository.save_analysis(
            {
                "id": snapshot_id, "project_id": project_id, "student_id": student_id, "source_kind": source_kind,
                "source_repository_id": source_repository_id, "target_role": project["target_role"],
                "source_timestamp": self._aware(source_timestamp).isoformat(), "analyzed_at": now.isoformat(),
                "completeness_score": score, "indicators_json": json.dumps([item.model_dump(mode="json") for item in indicators]),
                "factual_description": factual_description, "stale": int(stale), "disclaimer": disclaimer,
            },
            [
                {
                    "snapshot_id": snapshot_id, "student_id": student_id, "skill_id": item.skill_id, "skill_name": item.skill_name,
                    "status": item.status.value, "confidence": item.confidence, "evidence_json": json.dumps(item.evidence),
                    "source_type": item.source_type, "source_timestamp": item.source_timestamp.isoformat(),
                }
                for item in [*demonstrated, *missing]
            ],
            [
                {
                    "id": item.id, "snapshot_id": snapshot_id, "project_id": project_id, "student_id": student_id,
                    "kind": item.kind, "priority": item.priority, "title": item.title, "rationale": item.rationale,
                    "evidence_refs_json": json.dumps(item.evidence_refs), "editable_text": item.editable_text,
                    "status": item.status.value, "created_at": now.isoformat(),
                }
                for item in recommendations
            ],
        )
        self.repository.audit(project_id, student_id, "analysis_completed", f"source={source_kind};score={score}")
        return self._analysis_response(self.repository.latest_analysis(project_id, student_id))

    def decide_recommendation(self, student_id: str, project_id: str, recommendation_id: str, request: RecommendationDecisionRequest) -> PortfolioRecommendation:
        self._owned_project(student_id, project_id)
        row = self.repository.get_recommendation(recommendation_id)
        if not row:
            raise HTTPException(status_code=404, detail="Recommendation not found.")
        if row["student_id"] != student_id or row["project_id"] != project_id:
            raise HTTPException(status_code=403, detail="You cannot change another student's portfolio recommendation.")
        updated = self.repository.decide_recommendation(recommendation_id, student_id, request.decision, request.edited_text, self._now().isoformat())
        self.repository.audit(project_id, student_id, f"recommendation_{request.decision}", f"recommendation_id={recommendation_id}")
        return self._recommendation_response(updated)

    def _recommendations(self, snapshot_id: str, project, indicators, demonstrated, missing, factual_description: str, stale: bool) -> list[PortfolioRecommendation]:
        items: list[PortfolioRecommendation] = []
        priority_by_key = {"readme": "high", "tests": "high", "documentation": "medium", "live_demo": "low", "topics": "low", "technology": "medium"}
        labels = {
            "readme": "Add a runnable README", "tests": "Add visible automated tests", "documentation": "Document architecture and decisions",
            "live_demo": "Add a live demo if the project can be safely hosted", "topics": "Add factual project topics", "technology": "Record the technologies used",
        }
        for indicator in indicators:
            if indicator.satisfied or indicator.key not in labels:
                continue
            items.append(PortfolioRecommendation(
                id=f"rec_{uuid4().hex}", kind="improvement", priority=priority_by_key[indicator.key], title=labels[indicator.key],
                rationale=f"Completeness check: {indicator.evidence}", evidence_refs=[f"indicator:{indicator.key}"],
            ))
        if stale:
            items.append(PortfolioRecommendation(
                id=f"rec_{uuid4().hex}", kind="improvement", priority="high", title="Refresh the repository facts after re-authorising access",
                rationale="The imported repository snapshot is stale or access was revoked, so newer repository changes are not represented.", evidence_refs=["repository:freshness"],
            ))
        items.append(PortfolioRecommendation(
            id=f"rec_{uuid4().hex}", kind="description", priority="medium", title="Use a factual portfolio description",
            rationale="This description only uses the project title, student-supplied description and observable metadata in the selected snapshot.",
            evidence_refs=["project:title", "project:description", "project:facts"], editable_text=factual_description,
        ))
        for skill in missing[:2]:
            items.append(PortfolioRecommendation(
                id=f"rec_{uuid4().hex}", kind="project_idea", priority="medium", title=f"Make {skill.skill_name} directly observable",
                rationale=f"{skill.skill_name} is not demonstrated by the current project evidence. A focused extension or separate small project can make that evidence visible without claiming skill from activity volume.",
                evidence_refs=[f"skill:{skill.skill_id}:not_demonstrated"],
                editable_text=f"Create a small, scoped project or extension where {skill.skill_name} is visible in configuration, tests, documentation, or a reproducible demo.",
            ))
        return items[:12]

    @staticmethod
    def _factual_description(project, facts: ProjectFacts, source_kind: str) -> str:
        tech = [*facts.languages, *facts.technologies]
        tech_text = ", ".join(dict.fromkeys(tech)) if tech else "no technologies recorded yet"
        indicators = []
        if facts.has_readme: indicators.append("a README")
        if facts.has_tests: indicators.append("automated tests")
        if facts.has_documentation: indicators.append("project documentation")
        if facts.has_ci: indicators.append("CI configuration")
        if facts.has_docker: indicators.append("container configuration")
        evidence_text = ", ".join(indicators) if indicators else "no additional completeness indicators recorded yet"
        return f"{project['title']} is described as: {project['description'].strip()} Recorded technology evidence: {tech_text}. The {source_kind} snapshot shows {evidence_text}."

    def _project_response(self, row, student_id: str) -> PortfolioProjectResponse:
        if not row:
            raise HTTPException(status_code=404, detail="Portfolio project not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's portfolio project.")
        latest = self.repository.latest_analysis(row["id"], student_id)
        return PortfolioProjectResponse(
            id=row["id"], owner_id=row["student_id"], title=row["title"], description=row["description"], target_role=row["target_role"],
            project_url=row["project_url"], live_demo_url=row["live_demo_url"], facts=ProjectFacts.model_validate_json(row["facts_json"]),
            created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]),
            repositories=[self._repository_response(item) for item in self.repository.list_repositories(row["id"], student_id)],
            latest_analysis=self._analysis_response(latest) if latest else None,
        )

    def _analysis_response(self, row) -> PortfolioAnalysisResponse:
        skills = [self._skill_response(item) for item in self.repository.skills_for_snapshot(row["id"])]
        stale = bool(row["stale"])
        repository_id = row["source_repository_id"]
        if repository_id:
            repo = self.repository.get_repository(repository_id)
            if not repo:
                stale = True
            else:
                collected = datetime.fromisoformat(repo["collected_at"])
                stale = stale or repo["access_status"] != "active" or self._now() - self._aware(collected) > timedelta(days=STALE_AFTER_DAYS)
        return PortfolioAnalysisResponse(
            id=row["id"], project_id=row["project_id"], target_role=row["target_role"], source_kind=row["source_kind"],
            source_repository_id=repository_id, source_timestamp=datetime.fromisoformat(row["source_timestamp"]), analyzed_at=datetime.fromisoformat(row["analyzed_at"]),
            completeness_score=row["completeness_score"], indicators=json.loads(row["indicators_json"]),
            demonstrated_skills=[item for item in skills if item.status.value != "not_demonstrated"],
            not_demonstrated_skills=[item for item in skills if item.status.value == "not_demonstrated"],
            recommendations=[self._recommendation_response(item) for item in self.repository.recommendations_for_snapshot(row["id"])],
            factual_description=row["factual_description"], stale=stale, disclaimer=row["disclaimer"],
        )

    @staticmethod
    def _skill_response(row) -> SkillEvidenceResponse:
        return SkillEvidenceResponse(
            skill_id=row["skill_id"], skill_name=row["skill_name"], status=row["status"], confidence=row["confidence"],
            evidence=json.loads(row["evidence_json"]), source_type=row["source_type"], source_timestamp=datetime.fromisoformat(row["source_timestamp"]),
        )

    @staticmethod
    def _recommendation_response(row) -> PortfolioRecommendation:
        return PortfolioRecommendation(
            id=row["id"], kind=row["kind"], priority=row["priority"], title=row["title"], rationale=row["rationale"],
            evidence_refs=json.loads(row["evidence_refs_json"]), editable_text=row["editable_text"], status=row["status"],
        )

    def _repository_response(self, row) -> ExternalRepositoryResponse:
        collected = datetime.fromisoformat(row["collected_at"])
        stale = row["access_status"] == "revoked" or self._now() - self._aware(collected) > timedelta(days=STALE_AFTER_DAYS)
        return ExternalRepositoryResponse(
            id=row["id"], provider=row["provider"], external_repository_id=row["external_repository_id"], full_name=row["full_name"],
            repository_url=row["repository_url"], live_demo_url=row["live_demo_url"], visibility=row["visibility"], access_status=row["access_status"],
            collected_at=collected, imported_at=datetime.fromisoformat(row["imported_at"]),
            revoked_at=datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] else None, stale=stale,
            facts=ProjectFacts.model_validate_json(row["facts_json"]),
        )

    def _owned_project(self, student_id: str, project_id: str):
        row = self.repository.get_project(project_id)
        if not row:
            raise HTTPException(status_code=404, detail="Portfolio project not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's portfolio project.")
        return row

    def _owned_repository(self, student_id: str, project_id: str, repository_id: str):
        row = self.repository.get_repository(repository_id)
        if not row:
            raise HTTPException(status_code=404, detail="Repository reference not found.")
        if row["student_id"] != student_id or row["project_id"] != project_id:
            raise HTTPException(status_code=403, detail="You cannot access another student's repository reference.")
        return row

    def _now(self) -> datetime:
        return self._aware(self.now())

    @staticmethod
    def _aware(value: datetime) -> datetime:
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
