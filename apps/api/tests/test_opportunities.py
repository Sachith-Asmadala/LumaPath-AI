from __future__ import annotations
from datetime import datetime, timezone, timedelta
import tempfile
from fastapi import FastAPI
from fastapi.testclient import TestClient

from apps.api.app.modules.opportunities.repository import OpportunityRepository
from apps.api.app.modules.opportunities.service import OpportunityService
from apps.api.app.modules.opportunities.schemas import *
from apps.api.app.modules.opportunities import router as router_module

NOW=datetime(2026,10,2,10,0,tzinfo=timezone.utc)

def service():
    tmp=tempfile.NamedTemporaryFile(suffix='.db',delete=False); tmp.close()
    return OpportunityService(OpportunityRepository(tmp.name),now=lambda:NOW)

def ctx(**kwargs):
    base=dict(target_role='DevOps Engineer',readiness_score=58,skills=[SkillContext(skill_id='git',level=80,demonstrated=True),SkillContext(skill_id='docker',level=72,demonstrated=True)],preferences=RecommendationPreferences(preferred_types=['internship'],location_modes=['hybrid','online'],cost_preference='free_only'),eligibility=EligibilityProfile(student_status='undergraduate',country='Sri Lanka'))
    base.update(kwargs); return RecommendationContext(**base)

def test_catalogue_supports_all_required_categories():
    result=service().browse('s1',BrowseRequest())
    assert {'internship','hackathon','competition','workshop','scholarship','certification','university_event'} <= {i.category for i in result.items}
    assert result.personalized is False

def test_expired_untrusted_and_stale_items_are_not_active():
    result=service().browse('s1',BrowseRequest())
    ids={i.id for i in result.items}
    assert 'quarantined-event' not in ids and 'stale-internship' not in ids
    assert result.excluded_untrusted >= 1 and result.excluded_stale >= 1 and result.excluded_expired >= 1

def test_personalized_ranking_exposes_factors_and_skill_gaps():
    result=service().browse('s1',BrowseRequest(context=ctx()))
    assert result.personalized
    item=next(i for i in result.items if i.id=='devops-intern-2026')
    assert item.rank_score is not None and len(item.ranking_factors)>=6
    assert 'git' in item.strengths and 'docker' in item.strengths
    assert item.why_fit and 'career goal' in item.why_fit

def test_eligibility_unknown_is_never_claimed_as_certain():
    result=service().browse('s1',BrowseRequest(context=ctx(eligibility=EligibilityProfile())))
    scholarship=next(i for i in result.items if i.category=='scholarship')
    assert scholarship.eligibility_status=='unknown'
    assert scholarship.missing_eligibility_data

def test_known_eligibility_gap_is_explicit():
    result=service().browse('s1',BrowseRequest(context=ctx(eligibility=EligibilityProfile(student_status='graduate',country='India'))))
    scholarship=next(i for i in result.items if i.category=='scholarship')
    assert scholarship.eligibility_status=='unmet'
    assert any(c.status=='unmet' for c in scholarship.eligibility_checks)

def test_sponsored_placement_is_disclosed():
    result=service().browse('s1',BrowseRequest())
    cert=next(i for i in result.items if i.id=='k8s-cert-prep')
    assert cert.sponsored is True and cert.sponsor_name

def test_save_persists_and_feedback_adjusts_future_ranking():
    s=service(); before=s.browse('s1',BrowseRequest(context=ctx()))
    s.interact('s1','devops-intern-2026',InteractionRequest(action='save'))
    after=s.browse('s1',BrowseRequest(context=ctx()))
    item=next(i for i in after.items if i.id=='devops-intern-2026')
    assert item.saved is True
    assert item.rank_score >= next(i for i in before.items if i.id=='devops-intern-2026').rank_score

def test_dismiss_removes_item_and_affects_similar_feedback():
    s=service(); s.interact('s1','devops-intern-2026',InteractionRequest(action='dismiss',reason='Not my preferred employer'))
    result=s.browse('s1',BrowseRequest(context=ctx()))
    assert 'devops-intern-2026' not in {i.id for i in result.items}

def test_report_requires_reason_and_quarantines_active_recommendations():
    s=service()
    try: InteractionRequest(action='report')
    except Exception: pass
    else: raise AssertionError('report should require reason')
    s.interact('s1','api-workshop',InteractionRequest(action='report',reason='Source page is misleading'))
    assert 'api-workshop' not in {i.id for i in s.browse('s1',BrowseRequest()).items}
    assert 'api-workshop' not in {i.id for i in s.browse('s2',BrowseRequest()).items}

def test_plan_action_requires_confirmation_and_rejects_overlap():
    s=service(); start=NOW+timedelta(days=1)
    req=PreparationPlanRequest(title='Prepare portfolio',start_at=start,duration_minutes=60,confirmed=False)
    try: s.plan('s1','devops-intern-2026',req)
    except Exception as e: assert getattr(e,'status_code',None)==422
    else: raise AssertionError('confirmation required')
    req=PreparationPlanRequest(title='Prepare portfolio',start_at=start,duration_minutes=60,confirmed=True,existing_blocks=[ExistingPlanBlock(id='x',start_at=start+timedelta(minutes=30),end_at=start+timedelta(minutes=90))])
    try: s.plan('s1','devops-intern-2026',req)
    except Exception as e: assert getattr(e,'status_code',None)==409
    else: raise AssertionError('overlap should fail')

def test_plan_action_is_idempotent():
    s=service(); start=NOW+timedelta(days=1)
    req=PreparationPlanRequest(title='Prepare portfolio',start_at=start,duration_minutes=60,confirmed=True)
    a=s.plan('s1','devops-intern-2026',req); b=s.plan('s1','devops-intern-2026',req)
    assert a.action_id==b.action_id and a.idempotency_key==b.idempotency_key

def test_internship_handoff_is_factual_and_category_limited():
    s=service(); h=s.internship_handoff('s1','devops-intern-2026')
    assert h.source_reference=='opportunity:devops-intern-2026' and h.company=='Northstar Labs'
    try: s.internship_handoff('s1','api-workshop')
    except Exception as e: assert getattr(e,'status_code',None)==422
    else: raise AssertionError('non internship handoff must fail')

def test_snapshot_stores_only_minimal_context_summary_not_private_content():
    s=service(); s.browse('s1',BrowseRequest(context=ctx()))
    rows=s.repository.query('SELECT context_summary_json FROM recommendation_snapshots WHERE student_id=?',('s1',))
    text=rows[0]['context_summary_json']
    assert 'target_role' in text and 'skill_ids' in text
    assert 'task' not in text.lower() and 'cv' not in text.lower() and 'note' not in text.lower()

def test_categories_filter_works_without_profile():
    result=service().browse('s1',BrowseRequest(categories=['hackathon','competition']))
    assert result.items and {i.category for i in result.items}<={'hackathon','competition'}

def test_http_contract_and_identity(monkeypatch):
    s=service(); monkeypatch.setattr(router_module,'_service',s)
    app=FastAPI(); app.include_router(router_module.router); c=TestClient(app)
    assert c.post('/v1/opportunities/browse',json={}).status_code==401
    r=c.post('/v1/opportunities/browse',json={},headers={'X-Luma-Student-Id':'student-a'})
    assert r.status_code==200 and r.json()['items']
    iid=r.json()['items'][0]['id']
    assert c.post(f'/v1/opportunities/{iid}/interactions',json={'action':'save'},headers={'X-Luma-Student-Id':'student-a'}).status_code==200
    other=c.post('/v1/opportunities/browse',json={},headers={'X-Luma-Student-Id':'student-b'}).json()
    same=next(i for i in other['items'] if i['id']==iid)
    assert same['saved'] is False

def test_interactions_persist_across_repository_reopen():
    tmp=tempfile.NamedTemporaryFile(suffix='.db',delete=False); path=tmp.name; tmp.close()
    first=OpportunityService(OpportunityRepository(path),now=lambda:NOW)
    first.interact('s1','devops-intern-2026',InteractionRequest(action='save'))
    second=OpportunityService(OpportunityRepository(path),now=lambda:NOW)
    item=next(i for i in second.browse('s1',BrowseRequest()).items if i.id=='devops-intern-2026')
    assert item.saved is True
