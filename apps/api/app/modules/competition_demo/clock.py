"""Freeze only the dedicated synthetic student's scenario; normal users keep real time."""
from copy import copy
from datetime import datetime
from pathlib import Path
import json
from ...core.config import settings

MANIFEST = json.loads((Path(__file__).resolve().parents[5] / "src/data/demo/competition-scenario.json").read_text())
STUDENT_ID = MANIFEST["student"]["id"]
SCENARIO_NOW = datetime.fromisoformat(MANIFEST["now"])
DEMO_ENVIRONMENTS = {"development", "demo", "test"}


def competition_service(service, student_id):
    if student_id != STUDENT_ID or settings.environment not in DEMO_ENVIRONMENTS:
        return service
    clone = copy(service)
    if "now" in clone.__dict__:
        clone.now = lambda: SCENARIO_NOW
    elif "_now" in clone.__dict__:
        clone._now = lambda: SCENARIO_NOW
    return clone
