"""Small production-shaped scheduler loop for the DOC-F20 worker contract."""
from __future__ import annotations

import os
import time
from .run import run_once


def main() -> None:
    interval = max(15, int(os.getenv("NOTIFICATION_WORKER_INTERVAL_SECONDS", "60")))
    while True:
        run_once()
        time.sleep(interval)


if __name__ == "__main__":
    main()
