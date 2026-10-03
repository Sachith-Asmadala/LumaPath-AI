"""Add the sample portfolio, analyzed CVs, certificates, learning files and timetable."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from dotenv import load_dotenv
load_dotenv(ROOT / ".env")
from apps.api.app.core.config import settings
from apps.api.app.modules.competition_demo.content import DEMO_OWNERS, seed_demo_content

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", default=settings.database_path)
    parser.add_argument("--student", choices=sorted(DEMO_OWNERS), default="student-sachith")
    args = parser.parse_args()
    print(json.dumps(seed_demo_content(args.database, args.student)))
