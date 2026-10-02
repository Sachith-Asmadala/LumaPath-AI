"""Focused monetisation tests: quotas, API enforcement, and production lockout."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from apps.api.app.modules.subscriptions import service as service_module
from apps.api.app.modules.subscriptions.repository import SubscriptionRepository
from apps.api.app.modules.subscriptions.router import router
from apps.api.app.modules.subscriptions.service import EntitlementService, get_entitlements
from apps.api.app.modules.institutional_analytics import router as institutional
from apps.api.app.modules.career_scenarios import router as scenarios
from apps.api.app.modules.career_scenarios.repository import CareerScenarioRepository
from apps.api.app.modules.career_scenarios.service import CareerScenarioService
from apps.api.app.modules.careers.repository import CareerRepository
from apps.api.app.modules.careers.service import CareerService
from apps.api.app.modules.evidence_passport.repository import EvidencePassportRepository
from apps.api.app.modules.pathways.repository import PathwayRepository
from apps.api.app.modules.pathways.service import PathwayService

NOW = datetime(2026, 10, 2, tzinfo=timezone.utc)

@pytest.fixture
def ent(tmp_path, monkeypatch):
    monkeypatch.setattr(service_module, 'settings', SimpleNamespace(environment='test'))
    return EntitlementService(SubscriptionRepository(str(tmp_path / 'subscriptions.db')), now=lambda: NOW)

@pytest.fixture
def client(ent, monkeypatch):
    path = ent.repository.database_path
    career = CareerService(CareerRepository(path), now=lambda: NOW)
    pathway = PathwayRepository(path)
    monkeypatch.setattr(scenarios, '_service', CareerScenarioService(CareerScenarioRepository(path), career, EvidencePassportRepository(path), pathway, PathwayService(pathway, career_service=career), now=lambda: NOW))
    app = FastAPI()
    app.include_router(router)
    app.include_router(scenarios.router)
    app.dependency_overrides[get_entitlements] = lambda: ent
    app.include_router(institutional.router)
    monkeypatch.setattr(institutional._service, 'list_cohorts', lambda p: [])
    return TestClient(app)

HEADERS = {'X-Luma-Student-Id': 'student-a'}
ROLES = {'role_ids': ['devops-engineer', 'cloud-engineer']}

def test_real_comparison_api_free_blocked_pro_allowed_and_ownership(client):
    for _ in range(2):
        response = client.post('/v1/career-scenarios', headers=HEADERS, json=ROLES)
        assert response.status_code == 201
    blocked = client.post('/v1/career-scenarios', headers=HEADERS, json=ROLES)
    assert blocked.status_code == 429
    assert blocked.json()['detail'] == {'code': 'PLAN_LIMIT_REACHED', 'feature': 'career_comparisons', 'plan': 'free', 'limit': 2, 'used': 2, 'upgrade_required': True, 'required_plan': 'pro'}
    changed = client.post('/v1/subscriptions/demo-plan', headers=HEADERS, json={'plan': 'pro'})
    assert changed.status_code == 200
    assert changed.json()['entitlements']['career_comparisons']['used'] == 2
    pro = client.post('/v1/career-scenarios', headers=HEADERS, json={'role_ids': ROLES['role_ids'] + ['cybersecurity-engineer']})
    assert pro.status_code == 201
    assert client.get('/v1/career-scenarios/' + pro.json()['id'], headers={'X-Luma-Student-Id': 'other-student'}).status_code == 403
    assert client.get('/v1/subscriptions/me', headers=HEADERS).json()['plan'] == 'pro'


def test_role_limit_saved_scenarios_and_basic_journey(client, ent):
    assert client.post('/v1/career-scenarios', headers=HEADERS, json={'role_ids': ROLES['role_ids'] + ['cybersecurity-engineer']}).status_code == 429
    assert ent.snapshot('student-a')['entitlements']['career_comparisons']['used'] == 0
    assert client.get('/v1/career-scenarios/saved', headers=HEADERS).status_code == 403
    for feature in ['basic_planner', 'basic_next_action', 'evidence_passport', 'opportunity_browsing', 'international_profile']:
        ent.require('student-a', feature)
    ent.set_demo_plan('student-a', 'pro')
    saved = []
    for _ in range(3):
        response = client.post('/v1/career-scenarios', headers=HEADERS, json={**ROLES, 'save': True})
        assert response.status_code == 201
        saved.append(response.json()['id'])
    # Repeated saving is idempotent and does not consume a fourth slot.
    assert client.put(f'/v1/career-scenarios/{saved[0]}/saved', headers=HEADERS, json={'saved': True}).status_code == 200
    assert client.post('/v1/career-scenarios', headers=HEADERS, json={**ROLES, 'save': True}).status_code == 429
    assert client.put(f'/v1/career-scenarios/{saved[0]}/saved', headers=HEADERS, json={'saved': False}).status_code == 200
    assert client.post('/v1/career-scenarios', headers=HEADERS, json={**ROLES, 'save': True}).status_code == 201
    assert ent.snapshot('student-a')['entitlements']['saved_scenarios']['used'] == 3
    result = client.post('/v1/career-scenarios', headers=HEADERS, json=ROLES).json()
    sid = result['id']
    assert client.post(f'/v1/career-scenarios/{sid}/recompute', headers=HEADERS, json={'weekly_learning_minutes': 360}).status_code == 201
    history = client.get(f'/v1/career-scenarios/{sid}/history', headers=HEADERS)
    assert history.status_code == 200
    assert len(history.json()) == 2
    assert client.get(f'/v1/career-scenarios/{sid}/history', headers={'X-Luma-Student-Id': 'other'}).status_code == 403
    ent.set_demo_plan('student-a', 'free')
    assert client.get(f'/v1/career-scenarios/{sid}/history', headers=HEADERS).status_code == 403



def test_atomic_quota_refund_and_new_period(ent):
    def reserve(_):
        try:
            with ent.meter('concurrent', 'cv_analyses'):
                pass
            return True
        except HTTPException as exc:
            assert exc.status_code == 429
            return False
    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(reserve, range(8))) == 2
    with pytest.raises(ValueError):
        with ent.meter('failed', 'cv_analyses'):
            raise ValueError('analysis failed')
    assert ent.snapshot('failed')['entitlements']['cv_analyses']['used'] == 0
    ent.now = lambda: datetime(2026, 11, 1, tzinfo=timezone.utc)
    assert ent.snapshot('concurrent')['entitlements']['cv_analyses']['used'] == 0
    with ent.meter('concurrent', 'cv_analyses'):
        pass
    assert ent.snapshot('concurrent')['entitlements']['cv_analyses']['used'] == 1


def test_feed_daily_grants_cannot_be_bypassed_by_refresh(ent):
    items = [SimpleNamespace(article_id=f'item-{i}') for i in range(8)]
    assert len(ent.feed_items('reader', items)) == 3
    assert len(ent.feed_items('reader', list(reversed(items)))) == 3
    assert ent.feed_items('reader', [SimpleNamespace(article_id='new')]) == []
    ent.set_demo_plan('reader', 'pro')
    assert len(ent.feed_items('reader', items)) == 8
    ent.now = lambda: datetime(2026, 10, 3, tzinfo=timezone.utc)
    ent.set_demo_plan('reader', 'free')
    assert len(ent.feed_items('reader', items)) == 3


@pytest.mark.parametrize('plan', ['free', 'pro', 'institution'])
def test_institution_entitlements_and_existing_staff_roles(client, ent, plan):
    ent.set_demo_plan('student-a', plan)
    staff = {**HEADERS, 'X-Luma-Admin-Id': 'admin', 'X-Luma-Admin-Role': 'programme_admin', 'X-Luma-Institution-Id': 'university'}
    assert client.get('/v1/institutional-analytics/cohorts', headers=staff).status_code == (200 if plan == 'institution' else 403)
    assert client.get('/v1/institutional-analytics/cohorts', headers=HEADERS).status_code != 200
    for feature in ['institutional_analytics', 'taxonomy_governance', 'institution_mentoring']:
        if plan == 'institution':
            ent.require('student-a', feature)
        else:
            with pytest.raises(HTTPException) as blocked:
                ent.require('student-a', feature)
            assert blocked.value.detail['required_plan'] == 'institution'


def test_demo_production_lockout_and_automation(client, ent, monkeypatch):
    assert client.post('/v1/subscriptions/automation/authorize', headers=HEADERS).status_code == 403
    ent.set_demo_plan('student-a', 'pro')
    assert client.post('/v1/subscriptions/automation/authorize', headers=HEADERS).json()['authorized'] is True
    monkeypatch.setattr(service_module, 'settings', SimpleNamespace(environment='production'))
    assert client.post('/v1/subscriptions/demo-plan', headers=HEADERS, json={'plan': 'institution'}).status_code == 404
    assert client.get('/v1/subscriptions/me', headers=HEADERS).json()['demo_switch_enabled'] is False
    assert client.get('/v1/subscriptions/me', headers=HEADERS).json()['plan'] == 'pro'
    assert client.post('/v1/subscriptions/demo-plan', json={'plan': 'pro'}).status_code == 401


def test_advertised_daily_and_monthly_allowances(ent):
    # Business limits from the MVP specification, independently of plan definitions.
    expected = {
        'free': {'assistant_requests': 15, 'cv_analyses': 2, 'document_analyses': 3, 'opportunity_readiness': 3},
        'pro': {'assistant_requests': 100, 'cv_analyses': 15, 'document_analyses': 25, 'opportunity_readiness': 30},
    }
    for plan, allowances in expected.items():
        ent.set_demo_plan(plan, plan)
        for feature, limit in allowances.items():
            for _ in range(limit):
                with ent.meter(plan, feature):
                    pass
            with pytest.raises(HTTPException) as blocked:
                with ent.meter(plan, feature):
                    pytest.fail('Exhausted quota admitted domain work')
            assert blocked.value.detail['used'] == limit
            assert blocked.value.detail['limit'] == limit
    ent.now = lambda: datetime(2026, 10, 3, tzinfo=timezone.utc)
    assert ent.snapshot('free')['entitlements']['assistant_requests']['used'] == 0
    assert ent.snapshot('free')['entitlements']['document_analyses']['used'] == 3
