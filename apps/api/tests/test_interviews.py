from __future__ import annotations
from datetime import datetime,timedelta,timezone
from pathlib import Path
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from apps.api.app.modules.interviews.repository import InterviewRepository
from apps.api.app.modules.interviews.service import InterviewService
from apps.api.app.modules.interviews.schemas import CreateInterviewSessionRequest, SubmitInterviewAnswerRequest, RoadmapTopicRequest

NOW=datetime(2026,10,2,0,0,tzinfo=timezone.utc)

class Clock:
    def __init__(self): self.value=NOW
    def now(self): return self.value
    def tick(self,seconds): self.value+=timedelta(seconds=seconds)

def req(**kw):
    base=dict(role='DevOps Engineer',level='intern',round_type='technical',question_time_seconds=60,max_followups_per_question=1,retention_days=30,recording_mode='text',store_recordings=False,consent_acknowledged=True,locale='en')
    base.update(kw); return CreateInterviewSessionRequest(**base)

def service(tmp_path, evaluator=None, clock=None):
    c=clock or Clock(); return InterviewService(InterviewRepository(str(tmp_path/'test.db')),evaluator=evaluator,now=c.now),c

def answer_all(svc,clock,sid,text='I would use Docker because containers make the runtime reproducible. I would test the image, verify logs and health checks, compare alternatives, and measure the result before deployment.'):
    session=svc.start('student-a',sid)
    guard=0
    while session.current_question_id:
        clock.tick(20); session=svc.submit_answer('student-a',sid,SubmitInterviewAnswerRequest(answer_text=text)); guard+=1
        assert guard<20
    return session

def test_role_round_templates_cover_all_modes(tmp_path):
    svc,_=service(tmp_path)
    for mode in ('technical','behavioral','project'):
        s=svc.create('student-a',req(round_type=mode))
        assert s.round_type==mode and len(s.questions)==4
        if mode=='technical': assert any(q.skill_names for q in s.questions)

def test_consent_is_required_and_text_only_is_first_class(tmp_path):
    svc,_=service(tmp_path)
    with pytest.raises(HTTPException) as exc: svc.create('student-a',req(consent_acknowledged=False))
    assert exc.value.status_code==422
    s=svc.create('student-a',req())
    assert s.recording_mode=='text' and s.recording_storage_status=='not_applicable'

def test_recording_storage_is_explicit_opt_in_metadata_only(tmp_path):
    svc,_=service(tmp_path)
    no_store=svc.create('student-a',req(recording_mode='audio',store_recordings=False))
    assert no_store.recording_storage_status=='not_stored'
    store=svc.create('student-a',req(recording_mode='video',store_recordings=True))
    assert store.recording_storage_status=='consented_no_media_uploaded'

def test_timer_pause_resume_and_reload_recovery(tmp_path):
    clock=Clock(); db=str(tmp_path/'test.db'); svc=InterviewService(InterviewRepository(db),now=clock.now)
    s=svc.create('student-a',req()); s=svc.start('student-a',s.id); clock.tick(25)
    paused=svc.pause('student-a',s.id); assert paused.current_question_elapsed_seconds==25
    clock.tick(600)
    reopened=InterviewService(InterviewRepository(db),now=clock.now).get('student-a',s.id)
    assert reopened.status=='paused' and reopened.current_question_elapsed_seconds==25
    resumed=InterviewService(InterviewRepository(db),now=clock.now).resume('student-a',s.id); clock.tick(10)
    assert InterviewService(InterviewRepository(db),now=clock.now).get('student-a',s.id).current_question_elapsed_seconds==35

def test_stale_running_session_auto_pauses_without_counting_sleep(tmp_path):
    svc,clock=service(tmp_path); s=svc.start('student-a',svc.create('student-a',req()).id); clock.tick(30); svc.heartbeat('student-a',s.id); clock.tick(3600)
    recovered=svc.get('student-a',s.id)
    assert recovered.status=='paused'
    assert 29 <= recovered.current_question_elapsed_seconds <= 31

def test_followups_are_bounded(tmp_path):
    svc,clock=service(tmp_path); s=svc.start('student-a',svc.create('student-a',req(max_followups_per_question=1)).id)
    first=s.current_question_id; clock.tick(5); s=svc.submit_answer('student-a',s.id,SubmitInterviewAnswerRequest(answer_text='I used Docker.'))
    followups=[q for q in s.questions if q.parent_question_id==first]
    assert len(followups)==1 and followups[0].is_followup
    clock.tick(5); s=svc.submit_answer('student-a',s.id,SubmitInterviewAnswerRequest(answer_text='I personally built and tested the image, then verified the health check result.'))
    assert len([q for q in s.questions if q.parent_question_id==first])==1

def test_timed_answer_is_preserved_and_marked_timed_out(tmp_path):
    svc,clock=service(tmp_path); s=svc.start('student-a',svc.create('student-a',req(question_time_seconds=30,max_followups_per_question=0)).id); clock.tick(45)
    s=svc.submit_answer('student-a',s.id,SubmitInterviewAnswerRequest(answer_text='I would verify the service and record the result before changing configuration.'))
    assert s.responses[0].timed_out is True and s.responses[0].active_seconds==45

def test_feedback_separates_criteria_and_is_traceable(tmp_path):
    svc,clock=service(tmp_path); s=svc.create('student-a',req(max_followups_per_question=0)); answer_all(svc,clock,s.id); s=svc.complete('student-a',s.id)
    assert s.status=='feedback_ready' and s.feedback
    criteria={r.criterion for r in s.feedback.rubric_results}
    assert criteria=={'relevance','structure','technical_content','communication'}
    assert all(r.response_id and r.evidence_excerpt for r in s.feedback.rubric_results)
    assert all(item.refs for item in s.feedback.items)
    assert 'not an employment decision' in s.feedback.disclaimer

def test_protected_characteristic_text_does_not_drive_feedback(tmp_path):
    svc,clock=service(tmp_path); s=svc.create('student-a',req(round_type='behavioral',max_followups_per_question=0)); text='My religion and age are personal. Situation: two deadlines conflicted. Action: I prioritized the higher-risk dependency and communicated it. Result: the team delivered the critical work. I learned to document trade-offs.'; answer_all(svc,clock,s.id,text); s=svc.complete('student-a',s.id)
    combined=' '.join([r.rationale for r in s.feedback.rubric_results]+[i.detail for i in s.feedback.items]).lower()
    assert 'religion' not in combined and 'age' not in combined

def test_provider_failure_preserves_answers_and_safe_retry(tmp_path):
    class Failing:
        def __init__(self): self.fail=True
        def evaluate(self,*args,**kwargs):
            if self.fail: raise RuntimeError('provider down')
            from apps.api.app.modules.interviews.evaluator import DeterministicInterviewEvaluator
            return DeterministicInterviewEvaluator().evaluate(*args,**kwargs)
    provider=Failing(); svc,clock=service(tmp_path,evaluator=provider); s=svc.create('student-a',req(max_followups_per_question=0)); answer_all(svc,clock,s.id); before=len(svc.get('student-a',s.id).responses); failed=svc.complete('student-a',s.id)
    assert failed.status=='feedback_failed' and len(failed.responses)==before and failed.feedback_error
    provider.fail=False; retried=svc.retry_feedback('student-a',s.id)
    assert retried.status=='feedback_ready' and len(retried.responses)==before

def test_study_topics_must_reference_feedback(tmp_path):
    svc,clock=service(tmp_path); s=svc.create('student-a',req(max_followups_per_question=0)); answer_all(svc,clock,s.id,text='I would try it.'); s=svc.complete('student-a',s.id)
    refs=[ref for item in s.feedback.items if item.kind in {'study_topic','improvement'} for ref in item.refs]
    assert refs
    topics=svc.roadmap_topics('student-a',s.id,RoadmapTopicRequest(feedback_refs=[refs[0]]))
    assert topics.topics and topics.topics[0]['source']=='interview_feedback'
    with pytest.raises(HTTPException): svc.roadmap_topics('student-a',s.id,RoadmapTopicRequest(feedback_refs=['response:other']))

def test_cross_student_access_and_delete(tmp_path):
    svc,_=service(tmp_path); s=svc.create('student-a',req())
    with pytest.raises(HTTPException) as exc: svc.get('student-b',s.id)
    assert exc.value.status_code==403
    assert svc.delete('student-a',s.id).deleted is True
    with pytest.raises(HTTPException): svc.get('student-a',s.id)

def test_retention_purges_session_and_derived_content(tmp_path):
    svc,clock=service(tmp_path); s=svc.create('student-a',req(retention_days=7)); clock.tick(8*24*3600); svc.purge_expired()
    with pytest.raises(HTTPException) as exc: svc.get('student-a',s.id)
    assert exc.value.status_code==404

def test_pause_limit_is_predictable(tmp_path):
    svc,clock=service(tmp_path); s=svc.start('student-a',svc.create('student-a',req()).id)
    for _ in range(3):
        clock.tick(1); s=svc.pause('student-a',s.id); s=svc.resume('student-a',s.id)
    with pytest.raises(HTTPException) as exc: svc.pause('student-a',s.id)
    assert exc.value.status_code==409

def test_http_contract_and_owner_isolation(monkeypatch,tmp_path):
    import apps.api.app.modules.interviews.router as ir
    ir.service=InterviewService(InterviewRepository(str(tmp_path/'http.db')),now=lambda:NOW)
    from apps.api.app.main import app
    client=TestClient(app); h={'X-Luma-Student-Id':'student-a'}
    payload=req().model_dump(mode='json'); r=client.post('/v1/interviews/sessions',headers=h,json=payload); assert r.status_code==201; sid=r.json()['id']
    assert client.post(f'/v1/interviews/sessions/{sid}/start',headers=h).status_code==200
    assert client.get(f'/v1/interviews/sessions/{sid}',headers={'X-Luma-Student-Id':'student-b'}).status_code==403

def test_cv_gap_evidence_prioritizes_question_and_is_visible(tmp_path: Path):
    import json
    from apps.api.app.modules.cv.repository import CvRepository
    db=str(tmp_path/'evidence.db'); cv=CvRepository(db); now=NOW.isoformat(); doc_id='cv-evidence-1'
    cv.create_document({'id':doc_id,'student_id':'student-a','source_type':'paste','title':'CV','original_filename':None,'storage_name':None,'canonical_mime':None,'source_text':'Example CV source with enough content for a stored record.','parse_status':'parsed','parse_error':None,'target_role':'DevOps Engineer','retention_days':30,'expires_at':(NOW+timedelta(days=30)).isoformat(),'created_at':now,'updated_at':now,'source_deleted_at':None,'sections_confirmed_at':now,'parsed_sections_json':'[]'})
    cv.save_analysis({'id':'analysis-gap','document_id':doc_id,'student_id':'student-a','analysis_version':'v1','target_role':'DevOps Engineer','analyzed_at':now,'word_count':40,'findings_json':'[]','role_skills_json':json.dumps([{'skill_id':'kubernetes','skill_name':'Kubernetes','status':'not_demonstrated_in_cv','evidence':[]}]),'ats_disclaimer':'x','evidence_disclaimer':'x'},[])
    svc=InterviewService(InterviewRepository(db),now=lambda:NOW,cv_repository=cv)
    session=svc.create('student-a',req())
    assert session.questions[0].skill_names==['Kubernetes']
    assert any('cv_analysis:analysis-gap:skill:kubernetes:not_demonstrated_in_cv' in ref for ref in session.questions[0].evidence_refs)

def test_level_changes_template_expectations(tmp_path: Path):
    svc,_=service(tmp_path)
    intern=svc.create('student-a',req(level='intern'))
    mid=svc.create('student-a',req(level='mid'))
    assert intern.questions[0].prompt != mid.questions[0].prompt
    assert 'fundamentals' in intern.questions[0].prompt.lower()
    assert 'architecture' in mid.questions[0].prompt.lower()

def test_direct_access_after_expiry_is_deleted_without_listing_first(tmp_path: Path):
    svc,clock=service(tmp_path); s=svc.create('student-a',req(retention_days=7)); clock.tick(8*24*3600)
    with pytest.raises(HTTPException) as exc: svc.get('student-a',s.id)
    assert exc.value.status_code==404
    assert svc.repo.get_session(s.id) is None
