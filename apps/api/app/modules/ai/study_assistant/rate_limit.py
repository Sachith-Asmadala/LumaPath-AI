from __future__ import annotations

from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from threading import Lock
from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    def __init__(self, limit: int, window_seconds: int = 60) -> None:
        self.limit = max(1, limit)
        self.window = timedelta(seconds=window_seconds)
        self.events: dict[str, deque[datetime]] = defaultdict(deque)
        self.lock = Lock()

    def check(self, key: str) -> None:
        now = datetime.now(timezone.utc)
        cutoff = now - self.window
        with self.lock:
            bucket = self.events[key]
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= self.limit:
                raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many assistant requests. Try again shortly.")
            bucket.append(now)
