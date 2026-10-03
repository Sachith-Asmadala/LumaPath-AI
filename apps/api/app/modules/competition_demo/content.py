"""Populate only the two synthetic demo owners through the existing domain services."""
import asyncio
from datetime import date, timedelta
from io import BytesIO
from pathlib import Path

from fastapi import HTTPException, UploadFile
from starlette.datastructures import Headers

from ...core.config import settings
from .clock import DEMO_ENVIRONMENTS, SCENARIO_NOW, STUDENT_ID
from ..portfolio.repository import PortfolioRepository
from ..careers.repository import CareerRepository
from ..portfolio.schemas import CreatePortfolioProjectRequest, ProjectFacts
from ..portfolio.service import PortfolioService
from ..cv.repository import CvRepository
from ..cv.schemas import UpdateCvSectionsRequest
from ..cv.service import CvService
from ..documents.jobs import InlineDocumentJobDispatcher
from ..documents.repository import SqliteDocumentRepository
from ..documents.security import MalwareScanner
from ..documents.service import DocumentService
from ..documents.storage import LocalPrivateObjectStorage
from ..calendar.repository import CalendarRepository
from ..calendar.schemas import CommitDecision, CommitRequest
from ..calendar.service import CalendarService
from ..evidence_passport.repository import EvidencePassportRepository
from ..evidence_passport.schemas import CertificateInput
from ..evidence_passport.service import EvidencePassportService

ASSETS = Path(__file__).resolve().parents[5] / "public/demo"
DEMO_OWNERS = {STUDENT_ID, "student-sachith"}


class DemoCvService(CvService):
    def purge_expired(self):
        # Demo seeding must not run the shared retention job for other owners.
        return 0


class DemoDocumentService(DocumentService):
    def purge_expired(self):
        return 0


def seed_demo_content(database_path: str, student_id: str, *, document_storage=None, cv_storage=None):
    if settings.environment not in DEMO_ENVIRONMENTS or student_id not in DEMO_OWNERS:
        raise HTTPException(404, "Sample content is available only for synthetic demo students.")
    now = SCENARIO_NOW
    CareerRepository(database_path)  # Initialize the approved skill catalogue for standalone seeding.
    portfolio_repo = PortfolioRepository(database_path)
    portfolio = PortfolioService(portfolio_repo, now=lambda: now)
    projects = [
        ("GitHub Release Automation", "A sample Python release workflow that runs tests on pull requests, packages tagged releases and documents branch protection and rollback. The configuration is learner-supplied demo evidence.", ["GitHub Actions", "Git"], True, False, True),
        ("Campus Booking API", "A sample FastAPI and PostgreSQL room-booking service with conflict validation, automated API tests and a reproducible Docker Compose setup. Architecture notes explain service boundaries and local configuration.", ["FastAPI", "PostgreSQL", "Docker", "Git"], True, True, True),
        ("Docker Networking Lab", "A sample two-service Docker Compose lab exploring private networks, service-name resolution and database readiness. The README contains sanitized setup and troubleshooting notes; automated tests and architecture documentation are the next improvements.", ["Docker", "Docker Compose"], False, True, False),
    ]
    existing = {item.title for item in portfolio.list(student_id).items}
    for title, description, technologies, tests, docker, documentation in projects:
        if title in existing:
            continue
        project = portfolio.create(student_id, CreatePortfolioProjectRequest(
            title=title, description=description, target_role="DevOps Engineer",
            facts=ProjectFacts(technologies=technologies, languages=["Python"], topics=["devops", "learning-project"],
                has_readme=True, has_tests=tests, has_documentation=documentation,
                has_ci=tests, has_docker=docker, last_activity_at=now-timedelta(days=2)),
        ))
        portfolio.analyze(student_id, project.id)

    cvs = DemoCvService(CvRepository(database_path), LocalPrivateObjectStorage(cv_storage or settings.cv_storage_path), portfolio_repo, now=lambda: now)
    existing_cvs = {row["original_filename"] for row in cvs.repository.list_documents(student_id)}
    for slug, title in [("devops-starter", "DevOps Starter CV · Demo"), ("devops-internship", "DevOps Internship CV · Demo")]:
        filename = f"{title.replace(' · Demo', ' (Demo)')}.pdf"
        if filename in existing_cvs:
            continue
        document = cvs.create_upload(student_id, filename, "application/pdf", (ASSETS / f"cvs/{slug}.pdf").read_bytes(), "DevOps Engineer", 90)
        if document.parse_status != "parsed":
            raise RuntimeError(f"Sample CV did not parse: {slug}")
        cvs.update_sections(student_id, document.id, UpdateCvSectionsRequest(sections=document.sections, confirmed=True))
        cvs.analyze(student_id, document.id)

    evidence = EvidencePassportService(EvidencePassportRepository(database_path), now=lambda: now)
    existing_certificates = {row["credential_reference"] for row in evidence.repository.certificates(student_id)}
    for skill, title, acquired, reference, image in [
        ("git", "Git & Release Automation", date(2026, 9, 18), "DEMO-GIT-2026-018", "git-release-automation"),
        ("docker", "Docker Foundations", date(2026, 9, 24), "DEMO-DOCKER-2026-024", "docker-foundations"),
    ]:
        if reference not in existing_certificates:
            evidence.add_certificate(student_id, CertificateInput(skill_id=skill, title=f"{title} · Sample certificate", issuer="Luma Learning Academy (demo)",
                acquired_at=acquired, credential_reference=reference, source_url=f"https://example.org/lumapath-demo/certificates/{image}", proficiency=None))
    # Certificates remain self-declared; sample photos never imply issuer verification.
    evidence.sync(student_id)

    documents = DemoDocumentService(SqliteDocumentRepository(database_path), LocalPrivateObjectStorage(document_storage or settings.document_storage_path),
        MalwareScanner(require_scanner=False), InlineDocumentJobDispatcher(), max_bytes=15*1024*1024, retention_days=90)
    for slug, kind in [("linux-foundations", "pdf"), ("docker-networking-lab", "lab_sheet"), ("cicd-release-guide", "notes")]:
        extension = "txt" if kind == "notes" else "pdf"
        filename = f"{slug}.{extension}"
        document = documents.upload(student_id, filename=filename, declared_mime="text/plain" if extension == "txt" else "application/pdf",
            data=(ASSETS / f"learning/{filename}").read_bytes(), requested_kind=kind, module_id="DevOps Foundations")
        if document.status.value != "ready":
            raise RuntimeError(f"Sample learning document did not process: {filename}")

    calendar = CalendarService(CalendarRepository(database_path), now=lambda: now-timedelta(days=3))
    connections = calendar.list_connections(student_id).items
    connection = next((item for item in connections if item.display_name == "Luma University timetable · Demo"), None)
    actions = []
    if connection is None:
        async def import_sample(connection_id=None):
            file = UploadFile(BytesIO((ASSETS / "university-calendar.ics").read_bytes()), filename="university-calendar.ics", headers=Headers({"content-type": "text/calendar"}))
            preview = await calendar.preview_upload(student_id, file, "Asia/Colombo", [], connection_id)
            committed = calendar.commit(student_id, preview.sync_run_id, CommitRequest(
                decisions=[CommitDecision(preview_key=item.preview_key, action="import" if item.change_type == "new" else "skip") for item in preview.items],
                idempotency_key=f"demo-content-{preview.sync_run_id}"))
            return preview, committed
        preview, committed = asyncio.run(import_sample())
        calendar.repository.update_connection(preview.connection_id, display_name="Luma University timetable · Demo")
        actions = [action.model_dump(mode="json") for action in committed.actions]
        # A second, unchanged import demonstrates a real sync history and deduplication.
        calendar.now = lambda: now-timedelta(days=1)
        asyncio.run(import_sample(preview.connection_id))
    else:
        # Repeated seed calls restore the same planner references without duplicating records.
        for item in calendar.repository.list_items(student_id, connection.id):
            if item["import_status"] == "imported":
                actions.append(calendar._apply_action(item, "create", [], connection.display_name).model_dump(mode="json"))
    return {"portfolio_projects": len(portfolio.list(student_id).items), "cvs": len(cvs.repository.list_documents(student_id)),
        "documents": len(documents.list(student_id).items), "calendar_actions": actions}
