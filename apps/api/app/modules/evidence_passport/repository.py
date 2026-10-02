from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from threading import RLock


class EvidencePassportRepository:
    def __init__(self, database_path: str):
        self.database_path = database_path
        Path(database_path).parent.mkdir(parents=True, exist_ok=True)
        self._lock = RLock()
        self._init_schema()

    def _connect(self):
        db = sqlite3.connect(self.database_path, timeout=20, check_same_thread=False)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def _init_schema(self):
        with self._connect() as db:
            db.executescript("""
            CREATE TABLE IF NOT EXISTS evidence_certificates (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                skill_id TEXT NOT NULL,
                title TEXT NOT NULL,
                issuer TEXT NOT NULL,
                acquired_at TEXT,
                expires_at TEXT,
                credential_reference TEXT NOT NULL DEFAULT '',
                source_url TEXT,
                proficiency INTEGER,
                reference_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_evidence_certificates_owner ON evidence_certificates(student_id, updated_at DESC);

            CREATE TABLE IF NOT EXISTS skill_evidence (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                skill_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                evidence_type TEXT NOT NULL,
                title TEXT NOT NULL,
                source_origin TEXT NOT NULL,
                source_ref TEXT NOT NULL,
                source_url TEXT,
                issuer TEXT,
                acquired_at TEXT,
                expires_at TEXT,
                observed_at TEXT NOT NULL,
                last_reviewed_at TEXT,
                reference_hash TEXT NOT NULL,
                verification_status TEXT NOT NULL,
                confidence REAL NOT NULL,
                proficiency INTEGER,
                correction_note TEXT NOT NULL DEFAULT '',
                owner_disputed INTEGER NOT NULL DEFAULT 0,
                source_missing INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(student_id, source_ref, skill_id, evidence_type)
            );
            CREATE INDEX IF NOT EXISTS idx_skill_evidence_owner ON skill_evidence(student_id, skill_id, updated_at DESC);
            CREATE INDEX IF NOT EXISTS idx_skill_evidence_source ON skill_evidence(student_id, source_origin, source_ref);

            CREATE TABLE IF NOT EXISTS verification_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                evidence_id TEXT NOT NULL REFERENCES skill_evidence(id) ON DELETE CASCADE,
                student_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                old_status TEXT,
                new_status TEXT,
                detail TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_verification_events_evidence ON verification_events(student_id, evidence_id, occurred_at DESC);

            CREATE TABLE IF NOT EXISTS evidence_mentor_validation_requests (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                relationship_id TEXT NOT NULL,
                skill_id TEXT NOT NULL,
                skill_name TEXT NOT NULL,
                status TEXT NOT NULL,
                request_note TEXT NOT NULL DEFAULT '',
                mentor_note TEXT NOT NULL DEFAULT '',
                proficiency INTEGER,
                created_at TEXT NOT NULL,
                responded_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_evidence_mentor_requests_owner ON evidence_mentor_validation_requests(student_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS evidence_share_grants (
                id TEXT PRIMARY KEY,
                student_id TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                evidence_ids_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                access_count INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_evidence_share_owner ON evidence_share_grants(student_id, created_at DESC);

            CREATE TABLE IF NOT EXISTS evidence_access_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id TEXT NOT NULL,
                share_id TEXT,
                actor_type TEXT NOT NULL,
                event_type TEXT NOT NULL,
                evidence_ids_json TEXT NOT NULL DEFAULT '[]',
                detail TEXT NOT NULL DEFAULT '',
                occurred_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_evidence_access_owner ON evidence_access_audit(student_id, occurred_at DESC);
            CREATE INDEX IF NOT EXISTS idx_evidence_access_share ON evidence_access_audit(share_id, occurred_at DESC);
            """)

    def upsert_evidence(self, values: dict):
        with self._lock, self._connect() as db:
            existing = db.execute(
                "SELECT * FROM skill_evidence WHERE student_id=? AND source_ref=? AND skill_id=? AND evidence_type=?",
                (values["student_id"], values["source_ref"], values["skill_id"], values["evidence_type"]),
            ).fetchone()
            if existing:
                values = {**values, "id": existing["id"], "created_at": existing["created_at"], "owner_disputed": existing["owner_disputed"], "correction_note": existing["correction_note"]}
                db.execute("""UPDATE skill_evidence SET
                    skill_name=:skill_name,title=:title,source_origin=:source_origin,source_url=:source_url,issuer=:issuer,
                    acquired_at=:acquired_at,expires_at=:expires_at,observed_at=:observed_at,last_reviewed_at=:last_reviewed_at,
                    reference_hash=:reference_hash,verification_status=:verification_status,confidence=:confidence,proficiency=:proficiency,
                    source_missing=:source_missing,active=:active,metadata_json=:metadata_json,updated_at=:updated_at
                    WHERE id=:id AND student_id=:student_id""", values)
                evidence_id = existing["id"]
            else:
                db.execute("""INSERT INTO skill_evidence
                    (id,student_id,skill_id,skill_name,evidence_type,title,source_origin,source_ref,source_url,issuer,acquired_at,expires_at,
                     observed_at,last_reviewed_at,reference_hash,verification_status,confidence,proficiency,correction_note,owner_disputed,
                     source_missing,active,metadata_json,created_at,updated_at)
                    VALUES (:id,:student_id,:skill_id,:skill_name,:evidence_type,:title,:source_origin,:source_ref,:source_url,:issuer,:acquired_at,:expires_at,
                     :observed_at,:last_reviewed_at,:reference_hash,:verification_status,:confidence,:proficiency,:correction_note,:owner_disputed,
                     :source_missing,:active,:metadata_json,:created_at,:updated_at)""", values)
                evidence_id = values["id"]
            db.commit()
        return self.evidence(evidence_id)

    def evidence(self, evidence_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM skill_evidence WHERE id=?", (evidence_id,)).fetchone()

    def evidence_for_owner(self, evidence_id: str, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM skill_evidence WHERE id=? AND student_id=?", (evidence_id, student_id)).fetchone()

    def list_evidence(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM skill_evidence WHERE student_id=? AND active=1 ORDER BY skill_name, updated_at DESC, id", (student_id,)).fetchall()

    def selected_evidence(self, student_id: str, evidence_ids: list[str]):
        if not evidence_ids:
            return []
        marks = ",".join("?" for _ in evidence_ids)
        with self._connect() as db:
            return db.execute(f"SELECT * FROM skill_evidence WHERE student_id=? AND active=1 AND id IN ({marks}) ORDER BY skill_name,title", (student_id, *evidence_ids)).fetchall()

    def mark_missing_synced(self, student_id: str, source_origin: str, seen_refs: set[tuple[str,str,str]], at: str):
        with self._lock, self._connect() as db:
            rows = db.execute("SELECT * FROM skill_evidence WHERE student_id=? AND source_origin=? AND active=1", (student_id, source_origin)).fetchall()
            for row in rows:
                key = (row["source_ref"], row["skill_id"], row["evidence_type"])
                if key not in seen_refs and not row["source_missing"]:
                    old = row["verification_status"]
                    db.execute("UPDATE skill_evidence SET source_missing=1,verification_status='stale',confidence=MIN(confidence,0.25),updated_at=? WHERE id=?", (at, row["id"]))
                    db.execute("INSERT INTO verification_events(evidence_id,student_id,event_type,old_status,new_status,detail,occurred_at) VALUES (?,?,?,?,?,?,?)", (row["id"], student_id, "source_missing", old, "stale", "The source record is no longer available in the current synced domain data.", at))
            db.commit()

    def set_disputed(self, evidence_id: str, student_id: str, disputed: bool, note: str, at: str, restore_status: str = "self_declared"):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM skill_evidence WHERE id=? AND student_id=?", (evidence_id, student_id)).fetchone()
            if not row:
                return None
            old = row["verification_status"]
            if disputed:
                new = "disputed"
                db.execute("UPDATE skill_evidence SET owner_disputed=1,correction_note=?,verification_status='disputed',confidence=MIN(confidence,0.1),updated_at=? WHERE id=?", (note, at, evidence_id))
            else:
                new = restore_status
                db.execute("UPDATE skill_evidence SET owner_disputed=0,correction_note=?,verification_status=?,updated_at=? WHERE id=?", (note, new, at, evidence_id))
            db.execute("INSERT INTO verification_events(evidence_id,student_id,event_type,old_status,new_status,detail,occurred_at) VALUES (?,?,?,?,?,?,?)", (evidence_id, student_id, "owner_correction", old, new, note, at))
            db.commit()
        return self.evidence(evidence_id)

    def revalidate(self, evidence_id: str, student_id: str, at: str):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM skill_evidence WHERE id=? AND student_id=?", (evidence_id, student_id)).fetchone()
            if not row:
                return None
            db.execute("UPDATE skill_evidence SET last_reviewed_at=?,updated_at=? WHERE id=?", (at, at, evidence_id))
            db.execute("INSERT INTO verification_events(evidence_id,student_id,event_type,old_status,new_status,detail,occurred_at) VALUES (?,?,?,?,?,?,?)", (evidence_id, student_id, "owner_revalidated", row["verification_status"], row["verification_status"], "Owner reviewed this evidence record again; this does not independently verify authenticity.", at))
            db.commit()
        return self.evidence(evidence_id)

    def create_certificate(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO evidence_certificates(id,student_id,skill_id,title,issuer,acquired_at,expires_at,credential_reference,source_url,proficiency,reference_hash,created_at,updated_at)
                VALUES (:id,:student_id,:skill_id,:title,:issuer,:acquired_at,:expires_at,:credential_reference,:source_url,:proficiency,:reference_hash,:created_at,:updated_at)""", values)
            db.commit()
        return self.certificate(values["id"])

    def update_certificate(self, certificate_id: str, student_id: str, values: dict):
        with self._lock, self._connect() as db:
            cur = db.execute("""UPDATE evidence_certificates SET skill_id=:skill_id,title=:title,issuer=:issuer,acquired_at=:acquired_at,expires_at=:expires_at,
                credential_reference=:credential_reference,source_url=:source_url,proficiency=:proficiency,reference_hash=:reference_hash,updated_at=:updated_at
                WHERE id=:id AND student_id=:student_id""", {**values,"id":certificate_id,"student_id":student_id})
            db.commit()
        return self.certificate(certificate_id) if cur.rowcount else None

    def certificate(self, certificate_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_certificates WHERE id=?", (certificate_id,)).fetchone()

    def certificates(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_certificates WHERE student_id=? ORDER BY updated_at DESC", (student_id,)).fetchall()

    def retire_source_ref(self, student_id: str, source_ref: str, at: str):
        with self._lock, self._connect() as db:
            db.execute("UPDATE skill_evidence SET active=0,updated_at=? WHERE student_id=? AND source_ref=?", (at, student_id, source_ref))
            db.commit()

    def delete_certificate(self, certificate_id: str, student_id: str):
        with self._lock, self._connect() as db:
            row = db.execute("SELECT * FROM evidence_certificates WHERE id=? AND student_id=?", (certificate_id,student_id)).fetchone()
            if not row:
                return False
            source_ref = f"certificate:{certificate_id}"
            db.execute("DELETE FROM evidence_certificates WHERE id=? AND student_id=?", (certificate_id, student_id))
            db.execute("UPDATE skill_evidence SET active=0,source_missing=1,verification_status='stale',updated_at=datetime('now') WHERE student_id=? AND source_ref=?", (student_id, source_ref))
            db.commit()
            return True

    def latest_portfolio_rows(self, student_id: str):
        with self._connect() as db:
            try:
                return db.execute("""
                SELECT pse.*, pas.project_id,pas.source_kind,pas.source_repository_id,pas.source_timestamp,pas.analyzed_at,pas.stale,
                       pp.title AS project_title,pp.project_url,pp.live_demo_url AS project_live_demo,
                       er.repository_url,er.live_demo_url AS repository_live_demo,er.access_status,er.collected_at
                FROM portfolio_skill_evidence pse
                JOIN portfolio_analysis_snapshots pas ON pas.id=pse.snapshot_id
                JOIN portfolio_projects pp ON pp.id=pas.project_id
                LEFT JOIN external_repositories er ON er.id=pas.source_repository_id
                WHERE pse.student_id=? AND pas.id IN (
                    SELECT p2.id FROM portfolio_analysis_snapshots p2
                    WHERE p2.student_id=? AND p2.analyzed_at=(
                        SELECT MAX(p3.analyzed_at) FROM portfolio_analysis_snapshots p3 WHERE p3.project_id=p2.project_id AND p3.student_id=p2.student_id
                    )
                )
                ORDER BY pas.analyzed_at DESC,pse.id DESC
                """, (student_id,student_id)).fetchall()
            except sqlite3.OperationalError:
                return []

    def latest_assessment_rows(self, student_id: str):
        with self._connect() as db:
            try:
                return db.execute("""
                SELECT e.*, s.skill_name FROM student_skill_evidence e
                LEFT JOIN student_skills s ON s.assessment_id=e.assessment_id AND s.skill_id=e.skill_id
                WHERE e.student_id=? AND e.source_type='quiz'
                ORDER BY e.observed_at DESC,e.id DESC
                """, (student_id,)).fetchall()
            except sqlite3.OperationalError:
                return []

    def latest_student_skills(self, student_id: str):
        with self._connect() as db:
            try:
                assessment = db.execute("SELECT id,target_role FROM skill_assessments WHERE student_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1", (student_id,)).fetchone()
                if not assessment:
                    return []
                return db.execute("SELECT * FROM student_skills WHERE assessment_id=? ORDER BY skill_name", (assessment["id"],)).fetchall()
            except sqlite3.OperationalError:
                return []

    def skill_name(self, skill_id: str):
        with self._connect() as db:
            try:
                row = db.execute("SELECT name FROM skills WHERE id=? ORDER BY version DESC LIMIT 1", (skill_id,)).fetchone()
                return row["name"] if row else None
            except sqlite3.OperationalError:
                return None

    def active_mentor_relationship(self, student_id: str, relationship_id: str, now_iso: str):
        with self._connect() as db:
            try:
                return db.execute("SELECT * FROM mentor_relationships WHERE id=? AND student_id=? AND status='active' AND revoked_at IS NULL AND expires_at>?", (relationship_id,student_id,now_iso)).fetchone()
            except sqlite3.OperationalError:
                return None

    def mentor_relationship_by_token_hash(self, token_hash: str, now_iso: str):
        with self._connect() as db:
            try:
                return db.execute("SELECT * FROM mentor_relationships WHERE mentor_access_token_hash=? AND status='active' AND revoked_at IS NULL AND expires_at>?", (token_hash,now_iso)).fetchone()
            except sqlite3.OperationalError:
                return None

    def create_mentor_request(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO evidence_mentor_validation_requests(id,student_id,relationship_id,skill_id,skill_name,status,request_note,mentor_note,proficiency,created_at,responded_at)
                VALUES (:id,:student_id,:relationship_id,:skill_id,:skill_name,:status,:request_note,:mentor_note,:proficiency,:created_at,:responded_at)""", values)
            db.commit()
        return self.mentor_request(values["id"])

    def mentor_request(self, request_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_mentor_validation_requests WHERE id=?", (request_id,)).fetchone()

    def mentor_requests(self, student_id: str):
        with self._connect() as db:
            return db.execute("""SELECT r.*,m.mentor_label,m.mentor_name FROM evidence_mentor_validation_requests r
                LEFT JOIN mentor_relationships m ON m.id=r.relationship_id WHERE r.student_id=? ORDER BY r.created_at DESC""", (student_id,)).fetchall()

    def mentor_requests_for_relationship(self, relationship_id: str):
        with self._connect() as db:
            return db.execute("""SELECT r.*,m.mentor_label,m.mentor_name FROM evidence_mentor_validation_requests r
                LEFT JOIN mentor_relationships m ON m.id=r.relationship_id WHERE r.relationship_id=? ORDER BY r.created_at DESC""", (relationship_id,)).fetchall()

    def respond_mentor_request(self, request_id: str, decision: str, note: str, proficiency: int | None, at: str):
        with self._lock, self._connect() as db:
            db.execute("UPDATE evidence_mentor_validation_requests SET status=?,mentor_note=?,proficiency=?,responded_at=? WHERE id=? AND status='pending'", (decision,note,proficiency,at,request_id))
            db.commit()
        return self.mentor_request(request_id)

    def create_share(self, values: dict):
        with self._lock, self._connect() as db:
            db.execute("""INSERT INTO evidence_share_grants(id,student_id,token_hash,label,evidence_ids_json,created_at,expires_at,revoked_at,access_count)
                VALUES (:id,:student_id,:token_hash,:label,:evidence_ids_json,:created_at,:expires_at,NULL,0)""", values)
            db.commit()
        return self.share(values["id"])

    def share(self, share_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_share_grants WHERE id=?", (share_id,)).fetchone()

    def share_for_owner(self, share_id: str, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_share_grants WHERE id=? AND student_id=?", (share_id,student_id)).fetchone()

    def share_by_hash(self, token_hash: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_share_grants WHERE token_hash=?", (token_hash,)).fetchone()

    def list_shares(self, student_id: str):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_share_grants WHERE student_id=? ORDER BY created_at DESC", (student_id,)).fetchall()

    def revoke_share(self, share_id: str, student_id: str, at: str):
        with self._lock, self._connect() as db:
            cur=db.execute("UPDATE evidence_share_grants SET revoked_at=? WHERE id=? AND student_id=? AND revoked_at IS NULL", (at,share_id,student_id))
            db.commit()
        return self.share(share_id) if cur.rowcount else None

    def increment_share_access(self, share_id: str):
        with self._lock, self._connect() as db:
            db.execute("UPDATE evidence_share_grants SET access_count=access_count+1 WHERE id=?", (share_id,))
            db.commit()

    def audit(self, student_id: str, actor_type: str, event_type: str, evidence_ids: list[str], detail: str, occurred_at: str, share_id: str | None = None):
        with self._lock, self._connect() as db:
            db.execute("INSERT INTO evidence_access_audit(student_id,share_id,actor_type,event_type,evidence_ids_json,detail,occurred_at) VALUES (?,?,?,?,?,?,?)", (student_id,share_id,actor_type,event_type,json.dumps(evidence_ids),detail[:800],occurred_at))
            db.commit()

    def audit_history(self, student_id: str, limit: int=100):
        with self._connect() as db:
            return db.execute("SELECT * FROM evidence_access_audit WHERE student_id=? ORDER BY occurred_at DESC,id DESC LIMIT ?", (student_id,limit)).fetchall()
