from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
import json
from typing import Any, Callable
from uuid import uuid4
from zoneinfo import ZoneInfo

from .definitions import CATALOGUE_VERSION, DEFINITIONS, STREAK_RULE_VERSION
from .repository import AchievementRepository
from .schemas import (
    AchievementDashboardView, AchievementDefinitionView, AchievementEvidence, AchievementPreferencesUpdate,
    AchievementPreferencesView, AchievementProgressView, AwardedAchievementView, StreakView,
)


class AchievementService:
    def __init__(self, repository: AchievementRepository, now: Callable[[], datetime] | None = None):
        self.repository = repository
        self._now = now or (lambda: datetime.now(timezone.utc))
        self.repository.upsert_definitions([{
            "definition_key": item.key, "version": CATALOGUE_VERSION, "category": item.category,
            "title": item.title, "description": item.description, "target": item.target, "unit": item.unit,
            "optional_career": int(item.optional_career),
        } for item in DEFINITIONS])

    def dashboard(self, student_id: str, evaluate: bool = True) -> AchievementDashboardView:
        return self._build(student_id, evaluate=evaluate)

    def update_preferences(self, student_id: str, request: AchievementPreferencesUpdate) -> AchievementDashboardView:
        now = self._now().astimezone(timezone.utc)
        self.repository.update_preferences(student_id, {
            "feature_visible": int(request.feature_visible), "celebrations_enabled": int(request.celebrations_enabled),
            "streak_visible": int(request.streak_visible), "updated_at": now.isoformat(),
        })
        self.repository.audit(student_id, "achievement.preferences_updated", now.isoformat())
        return self._build(student_id, evaluate=True)

    def _build(self, student_id: str, evaluate: bool) -> AchievementDashboardView:
        now = self._now().astimezone(timezone.utc)
        facts = self._collect_facts(student_id, now)
        progress_map = self._progress(facts)
        streak = self._compute_streak(facts["focus_sessions"], facts["timezone"], now)
        self.repository.save_streak({
            "student_id": student_id, "current_count": streak.current_count, "longest_count": streak.longest_count,
            "last_qualifying_date": streak.last_qualifying_date, "grace_days_used": streak.grace_days_used,
            "state": streak.state, "rule_version": STREAK_RULE_VERSION,
            "qualifying_dates_json": json.dumps(streak.qualifying_dates),
            "evidence_json": json.dumps([item.model_dump(mode="json") for item in progress_map["study.consistency_three"]["evidence"]]),
            "updated_at": now.isoformat(),
        })
        progress_map["study.consistency_three"]["current"] = streak.current_count
        progress_map["study.consistency_three"]["evidence"] = progress_map["study.consistency_three"]["evidence"][-streak.current_count:] if streak.current_count else []

        new_rows: list[Any] = []
        if evaluate:
            for definition in DEFINITIONS:
                current = int(progress_map[definition.key]["current"])
                evidence = progress_map[definition.key]["evidence"]
                qualifying_current = streak.longest_count if definition.key == "study.consistency_three" else current
                if qualifying_current >= definition.target:
                    row, created, restored = self.repository.award({
                        "id": f"ach_{uuid4().hex}", "student_id": student_id, "definition_key": definition.key,
                        "definition_version": CATALOGUE_VERSION, "awarded_at": now.isoformat(),
                        "evidence_json": json.dumps([item.model_dump(mode="json") for item in evidence[:12]]),
                        "updated_at": now.isoformat(),
                    })
                    if created or restored:
                        new_rows.append(row)
                        self.repository.audit(student_id, "achievement.awarded" if created else "achievement.restored", now.isoformat(), definition.key)
                elif self.repository.withdraw(student_id, definition.key, CATALOGUE_VERSION, now.isoformat()):
                    self.repository.audit(student_id, "achievement.evidence_withdrawn", now.isoformat(), definition.key, "Source evidence was corrected or deleted; award kept as private history but marked withdrawn.")

        definition_rows = {row["definition_key"]: row for row in self.repository.definitions(CATALOGUE_VERSION)}
        awards = [self._award_view(row, definition_rows[row["definition_key"]]) for row in self.repository.awards(student_id, CATALOGUE_VERSION)]
        new_ids = {row["id"] for row in new_rows}
        prefs = self.repository.preferences(student_id, now.isoformat())
        progress = [AchievementProgressView(
            definition=self._definition_view(definition_rows[item.key]),
            current=min(int(progress_map[item.key]["current"]), item.target), target=item.target,
            complete=int(progress_map[item.key]["current"]) >= item.target,
            evidence=progress_map[item.key]["evidence"][:12],
        ) for item in DEFINITIONS]
        return AchievementDashboardView(
            student_id=student_id, catalogue_version=CATALOGUE_VERSION,
            preferences=self._preference_view(prefs), awards=awards, progress=progress, streak=streak,
            new_awards=[item for item in awards if item.id in new_ids], private_only=True, comparison_enabled=False,
            generated_at=now,
        )

    def _collect_facts(self, student_id: str, now: datetime) -> dict[str, Any]:
        facts: dict[str, Any] = {"analytics": [], "focus_sessions": [], "portfolio": [], "cv": [], "applications": [], "roadmap": [], "timezone": "Asia/Colombo"}
        if self.repository.table_exists("analytics_activity_events"):
            facts["analytics"] = self.repository.query("SELECT * FROM analytics_activity_events WHERE student_id=? ORDER BY occurred_at,id", (student_id,))
            for row in reversed(facts["analytics"]):
                if row["timezone"]:
                    facts["timezone"] = row["timezone"]; break
        if self.repository.table_exists("focus_sessions"):
            facts["focus_sessions"] = self.repository.query("SELECT * FROM focus_sessions WHERE student_id=? AND status='completed' AND productive_minutes>0 AND ended_at IS NOT NULL ORDER BY ended_at", (student_id,))
            if facts["focus_sessions"]:
                facts["timezone"] = facts["focus_sessions"][-1]["timezone"] or facts["timezone"]
        if self.repository.table_exists("portfolio_analysis_snapshots"):
            facts["portfolio"] = self.repository.query("SELECT id,project_id,analyzed_at FROM portfolio_analysis_snapshots WHERE student_id=? ORDER BY analyzed_at", (student_id,))
        if self.repository.table_exists("cv_analysis_snapshots"):
            facts["cv"] = self.repository.query("SELECT id,document_id,analyzed_at FROM cv_analysis_snapshots WHERE student_id=? ORDER BY analyzed_at", (student_id,))
        if self.repository.table_exists("application_events"):
            facts["applications"] = self.repository.query("SELECT id,application_id,to_status,occurred_at FROM application_events WHERE student_id=? AND to_status='applied' ORDER BY occurred_at,id", (student_id,))
        if self.repository.table_exists("pathway_steps"):
            facts["roadmap"] = self.repository.query("""SELECT ps.id,ps.pathway_id,ps.skill_id,ps.state,ps.completion_source,ps.updated_at
                FROM pathway_steps ps JOIN pathways p ON p.id=ps.pathway_id
                WHERE ps.student_id=? AND p.status IN ('active','superseded') AND ps.state IN ('completed','credited') ORDER BY ps.updated_at""", (student_id,))
        return facts

    def _progress(self, facts: dict[str, Any]) -> dict[str, dict[str, Any]]:
        result = {item.key: {"current": 0, "evidence": []} for item in DEFINITIONS}
        deleted: set[str] = set()
        task_observed: dict[str, Any] = {}
        accepted_plans: dict[str, Any] = {}
        completed_tasks: dict[str, Any] = {}
        for row in facts["analytics"]:
            payload = json.loads(row["payload_json"])
            if row["event_type"] == "source_deleted":
                deleted.add(row["source_id"])
            elif row["source_id"] not in deleted:
                if row["event_type"] == "task_observed": task_observed[row["source_id"]] = row
                if row["event_type"] == "plan_block_accepted": accepted_plans[row["source_id"]] = row
                if row["event_type"] == "task_completed": completed_tasks[row["source_id"]] = row
        accepted_plans = {key: row for key,row in accepted_plans.items() if key not in deleted}
        completed_tasks = {key: row for key,row in completed_tasks.items() if key not in deleted}
        plan_evidence = [self._ev("plan_block", row["source_id"], row["occurred_at"], "/planner", "Approved planning commitment") for row in accepted_plans.values()]
        completed_evidence = [self._ev("task", row["source_id"], row["occurred_at"], "/tasks", "Completed planned task") for row in completed_tasks.values()]
        result["planning.first_completion"] = {"current": len(completed_evidence), "evidence": completed_evidence}
        result["planning.first_commitment"] = {"current": len(plan_evidence), "evidence": plan_evidence}
        result["planning.five_commitments"] = {"current": len(plan_evidence), "evidence": plan_evidence}
        on_time: list[AchievementEvidence] = []
        for source_id, row in completed_tasks.items():
            observed = task_observed.get(source_id)
            if not observed: continue
            payload = json.loads(observed["payload_json"])
            due = payload.get("due_at")
            if not due: continue
            completed_at = datetime.fromisoformat(row["occurred_at"])
            due_at = datetime.fromisoformat(due)
            if due_at.tzinfo is None: due_at = due_at.replace(tzinfo=timezone.utc)
            if completed_at <= due_at.astimezone(timezone.utc):
                on_time.append(self._ev("task", source_id, row["occurred_at"], "/tasks", "Task completed by its recorded deadline"))
        result["deadline.on_time"] = {"current": len(on_time), "evidence": on_time}
        focus_evidence = [self._ev("focus_session", row["id"], row["ended_at"], "/focus", "Completed focus session") for row in facts["focus_sessions"]]
        result["study.consistency_three"] = {"current": 0, "evidence": focus_evidence}
        portfolio = [self._ev("portfolio_analysis", row["id"], row["analyzed_at"], "/portfolio", "Portfolio analysis snapshot") for row in facts["portfolio"]]
        result["portfolio.first_review"] = {"current": len(portfolio), "evidence": portfolio}
        cvs = [self._ev("cv_analysis", row["id"], row["analyzed_at"], "/cv", "CV analysis snapshot") for row in facts["cv"]]
        result["cv.first_review"] = {"current": len(cvs), "evidence": cvs}
        applications = [self._ev("internship_application", str(row["application_id"]), row["occurred_at"], "/internships", "Application reached Applied") for row in facts["applications"]]
        result["application.first_applied"] = {"current": len({item.source_id for item in applications}), "evidence": applications}
        roadmap = [self._ev("pathway_step", row["id"], row["updated_at"], "/roadmap", "Completed or credited roadmap milestone") for row in facts["roadmap"]]
        result["roadmap.first_milestone"] = {"current": len(roadmap), "evidence": roadmap}
        return result

    def _compute_streak(self, sessions: list[Any], timezone_name: str, now: datetime) -> StreakView:
        try: tz = ZoneInfo(timezone_name)
        except Exception: tz = ZoneInfo("Asia/Colombo")
        by_day: dict[date, list[Any]] = defaultdict(list)
        for row in sessions:
            ended = datetime.fromisoformat(row["ended_at"])
            if ended.tzinfo is None: ended = ended.replace(tzinfo=timezone.utc)
            try: session_tz = ZoneInfo(row["timezone"] or timezone_name)
            except Exception: session_tz = tz
            by_day[ended.astimezone(session_tz).date()].append(row)
        days = sorted(by_day)
        if not days:
            return StreakView(current_count=0,longest_count=0,last_qualifying_date=None,grace_days_used=0,state="empty",rule_version=STREAK_RULE_VERSION,explanation="A qualifying study day is a completed Focus session with productive time. One missed calendar day between qualifying days is treated as grace, not a loss.",qualifying_dates=[])
        longest = 1; run = 1; grace_total = 0; best_days: list[date] = [days[0]]; run_days=[days[0]]
        for prev, current in zip(days, days[1:]):
            gap = (current-prev).days
            if gap <= 2:
                run += 1; run_days.append(current)
                if gap == 2: grace_total += 1
            else:
                if run > longest: longest=run; best_days=list(run_days)
                run=1; run_days=[current]; grace_total=0
        if run > longest: longest=run; best_days=list(run_days)
        last = days[-1]
        current_run_days=[last]
        for idx in range(len(days)-2,-1,-1):
            if (current_run_days[0]-days[idx]).days <= 2: current_run_days.insert(0,days[idx])
            else: break
        current_count=len(current_run_days)
        grace_used=sum(1 for a,b in zip(current_run_days,current_run_days[1:]) if (b-a).days==2)
        today=now.astimezone(tz).date(); since=(today-last).days
        state = "active" if since==0 else "grace" if since <= 2 else "resting"
        if since>2: current_count=0; grace_used=0
        return StreakView(current_count=current_count,longest_count=max(longest,len(current_run_days)),last_qualifying_date=last.isoformat(),grace_days_used=grace_used,state=state,rule_version=STREAK_RULE_VERSION,explanation="Counts qualifying Focus-study days, not perfect attendance. One missed calendar day between study days is allowed as grace; longer breaks simply start a new run without penalty or loss language.",qualifying_dates=[item.isoformat() for item in current_run_days])

    @staticmethod
    def _ev(source_type: str, source_id: str, occurred_at: str, href: str, label: str) -> AchievementEvidence:
        return AchievementEvidence(source_type=source_type, source_id=str(source_id), occurred_at=datetime.fromisoformat(occurred_at), href=href, label=label, verified=True)

    @staticmethod
    def _definition_view(row: Any) -> AchievementDefinitionView:
        return AchievementDefinitionView(key=row["definition_key"],version=row["version"],category=row["category"],title=row["title"],description=row["description"],target=row["target"],unit=row["unit"],optional_career=bool(row["optional_career"]))

    def _award_view(self, row: Any, definition: Any) -> AwardedAchievementView:
        return AwardedAchievementView(id=row["id"],definition_key=row["definition_key"],definition_version=row["definition_version"],title=definition["title"],description=definition["description"],category=definition["category"],awarded_at=datetime.fromisoformat(row["awarded_at"]),evidence_status=row["evidence_status"],evidence=[AchievementEvidence.model_validate(item) for item in json.loads(row["evidence_json"])],restored_at=datetime.fromisoformat(row["restored_at"]) if row["restored_at"] else None)

    @staticmethod
    def _preference_view(row: Any) -> AchievementPreferencesView:
        return AchievementPreferencesView(student_id=row["student_id"],feature_visible=bool(row["feature_visible"]),celebrations_enabled=bool(row["celebrations_enabled"]),streak_visible=bool(row["streak_visible"]),updated_at=datetime.fromisoformat(row["updated_at"]))
