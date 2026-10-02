from __future__ import annotations
import sqlite3, threading
from pathlib import Path

class InterviewRepository:
    def __init__(self, database_path: str):
        self.database_path=database_path; Path(database_path).parent.mkdir(parents=True, exist_ok=True); self._lock=threading.RLock(); self._init()
    def _connect(self):
        db=sqlite3.connect(self.database_path, timeout=20, check_same_thread=False); db.row_factory=sqlite3.Row; db.execute('PRAGMA foreign_keys=ON'); db.execute('PRAGMA journal_mode=WAL'); return db
    def _init(self):
        with self._connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS interview_sessions(
              id TEXT PRIMARY KEY, student_id TEXT NOT NULL, role TEXT NOT NULL, level TEXT NOT NULL, round_type TEXT NOT NULL,
              template_version TEXT NOT NULL, rubric_version TEXT NOT NULL, status TEXT NOT NULL, question_time_seconds INTEGER NOT NULL,
              max_followups_per_question INTEGER NOT NULL, current_question_id TEXT, current_question_started_at TEXT, current_question_elapsed_seconds INTEGER NOT NULL DEFAULT 0,
              last_heartbeat_at TEXT, paused_at TEXT, pause_count INTEGER NOT NULL DEFAULT 0, max_pause_count INTEGER NOT NULL DEFAULT 3,
              recording_mode TEXT NOT NULL, store_recordings INTEGER NOT NULL, retention_days INTEGER NOT NULL, expires_at TEXT NOT NULL,
              feedback_status TEXT NOT NULL DEFAULT 'not_requested', feedback_error TEXT, feedback_json TEXT,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_interview_owner ON interview_sessions(student_id, updated_at DESC);
            CREATE TABLE IF NOT EXISTS interview_questions(
              id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE, prompt TEXT NOT NULL,
              round_type TEXT NOT NULL, skill_ids_json TEXT NOT NULL, skill_names_json TEXT NOT NULL, evidence_refs_json TEXT NOT NULL DEFAULT '[]', is_followup INTEGER NOT NULL,
              parent_question_id TEXT, sequence INTEGER NOT NULL, time_limit_seconds INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_interview_questions ON interview_questions(session_id, sequence);
            CREATE TABLE IF NOT EXISTS interview_responses(
              id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE, question_id TEXT NOT NULL,
              answer_text TEXT NOT NULL, started_at TEXT NOT NULL, submitted_at TEXT NOT NULL, active_seconds INTEGER NOT NULL, timed_out INTEGER NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_interview_responses ON interview_responses(session_id, submitted_at);
            CREATE TABLE IF NOT EXISTS interview_rubric_results(
              id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES interview_sessions(id) ON DELETE CASCADE,
              response_id TEXT NOT NULL, criterion TEXT NOT NULL, score INTEGER NOT NULL, rationale TEXT NOT NULL, evidence_excerpt TEXT NOT NULL,
              rubric_version TEXT NOT NULL, created_at TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS interview_recording_preferences(
              session_id TEXT PRIMARY KEY REFERENCES interview_sessions(id) ON DELETE CASCADE, student_id TEXT NOT NULL, recording_mode TEXT NOT NULL,
              store_recordings INTEGER NOT NULL, consented_at TEXT NOT NULL, storage_locator TEXT);
            CREATE TABLE IF NOT EXISTS interview_audit(
              id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL, student_id TEXT NOT NULL, event_type TEXT NOT NULL, occurred_at TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '');
            ''')
            qcols={row[1] for row in db.execute('PRAGMA table_info(interview_questions)').fetchall()}
            if 'evidence_refs_json' not in qcols:
                db.execute("ALTER TABLE interview_questions ADD COLUMN evidence_refs_json TEXT NOT NULL DEFAULT '[]'")
    def create_session(self, values, questions):
        with self._lock, self._connect() as db:
            cols=','.join(values); marks=','.join('?' for _ in values); db.execute(f"INSERT INTO interview_sessions({cols}) VALUES({marks})", tuple(values.values()))
            for q in questions:
                cols=','.join(q); marks=','.join('?' for _ in q); db.execute(f"INSERT INTO interview_questions({cols}) VALUES({marks})", tuple(q.values()))
            db.execute('INSERT INTO interview_recording_preferences(session_id,student_id,recording_mode,store_recordings,consented_at,storage_locator) VALUES(?,?,?,?,?,NULL)', (values['id'],values['student_id'],values['recording_mode'],values['store_recordings'],values['created_at']))
            db.commit()
        return self.get_session(values['id'])
    def get_session(self, sid):
        with self._connect() as db: return db.execute('SELECT * FROM interview_sessions WHERE id=?',(sid,)).fetchone()
    def list_sessions(self, student_id):
        with self._connect() as db: return db.execute('SELECT * FROM interview_sessions WHERE student_id=? ORDER BY updated_at DESC',(student_id,)).fetchall()
    def questions(self,sid):
        with self._connect() as db: return db.execute('SELECT * FROM interview_questions WHERE session_id=? ORDER BY sequence,id',(sid,)).fetchall()
    def responses(self,sid):
        with self._connect() as db: return db.execute('SELECT * FROM interview_responses WHERE session_id=? ORDER BY submitted_at,id',(sid,)).fetchall()
    def update_session(self,sid,student_id,**fields):
        if not fields: return self.get_session(sid)
        sets=','.join(f'{k}=?' for k in fields)
        with self._lock,self._connect() as db:
            cur=db.execute(f'UPDATE interview_sessions SET {sets} WHERE id=? AND student_id=?', (*fields.values(),sid,student_id)); db.commit()
        return self.get_session(sid) if cur.rowcount else None
    def add_question(self,q):
        with self._lock,self._connect() as db:
            cols=','.join(q); marks=','.join('?' for _ in q); db.execute(f'INSERT INTO interview_questions({cols}) VALUES({marks})', tuple(q.values())); db.commit()
    def add_response(self,r):
        with self._lock,self._connect() as db:
            cols=','.join(r); marks=','.join('?' for _ in r); db.execute(f'INSERT INTO interview_responses({cols}) VALUES({marks})', tuple(r.values())); db.commit()
    def replace_rubric(self,sid, rows):
        with self._lock,self._connect() as db:
            db.execute('DELETE FROM interview_rubric_results WHERE session_id=?',(sid,))
            for r in rows: db.execute('INSERT INTO interview_rubric_results(session_id,response_id,criterion,score,rationale,evidence_excerpt,rubric_version,created_at) VALUES(?,?,?,?,?,?,?,?)', r)
            db.commit()
    def delete(self,sid,student_id):
        with self._lock,self._connect() as db:
            cur=db.execute('DELETE FROM interview_sessions WHERE id=? AND student_id=?',(sid,student_id)); db.commit(); return cur.rowcount>0
    def expired(self, now_iso):
        with self._connect() as db: return db.execute('SELECT * FROM interview_sessions WHERE expires_at<=?',(now_iso,)).fetchall()
    def audit(self,sid,student_id,event,at,detail=''):
        with self._connect() as db: db.execute('INSERT INTO interview_audit(session_id,student_id,event_type,occurred_at,detail) VALUES(?,?,?,?,?)',(sid,student_id,event,at,detail[:500])); db.commit()
