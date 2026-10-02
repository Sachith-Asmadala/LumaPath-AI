"""DOC-F20 notification worker iteration.

Run this module from a scheduler/worker process. It never creates notification
content itself; it only ingests confirmed server-owned application reminders,
applies the policy engine, delivers due candidates, and retries idempotent failed
channel deliveries.
"""
from __future__ import annotations

from apps.api.app.core.config import settings
from apps.api.app.modules.notifications.repository import NotificationRepository
from apps.api.app.modules.notifications.service import NotificationService


def run_once() -> dict[str, int]:
    repository = NotificationRepository(settings.database_path)
    service = NotificationService(repository, max_attempts=settings.notification_delivery_max_attempts)
    summary = {"students": 0, "delivered": 0, "suppressed": 0, "expired": 0, "failed": 0, "retried": 0}
    for student_id in repository.student_ids_for_processing():
        summary["students"] += 1
        result = service.process_server_sources(student_id)
        retry = service.retry_failed(student_id)
        for key in ("delivered", "suppressed", "expired", "failed"):
            summary[key] += result[key]
        summary["retried"] += retry.attempted
    return summary


if __name__ == "__main__":
    print(run_once())
