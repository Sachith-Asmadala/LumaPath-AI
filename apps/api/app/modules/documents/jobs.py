from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from typing import Callable, Protocol


class DocumentJobDispatcher(Protocol):
    def submit(self, document_id: str, owner_id: str, job: Callable[[], None]) -> None: ...


class ThreadPoolDocumentJobDispatcher:
    """Development worker adapter.

    Processing state is durable in SQLite, while execution uses a bounded local pool. Production can
    replace this with Celery/RQ/SQS without changing the service or HTTP contract.
    """

    def __init__(self, max_workers: int = 2) -> None:
        self._executor = ThreadPoolExecutor(max_workers=max(1, max_workers), thread_name_prefix="lumapath-doc")

    def submit(self, document_id: str, owner_id: str, job: Callable[[], None]) -> None:
        self._executor.submit(job)


class InlineDocumentJobDispatcher:
    def submit(self, document_id: str, owner_id: str, job: Callable[[], None]) -> None:
        job()
