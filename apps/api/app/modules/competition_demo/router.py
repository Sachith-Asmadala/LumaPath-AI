from pathlib import Path
from threading import Lock
import json
import subprocess
import sys

from fastapi import APIRouter, Depends, HTTPException
from ...core.config import settings
from ...core.security import Principal, current_principal
from .clock import DEMO_ENVIRONMENTS, SCENARIO_NOW

router = APIRouter(prefix="/v1/competition-demo", tags=["competition-demo"])
_reset_lock = Lock()
SCRIPT = Path(__file__).resolve().parents[5] / "scripts/seed-data/seed-competition-demo.py"


def demo_only():
    if settings.environment not in DEMO_ENVIRONMENTS:
        raise HTTPException(404, "Competition demo is unavailable in production.")


@router.get("/status", dependencies=[Depends(demo_only)])
def status():
    return {"enabled": True, "synthetic": True, "scenario_date": SCENARIO_NOW.date().isoformat()}


@router.post("/reset", dependencies=[Depends(demo_only)])
def reset(_: Principal = Depends(current_principal)):
    if not _reset_lock.acquire(blocking=False):
        raise HTTPException(409, "A competition reset is already running. Please wait and try again.")
    try:
        # Separate process keeps deterministic seed ID generation out of the live API.
        result = subprocess.run([sys.executable, str(SCRIPT), "--database", str(Path(settings.database_path).resolve())],
            capture_output=True,text=True,timeout=35,check=False)
        if result.returncode != 0:
            raise HTTPException(503,"The competition scenario could not be restored. Please retry the reset.")
        return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, json.JSONDecodeError):
        raise HTTPException(503,"Competition reset did not finish. Please retry.")
    finally:
        _reset_lock.release()
