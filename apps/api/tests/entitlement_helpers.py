"""Use explicit plans and isolated stores in existing domain HTTP tests."""
from apps.api.app.modules.subscriptions.repository import SubscriptionRepository
from apps.api.app.modules.subscriptions.service import EntitlementService, get_entitlements


def grant_test_plan(app, monkeypatch, database_path, student_id, plan):
    service = EntitlementService(SubscriptionRepository(str(database_path)))
    service.set_demo_plan(student_id, plan)
    monkeypatch.setitem(app.dependency_overrides, get_entitlements, lambda: service)
    return service
