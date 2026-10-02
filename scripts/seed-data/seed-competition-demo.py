"""Reset the isolated competition student using the existing governed domain services."""
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from apps.api.app.core.config import settings
from apps.api.app.modules.competition_demo.seed import reset_competition_demo

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", default=settings.database_path)
    args = parser.parse_args()
    print(json.dumps(reset_competition_demo(args.database)))
