from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
from pathlib import Path
import uuid

from .analyzer import analyze_document
from .extractor import EncryptedDocumentError, ExtractionError, extract_document
from .jobs import DocumentJobDispatcher
from .repository import SqliteDocumentRepository
from .schemas import (
    ApproveDocumentActionRequest,
    ApproveDocumentActionResponse,
    DeleteDocumentResponse,
    DocumentKind,
    DocumentListResponse,
    DocumentProposedAction,
    DocumentRecord,
    DocumentStatus,
    RetryDocumentResponse,
)
from .security import FileValidationError, MalwareScanner, verify_file
from .storage import LocalPrivateObjectStorage


class DocumentError(RuntimeError):
    status_code = 400


class DocumentNotFoundError(DocumentError):
    status_code = 404


class DocumentForbiddenError(DocumentError):
    status_code = 403


class DocumentValidationError(DocumentError):
    status_code = 422


class DocumentUpstreamError(DocumentError):
    status_code = 503


class DocumentConflictError(DocumentError):
    status_code = 409


class DocumentService:
    def __init__(
        self,
        repository: SqliteDocumentRepository,
        storage: LocalPrivateObjectStorage,
        scanner: MalwareScanner,
        dispatcher: DocumentJobDispatcher,
        *,
        max_bytes: int,
        retention_days: int,
        max_processing_attempts: int = 3,
    ) -> None:
        self.repository = repository
        self.storage = storage
        self.scanner = scanner
        self.dispatcher = dispatcher
        self.max_bytes = max_bytes
        self.retention_days = max(1, retention_days)
        self.max_processing_attempts = max(1, max_processing_attempts)

    @staticmethod
    def _kind(extension: str, requested: str | None) -> DocumentKind:
        if requested:
            try:
                return DocumentKind(requested)
            except ValueError as exc:
                raise DocumentValidationError("Unknown document type.") from exc
        if extension == ".pptx":
            return DocumentKind.SLIDES
        if extension == ".pdf":
            return DocumentKind.PDF
        return DocumentKind.NOTES

    def purge_expired(self) -> int:
        now = datetime.now(timezone.utc).isoformat()
        rows = self.repository.expired_rows(now)
        removed = 0
        for row in rows:
            storage_name = self.repository.delete(row["id"], row["owner_id"])
            if storage_name:
                self.storage.delete(storage_name)
                self.repository.audit(row["owner_id"], "document_retention_expired", None, {"document_id": row["id"]})
                removed += 1
        return removed

    def upload(self, owner_id: str, *, filename: str, declared_mime: str | None, data: bytes, requested_kind: str | None, module_id: str | None) -> DocumentRecord:
        self.purge_expired()
        try:
            verified = verify_file(filename, declared_mime, data, self.max_bytes)
        except FileValidationError as exc:
            raise DocumentValidationError(str(exc)) from exc
        digest = hashlib.sha256(data).hexdigest()
        duplicate = self.repository.find_duplicate(owner_id, digest)
        if duplicate:
            record = self._record(duplicate, duplicate=True)
            self.repository.audit(owner_id, "document_duplicate_reused", record.id, {"sha256": digest[:16]})
            return record

        stored = self.storage.save(data, verified.extension)
        try:
            scan_status = self.scanner.scan(stored.path)
        except FileValidationError as exc:
            self.storage.delete(stored.storage_name)
            raise DocumentValidationError(str(exc)) from exc
        except RuntimeError as exc:
            self.storage.delete(stored.storage_name)
            raise DocumentUpstreamError(str(exc)) from exc

        now = datetime.now(timezone.utc)
        document_id = f"doc_{uuid.uuid4().hex}"
        values = {
            "id": document_id,
            "owner_id": owner_id,
            "original_name": Path(filename).name[:260],
            "storage_name": stored.storage_name,
            "extension": verified.extension,
            "kind": self._kind(verified.extension, requested_kind).value,
            "mime_type": verified.canonical_mime,
            "size_bytes": len(data),
            "sha256": digest,
            "status": DocumentStatus.QUEUED.value,
            "scan_status": scan_status,
            "module_id": module_id.strip()[:128] if module_id and module_id.strip() else None,
            "created_at": now.isoformat(),
            "updated_at": now.isoformat(),
            "retention_expires_at": (now + timedelta(days=self.retention_days)).isoformat(),
        }
        self.repository.create(values)
        self.repository.audit(owner_id, "document_uploaded", document_id, {"kind": values["kind"], "size_bytes": str(len(data)), "scan_status": scan_status})
        self._dispatch(document_id, owner_id)
        row = self.repository.get_row(document_id, owner_id)
        assert row is not None
        return self._record(row)

    def _dispatch(self, document_id: str, owner_id: str) -> None:
        self.dispatcher.submit(document_id, owner_id, lambda: self.process(document_id, owner_id))

    def process(self, document_id: str, owner_id: str) -> None:
        row = self.repository.get_row(document_id, owner_id)
        if not row:
            return
        self.repository.update_status(document_id, owner_id, DocumentStatus.PROCESSING, increment_attempt=True)
        try:
            path = self.storage.path_for(row["storage_name"])
            extracted = extract_document(path, row["extension"])
            chunks = [
                {"id": f"chunk_{document_id}_{item.ordinal}", "ordinal": item.ordinal, "locator_type": item.locator_type, "locator": item.locator, "text": item.text}
                for item in extracted
            ]
            self.repository.replace_chunks(document_id, owner_id, chunks)
            analysis = analyze_document(chunks, row["original_name"])
            self.repository.save_analysis(document_id, owner_id, analysis)
            self.repository.update_status(document_id, owner_id, DocumentStatus.READY)
            self.repository.audit(owner_id, "document_processing_ready", document_id, {"chunks": str(len(chunks)), "actions": str(len(analysis.proposed_actions))})
        except EncryptedDocumentError as exc:
            self.repository.update_status(document_id, owner_id, DocumentStatus.FAILED, error_code="encrypted", error_message=str(exc))
            self.repository.audit(owner_id, "document_processing_failed", document_id, {"code": "encrypted"})
        except ExtractionError as exc:
            self.repository.update_status(document_id, owner_id, DocumentStatus.FAILED, error_code="extraction_failed", error_message=str(exc))
            self.repository.audit(owner_id, "document_processing_failed", document_id, {"code": "extraction_failed"})
        except Exception:
            self.repository.update_status(document_id, owner_id, DocumentStatus.FAILED, error_code="processing_failed", error_message="Document processing failed safely. Retry the file or upload a clean copy.")
            self.repository.audit(owner_id, "document_processing_failed", document_id, {"code": "processing_failed"})

    def _record(self, row, duplicate: bool = False) -> DocumentRecord:
        analysis = self.repository.load_analysis(row["id"], row["owner_id"]) if row["status"] == DocumentStatus.READY.value else None
        return DocumentRecord(
            id=row["id"], owner_id=row["owner_id"], original_name=row["original_name"], kind=row["kind"], mime_type=row["mime_type"],
            size_bytes=row["size_bytes"], sha256=row["sha256"], status=row["status"], scan_status=row["scan_status"], module_id=row["module_id"],
            created_at=row["created_at"], updated_at=row["updated_at"], retention_expires_at=row["retention_expires_at"], processing_attempts=row["processing_attempts"],
            error_code=row["error_code"], error_message=row["error_message"], duplicate=duplicate, analysis=analysis,
        )

    def get(self, owner_id: str, document_id: str) -> DocumentRecord:
        self.purge_expired()
        row = self.repository.get_row(document_id, owner_id)
        if not row:
            if self.repository.get_any_row(document_id):
                raise DocumentForbiddenError("You cannot access another student's private document.")
            raise DocumentNotFoundError("Document not found.")
        return self._record(row)

    def list(self, owner_id: str) -> DocumentListResponse:
        self.purge_expired()
        return DocumentListResponse(items=[self._record(row) for row in self.repository.list_rows(owner_id)])

    def retry(self, owner_id: str, document_id: str) -> RetryDocumentResponse:
        record = self.get(owner_id, document_id)
        if record.status != DocumentStatus.FAILED:
            raise DocumentConflictError("Only failed documents can be retried.")
        if record.processing_attempts >= self.max_processing_attempts:
            raise DocumentConflictError("Retry limit reached. Delete the file and upload a clean copy.")
        self.repository.update_status(document_id, owner_id, DocumentStatus.QUEUED)
        self.repository.audit(owner_id, "document_retry_requested", document_id, {"attempt": str(record.processing_attempts + 1)})
        self._dispatch(document_id, owner_id)
        return RetryDocumentResponse(document_id=document_id, status=DocumentStatus.QUEUED, message="Document queued for another processing attempt.")

    def _validate_action(self, owner_id: str, document_id: str, request: ApproveDocumentActionRequest) -> DocumentProposedAction:
        action = request.action
        context = request.planner_context
        if context.student_id != owner_id or any(block.owner_id != owner_id for block in context.plan_blocks):
            raise DocumentForbiddenError("Planner context belongs to another student.")
        stored_row = self.repository.get_action(document_id, owner_id, action.id)
        if not stored_row:
            raise DocumentValidationError("This action was not proposed by the selected document.")
        original = DocumentProposedAction.model_validate(json.loads(stored_row["payload_json"]))
        if original.kind != action.kind:
            raise DocumentValidationError("The edited action changed a protected action type.")
        if action.approval_status != original.approval_status:
            raise DocumentValidationError("The edited action changed a protected approval state.")
        valid_chunk_ids = {item["id"] for item in self.repository.get_chunks(document_id, owner_id)}
        if any(ref.chunk_id not in valid_chunk_ids for ref in action.source_refs):
            raise DocumentValidationError("The edited action contains a source reference that does not belong to this document.")
        if action.kind in {"task", "plan_item"}:
            assert action.estimated_minutes is not None
            if not action.start_at:
                raise DocumentValidationError("Choose a planner start time before approving this action.")
            if action.estimated_minutes > max(30, context.planning_minutes):
                raise DocumentValidationError("This action exceeds the student's current planning capacity. Shorten or split it first.")
            reference = datetime.fromisoformat(context.reference_date)
            if action.start_at < reference:
                raise DocumentValidationError("The planned study action cannot start before the current planning date.")
            if action.due_at and not action.date_confirmed:
                raise DocumentValidationError("Confirm the extracted date before creating a planner task from it.")
            if action.due_at and action.start_at > action.due_at:
                raise DocumentValidationError("The planned study action starts after the confirmed date.")
            end_at = action.start_at + timedelta(minutes=action.estimated_minutes)
            for block in context.plan_blocks:
                if action.start_at < block.end_at and end_at > block.start_at:
                    raise DocumentValidationError(f"This action conflicts with existing planner item “{block.title}”.")
        if action.kind == "flashcard_set" and len(action.flashcards) > 40:
            raise DocumentValidationError("A saved flashcard set is limited to 40 cards.")
        if action.kind == "quiz_set" and len(action.quiz) > 30:
            raise DocumentValidationError("A saved quiz is limited to 30 questions.")
        return action

    def approve_action(self, owner_id: str, document_id: str, request: ApproveDocumentActionRequest) -> ApproveDocumentActionResponse:
        record = self.get(owner_id, document_id)
        if record.status != DocumentStatus.READY:
            raise DocumentConflictError("Document analysis is not ready for action approval.")
        action = self._validate_action(owner_id, document_id, request)
        approved_action = action.model_copy(update={"approval_status": "approved"})
        self.repository.approve_action(document_id, owner_id, approved_action)
        self.repository.audit(owner_id, "document_action_approved", document_id, {"action_id": action.id, "kind": action.kind})
        return ApproveDocumentActionResponse(saved=True, action_id=action.id, kind=action.kind, message="Action approved after ownership, source, date and planner validation.")

    def delete(self, owner_id: str, document_id: str) -> DeleteDocumentResponse:
        self.get(owner_id, document_id)
        storage_name = self.repository.delete(document_id, owner_id)
        if storage_name:
            self.storage.delete(storage_name)
        self.repository.audit(owner_id, "document_deleted", None, {"document_id": document_id})
        return DeleteDocumentResponse(deleted=True, document_id=document_id)
