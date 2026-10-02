from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, UploadFile

from .parser import ParsedCalendarItem, detect_format, parse_calendar, validate_timezone
from .connectors import CalendarConnector, CredentialCipher, ProviderAuthorizationExpired, ProviderSyncFailure
from .repository import CalendarRepository
from .schemas import (
    CalendarApplyAction, CalendarItemKind, CalendarItemResponse, CleanupRequest, CleanupResponse,
    CommitRequest, CommitResponse, ConnectionListResponse, ConnectionResponse, ExistingRecordInput,
    ItemListResponse, OverrideRequest, PreviewItem, PreviewResponse, RevokeResponse,
)


class CalendarService:
    def __init__(self, repository: CalendarRepository, now=lambda: datetime.now(timezone.utc), *, max_upload_bytes: int = 2 * 1024 * 1024, credential_cipher: CredentialCipher | None = None):
        self.repository = repository
        self.now = now
        self.max_upload_bytes = max_upload_bytes
        self.credential_cipher = credential_cipher


    def register_authorized_provider(self, student_id: str, *, provider_key: str, display_name: str, timezone_name: str, credential_secret: str, scopes: list[str], explicitly_authorized: bool) -> ConnectionResponse:
        """Internal-only hook for a future OAuth/LMS adapter after explicit user authorization.

        DOC-F23 exposes no public route that can call this function.
        """
        if not explicitly_authorized:
            raise HTTPException(status_code=403, detail="Provider connection requires explicit student authorization.")
        try: validate_timezone(timezone_name)
        except ValueError as exc: raise HTTPException(status_code=422, detail=str(exc)) from exc
        if not credential_secret:
            raise HTTPException(status_code=422, detail="Provider credential is required.")
        if self.credential_cipher is None:
            raise HTTPException(status_code=503, detail="Calendar provider credential encryption is not configured.")
        normalized_scopes = sorted(set(scopes))
        if "calendar.read" not in normalized_scopes:
            raise HTTPException(status_code=422, detail="Calendar provider access must include the minimum read-only calendar scope.")
        encrypted_credentials = self.credential_cipher.encrypt(credential_secret)
        now = self._now()
        row = self.repository.create_connection({
            "id": f"calconn_{uuid4().hex}", "student_id": student_id, "source_type": "provider", "display_name": display_name[:180], "status": "active",
            "default_timezone": timezone_name, "provider_key": provider_key[:120], "encrypted_credentials": encrypted_credentials, "scopes_json": json.dumps(normalized_scopes),
            "sync_cursor": None, "last_sync_at": None, "revoked_at": None, "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        self.repository.audit(student_id, row["id"], "provider_authorized", {"provider": provider_key, "scopes": normalized_scopes}, now.isoformat())
        return self._connection(row)

    def preview_provider_sync(self, student_id: str, connection_id: str, connector: CalendarConnector, existing_records: list[ExistingRecordInput], cursor: str | None = None) -> PreviewResponse:
        """Provider-neutral incremental preview used only by a separately authorized adapter."""
        connection = self._owned_connection(student_id, connection_id)
        if connection["source_type"] != "provider":
            raise HTTPException(status_code=422, detail="This source is not a provider connection.")
        if connection["status"] != "active":
            raise HTTPException(status_code=409, detail="This provider connection is revoked.")
        granted_scopes = set(json.loads(connection["scopes_json"] or "[]"))
        missing_scopes = set(connector.minimum_scopes) - granted_scopes
        if missing_scopes:
            raise HTTPException(status_code=403, detail="Calendar provider connection is missing the connector's required read scopes.")
        now = self._now(); run_id = f"calsync_{uuid4().hex}"
        try:
            effective_cursor = cursor if cursor is not None else connection["sync_cursor"]
            result = connector.fetch_incremental(cursor=effective_cursor)
            normalized = tuple(result.items)
            source_hash = hashlib.sha256("|".join(item.source_hash for item in normalized).encode("utf-8")).hexdigest()
            self.repository.create_sync_run({"id":run_id,"connection_id":connection_id,"student_id":student_id,"status":"parsing","source_filename":connection["display_name"],"source_format":"provider","source_hash":source_hash,"preview_json":"[]","commit_json":None,"commit_idempotency_key":None,"next_cursor":result.next_cursor,"error_code":None,"error_detail":None,"started_at":now.isoformat(),"completed_at":None,"created_at":now.isoformat(),"updated_at":now.isoformat()})
            preview_items = self._build_preview(connection, list(normalized), existing_records)
            self.repository.update_sync_run(run_id,status="preview_ready",preview_json=json.dumps([item.model_dump(mode="json") for item in preview_items]),updated_at=now.isoformat())
            counts={key:sum(1 for item in preview_items if item.change_type==key) for key in ("new","changed","duplicate","conflict","deleted","unchanged")}
            return PreviewResponse(sync_run_id=run_id,connection_id=connection_id,connection_name=connection["display_name"],source_format="provider",timezone=connection["default_timezone"],items=preview_items,new_count=counts["new"],changed_count=counts["changed"],duplicate_count=counts["duplicate"],conflict_count=counts["conflict"],deleted_count=counts["deleted"],unchanged_count=counts["unchanged"],generated_at=now)
        except ProviderAuthorizationExpired as exc:
            self.repository.update_connection(connection_id,status="revoked",revoked_at=now.isoformat(),encrypted_credentials=None,updated_at=now.isoformat())
            self.repository.audit(student_id,connection_id,"provider_authorization_expired",{},now.isoformat())
            raise HTTPException(status_code=401,detail="Calendar provider authorization expired. Re-authorize before syncing again.") from exc
        except ProviderSyncFailure as exc:
            self.repository.create_sync_run({"id":run_id,"connection_id":connection_id,"student_id":student_id,"status":"failed","source_filename":connection["display_name"],"source_format":"provider","source_hash":f"failed:{uuid4().hex}","preview_json":"[]","commit_json":None,"commit_idempotency_key":None,"next_cursor":None,"error_code":"provider_failure","error_detail":str(exc)[:500],"started_at":now.isoformat(),"completed_at":now.isoformat(),"created_at":now.isoformat(),"updated_at":now.isoformat()})
            raise HTTPException(status_code=503,detail="Calendar provider sync failed. Existing plan data was not changed.") from exc

    async def preview_upload(self, student_id: str, file: UploadFile, timezone_name: str, existing_records: list[ExistingRecordInput], connection_id: str | None = None) -> PreviewResponse:
        raw = await file.read(self.max_upload_bytes + 1)
        if len(raw) > self.max_upload_bytes:
            raise HTTPException(status_code=413, detail=f"Calendar file exceeds the {self.max_upload_bytes // (1024*1024)} MB upload limit.")
        try:
            validate_timezone(timezone_name)
            source_format = detect_format(file.filename or "calendar", file.content_type, raw)
            parsed = parse_calendar(raw, source_format, timezone_name)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        now = self._now()
        connection = self._connection_for_preview(student_id, connection_id, source_format, file.filename or f"calendar.{source_format}", timezone_name, now)
        source_hash = hashlib.sha256(raw).hexdigest()
        run_id = f"calsync_{uuid4().hex}"
        run = self.repository.create_sync_run({
            "id": run_id, "connection_id": connection["id"], "student_id": student_id, "status": "parsing", "source_filename": Path(file.filename or f"calendar.{source_format}").name[:255],
            "source_format": source_format, "source_hash": source_hash, "preview_json": "[]", "commit_json": None, "commit_idempotency_key": None, "next_cursor": None,
            "error_code": None, "error_detail": None, "started_at": now.isoformat(), "completed_at": None, "created_at": now.isoformat(), "updated_at": now.isoformat(),
        })
        try:
            preview_items = self._build_preview(connection, parsed, existing_records)
            payload = [item.model_dump(mode="json") for item in preview_items]
            self.repository.update_sync_run(run_id, status="preview_ready", preview_json=json.dumps(payload), updated_at=now.isoformat())
            self.repository.audit(student_id, connection["id"], "preview_ready", {"run_id": run_id, "items": len(payload), "source_format": source_format}, now.isoformat())
            counts = {key: sum(1 for item in preview_items if item.change_type == key) for key in ("new","changed","duplicate","conflict","deleted","unchanged")}
            return PreviewResponse(sync_run_id=run_id, connection_id=connection["id"], connection_name=connection["display_name"], source_format=source_format, timezone=timezone_name,
                items=preview_items, new_count=counts["new"], changed_count=counts["changed"], duplicate_count=counts["duplicate"], conflict_count=counts["conflict"], deleted_count=counts["deleted"], unchanged_count=counts["unchanged"], generated_at=now)
        except Exception as exc:
            self.repository.update_sync_run(run_id, status="failed", error_code="preview_failed", error_detail=str(exc)[:500], completed_at=now.isoformat(), updated_at=now.isoformat())
            if isinstance(exc, HTTPException): raise
            raise HTTPException(status_code=422, detail="Calendar preview failed. Existing plan data was not changed.") from exc

    def commit(self, student_id: str, run_id: str, request: CommitRequest) -> CommitResponse:
        run = self._owned_run(student_id, run_id)
        if run["status"] == "committed" and run["commit_json"]:
            if run["commit_idempotency_key"] == request.idempotency_key:
                return CommitResponse.model_validate_json(run["commit_json"])
            raise HTTPException(status_code=409, detail="This preview has already been committed. Refresh the calendar source before applying another decision set.")
        if run["status"] != "preview_ready":
            raise HTTPException(status_code=409, detail="Only a ready calendar preview can be committed.")
        connection = self._owned_connection(student_id, run["connection_id"])
        if connection["status"] != "active":
            raise HTTPException(status_code=409, detail="This calendar source has been revoked. Re-authorize or upload it as a new manual source.")
        preview = [PreviewItem.model_validate(item) for item in json.loads(run["preview_json"])]
        decisions = {item.preview_key: item.action for item in request.decisions}
        unknown = set(decisions) - {item.preview_key for item in preview}
        if unknown:
            raise HTTPException(status_code=422, detail="One or more commit decisions do not belong to this preview.")
        now = self._now(); actions: list[CalendarApplyAction] = []
        stats = {"imported":0,"updated":0,"linked":0,"skipped":0,"removed":0,"kept_personal":0}
        for item in preview:
            decision = decisions.get(item.preview_key, "skip")
            if item.change_type == "deleted":
                existing = self._find_preview_existing(connection["id"], item)
                if decision == "remove_internal" and existing:
                    if existing["mapped_internal_id"]:
                        actions.append(CalendarApplyAction(operation="delete", external_item_id=existing["id"], internal_record_id=existing["mapped_internal_id"], record_type=existing["mapped_record_type"]))
                    self._mark_deleted(existing, run_id, now, detach=True); stats["removed"] += 1
                elif decision == "keep_personal" and existing:
                    if existing["mapped_internal_id"]:
                        actions.append(CalendarApplyAction(operation="detach", external_item_id=existing["id"], internal_record_id=existing["mapped_internal_id"], record_type=existing["mapped_record_type"]))
                    self._mark_deleted(existing, run_id, now, detach=True); stats["kept_personal"] += 1
                else: stats["skipped"] += 1
                continue
            if decision == "skip":
                # A skip on an already-imported/linked item means "leave my current
                # LumaPath record and source mapping exactly as-is". Persisting the
                # new source snapshot here would silently detach the mapping and
                # would also hide the same source change on the next sync. New
                # never-imported items may be remembered as ignored.
                existing = self._find_preview_existing(connection["id"], item)
                if not existing:
                    self._persist_preview_item(
                        student_id, connection, item, run_id, now,
                        import_status="ignored", mapped_record_type=None, mapped_internal_id=None,
                    )
                stats["skipped"] += 1
                continue
            if decision == "link_existing":
                if not item.matched_internal_id:
                    raise HTTPException(status_code=422, detail="Only a detected duplicate can be linked to an existing LumaPath record.")
                record_type = item.mapped_record_type or ("task" if item.kind == CalendarItemKind.DEADLINE else "planner_event")
                row = self._persist_preview_item(student_id, connection, item, run_id, now, import_status="linked", mapped_record_type=record_type, mapped_internal_id=item.matched_internal_id)
                actions.append(CalendarApplyAction(operation="tag", external_item_id=row["id"], internal_record_id=item.matched_internal_id, record_type=record_type, source_label=f"Calendar · {connection['display_name']}"))
                stats["linked"] += 1
                continue
            if decision not in {"import", "update"}:
                raise HTTPException(status_code=422, detail=f"Decision '{decision}' is not valid for an active source item.")
            existing = self._find_preview_existing(connection["id"], item)
            record_type = existing["mapped_record_type"] if existing and existing["mapped_record_type"] else ("task" if item.kind == CalendarItemKind.DEADLINE else "planner_event")
            internal_id = existing["mapped_internal_id"] if existing and existing["mapped_internal_id"] else self._internal_id(record_type, connection["id"], item.preview_key)
            row = self._persist_preview_item(student_id, connection, item, run_id, now, import_status="imported", mapped_record_type=record_type, mapped_internal_id=internal_id)
            operation = "update" if existing and existing["mapped_internal_id"] else "create"
            action = self._apply_action(row, operation, item.override_fields, connection["display_name"])
            actions.append(action)
            stats["updated" if operation == "update" else "imported"] += 1
        response = CommitResponse(sync_run_id=run_id, connection_id=connection["id"], actions=actions, committed_at=now, **stats)
        encoded = response.model_dump_json()
        self.repository.update_sync_run(run_id, status="committed", commit_json=encoded, commit_idempotency_key=request.idempotency_key, completed_at=now.isoformat(), updated_at=now.isoformat())
        connection_updates = {"last_sync_at": now.isoformat(), "updated_at": now.isoformat()}
        if run["source_format"] == "provider" and run["next_cursor"] is not None:
            connection_updates["sync_cursor"] = run["next_cursor"]
        self.repository.update_connection(connection["id"], **connection_updates)
        self.repository.audit(student_id, connection["id"], "sync_committed", {"run_id": run_id, **stats}, now.isoformat())
        return response

    def list_connections(self, student_id: str) -> ConnectionListResponse:
        return ConnectionListResponse(items=[self._connection(row) for row in self.repository.list_connections(student_id)])

    def list_items(self, student_id: str, connection_id: str | None = None, include_deleted: bool = False) -> ItemListResponse:
        if connection_id: self._owned_connection(student_id, connection_id)
        return ItemListResponse(items=[self._item(row) for row in self.repository.list_items(student_id, connection_id, include_deleted)])

    def revoke(self, student_id: str, connection_id: str) -> RevokeResponse:
        row = self._owned_connection(student_id, connection_id); now = self._now()
        if row["status"] != "revoked":
            row = self.repository.update_connection(connection_id, status="revoked", revoked_at=now.isoformat(), encrypted_credentials=None, updated_at=now.isoformat())
            self.repository.audit(student_id, connection_id, "connection_revoked", {}, now.isoformat())
        return RevokeResponse(connection=self._connection(row))

    def cleanup(self, student_id: str, connection_id: str, request: CleanupRequest) -> CleanupResponse:
        connection = self._owned_connection(student_id, connection_id)
        rows = self.repository.list_items(student_id, connection_id, include_deleted=True)
        actions: list[CalendarApplyAction] = []
        if request.remove_internal_records:
            for row in rows:
                if row["mapped_internal_id"]:
                    actions.append(CalendarApplyAction(operation="delete", external_item_id=row["id"], internal_record_id=row["mapped_internal_id"], record_type=row["mapped_record_type"]))
        else:
            for row in rows:
                if row["mapped_internal_id"]:
                    actions.append(CalendarApplyAction(operation="detach", external_item_id=row["id"], internal_record_id=row["mapped_internal_id"], record_type=row["mapped_record_type"]))
        count = self.repository.delete_imported_items(connection_id); now = self._now()
        self.repository.audit(student_id, connection_id, "imported_data_deleted", {"count":count,"remove_internal_records":request.remove_internal_records}, now.isoformat())
        return CleanupResponse(connection_id=connection_id, deleted_imported_items=count, actions=actions, internal_records_removed=request.remove_internal_records)

    def set_overrides(self, student_id: str, item_id: str, request: OverrideRequest) -> CalendarItemResponse:
        row = self.repository.get_item(item_id)
        if not row: raise HTTPException(status_code=404, detail="Calendar item was not found.")
        if row["student_id"] != student_id: raise HTTPException(status_code=403, detail="This calendar item belongs to another student.")
        return self._item(self.repository.update_item_overrides(item_id, request.fields, self._now().isoformat()))

    def _connection_for_preview(self, student_id: str, connection_id: str | None, source_format: str, filename: str, timezone_name: str, now: datetime):
        if connection_id:
            row = self._owned_connection(student_id, connection_id)
            if row["status"] != "active": raise HTTPException(status_code=409, detail="This calendar source is revoked and cannot sync.")
            return row
        return self.repository.create_connection({
            "id": f"calconn_{uuid4().hex}", "student_id": student_id, "source_type": f"manual_{source_format}", "display_name": Path(filename).name[:180],
            "status":"active", "default_timezone":timezone_name, "provider_key":None, "encrypted_credentials":None, "scopes_json":"[]", "sync_cursor":None, "last_sync_at":None,
            "revoked_at":None, "created_at":now.isoformat(), "updated_at":now.isoformat(),
        })

    def _build_preview(self, connection, parsed: list[ParsedCalendarItem], existing_records: list[ExistingRecordInput]) -> list[PreviewItem]:
        records = {record.internal_id: record for record in existing_records}
        preview: list[PreviewItem] = []; seen_source: set[tuple[str,str]] = set(); seen_fingerprints: dict[str,str] = {}
        for parsed_item in parsed:
            source_key = (parsed_item.external_id, parsed_item.recurrence_key); seen_source.add(source_key)
            existing = self.repository.find_item(connection["id"], *source_key)
            override_fields = self._detect_overrides(existing, records.get(existing["mapped_internal_id"]) if existing and existing["mapped_internal_id"] else None)
            exact = self._find_exact_record(parsed_item, existing_records, exclude_id=existing["mapped_internal_id"] if existing else None)
            conflicts = self._find_conflicts(parsed_item, existing_records, exclude_id=(existing["mapped_internal_id"] if existing else None))
            fingerprint = self._fingerprint(parsed_item)
            intra_duplicate = seen_fingerprints.get(fingerprint); seen_fingerprints.setdefault(fingerprint, parsed_item.preview_key)
            if existing:
                change = "unchanged" if existing["source_hash"] == parsed_item.source_hash else "changed"
                matched = existing["mapped_internal_id"]
                record_type = existing["mapped_record_type"]
            elif exact or intra_duplicate:
                change = "duplicate"; matched = exact.internal_id if exact else None; record_type = exact.record_type if exact else None
            elif conflicts:
                change = "conflict"; matched = None; record_type = None
            else:
                change = "new"; matched = None; record_type = None
            preview.append(PreviewItem(preview_key=parsed_item.preview_key, external_id=parsed_item.external_id, recurrence_key=parsed_item.recurrence_key,
                kind=parsed_item.kind, title=parsed_item.title, description=parsed_item.description, start_at=parsed_item.start_at, end_at=parsed_item.end_at,
                timezone=parsed_item.timezone, confidence=parsed_item.confidence, source_updated_at=parsed_item.source_updated_at, change_type=change,
                matched_internal_id=matched, mapped_record_type=record_type, conflict_internal_ids=conflicts, override_fields=override_fields,
                source_warning=parsed_item.source_warning, selected_by_default=change in {"new","changed"}))
        for existing in self.repository.active_items_for_connection(connection["id"]):
            if (existing["external_id"], existing["recurrence_key"]) in seen_source: continue
            preview.append(PreviewItem(preview_key=f"deleted:{existing['id']}", external_id=existing["external_id"], recurrence_key=existing["recurrence_key"], kind=existing["item_kind"],
                title=existing["title"], description=existing["description"], start_at=datetime.fromisoformat(existing["start_at"]), end_at=datetime.fromisoformat(existing["end_at"]) if existing["end_at"] else None,
                timezone=existing["timezone"], confidence=float(existing["confidence"]), source_updated_at=datetime.fromisoformat(existing["source_updated_at"]) if existing["source_updated_at"] else None,
                change_type="deleted", matched_internal_id=existing["mapped_internal_id"], mapped_record_type=existing["mapped_record_type"], override_fields=json.loads(existing["user_overrides_json"] or "[]"),
                source_warning="This item disappeared from the latest source. Choose whether to keep the personal record or remove it.", selected_by_default=False))
        return preview

    @staticmethod
    def _fingerprint(item: ParsedCalendarItem) -> str:
        return hashlib.sha256(f"{item.kind.value}|{item.title.strip().lower()}|{item.start_at.isoformat()}".encode()).hexdigest()

    @staticmethod
    def _find_exact_record(item: ParsedCalendarItem, records: list[ExistingRecordInput], exclude_id: str | None = None) -> ExistingRecordInput | None:
        title = " ".join(item.title.lower().split())
        for record in records:
            if record.internal_id == exclude_id or " ".join(record.title.lower().split()) != title: continue
            if item.kind == CalendarItemKind.DEADLINE and record.record_type == "task" and record.due_at and abs((record.due_at.astimezone(timezone.utc)-item.start_at).total_seconds()) < 60:
                return record
            if item.kind != CalendarItemKind.DEADLINE and record.record_type == "planner_event" and record.start_at and abs((record.start_at.astimezone(timezone.utc)-item.start_at).total_seconds()) < 60:
                return record
        return None

    @staticmethod
    def _find_conflicts(item: ParsedCalendarItem, records: list[ExistingRecordInput], exclude_id: str | None = None) -> list[str]:
        if item.kind == CalendarItemKind.DEADLINE: return []
        start = item.start_at; end = item.end_at or (start + timedelta(hours=1)); conflicts: list[str] = []
        for record in records:
            if record.internal_id == exclude_id or record.record_type != "planner_event" or not record.start_at: continue
            r_start = record.start_at.astimezone(timezone.utc); r_end = (record.end_at or (record.start_at + timedelta(hours=1))).astimezone(timezone.utc)
            if start < r_end and end > r_start: conflicts.append(record.internal_id)
        return conflicts

    @staticmethod
    def _detect_overrides(existing, record: ExistingRecordInput | None) -> list[str]:
        if not existing or not record: return json.loads(existing["user_overrides_json"] or "[]") if existing else []
        fields = set(json.loads(existing["user_overrides_json"] or "[]"))
        if existing["imported_title"] and record.title != existing["imported_title"]: fields.add("title")
        if record.record_type == "task" and existing["imported_due_at"]:
            if not record.due_at or record.due_at.astimezone(timezone.utc).isoformat() != datetime.fromisoformat(existing["imported_due_at"]).astimezone(timezone.utc).isoformat(): fields.add("due_at")
        if record.record_type == "planner_event":
            if existing["imported_start_at"] and (not record.start_at or record.start_at.astimezone(timezone.utc).isoformat() != datetime.fromisoformat(existing["imported_start_at"]).astimezone(timezone.utc).isoformat()): fields.add("start_at")
            if existing["imported_end_at"] and (not record.end_at or record.end_at.astimezone(timezone.utc).isoformat() != datetime.fromisoformat(existing["imported_end_at"]).astimezone(timezone.utc).isoformat()): fields.add("end_at")
        return sorted(fields)

    def _persist_preview_item(self, student_id, connection, item: PreviewItem, run_id: str, now: datetime, *, import_status: str, mapped_record_type: str | None, mapped_internal_id: str | None):
        existing = self.repository.find_item(connection["id"], item.external_id, item.recurrence_key)
        override_fields = item.override_fields or (json.loads(existing["user_overrides_json"] or "[]") if existing else [])
        due = item.start_at if item.kind == CalendarItemKind.DEADLINE else None
        return self.repository.upsert_item({
            "id": existing["id"] if existing else f"calitem_{uuid4().hex}", "connection_id":connection["id"], "student_id":student_id, "external_id":item.external_id,
            "recurrence_key":item.recurrence_key, "item_kind":item.kind.value, "title":item.title, "description":item.description, "start_at":item.start_at.astimezone(timezone.utc).isoformat(),
            "end_at":item.end_at.astimezone(timezone.utc).isoformat() if item.end_at else None, "timezone":item.timezone, "confidence":item.confidence,
            "source_updated_at":item.source_updated_at.astimezone(timezone.utc).isoformat() if item.source_updated_at else None,
            "source_hash":hashlib.sha256("|".join([item.external_id,item.recurrence_key,item.kind.value,item.title,item.description,item.start_at.isoformat(),item.end_at.isoformat() if item.end_at else "",item.timezone,item.source_updated_at.isoformat() if item.source_updated_at else ""]).encode("utf-8")).hexdigest(),
            "source_state":"active", "import_status":import_status, "mapped_record_type":mapped_record_type, "mapped_internal_id":mapped_internal_id,
            "imported_title":item.title, "imported_start_at":item.start_at.astimezone(timezone.utc).isoformat() if mapped_record_type=="planner_event" else None,
            "imported_end_at":item.end_at.astimezone(timezone.utc).isoformat() if item.end_at and mapped_record_type=="planner_event" else None,
            "imported_due_at":due.astimezone(timezone.utc).isoformat() if due and mapped_record_type=="task" else None,
            "user_overrides_json":json.dumps(override_fields), "last_seen_run_id":run_id, "last_sync_at":now.isoformat(), "created_at":existing["created_at"] if existing else now.isoformat(), "updated_at":now.isoformat(),
        })

    def _apply_action(self, row, operation: str, override_fields: list[str], connection_name: str) -> CalendarApplyAction:
        start = datetime.fromisoformat(row["start_at"]); end = datetime.fromisoformat(row["end_at"]) if row["end_at"] else None
        due = start if row["mapped_record_type"] == "task" else None
        return CalendarApplyAction(operation=operation, external_item_id=row["id"], internal_record_id=row["mapped_internal_id"], record_type=row["mapped_record_type"], title=row["title"], kind=row["item_kind"],
            start_at=start if row["mapped_record_type"] == "planner_event" else None, end_at=end if row["mapped_record_type"] == "planner_event" else None, due_at=due,
            source_label=f"Calendar · {connection_name}", override_fields=override_fields)

    def _mark_deleted(self, row, run_id: str, now: datetime, detach: bool):
        values = dict(row)
        values.update({"source_state":"deleted", "import_status":"detached" if detach else row["import_status"], "mapped_record_type":None if detach else row["mapped_record_type"], "mapped_internal_id":None if detach else row["mapped_internal_id"], "last_seen_run_id":run_id, "last_sync_at":now.isoformat(), "updated_at":now.isoformat()})
        self.repository.upsert_item(values)

    @staticmethod
    def _internal_id(record_type: str, connection_id: str, preview_key: str) -> str:
        digest = hashlib.sha256(f"{connection_id}|{preview_key}".encode()).hexdigest()[:18]
        return f"calendar-{'task' if record_type=='task' else 'event'}-{digest}"

    def _find_preview_existing(self, connection_id: str, item: PreviewItem):
        if item.preview_key.startswith("deleted:"):
            return self.repository.get_item(item.preview_key.split(":",1)[1])
        return self.repository.find_item(connection_id, item.external_id, item.recurrence_key)

    def _owned_connection(self, student_id: str, connection_id: str):
        row = self.repository.get_connection(connection_id)
        if not row: raise HTTPException(status_code=404, detail="Calendar source was not found.")
        if row["student_id"] != student_id: raise HTTPException(status_code=403, detail="This calendar source belongs to another student.")
        return row

    def _owned_run(self, student_id: str, run_id: str):
        row = self.repository.get_sync_run(run_id)
        if not row: raise HTTPException(status_code=404, detail="Calendar sync preview was not found.")
        if row["student_id"] != student_id: raise HTTPException(status_code=403, detail="This calendar preview belongs to another student.")
        return row

    def _connection(self, row) -> ConnectionResponse:
        return ConnectionResponse(id=row["id"], source_type=row["source_type"], display_name=row["display_name"], status=row["status"], default_timezone=row["default_timezone"],
            scopes=json.loads(row["scopes_json"] or "[]"), last_sync_at=datetime.fromisoformat(row["last_sync_at"]) if row["last_sync_at"] else None,
            revoked_at=datetime.fromisoformat(row["revoked_at"]) if row["revoked_at"] else None, created_at=datetime.fromisoformat(row["created_at"]), updated_at=datetime.fromisoformat(row["updated_at"]), provider_connected=row["source_type"]=="provider")

    def _item(self, row) -> CalendarItemResponse:
        conn = self.repository.get_connection(row["connection_id"])
        return CalendarItemResponse(id=row["id"], connection_id=row["connection_id"], external_id=row["external_id"], recurrence_key=row["recurrence_key"], kind=row["item_kind"], title=row["title"],
            description=row["description"], start_at=datetime.fromisoformat(row["start_at"]), end_at=datetime.fromisoformat(row["end_at"]) if row["end_at"] else None, timezone=row["timezone"], confidence=float(row["confidence"]),
            source_updated_at=datetime.fromisoformat(row["source_updated_at"]) if row["source_updated_at"] else None, source_state=row["source_state"], import_status=row["import_status"], mapped_record_type=row["mapped_record_type"], mapped_internal_id=row["mapped_internal_id"],
            override_fields=json.loads(row["user_overrides_json"] or "[]"), last_sync_at=datetime.fromisoformat(row["last_sync_at"]), source_badge=f"Calendar · {conn['display_name'] if conn else 'Imported source'}")

    def _now(self):
        value = self.now(); return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
