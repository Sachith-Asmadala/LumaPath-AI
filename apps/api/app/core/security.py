from __future__ import annotations

from dataclasses import dataclass
from fastapi import Header, HTTPException, status
from .config import settings


def development_identity_only() -> None:
    if settings.environment not in {"development", "demo", "test"}:
        raise HTTPException(status_code=503, detail="Verified authentication is not configured for this release. Development identity headers are disabled.")


@dataclass(frozen=True, slots=True)
class Principal:
    student_id: str


ADMIN_ROLES = {"programme_admin", "institution_admin", "analytics_viewer"}


@dataclass(frozen=True, slots=True)
class AdministratorPrincipal:
    administrator_id: str
    institution_id: str
    role: str

    @property
    def can_export_institutional_analytics(self) -> bool:
        return self.role in {"programme_admin", "institution_admin"}

    @property
    def can_refresh_institutional_analytics(self) -> bool:
        return self.role in {"programme_admin", "institution_admin"}


def current_principal(x_luma_student_id: str | None = Header(default=None, alias="X-Luma-Student-Id")) -> Principal:
    """Prototype identity boundary.

    The production auth story should replace this trusted development header with a verified
    session/JWT. Keeping identity parsing server-side still lets every assistant operation fail
    closed on ownership mismatches today.
    """
    development_identity_only()
    if not x_luma_student_id or not x_luma_student_id.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Student identity is required.")
    student_id = x_luma_student_id.strip()
    if len(student_id) > 128 or any(char.isspace() for char in student_id):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Student identity is invalid.")
    return Principal(student_id=student_id)


def _validated_claim(value: str | None, *, label: str, max_length: int = 128) -> str:
    if not value or not value.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"{label} is required.")
    claim = value.strip()
    if len(claim) > max_length or any(char.isspace() for char in claim):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=f"{label} is invalid.")
    return claim


def current_administrator(
    x_luma_admin_id: str | None = Header(default=None, alias="X-Luma-Admin-Id"),
    x_luma_admin_role: str | None = Header(default=None, alias="X-Luma-Admin-Role"),
    x_luma_institution_id: str | None = Header(default=None, alias="X-Luma-Institution-Id"),
) -> AdministratorPrincipal:
    """Prototype administrator identity boundary for DOC-F25.

    The claims are parsed and authorised only on the API side so institution and role checks
    cannot be bypassed by query parameters. Production must replace these trusted development
    headers with claims from the verified administrator session/JWT.
    """

    development_identity_only()
    administrator_id = _validated_claim(x_luma_admin_id, label="Administrator identity")
    institution_id = _validated_claim(x_luma_institution_id, label="Institution identity")
    role = _validated_claim(x_luma_admin_role, label="Administrator role", max_length=64)
    if role not in ADMIN_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator role is not authorised for institutional analytics.")
    return AdministratorPrincipal(administrator_id=administrator_id, institution_id=institution_id, role=role)


TAXONOMY_ROLES = {"taxonomy_curator", "taxonomy_reviewer"}


@dataclass(frozen=True, slots=True)
class TaxonomyCuratorPrincipal:
    curator_id: str
    role: str
    region_scope: tuple[str, ...]

    def can_access_region(self, region_code: str | None) -> bool:
        if region_code is None:
            return True
        normalized = region_code.strip().lower()
        return "all" in self.region_scope or normalized in self.region_scope


def current_taxonomy_curator(
    x_luma_curator_id: str | None = Header(default=None, alias="X-Luma-Curator-Id"),
    x_luma_curator_role: str | None = Header(default=None, alias="X-Luma-Curator-Role"),
    x_luma_region_scope: str | None = Header(default="international", alias="X-Luma-Region-Scope"),
) -> TaxonomyCuratorPrincipal:
    """Prototype curator identity boundary for DOC-F34.

    Production must derive role/region claims from a verified staff session. Region claims
    are enforced server-side for draft market profiles and cannot be supplied in request bodies.
    """
    development_identity_only()
    curator_id = _validated_claim(x_luma_curator_id, label="Taxonomy curator identity")
    role = _validated_claim(x_luma_curator_role, label="Taxonomy curator role", max_length=64)
    if role not in TAXONOMY_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Taxonomy curator role is not authorised.")
    scopes = tuple(sorted({item.strip().lower() for item in (x_luma_region_scope or "international").split(",") if item.strip()}))
    if not scopes or any(len(item) > 32 or any(ch.isspace() for ch in item) for item in scopes):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Taxonomy region scope is invalid.")
    return TaxonomyCuratorPrincipal(curator_id=curator_id, role=role, region_scope=scopes)
