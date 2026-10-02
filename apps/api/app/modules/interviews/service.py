from __future__ import annotations
import json
from datetime import datetime,timedelta,timezone
from uuid import uuid4
from fastapi import HTTPException
from .repository import InterviewRepository
from .schemas import *
from .templates import TEMPLATE_VERSION,RUBRIC_VERSION,questions_for
from .evaluator import DeterministicInterviewEvaluator, EvaluationContext

class InterviewService:
    def __init__(self, repo: InterviewRepository, evaluator=None, now=lambda: datetime.now(timezone.utc), cv_repository=None, portfolio_repository=None):
        self.repo=repo; self.evaluator=evaluator or DeterministicInterviewEvaluator(); self.now=now; self.cv_repository=cv_repository; self.portfolio_repository=portfolio_repository
    def _iso(self,dt): return dt.astimezone(timezone.utc).isoformat()
    def _owned(self,student_id,sid):
        row=self.repo.get_session(sid)
        if not row: raise HTTPException(404,'Interview session not found.')
        if row['student_id']!=student_id: raise HTTPException(403,"You cannot access another student's interview session.")
        if datetime.fromisoformat(row['expires_at']) <= self.now():
            self.repo.delete(sid, student_id)
            raise HTTPException(404, 'Interview session has expired and was deleted.')
        return row
    def create(self,student_id,req:CreateInterviewSessionRequest):
        if not req.consent_acknowledged: raise HTTPException(422,'Review and acknowledge the interview practice consent before starting.')
        self.purge_expired(); now=self.now(); sid=f'int-{uuid4().hex[:16]}'; priority_skills, evidence_refs_by_skill, project_titles = self._evidence_context(student_id, req.role); templates=questions_for(req.role,req.level,req.round_type,priority_skills,evidence_refs_by_skill,project_titles)
        qs=[]
        for idx,t in enumerate(templates,1):
            qs.append({'id':f'q-{uuid4().hex[:12]}','session_id':sid,'prompt':t.prompt,'round_type':req.round_type,'skill_ids_json':json.dumps(t.skill_ids),'skill_names_json':json.dumps(t.skill_names),'evidence_refs_json':json.dumps(t.evidence_refs),'is_followup':0,'parent_question_id':None,'sequence':idx*10,'time_limit_seconds':req.question_time_seconds})
        vals={'id':sid,'student_id':student_id,'role':req.role,'level':req.level,'round_type':req.round_type,'template_version':TEMPLATE_VERSION,'rubric_version':RUBRIC_VERSION,'status':'ready','question_time_seconds':req.question_time_seconds,'max_followups_per_question':req.max_followups_per_question,'current_question_id':None,'current_question_started_at':None,'current_question_elapsed_seconds':0,'last_heartbeat_at':None,'paused_at':None,'pause_count':0,'max_pause_count':3,'recording_mode':req.recording_mode,'store_recordings':int(req.store_recordings),'retention_days':req.retention_days,'expires_at':self._iso(now+timedelta(days=req.retention_days)),'feedback_status':'not_requested','feedback_error':None,'feedback_json':None,'created_at':self._iso(now),'updated_at':self._iso(now)}
        self.repo.create_session(vals,qs); self.repo.audit(sid,student_id,'created',self._iso(now),f'{req.role}/{req.round_type}')
        return self.get(student_id,sid)
    def list(self,student_id): self.purge_expired(); return InterviewSessionListResponse(items=[self._response(r) for r in self.repo.list_sessions(student_id)])
    def get(self,student_id,sid):
        row=self._owned(student_id,sid); row=self._recover_stale(row); return self._response(row)
    def start(self,student_id,sid):
        row=self._owned(student_id,sid)
        if row['status']!='ready': raise HTTPException(409,'Only a ready interview session can be started.')
        q=self.repo.questions(sid)[0]; now=self.now(); self.repo.update_session(sid,student_id,status='running',current_question_id=q['id'],current_question_started_at=self._iso(now),current_question_elapsed_seconds=0,last_heartbeat_at=self._iso(now),updated_at=self._iso(now)); self.repo.audit(sid,student_id,'started',self._iso(now)); return self.get(student_id,sid)
    def heartbeat(self,student_id,sid):
        row=self._owned(student_id,sid)
        if row['status']!='running': return self._response(row)
        now=self.now(); self.repo.update_session(sid,student_id,last_heartbeat_at=self._iso(now),updated_at=self._iso(now)); return self.get(student_id,sid)
    def _elapsed(self,row,at):
        base=int(row['current_question_elapsed_seconds'] or 0)
        if row['status']=='running' and row['current_question_started_at']:
            start=datetime.fromisoformat(row['current_question_started_at']); return base+max(0,int((at-start).total_seconds()))
        return base
    def _recover_stale(self,row):
        if row['status']!='running' or not row['last_heartbeat_at']: return row
        now=self.now(); last=datetime.fromisoformat(row['last_heartbeat_at'])
        if (now-last).total_seconds()<=75: return row
        elapsed=self._elapsed(row,last)
        self.repo.update_session(row['id'],row['student_id'],status='paused',current_question_elapsed_seconds=elapsed,current_question_started_at=None,paused_at=self._iso(last),last_heartbeat_at=None,updated_at=self._iso(now)); self.repo.audit(row['id'],row['student_id'],'auto_paused_stale',self._iso(now)); return self.repo.get_session(row['id'])
    def pause(self,student_id,sid):
        row=self._owned(student_id,sid)
        if row['status']!='running': raise HTTPException(409,'Only a running interview can be paused.')
        if row['pause_count']>=row['max_pause_count']: raise HTTPException(409,'This practice session has reached its pause limit.')
        now=self.now(); elapsed=self._elapsed(row,now); self.repo.update_session(sid,student_id,status='paused',current_question_elapsed_seconds=elapsed,current_question_started_at=None,last_heartbeat_at=None,paused_at=self._iso(now),pause_count=row['pause_count']+1,updated_at=self._iso(now)); self.repo.audit(sid,student_id,'paused',self._iso(now)); return self.get(student_id,sid)
    def resume(self,student_id,sid):
        row=self._owned(student_id,sid)
        if row['status']!='paused': raise HTTPException(409,'Only a paused interview can be resumed.')
        now=self.now(); self.repo.update_session(sid,student_id,status='running',current_question_started_at=self._iso(now),last_heartbeat_at=self._iso(now),paused_at=None,updated_at=self._iso(now)); self.repo.audit(sid,student_id,'resumed',self._iso(now)); return self.get(student_id,sid)
    def submit_answer(self,student_id,sid,req:SubmitInterviewAnswerRequest):
        row=self._recover_stale(self._owned(student_id,sid))
        if row['status']!='running' or not row['current_question_id']: raise HTTPException(409,'Resume the active question before submitting an answer.')
        now=self.now(); qs=self.repo.questions(sid); q=next(x for x in qs if x['id']==row['current_question_id']); elapsed=self._elapsed(row,now); rid=f'r-{uuid4().hex[:14]}'
        self.repo.add_response({'id':rid,'session_id':sid,'question_id':q['id'],'answer_text':req.answer_text.strip(),'started_at':row['current_question_started_at'] or self._iso(now),'submitted_at':self._iso(now),'active_seconds':elapsed,'timed_out':int(elapsed>q['time_limit_seconds'])})
        # At most configured followups for each main question; only when answer is short or lacks explanation.
        if not q['is_followup'] and row['max_followups_per_question']>0:
            existing=sum(1 for item in self.repo.questions(sid) if item['parent_question_id']==q['id'])
            low=req.answer_text.lower(); needs=len(req.answer_text.split())<55 or not any(term in low for term in ('because','result','verify','learned','trade-off','tested'))
            if existing<row['max_followups_per_question'] and needs:
                fq={'id':f'q-{uuid4().hex[:12]}','session_id':sid,'prompt':'Can you make that more concrete? Add one decision or action you personally took and the evidence or result you used to judge it.','round_type':row['round_type'],'skill_ids_json':q['skill_ids_json'],'skill_names_json':q['skill_names_json'],'evidence_refs_json':q['evidence_refs_json'],'is_followup':1,'parent_question_id':q['id'],'sequence':q['sequence']+existing+1,'time_limit_seconds':min(row['question_time_seconds'],120)}; self.repo.add_question(fq)
        allq=self.repo.questions(sid); answered={r['question_id'] for r in self.repo.responses(sid)}; nxt=next((x for x in allq if x['id'] not in answered),None)
        self.repo.update_session(sid,student_id,current_question_id=nxt['id'] if nxt else None,current_question_started_at=self._iso(now) if nxt else None,current_question_elapsed_seconds=0,last_heartbeat_at=self._iso(now) if nxt else None,updated_at=self._iso(now)); self.repo.audit(sid,student_id,'answer_submitted',self._iso(now),q['id']); return self.get(student_id,sid)
    def complete(self,student_id,sid):
        row=self._recover_stale(self._owned(student_id,sid))
        if row['status'] not in {'running','paused'}: raise HTTPException(409,'This interview session cannot be completed from its current state.')
        if row['current_question_id'] is not None: raise HTTPException(409,'Answer the remaining question before completing the session.')
        now=self.now(); self.repo.update_session(sid,student_id,status='completed',feedback_status='pending',feedback_error=None,current_question_started_at=None,last_heartbeat_at=None,paused_at=None,updated_at=self._iso(now)); self.repo.audit(sid,student_id,'completed',self._iso(now)); return self._generate_feedback(student_id,sid)
    def retry_feedback(self,student_id,sid):
        row=self._owned(student_id,sid)
        if row['status'] not in {'completed','feedback_failed','feedback_ready'}: raise HTTPException(409,'Complete the interview before generating feedback.')
        return self._generate_feedback(student_id,sid)
    def _generate_feedback(self,student_id,sid):
        row=self._owned(student_id,sid); now=self.now(); qs={q['id']:{**dict(q),'skill_names':json.loads(q['skill_names_json'])} for q in self.repo.questions(sid)}; responses=[dict(r) for r in self.repo.responses(sid)]
        try:
            feedback=self.evaluator.evaluate(EvaluationContext(row['round_type'],responses,qs,row['role']),now)
            rubric_rows=[(sid,r.response_id,r.criterion,r.score,r.rationale,r.evidence_excerpt,feedback.rubric_version,self._iso(now)) for r in feedback.rubric_results]; self.repo.replace_rubric(sid,rubric_rows)
            self.repo.update_session(sid,student_id,status='feedback_ready',feedback_status='ready',feedback_error=None,feedback_json=feedback.model_dump_json(),updated_at=self._iso(now)); self.repo.audit(sid,student_id,'feedback_ready',self._iso(now)); return self.get(student_id,sid)
        except Exception:
            self.repo.update_session(sid,student_id,status='feedback_failed',feedback_status='failed',feedback_error='Feedback generation failed. Your completed answers are preserved; retry when ready.',updated_at=self._iso(now)); self.repo.audit(sid,student_id,'feedback_failed',self._iso(now)); return self.get(student_id,sid)
    def roadmap_topics(self,student_id,sid,req:RoadmapTopicRequest):
        sess=self.get(student_id,sid)
        if not sess.feedback: raise HTTPException(409,'Generate interview feedback before selecting study topics.')
        allowed={ref for item in sess.feedback.items if item.kind in {'study_topic','improvement'} for ref in item.refs}
        requested=set(req.feedback_refs)
        if not requested<=allowed: raise HTTPException(422,'Study topics must reference this session\'s feedback evidence.')
        items=[item for item in sess.feedback.items if item.kind in {'study_topic','improvement'} and requested.intersection(item.refs)]
        return RoadmapTopicResponse(topics=[{'title':i.title,'detail':i.detail,'source':'interview_feedback','refs':i.refs,'category':'career-learning'} for i in items[:6]])
    def delete(self,student_id,sid): self._owned(student_id,sid); ok=self.repo.delete(sid,student_id); return InterviewDeleteResponse(deleted=ok)
    def _evidence_context(self, student_id: str, role: str):
        priority=[]; refs_by_skill={}; project_titles=[]
        if self.cv_repository is not None:
            for doc in self.cv_repository.list_documents(student_id):
                if doc["target_role"] != role or not doc["sections_confirmed_at"]:
                    continue
                analysis=self.cv_repository.latest_analysis(doc["id"], student_id)
                if not analysis: continue
                try: skills=json.loads(analysis["role_skills_json"])
                except Exception: skills=[]
                for item in skills:
                    sid=item.get("skill_id"); status=item.get("status")
                    if not sid: continue
                    refs_by_skill.setdefault(sid,[]).append(f"cv_analysis:{analysis['id']}:skill:{sid}:{status}")
                    if status=="not_demonstrated_in_cv" and sid not in priority: priority.append(sid)
                break
        if self.portfolio_repository is not None:
            for project in self.portfolio_repository.list_projects(student_id)[:3]:
                project_titles.append(project["title"])
                analysis=self.portfolio_repository.latest_analysis(project["id"], student_id)
                if not analysis: continue
                for skill in self.portfolio_repository.skills_for_snapshot(analysis["id"]):
                    sid=skill["skill_id"]; refs_by_skill.setdefault(sid,[]).append(f"portfolio:{project['id']}:skill:{sid}:{skill['status']}")
        return tuple(priority), {k:tuple(v) for k,v in refs_by_skill.items()}, tuple(project_titles)
    def purge_expired(self):
        now=self.now();
        for row in self.repo.expired(self._iso(now)): self.repo.delete(row['id'],row['student_id'])
    def _response(self,row):
        qs=[InterviewQuestion(id=q['id'],prompt=q['prompt'],round_type=q['round_type'],skill_ids=json.loads(q['skill_ids_json']),skill_names=json.loads(q['skill_names_json']),evidence_refs=json.loads(q['evidence_refs_json']),is_followup=bool(q['is_followup']),parent_question_id=q['parent_question_id'],sequence=q['sequence'],time_limit_seconds=q['time_limit_seconds']) for q in self.repo.questions(row['id'])]
        rs=[InterviewResponseItem(id=r['id'],question_id=r['question_id'],answer_text=r['answer_text'],started_at=r['started_at'],submitted_at=r['submitted_at'],active_seconds=r['active_seconds'],timed_out=bool(r['timed_out'])) for r in self.repo.responses(row['id'])]
        feedback=InterviewFeedback.model_validate_json(row['feedback_json']) if row['feedback_json'] else None
        elapsed=self._elapsed(row,self.now())
        storage='not_applicable' if row['recording_mode']=='text' else ('consented_no_media_uploaded' if row['store_recordings'] else 'not_stored')
        return InterviewSessionResponse(id=row['id'],role=row['role'],level=row['level'],round_type=row['round_type'],template_version=row['template_version'],rubric_version=row['rubric_version'],status=row['status'],question_time_seconds=row['question_time_seconds'],max_followups_per_question=row['max_followups_per_question'],current_question_id=row['current_question_id'],current_question_started_at=row['current_question_started_at'],current_question_elapsed_seconds=elapsed,pause_count=row['pause_count'],max_pause_count=row['max_pause_count'],questions=qs,responses=rs,feedback=feedback,feedback_error=row['feedback_error'],recording_mode=row['recording_mode'],store_recordings=bool(row['store_recordings']),recording_storage_status=storage,retention_days=row['retention_days'],expires_at=row['expires_at'],created_at=row['created_at'],updated_at=row['updated_at'])
