from hashlib import sha256

from fastapi import Depends, Header, Request

from ...core.security import Principal, current_principal
from .service import EntitlementService, get_entitlements


def institution_access(p: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    ent.require(p.student_id, "institutional_analytics")


def taxonomy_access(request: Request, p: Principal = Depends(current_principal), ent: EntitlementService = Depends(get_entitlements)):
    if not request.url.path.startswith("/v1/market-taxonomy/student/"):
        ent.require(p.student_id, "taxonomy_governance")


def mentor_access(x_luma_mentor_token: str | None = Header(default=None, alias="X-Luma-Mentor-Token"), ent: EntitlementService = Depends(get_entitlements)):
    # Tokens still undergo the domain's expiry, consent, and relationship checks.
    if not x_luma_mentor_token:
        return
    with ent.repository.connect() as db:
        row = db.execute("SELECT student_id FROM mentor_relationships WHERE mentor_access_token_hash=?", (sha256(f"lumapath-mentor-v1:{x_luma_mentor_token}".encode()).hexdigest(),)).fetchone()
    if row:
        ent.require(row["student_id"], "institution_mentoring")
