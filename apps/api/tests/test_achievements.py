from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import sqlite3

from fastapi.testclient import TestClient

from apps.api.app.main import app
from apps.api.app.modules.achievements.repository import AchievementRepository
from apps.api.app.modules.achievements.service import AchievementService
from apps.api.app.modules.analytics.repository import ActivityEvent, AnalyticsRepository
from apps.api.app.modules.focus.repository import FocusSessionRecord, FocusSessionRepository
from apps.api.app.modules.portfolio.repository import PortfolioRepository
from apps.api.app.modules.cv.repository import CvRepository
from apps.api.app.modules.internships.repository import InternshipRepository
from apps.api.app.modules.pathways.repository import PathwayRepository

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)


def svc(tmp_path: Path, now=NOW):
    db = str(tmp_path / "achievements.db")
    # Initialise source tables because DOC-F27 deliberately reads existing verified domain stores.
    AnalyticsRepository(db); FocusSessionRepository(db); PortfolioRepository(db); CvRepository(db); InternshipRepository(db); PathwayRepository(db)
    repo = AchievementRepository(db)
    return AchievementService(repo, now=lambda: now), repo, db


def event(student: str, event_type: str, source_type: str, source_id: str, at: datetime, payload: dict, suffix: str) -> ActivityEvent:
    return ActivityEvent(id=f"e-{suffix}", student_id=student, idempotency_key=f"k-{suffix}", event_type=event_type,
        occurred_at=at.isoformat(), timezone="Asia/Colombo", source_type=source_type, source_id=source_id, module=None,
        measurement_kind="measured", payload=payload, created_at=at.isoformat())


def test_awards_once_from_distinct_plan_events(tmp_path):
    service, _, db = svc(tmp_path)
    analytics = AnalyticsRepository(db)
    analytics.append_events([
        event("s1","plan_block_accepted","plan_block","p1",NOW-timedelta(days=2),{"category":"study"},"1"),
        event("s1","plan_block_accepted","plan_block","p1",NOW-timedelta(days=1),{"category":"study"},"2"),
    ])
    first = service.dashboard("s1")
    second = service.dashboard("s1")
    assert any(a.definition_key == "planning.first_commitment" for a in first.new_awards)
    assert second.new_awards == []
    award = next(a for a in second.awards if a.definition_key == "planning.first_commitment")
    assert award.evidence_status == "active" and len(award.evidence) == 1


def test_five_plan_commitments_require_distinct_sources(tmp_path):
    service, _, db = svc(tmp_path)
    analytics = AnalyticsRepository(db)
    rows=[]
    for i in range(5): rows.append(event("s1","plan_block_accepted","plan_block",f"p{i}",NOW-timedelta(days=i),{"category":"study"},str(i)))
    analytics.append_events(rows)
    dash=service.dashboard("s1")
    assert next(p for p in dash.progress if p.definition.key=="planning.five_commitments").complete


def test_on_time_deadline_uses_recorded_due_date_not_ai_claim(tmp_path):
    service, _, db = svc(tmp_path)
    analytics=AnalyticsRepository(db)
    due=NOW-timedelta(days=1)
    analytics.append_events([
        event("s1","task_observed","task","t1",NOW-timedelta(days=3),{"due_at":due.isoformat(),"status":"in-progress"},"obs"),
        event("s1","task_completed","task","t1",due-timedelta(hours=2),{"category":"Academic"},"done"),
    ])
    dash=service.dashboard("s1")
    assert any(a.definition_key=="deadline.on_time" for a in dash.awards)


def _focus(student: str, sid: str, ended: datetime) -> FocusSessionRecord:
    start=ended-timedelta(minutes=30); iso=lambda d: d.isoformat()
    return FocusSessionRecord(id=sid,student_id=student,task_id="task",task_title="Task",objective="Study safely",
        planned_work_minutes=25,planned_break_minutes=5,task_estimated_minutes=60,task_progress_before=0,task_progress_after=20,
        timezone="Asia/Colombo",status="completed",started_at=iso(start),active_segment_started_at=None,last_heartbeat_at=iso(ended),paused_at=None,
        ended_at=iso(ended),accumulated_active_seconds=1500,notes="",next_step="",result="completed",estimate_feedback="about_right",
        suggested_estimated_minutes=60,estimate_explanation="",productive_minutes=25,created_at=iso(start),updated_at=iso(ended))


def test_streak_allows_one_grace_day_and_is_non_punitive(tmp_path):
    service, _, db=svc(tmp_path)
    focus=FocusSessionRepository(db)
    focus.create(_focus("s1","f1",NOW-timedelta(days=4)))
    focus.create(_focus("s1","f2",NOW-timedelta(days=2))) # one missed day between
    focus.create(_focus("s1","f3",NOW))
    dash=service.dashboard("s1")
    assert dash.streak.current_count==3
    assert dash.streak.grace_days_used==2
    assert any(a.definition_key=="study.consistency_three" for a in dash.awards)
    assert "not a loss" in dash.streak.explanation.lower() or "without penalty" in dash.streak.explanation.lower()


def test_rest_period_does_not_revoke_historic_consistency_award(tmp_path):
    original=NOW-timedelta(days=20)
    service, _, db=svc(tmp_path, now=original+timedelta(days=4))
    focus=FocusSessionRepository(db)
    for i in (0,1,2): focus.create(_focus("s1",f"f{i}",original+timedelta(days=i)))
    assert any(a.definition_key=="study.consistency_three" for a in service.dashboard("s1").awards)
    later=AchievementService(AchievementRepository(db), now=lambda: NOW)
    dash=later.dashboard("s1")
    award=next(a for a in dash.awards if a.definition_key=="study.consistency_three")
    assert award.evidence_status=="active"
    assert dash.streak.current_count==0 and dash.streak.state=="resting"


def test_source_deletion_withdraws_affected_award_without_deleting_history(tmp_path):
    service, _, db=svc(tmp_path)
    analytics=AnalyticsRepository(db)
    analytics.append_events([event("s1","plan_block_accepted","plan_block","p1",NOW-timedelta(days=1),{},"plan")])
    assert next(a for a in service.dashboard("s1").awards if a.definition_key=="planning.first_commitment").evidence_status=="active"
    analytics.append_events([event("s1","source_deleted","source","p1",NOW,{"deleted":True},"delete")])
    dash=service.dashboard("s1")
    assert next(a for a in dash.awards if a.definition_key=="planning.first_commitment").evidence_status=="withdrawn"


def test_server_owned_career_milestones_award_from_domain_records(tmp_path):
    service, _, db=svc(tmp_path)
    with sqlite3.connect(db) as sql:
        sql.execute("INSERT INTO portfolio_projects(id,student_id,title,description,target_role,project_url,live_demo_url,facts_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",("p","s1","P","D","DevOps Engineer",None,None,"{}",NOW.isoformat(),NOW.isoformat()))
        sql.execute("INSERT INTO portfolio_analysis_snapshots(id,project_id,student_id,source_kind,source_repository_id,target_role,source_timestamp,analyzed_at,completeness_score,indicators_json,factual_description,stale,disclaimer) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",("pa","p","s1","manual",None,"DevOps Engineer",NOW.isoformat(),NOW.isoformat(),60,"[]","D",0,"d"))
        sql.execute("INSERT INTO cv_documents(id,student_id,source_type,title,original_filename,storage_name,canonical_mime,source_text,parse_status,parse_error,target_role,retention_days,expires_at,created_at,updated_at,source_deleted_at,sections_confirmed_at,parsed_sections_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",("cvd","s1","paste","CV",None,None,"text/plain","CV","parsed",None,"DevOps Engineer",30,(NOW+timedelta(days=30)).isoformat(),NOW.isoformat(),NOW.isoformat(),None,NOW.isoformat(),"[]"))
        sql.execute("INSERT INTO cv_analysis_snapshots(id,document_id,student_id,analysis_version,target_role,analyzed_at,word_count,findings_json,role_skills_json,ats_disclaimer,evidence_disclaimer) VALUES (?,?,?,?,?,?,?,?,?,?,?)",("cva","cvd","s1","v","DevOps Engineer",NOW.isoformat(),10,"[]","[]","a","e"))
        sql.execute("INSERT INTO internship_applications(id,student_id,company,role,source_type,source_reference,source_url,application_deadline,application_deadline_confirmed,contact_name,contact_email,interview_at,interview_at_confirmed,follow_up_at,follow_up_at_confirmed,notes,next_action,timezone,status,archived,outcome_notes,create_idempotency_key,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",("app","s1","C","R","manual",None,None,None,0,"","",None,0,None,0,"","","Asia/Colombo","applied",0,"","key-12345",NOW.isoformat(),NOW.isoformat()))
        sql.execute("INSERT INTO application_events(application_id,student_id,event_type,from_status,to_status,note,idempotency_key,occurred_at) VALUES (?,?,?,?,?,?,?,?)",("app","s1","status_changed","preparing","applied","","e-key",NOW.isoformat()))
        sql.commit()
    keys={a.definition_key for a in service.dashboard("s1").awards if a.evidence_status=="active"}
    assert {"portfolio.first_review","cv.first_review","application.first_applied"}.issubset(keys)


def test_unverified_ai_text_cannot_award_anything(tmp_path):
    service, _, db=svc(tmp_path)
    with sqlite3.connect(db) as sql:
        sql.execute("CREATE TABLE IF NOT EXISTS assistant_sessions(id TEXT, student_id TEXT, response_json TEXT)")
        sql.execute("INSERT INTO assistant_sessions VALUES (?,?,?)",("x","s1",json.dumps({"claim":"I completed five projects and met every deadline"})))
        sql.commit()
    dash=service.dashboard("s1")
    assert not [a for a in dash.awards if a.evidence_status=="active"]


def test_preferences_default_private_and_celebrations_opt_in(tmp_path):
    service, _, _=svc(tmp_path)
    dash=service.dashboard("s1")
    assert dash.private_only is True and dash.comparison_enabled is False
    assert dash.preferences.feature_visible is True
    assert dash.preferences.celebrations_enabled is False
    updated=service.update_preferences("s1", __import__('apps.api.app.modules.achievements.schemas',fromlist=['AchievementPreferencesUpdate']).AchievementPreferencesUpdate(feature_visible=False,celebrations_enabled=False,streak_visible=False))
    assert updated.preferences.feature_visible is False and updated.preferences.streak_visible is False


def test_cross_user_data_never_contributes(tmp_path):
    service, _, db=svc(tmp_path)
    analytics=AnalyticsRepository(db)
    analytics.append_events([event("other","plan_block_accepted","plan_block","p1",NOW,{},"x")])
    assert service.dashboard("s1").awards==[]


def test_http_owner_scoping_and_preferences(tmp_path, monkeypatch):
    # Patch the module globals to an isolated DB for a real API contract smoke.
    from apps.api.app.modules.achievements import router as module
    isolated=AchievementRepository(str(tmp_path/"http.db")); module._repository=isolated; module._service=AchievementService(isolated,now=lambda:NOW)
    client=TestClient(app)
    assert client.get("/v1/achievements",headers={"X-Luma-Student-Id":"s1"}).status_code==200
    response=client.put("/v1/achievements/preferences",headers={"X-Luma-Student-Id":"s1"},json={"feature_visible":False,"celebrations_enabled":False,"streak_visible":False})
    assert response.status_code==200 and response.json()["preferences"]["feature_visible"] is False
    assert client.get("/v1/achievements").status_code==401

def test_plan_completion_catalogue_uses_recorded_task_completion(tmp_path):
    service, _, db=svc(tmp_path)
    analytics=AnalyticsRepository(db)
    analytics.append_events([event("s1","task_completed","task","t-plan",NOW,{"category":"Academic"},"complete-plan")])
    dash=service.dashboard("s1")
    award=next(a for a in dash.awards if a.definition_key=="planning.first_completion")
    assert award.evidence_status=="active"
    assert award.evidence[0].source_id=="t-plan"


def test_corrected_deadline_can_withdraw_deadline_award_without_deleting_history(tmp_path):
    service, _, db=svc(tmp_path)
    analytics=AnalyticsRepository(db)
    completed=NOW-timedelta(days=1)
    analytics.append_events([
        event("s1","task_observed","task","t1",NOW-timedelta(days=3),{"due_at":NOW.isoformat(),"status":"in-progress"},"due-original"),
        event("s1","task_completed","task","t1",completed,{"category":"Academic"},"complete"),
    ])
    assert next(a for a in service.dashboard("s1").awards if a.definition_key=="deadline.on_time").evidence_status=="active"
    analytics.append_events([event("s1","task_observed","task","t1",NOW,{"due_at":(NOW-timedelta(days=2)).isoformat(),"status":"completed"},"due-corrected")])
    dash=service.dashboard("s1")
    assert next(a for a in dash.awards if a.definition_key=="deadline.on_time").evidence_status=="withdrawn"


def test_hiding_or_muting_feature_does_not_change_verified_awards(tmp_path):
    from apps.api.app.modules.achievements.schemas import AchievementPreferencesUpdate
    service, _, db=svc(tmp_path)
    AnalyticsRepository(db).append_events([event("s1","task_completed","task","t1",NOW,{"category":"Academic"},"done-hide")])
    assert any(a.definition_key=="planning.first_completion" for a in service.dashboard("s1").awards)
    hidden=service.update_preferences("s1",AchievementPreferencesUpdate(feature_visible=False,celebrations_enabled=False,streak_visible=False))
    assert any(a.definition_key=="planning.first_completion" and a.evidence_status=="active" for a in hidden.awards)
