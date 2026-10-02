from __future__ import annotations

import json
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, status

from ..documents.extractor import ExtractionError, extract_document
from ..documents.security import FileValidationError, MalwareScanner, verify_file
from ..documents.storage import LocalPrivateObjectStorage
from ..portfolio.repository import PortfolioRepository
from ..portfolio.taxonomy import ROLE_TAXONOMY
from .analyzer import ANALYSIS_VERSION, PortfolioEvidence, analyze_findings
from .parser import parse_cv_sections
from .repository import CvRepository
from .schemas import (
    CreatePastedCvRequest, CvAnalysisResponse, CvDeleteResponse, CvDocumentListResponse, CvDocumentResponse,
    CvExportResponse, CvFinding, CvRoleSkill, CvSection, CvSuggestion, CvSuggestionDecisionRequest,
    UpdateCvSectionsRequest,
)

ATS_DISCLAIMER = "This is a deterministic ATS-oriented review of extracted text and standard structure. It does not predict recruiter decisions or guarantee ATS success."
EVIDENCE_DISCLAIMER = "Suggestions are drafts. LumaPath does not invent employers, dates, qualifications, metrics or achievements. Add claims only when you can verify them."


class CvService:
    def __init__(
        self,
        repository: CvRepository,
        storage: LocalPrivateObjectStorage,
        portfolio_repository: PortfolioRepository,
        *,
        now=lambda: datetime.now(timezone.utc),
        max_upload_bytes: int = 8 * 1024 * 1024,
        require_malware_scan: bool = False,
        analyses_per_minute: int = 8,
    ) -> None:
        self.repository = repository
        self.storage = storage
        self.portfolio_repository = portfolio_repository
        self.now = now
        self.max_upload_bytes = max_upload_bytes
        self.scanner = MalwareScanner(require_scanner=require_malware_scan)
        self.analyses_per_minute = analyses_per_minute

    def create_paste(self, student_id: str, request: CreatePastedCvRequest) -> CvDocumentResponse:
        self.purge_expired()
        now = self._now()
        document_id = f"cv_{uuid4().hex}"
        sections = parse_cv_sections(request.source_text)
        row = self.repository.create_document({
            "id": document_id, "student_id": student_id, "source_type": "paste", "title": request.title,
            "original_filename": None, "storage_name": None, "canonical_mime": "text/plain", "source_text": request.source_text,
            "parse_status": "parsed", "parse_error": None, "target_role": request.target_role, "retention_days": request.retention_days,
            "expires_at": (now + timedelta(days=request.retention_days)).isoformat(), "created_at": now.isoformat(), "updated_at": now.isoformat(),
            "source_deleted_at": None, "sections_confirmed_at": None,
            "parsed_sections_json": json.dumps([item.model_dump(mode="json") for item in sections], ensure_ascii=False),
        })
        self.repository.audit(document_id, student_id, "cv.pasted", now.isoformat(), f"retention_days={request.retention_days}")
        return self._document(row)

    def create_upload(self, student_id: str, filename: str, declared_mime: str | None, data: bytes, target_role: str, retention_days: int) -> CvDocumentResponse:
        self.purge_expired()
        if retention_days not in {7, 30, 90}:
            raise HTTPException(status_code=422, detail="Choose a CV retention period of 7, 30 or 90 days.")
        target_role = target_role.strip()
        if target_role not in ROLE_TAXONOMY:
            raise HTTPException(status_code=422, detail="Choose a supported target role from the LumaPath role taxonomy.")
        try:
            verified = verify_file(filename, declared_mime, data, self.max_upload_bytes)
        except FileValidationError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        if verified.extension not in {".pdf", ".docx", ".txt"}:
            raise HTTPException(status_code=422, detail="CV uploads support PDF, DOCX or UTF-8 TXT files.")
        now = self._now()
        stored = self.storage.save(data, verified.extension)
        try:
            scan_status = self.scanner.scan(stored.path)
        except (FileValidationError, RuntimeError) as exc:
            self.storage.delete(stored.storage_name)
            raise HTTPException(status_code=422 if isinstance(exc, FileValidationError) else 503, detail=str(exc)) from exc
        document_id = f"cv_{uuid4().hex}"
        row = self.repository.create_document({
            "id": document_id, "student_id": student_id, "source_type": "upload", "title": Path(filename).stem[:220] or "Uploaded CV",
            "original_filename": Path(filename).name[:260], "storage_name": stored.storage_name, "canonical_mime": verified.canonical_mime,
            "source_text": None, "parse_status": "parse_failed", "parse_error": "Extraction has not completed.", "target_role": target_role,
            "retention_days": retention_days, "expires_at": (now + timedelta(days=retention_days)).isoformat(), "created_at": now.isoformat(),
            "updated_at": now.isoformat(), "source_deleted_at": None, "sections_confirmed_at": None, "parsed_sections_json": "[]",
        })
        self.repository.audit(document_id, student_id, "cv.uploaded", now.isoformat(), f"scan={scan_status};mime={verified.canonical_mime}")
        try:
            chunks = extract_document(stored.path, verified.extension)
            text = "\n\n".join(chunk.text for chunk in chunks)
            sections = parse_cv_sections(text)
            row = self.repository.update_sections(document_id, student_id, json.dumps([item.model_dump(mode="json") for item in sections], ensure_ascii=False), None, now.isoformat())
            self.repository.audit(document_id, student_id, "cv.parsed", now.isoformat(), f"chunks={len(chunks)}")
        except ExtractionError as exc:
            row = self.repository.mark_parse_failed(document_id, student_id, str(exc), now.isoformat())
            self.repository.audit(document_id, student_id, "cv.parse_failed", now.isoformat(), str(exc))
        return self._document(row)

    def list(self, student_id: str) -> CvDocumentListResponse:
        self.purge_expired()
        return CvDocumentListResponse(items=[self._document(row) for row in self.repository.list_documents(student_id)])

    def get(self, student_id: str, document_id: str) -> CvDocumentResponse:
        self.purge_expired()
        return self._document(self._owned(student_id, document_id))

    def update_sections(self, student_id: str, document_id: str, request: UpdateCvSectionsRequest) -> CvDocumentResponse:
        self._owned(student_id, document_id)
        now = self._now()
        # Any section correction changes the analysis source of truth. Remove older
        # snapshots/suggestions rather than displaying a report for stale text.
        self.repository.delete_analysis(document_id, student_id)
        row = self.repository.update_sections(
            document_id, student_id,
            json.dumps([item.model_dump(mode="json") for item in request.sections], ensure_ascii=False),
            now.isoformat() if request.confirmed else None, now.isoformat(),
        )
        self.repository.audit(document_id, student_id, "cv.sections_reviewed", now.isoformat(), f"confirmed={request.confirmed}")
        return self._document(row)

    def analyze(self, student_id: str, document_id: str) -> CvAnalysisResponse:
        row = self._owned(student_id, document_id)
        if row["parse_status"] == "parse_failed":
            raise HTTPException(status_code=409, detail="Review cannot run because the CV could not be parsed. The original source is still preserved for deletion or later retry.")
        if not row["sections_confirmed_at"]:
            raise HTTPException(status_code=409, detail="Confirm the parsed CV sections before running analysis.")
        since = self._now() - timedelta(minutes=1)
        if self.repository.analysis_count_since(student_id, since.isoformat()) >= self.analyses_per_minute:
            raise HTTPException(status_code=429, detail="CV analysis limit reached. Review the current report before running another analysis.")
        sections = self._sections(row)
        try:
            return self._run_analysis(student_id, row, sections)
        except HTTPException:
            raise
        except Exception as exc:
            self.repository.audit(document_id, student_id, "cv.analysis_failed", self._now().isoformat(), type(exc).__name__)
            raise HTTPException(status_code=503, detail="CV analysis could not be completed safely. Your original CV and reviewed sections were not changed.") from exc

    def _run_analysis(self, student_id: str, row, sections: list[CvSection]) -> CvAnalysisResponse:
        now = self._now()
        word_count, findings, role_skills_rows = analyze_findings(sections, row["target_role"], row["source_type"])
        evidence = self._portfolio_evidence(student_id, row["target_role"])
        evidence_by_skill: dict[str, list[PortfolioEvidence]] = {}
        for item in evidence:
            evidence_by_skill.setdefault(item.skill_id, []).append(item)
        upgraded: list[CvRoleSkill] = []
        for skill in role_skills_rows:
            if skill.status == "not_demonstrated_in_cv" and evidence_by_skill.get(skill.skill_id):
                sources = evidence_by_skill[skill.skill_id]
                upgraded.append(CvRoleSkill(
                    skill_id=skill.skill_id, skill_name=skill.skill_name, status="portfolio_evidenced",
                    evidence=[f"Portfolio evidence from {source.project_title}: {detail}" for source in sources for detail in source.evidence][:20],
                ))
                findings.append(CvFinding(
                    id=f"finding_{uuid4().hex}", category="skills", severity="low",
                    title=f"{skill.skill_name} evidence exists outside the CV",
                    rationale=f"Portfolio evidence supports {skill.skill_name}, but the reviewed CV does not currently demonstrate it. This is an evidence gap in the CV, not a judgment about your ability.",
                    source_section="skills", proposed_action="If this evidence reflects your own work, add a concise factual reference to the relevant project or Skills section.",
                ))
            else:
                upgraded.append(skill)
        suggestions = self._suggestions(sections, row["target_role"], upgraded, evidence)
        analysis_id = f"cva_{uuid4().hex}"
        analysis_values = {
            "id": analysis_id, "document_id": row["id"], "student_id": student_id, "analysis_version": ANALYSIS_VERSION,
            "target_role": row["target_role"], "analyzed_at": now.isoformat(), "word_count": word_count,
            "findings_json": json.dumps([item.model_dump(mode="json") for item in findings], ensure_ascii=False),
            "role_skills_json": json.dumps([item.model_dump(mode="json") for item in upgraded], ensure_ascii=False),
            "ats_disclaimer": ATS_DISCLAIMER, "evidence_disclaimer": EVIDENCE_DISCLAIMER,
        }
        suggestion_values = [{
            "id": item.id, "analysis_id": analysis_id, "document_id": row["id"], "student_id": student_id,
            "kind": item.kind, "section_key": item.section_key, "title": item.title, "rationale": item.rationale,
            "evidence_refs_json": json.dumps(item.evidence_refs, ensure_ascii=False), "draft_text": item.draft_text,
            "status": item.status, "created_at": now.isoformat(),
        } for item in suggestions]
        self.repository.save_analysis(analysis_values, suggestion_values)
        self.repository.audit(row["id"], student_id, "cv.analyzed", now.isoformat(), f"version={ANALYSIS_VERSION};role={row['target_role']}")
        return self._analysis(self.repository.latest_analysis(row["id"], student_id))

    def decide_suggestion(self, student_id: str, document_id: str, suggestion_id: str, request: CvSuggestionDecisionRequest) -> CvSuggestion:
        self._owned(student_id, document_id)
        suggestion = self.repository.get_suggestion(suggestion_id)
        if not suggestion:
            raise HTTPException(status_code=404, detail="CV suggestion was not found.")
        if suggestion["student_id"] != student_id or suggestion["document_id"] != document_id:
            raise HTTPException(status_code=403, detail="This CV suggestion belongs to another student.")
        draft = request.edited_text.strip() if request.edited_text and request.edited_text.strip() else None
        updated = self.repository.decide_suggestion(suggestion_id, student_id, request.decision, draft, self._now().isoformat())
        return self._suggestion(updated)

    def export(self, student_id: str, document_id: str) -> CvExportResponse:
        row = self._owned(student_id, document_id)
        sections = self._sections(row)
        analysis = self.repository.latest_analysis(document_id, student_id)
        accepted = [] if not analysis else [item for item in self.repository.suggestions(analysis["id"]) if item["status"] == "accepted"]
        lines = [f"{section.title.upper()}\n{section.content.strip()}" for section in sections if section.content.strip()]
        if accepted:
            lines.append("ACCEPTED IMPROVEMENT DRAFTS\n" + "\n\n".join(f"[{item['section_key'].title()}] {item['draft_text']}" for item in accepted))
        lines.append("LUMAPATH NOTE\nAccepted improvements are user-reviewed drafts. Verify every factual claim before using this CV.")
        safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", row["title"]).strip("-") or "cv"
        return CvExportResponse(filename=f"{safe}-reviewed.txt", content="\n\n".join(lines), accepted_suggestion_count=len(accepted))

    def delete_source(self, student_id: str, document_id: str) -> CvDeleteResponse:
        row = self._owned(student_id, document_id)
        if row["storage_name"]:
            self.storage.delete(row["storage_name"])
        at = self._now().isoformat()
        self.repository.mark_source_deleted(document_id, student_id, at)
        self.repository.audit(document_id, student_id, "cv.source_deleted", at)
        return CvDeleteResponse(deleted=False, source_deleted=True)

    def delete_analysis(self, student_id: str, document_id: str) -> CvDeleteResponse:
        self._owned(student_id, document_id)
        deleted = self.repository.delete_analysis(document_id, student_id)
        self.repository.audit(document_id, student_id, "cv.analysis_deleted", self._now().isoformat())
        return CvDeleteResponse(deleted=False, analysis_deleted=deleted)

    def delete(self, student_id: str, document_id: str) -> CvDeleteResponse:
        row = self._owned(student_id, document_id)
        if row["storage_name"]:
            self.storage.delete(row["storage_name"])
        deleted = self.repository.delete_document(document_id, student_id)
        return CvDeleteResponse(deleted=deleted, source_deleted=True, analysis_deleted=True)

    def purge_expired(self) -> int:
        now = self._now()
        removed = 0
        for row in self.repository.expired_documents(now.isoformat()):
            if row["storage_name"]:
                self.storage.delete(row["storage_name"])
            if self.repository.delete_document(row["id"], row["student_id"]):
                removed += 1
        return removed

    def _portfolio_evidence(self, student_id: str, target_role: str) -> list[PortfolioEvidence]:
        result: list[PortfolioEvidence] = []
        for project in self.portfolio_repository.list_projects(student_id):
            latest = self.portfolio_repository.latest_analysis(project["id"], student_id)
            if not latest or latest["target_role"] != target_role:
                continue
            facts = json.loads(project["facts_json"] or "{}")
            tech = tuple(str(item) for item in [*(facts.get("technologies") or []), *(facts.get("languages") or [])][:20])
            for skill in self.portfolio_repository.skills_for_snapshot(latest["id"]):
                if skill["status"] == "not_demonstrated":
                    continue
                result.append(PortfolioEvidence(
                    project_id=project["id"], project_title=project["title"], skill_id=skill["skill_id"], skill_name=skill["skill_name"],
                    verification_status=skill["status"], evidence=tuple(json.loads(skill["evidence_json"] or "[]")),
                    description=project["description"], technologies=tech,
                ))
        return result

    def _suggestions(self, sections: list[CvSection], target_role: str, skills: list[CvRoleSkill], evidence: list[PortfolioEvidence]) -> list[CvSuggestion]:
        suggestions: list[CvSuggestion] = []
        evidenced_names = [skill.skill_name for skill in skills if skill.status != "not_demonstrated_in_cv"][:4]
        if evidenced_names:
            joined = ", ".join(evidenced_names[:-1]) + (f" and {evidenced_names[-1]}" if len(evidenced_names) > 1 else evidenced_names[0])
            suggestions.append(CvSuggestion(
                id=f"cvs_{uuid4().hex}", kind="wording", section_key="summary", title="Draft a role-focused summary",
                rationale="This draft uses only the selected target role and skill evidence already visible in the CV or Portfolio. It does not add employers, dates, qualifications or results.",
                evidence_refs=[f"role:{target_role}"] + [f"skill:{skill.skill_id}:{skill.status}" for skill in skills if skill.status != "not_demonstrated_in_cv"][:6],
                draft_text=f"Student targeting {target_role} opportunities with evidence in {joined}. Keep this summary only if those evidence sources accurately represent your own work.",
            ))
        project_section = next((item for item in sections if item.key == "projects"), None)
        project_text = (project_section.content.lower() if project_section else "")
        seen_projects: set[str] = set()
        for item in evidence:
            if item.project_id in seen_projects:
                continue
            seen_projects.add(item.project_id)
            if item.project_title.lower() in project_text and len(project_text) > 40:
                continue
            description = re.split(r"(?<=[.!?])\s+", item.description.strip())[0][:320]
            tech = ", ".join(item.technologies[:6])
            draft = f"{item.project_title} — {description}"
            if tech:
                draft += f" Technologies recorded in Portfolio: {tech}."
            suggestions.append(CvSuggestion(
                id=f"cvs_{uuid4().hex}", kind="wording", section_key="projects", title=f"Project draft: {item.project_title}",
                rationale="The wording is based on an existing Portfolio project record. Review it carefully because manual Portfolio evidence remains student-supplied unless separately observed from an authorised source.",
                evidence_refs=[f"portfolio:{item.project_id}:{item.verification_status}"], draft_text=draft[:5000],
            ))
            if len(seen_projects) >= 3:
                break
        experience = next((item for item in sections if item.key == "experience"), None)
        if experience:
            candidate_lines = [line.strip("•-* \t") for line in experience.content.splitlines() if len(line.strip()) >= 35]
            for index, line in enumerate(candidate_lines[:2], start=1):
                if not re.search(r"\d", line):
                    suggestions.append(CvSuggestion(
                        id=f"cvs_{uuid4().hex}", kind="evidence_request", section_key="experience", title=f"Evidence question {index}",
                        rationale="The experience statement describes work but does not contain a verifiable result, scale or outcome. LumaPath will not invent one.",
                        evidence_refs=["cv:experience:existing_text"],
                        draft_text=f"What result, scale, quality improvement or responsibility can you verify for this statement: “{line[:220]}”? If you have no evidence for a metric, keep the statement factual without adding one.",
                    ))
        return suggestions[:10]

    def _owned(self, student_id: str, document_id: str):
        row = self.repository.get_document(document_id)
        if not row:
            raise HTTPException(status_code=404, detail="CV document was not found.")
        if row["student_id"] != student_id:
            raise HTTPException(status_code=403, detail="This CV belongs to another student.")
        return row

    def _sections(self, row) -> list[CvSection]:
        try:
            raw = json.loads(row["parsed_sections_json"] or "[]")
            return [CvSection.model_validate(item) for item in raw]
        except Exception:
            return []

    def _document(self, row) -> CvDocumentResponse:
        analysis_row = self.repository.latest_analysis(row["id"], row["student_id"])
        return CvDocumentResponse(
            id=row["id"], owner_id=row["student_id"], source_type=row["source_type"], title=row["title"],
            original_filename=row["original_filename"], canonical_mime=row["canonical_mime"], target_role=row["target_role"],
            retention_days=row["retention_days"], expires_at=datetime.fromisoformat(row["expires_at"]),
            created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]),
            parse_status=row["parse_status"], parse_error=row["parse_error"],
            source_deleted_at=datetime.fromisoformat(row["source_deleted_at"]) if row["source_deleted_at"] else None,
            sections_confirmed=bool(row["sections_confirmed_at"]), sections=self._sections(row),
            latest_analysis=self._analysis(analysis_row) if analysis_row else None,
        )

    def _analysis(self, row) -> CvAnalysisResponse:
        suggestions = [self._suggestion(item) for item in self.repository.suggestions(row["id"])]
        return CvAnalysisResponse(
            id=row["id"], document_id=row["document_id"], analysis_version=row["analysis_version"], target_role=row["target_role"],
            analyzed_at=datetime.fromisoformat(row["analyzed_at"]), word_count=row["word_count"],
            findings=[CvFinding.model_validate(item) for item in json.loads(row["findings_json"] or "[]")],
            role_skills=[CvRoleSkill.model_validate(item) for item in json.loads(row["role_skills_json"] or "[]")],
            suggestions=suggestions, ats_disclaimer=row["ats_disclaimer"], evidence_disclaimer=row["evidence_disclaimer"],
        )

    @staticmethod
    def _suggestion(row) -> CvSuggestion:
        return CvSuggestion(
            id=row["id"], kind=row["kind"], section_key=row["section_key"], title=row["title"], rationale=row["rationale"],
            evidence_refs=json.loads(row["evidence_refs_json"] or "[]"), draft_text=row["draft_text"], status=row["status"],
        )

    def _now(self) -> datetime:
        value = self.now()
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
