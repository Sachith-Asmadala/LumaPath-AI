from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, status

from .definitions import (
    CATEGORY_LABELS,
    CATEGORY_TRUST_MINIMUM,
    EXPLANATION_VERSION,
    INGESTION_VERSION,
    RANKING_VERSION,
    SENSITIVE_CATEGORY_SOURCE_TYPES,
    SKILL_KEYWORDS, TOPIC_KEYWORDS,
    TRACKING_QUERY_KEYS,
    TRACKING_QUERY_PREFIXES,
)
from .repository import IntelligenceRepository
from .schemas import (
    AddToPlanRequest,
    FeedIngestionStatus,
    FeedItem,
    FeedPathwayContext,
    FeedPathwayStep,
    FeedResponse,
    FeedSource,
    IngestionCandidate,
    IngestionResult,
    InteractionRequest,
    InteractionResponse,
    PlannerHandoffResponse,
)
from ..pathways.repository import PathwayRepository


UNSAFE_TEXT_MARKERS = (
    "<script", "</script", "javascript:", "data:text/html", "<iframe",
    "ignore previous instructions", "ignore all previous instructions", "system prompt",
)


class IntelligenceService:
    def __init__(
        self,
        repository: IntelligenceRepository,
        pathway_repository: PathwayRepository,
        now=lambda: datetime.now(timezone.utc),
        daily_limit: int = 8,
        per_source_limit: int = 2,
        per_category_limit: int = 3,
    ):
        self.repository = repository
        self.pathways = pathway_repository
        self.now = now
        self.daily_limit = max(1, min(20, daily_limit))
        self.per_source_limit = max(1, min(self.daily_limit, per_source_limit))
        self.per_category_limit = max(1, min(self.daily_limit, per_category_limit))

    # ---------- governed ingestion ----------
    def ingest_candidates(self, source_id: str, candidates: list[IngestionCandidate]) -> IngestionResult:
        source = self.repository.source(source_id)
        if source is None:
            raise HTTPException(status_code=404, detail="Content source is not in the approved-source catalogue.")
        started = self._utc(self.now())
        run_id = f"ing_{uuid4().hex[:20]}"
        self.repository.start_ingestion_run({
            "id": run_id, "source_id": source_id, "ingestion_version": INGESTION_VERSION,
            "started_at": started.isoformat(), "candidate_count": len(candidates),
        })
        if source["trust_status"] == "blocked":
            return self._finish_failed(run_id, source_id, started, "source_blocked", "The source is blocked by content governance.")

        counts = Counter(accepted=0, quarantined=0, duplicates=0, rejected=0)
        try:
            for candidate in candidates:
                if candidate.source_id != source_id:
                    counts["rejected"] += 1
                    continue
                prepared = self._prepare_candidate(source, candidate, started)
                if prepared is None:
                    counts["rejected"] += 1
                    continue
                values, skills = prepared
                values["ingestion_run_id"] = run_id
                duplicate = self.repository.duplicate_article(values["canonical_url"], values["content_hash"])
                if duplicate:
                    counts["duplicates"] += 1
                    continue
                self.repository.insert_article(values, skills)
                counts["quarantined" if values["trust_status"] == "quarantined" else "accepted"] += 1
            completed = self._utc(self.now())
            self.repository.finish_ingestion_run(run_id, source_id, {
                "completed_at": completed.isoformat(), "status": "succeeded",
                "accepted_count": counts["accepted"], "quarantined_count": counts["quarantined"],
                "duplicate_count": counts["duplicates"], "rejected_count": counts["rejected"],
                "error_code": None, "error_message": None,
            })
            return IngestionResult(
                run_id=run_id, source_id=source_id, status="succeeded", accepted=counts["accepted"],
                quarantined=counts["quarantined"], duplicates=counts["duplicates"], rejected=counts["rejected"],
                completed_at=completed,
            )
        except Exception as exc:
            self._finish_failed(run_id, source_id, started, "pipeline_error", "The approved-source ingestion pipeline failed safely.")
            raise exc

    def record_ingestion_failure(self, source_id: str, error_code: str, message: str) -> IngestionResult:
        source = self.repository.source(source_id)
        if source is None:
            raise HTTPException(status_code=404, detail="Content source is not in the approved-source catalogue.")
        started = self._utc(self.now())
        run_id = f"ing_{uuid4().hex[:20]}"
        self.repository.start_ingestion_run({
            "id": run_id, "source_id": source_id, "ingestion_version": INGESTION_VERSION,
            "started_at": started.isoformat(), "candidate_count": 0,
        })
        return self._finish_failed(run_id, source_id, started, self._safe_code(error_code), self._safe_error(message))

    def _finish_failed(self, run_id: str, source_id: str, started: datetime, error_code: str, message: str) -> IngestionResult:
        completed = self._utc(self.now())
        self.repository.finish_ingestion_run(run_id, source_id, {
            "completed_at": completed.isoformat(), "status": "failed", "accepted_count": 0, "quarantined_count": 0,
            "duplicate_count": 0, "rejected_count": 0, "error_code": error_code[:80], "error_message": message[:300],
        })
        return IngestionResult(run_id=run_id, source_id=source_id, status="failed", error_code=error_code[:80], error_message=message[:300], completed_at=completed)

    def _prepare_candidate(self, source, candidate: IngestionCandidate, now: datetime):
        allowed_categories = set(json.loads(source["categories_json"]))
        if candidate.category not in allowed_categories:
            return None
        canonical = self._canonicalize(candidate.canonical_url, set(json.loads(source["allowed_domains_json"])))
        if canonical is None:
            return None

        published = self._utc(candidate.published_at)
        explicit_expiry = self._utc(candidate.expires_at) if candidate.expires_at else None
        policy_expiry = published + timedelta(days=int(source["max_age_days"]))
        expires = min(explicit_expiry, policy_expiry) if explicit_expiry else policy_expiry
        if expires <= published:
            return None

        title = self._plain_text(candidate.title, 240)
        if not title:
            return None
        excerpt_limit = int(source["max_excerpt_chars"]) if source["storage_policy"] == "metadata_excerpt" else 0
        excerpt = self._plain_text(candidate.excerpt, excerpt_limit) if excerpt_limit else ""
        unsafe = self._unsafe(candidate.title) or self._unsafe(candidate.excerpt)
        stale = expires <= now or published < now - timedelta(days=int(source["max_age_days"]))
        future = published > now + timedelta(hours=24)
        trust_too_low = int(source["trust_score"]) < CATEGORY_TRUST_MINIMUM[candidate.category]
        wrong_sensitive_type = candidate.category in SENSITIVE_CATEGORY_SOURCE_TYPES and source["source_type"] not in SENSITIVE_CATEGORY_SOURCE_TYPES[candidate.category]
        not_approved = source["trust_status"] != "approved"

        quarantine_reason = None
        if unsafe: quarantine_reason = "unsafe_or_instructional_metadata"
        elif stale: quarantine_reason = "stale_at_ingestion"
        elif future: quarantine_reason = "implausible_future_publication_date"
        elif not_approved: quarantine_reason = "source_not_approved"
        elif trust_too_low: quarantine_reason = "source_trust_below_category_threshold"
        elif wrong_sensitive_type: quarantine_reason = "source_type_not_authoritative_for_sensitive_claim"
        trust_status = "quarantined" if quarantine_reason else "active"

        enrichment_text = f"{title} {excerpt}".lower()
        topics = [self._slug(value) for value in candidate.topics if self._slug(value)]
        if not topics:
            topics = [topic for topic, keywords in TOPIC_KEYWORDS.items() if any(keyword in enrichment_text for keyword in keywords)]
        topics = list(dict.fromkeys(topics))[:20]
        target_roles = [" ".join(value.split())[:120] for value in candidate.target_roles if value.strip()]
        target_roles = list(dict.fromkeys(target_roles))[:20]
        skills: list[tuple[str, str]] = []
        for skill in candidate.skills:
            skill_id = self._slug(skill.skill_id)[:80]
            if skill_id and skill_id not in {item[0] for item in skills}:
                skills.append((skill_id, skill.relationship))
        if not skills:
            skills = [(skill_id, "related") for skill_id, keywords in SKILL_KEYWORDS.items() if any(keyword in enrichment_text for keyword in keywords)][:30]
        content_hash = hashlib.sha256(f"{source['id']}|{canonical}|{title.lower()}".encode()).hexdigest()
        article_id = f"article_{hashlib.sha256(canonical.encode()).hexdigest()[:20]}"
        values = {
            "id": article_id, "source_id": source["id"], "category": candidate.category, "title": title,
            "excerpt": excerpt, "canonical_url": canonical, "published_at": published.isoformat(), "expires_at": expires.isoformat(),
            "topics_json": json.dumps(topics), "target_roles_json": json.dumps(target_roles), "difficulty": candidate.difficulty,
            "reading_minutes": candidate.reading_minutes, "content_hash": content_hash, "trust_status": trust_status,
            "quarantine_reason": quarantine_reason, "ingestion_run_id": None, "ingested_at": now.isoformat(), "updated_at": now.isoformat(),
        }
        # Filled after the run id is known by the caller. Keep the column nullable so adapters never need to expose it.
        return values, skills

    # ---------- student feed ----------
    def feed(self, student_id: str, view: str = "today") -> FeedResponse:
        now = self._utc(self.now())
        active = self.pathways.current_active(student_id)
        ingestion = self._ingestion_status()
        if view == "today" and active is None:
            return FeedResponse(
                state="no_pathway", message="Create and approve a Career Path before LumaPath ranks daily updates. No generic or fabricated feed is substituted.",
                feed_date=now.date().isoformat(), generated_at=now, pathway=None, ingestion=ingestion, items=[],
                freshness_policy="Only unexpired metadata from approved sources can appear in today's feed.",
            )

        pathway, step, pathway_steps = self._pathway_context(active) if active else (None, None, [])
        feed_date = self._feed_date(active, now)
        if view == "today":
            items = self._today_items(student_id, active, step, pathway_steps, feed_date, now)
        elif view == "saved":
            items = self._collection_items(student_id, "saved", now)
        elif view == "planned":
            items = self._collection_items(student_id, "planned", now)
        else:
            raise HTTPException(status_code=422, detail="Unknown feed view.")

        if items:
            return FeedResponse(
                state="ready", message="Fresh, approved-source updates ranked for your current pathway.", feed_date=feed_date,
                generated_at=now, pathway=pathway, ingestion=ingestion, items=items,
                freshness_policy="Today's feed excludes blocked, reported, quarantined, duplicate and expired content. Saved items are never substituted into today's feed when fresh content is unavailable.",
            )
        if view != "today":
            return FeedResponse(
                state="ready", message="Nothing is in this collection yet.", feed_date=feed_date, generated_at=now,
                pathway=pathway, ingestion=ingestion, items=[], freshness_policy="Saved/planned collections show only content that remains approved and not quarantined.",
            )
        state = "ingestion_failure" if ingestion.state == "degraded" else "no_fresh_content"
        message = (
            "Approved-source ingestion is currently degraded and there is no fresh trusted content to show. LumaPath will not recycle outdated claims."
            if state == "ingestion_failure" else
            "There are no fresh trusted updates for your pathway today. LumaPath will not recycle expired or low-trust content."
        )
        return FeedResponse(
            state=state, message=message, feed_date=feed_date, generated_at=now, pathway=pathway, ingestion=ingestion,
            items=[], freshness_policy="Only unexpired metadata from approved sources can appear in today's feed.",
        )

    def _today_items(self, student_id: str, active, current_step, pathway_steps, feed_date: str, now: datetime) -> list[FeedItem]:
        existing = self.repository.recommendations(student_id, feed_date)
        cache_fresh = bool(existing) and all(row["invalidated_at"] is None for row in existing)
        if existing and cache_fresh and all(
            row["active_pathway_id"] == active["id"] and int(row["pathway_version"]) == int(active["version"])
            and row["ranking_version"] == RANKING_VERSION and row["explanation_version"] == EXPLANATION_VERSION
            for row in existing
        ):
            materialized = self._materialize_recommendations(student_id, existing, now)
            if len(materialized) == len(existing):
                return materialized

        interactions = self.repository.interaction_rows(student_id)
        affinity = self._interaction_affinity(interactions)
        candidates = []
        pathway_skill_ids = {row["skill_id"] for row in pathway_steps}
        skill_names = {row["skill_id"]: row["name"] for row in pathway_steps}
        for article in self.repository.eligible_articles(now.isoformat()):
            state = self.repository.latest_interaction_state(student_id, article["id"])
            if state["dismissed"] or state["reported"]:
                continue
            score, factors = self._score(article, current_step, pathway_skill_ids, active["target_role"], affinity, now)
            if score < 20:
                continue
            explanation = self._explanation(article, current_step, pathway_skill_ids, skill_names, active["target_role"], factors)
            candidates.append((score, article, factors, explanation))
        candidates.sort(key=lambda item: (-item[0], item[1]["published_at"], item[1]["id"]))
        selected = self._diverse_select(candidates)
        created = now.isoformat()
        rows = []
        generation_id = f"feed_{uuid4().hex[:18]}"
        for index, (score, article, factors, explanation) in enumerate(selected, start=1):
            rows.append({
                "id": f"rec_{uuid4().hex[:20]}", "student_id": student_id, "article_id": article["id"], "feed_date": feed_date, "generation_id": generation_id,
                "rank_position": index, "score": round(score, 2), "active_pathway_id": active["id"], "pathway_version": int(active["version"]),
                "target_role": active["target_role"], "active_step_id": current_step["id"] if current_step else None,
                "active_skill_id": current_step["skill_id"] if current_step else None, "ranking_version": RANKING_VERSION,
                "explanation_version": EXPLANATION_VERSION, "explanation": explanation, "factors_json": json.dumps(factors), "created_at": created,
            })
        self.repository.append_recommendations(rows)
        return self._materialize_recommendations(student_id, self.repository.recommendations(student_id, feed_date), now)

    def _collection_items(self, student_id: str, collection: str, now: datetime) -> list[FeedItem]:
        articles = self.repository.saved_or_planned_articles(student_id, planned=collection == "planned", now_iso=now.isoformat())
        items: list[FeedItem] = []
        for article in articles:
            rec = self.repository.recommendation(student_id, article["id"])
            if rec is None:
                continue
            item = self._feed_item(student_id, rec, article, now)
            if item:
                items.append(item)
        return items

    def _materialize_recommendations(self, student_id: str, rows, now: datetime) -> list[FeedItem]:
        result: list[FeedItem] = []
        for rec in rows:
            article = self.repository.article(rec["article_id"])
            if not article or article["trust_status"] != "active" or article["source_trust_status"] != "approved":
                continue
            if self._parse(article["expires_at"]) <= now:
                continue
            state = self.repository.latest_interaction_state(student_id, article["id"])
            if state["dismissed"] or state["reported"]:
                continue
            item = self._feed_item(student_id, rec, article, now)
            if item: result.append(item)
        return result

    def _feed_item(self, student_id: str, rec, article, now: datetime) -> FeedItem | None:
        expires = self._parse(article["expires_at"])
        if expires <= now or article["trust_status"] != "active" or article["source_trust_status"] != "approved":
            return None
        state = self.repository.latest_interaction_state(student_id, article["id"])
        interaction_state = "planned" if state["planned"] else "saved" if state["saved"] else "new"
        skills = [row["skill_id"] for row in self.repository.article_skills(article["id"])]
        return FeedItem(
            recommendation_id=rec["id"], article_id=article["id"], category=article["category"], category_label=CATEGORY_LABELS[article["category"]],
            title=article["title"], excerpt=article["excerpt"], canonical_url=article["canonical_url"],
            source=FeedSource(id=article["source_id"], name=article["source_name"], source_type=article["source_type"], trust_score=int(article["trust_score"]), terms_url=article["terms_url"]),
            published_at=self._parse(article["published_at"]), expires_at=expires, fresh=True,
            topics=json.loads(article["topics_json"]), skills=skills, difficulty=article["difficulty"], reading_minutes=int(article["reading_minutes"]),
            relevance_score=float(rec["score"]), why_this_matters=rec["explanation"], ranking_version=rec["ranking_version"],
            explanation_version=rec["explanation_version"], interaction_state=interaction_state,
        )

    def interact(self, student_id: str, article_id: str, request: InteractionRequest) -> InteractionResponse:
        now = self._utc(self.now())
        article = self.repository.article(article_id)
        if article is None:
            raise HTTPException(status_code=404, detail="Feed item was not found.")
        rec = self.repository.recommendation(student_id, article_id)
        if rec is None:
            raise HTTPException(status_code=409, detail="Only content recommended to this student can be acted on.")
        if request.action != "report" and (article["trust_status"] != "active" or article["source_trust_status"] != "approved"):
            raise HTTPException(status_code=409, detail="This content is no longer available from an approved source.")
        self.repository.record_interaction({
            "student_id": student_id, "article_id": article_id, "action": request.action, "reason": request.reason.strip() or None,
            "recommendation_id": rec["id"], "ranking_version": rec["ranking_version"], "explanation_version": rec["explanation_version"],
            "idempotency_key": None, "metadata_json": "{}", "occurred_at": now.isoformat(),
        })
        if request.action == "report":
            self.repository.quarantine_article(article_id, "student_reported_for_review", now.isoformat())
        feed_date = self._feed_date(self.pathways.current_active(student_id), now)
        self.repository.invalidate_recommendations(student_id, feed_date, now.isoformat())
        state = {"save": "saved", "unsave": "new", "dismiss": "dismissed", "report": "reported"}[request.action]
        message = {
            "save": "Saved for later.", "unsave": "Removed from saved items.", "dismiss": "Dismissed; similar content will receive less weight.",
            "report": "Reported and quarantined from feeds pending review.",
        }[request.action]
        return InteractionResponse(article_id=article_id, action=request.action, state=state, feed_invalidated=True, message=message)

    def add_to_plan(self, student_id: str, article_id: str, request: AddToPlanRequest) -> PlannerHandoffResponse:
        existing = self.repository.planned_interaction_by_key(student_id, request.idempotency_key)
        if existing:
            payload = json.loads(existing["metadata_json"])
            return PlannerHandoffResponse(**payload, idempotent=True)
        now = self._utc(self.now())
        article = self.repository.article(article_id)
        if article is None:
            raise HTTPException(status_code=404, detail="Feed item was not found.")
        if article["trust_status"] != "active" or article["source_trust_status"] != "approved" or self._parse(article["expires_at"]) <= now:
            raise HTTPException(status_code=409, detail="Only fresh content from an approved source can be added to the plan.")
        rec = self.repository.recommendation(student_id, article_id)
        if rec is None:
            raise HTTPException(status_code=409, detail="This item is not part of the student's auditable feed.")
        active = self.pathways.current_active(student_id)
        timezone_name = active["timezone"] if active else "UTC"
        duration = request.duration_minutes or max(20, min(90, int(article["reading_minutes"]) + 10))
        start = self._plan_start(request, duration, timezone_name, now)
        end = start + timedelta(minutes=duration)
        payload = {
            "article_id": article_id, "recommendation_id": rec["id"], "title": f"Review · {article['title']}",
            "start_at": start.isoformat(), "end_at": end.isoformat(), "duration_minutes": duration, "category": "Career",
            "description": f"Approved-source study task from {article['source_name']}. {rec['explanation']}",
            "source": article["source_name"], "source_url": article["canonical_url"], "ranking_version": rec["ranking_version"],
            "explanation_version": rec["explanation_version"],
        }
        self.repository.record_interaction({
            "student_id": student_id, "article_id": article_id, "action": "add_to_plan", "reason": "Student approved planner handoff.",
            "recommendation_id": rec["id"], "ranking_version": rec["ranking_version"], "explanation_version": rec["explanation_version"],
            "idempotency_key": request.idempotency_key, "metadata_json": json.dumps(payload), "occurred_at": now.isoformat(),
        })
        return PlannerHandoffResponse(**payload)

    # ---------- ranking helpers ----------
    def _score(self, article, current_step, pathway_skill_ids: set[str], target_role: str, affinity, now: datetime):
        skills = self.repository.article_skills(article["id"])
        primary = {row["skill_id"] for row in skills if row["relationship"] == "primary"}
        related = {row["skill_id"] for row in skills}
        active_skill = current_step["skill_id"] if current_step else None
        factors: dict[str, float | str | bool] = {}
        skill_score = 0.0
        if active_skill and active_skill in primary: skill_score = 45.0
        elif active_skill and active_skill in related: skill_score = 38.0
        elif related & pathway_skill_ids: skill_score = 22.0
        factors["skill_alignment"] = skill_score

        target_roles = [value.lower() for value in json.loads(article["target_roles_json"])]
        target = target_role.lower().strip()
        role_match = bool(target_roles and any(role in target or target in role for role in target_roles))
        role_score = 15.0 if role_match else (4.0 if not target_roles else 0.0)
        factors["role_alignment"] = role_score

        proficiency = int(current_step["proficiency"]) if current_step else 50
        desired = "beginner" if proficiency < 35 else "intermediate" if proficiency < 70 else "advanced"
        order = {"beginner": 0, "intermediate": 1, "advanced": 2}
        gap = abs(order[article["difficulty"]] - order[desired])
        difficulty_score = 10.0 if gap == 0 else 5.0 if gap == 1 else 0.0
        factors["difficulty_fit"] = difficulty_score
        factors["preferred_difficulty"] = desired

        published = self._parse(article["published_at"])
        expires = self._parse(article["expires_at"])
        lifetime = max(1.0, (expires - published).total_seconds())
        age = max(0.0, (now - published).total_seconds())
        recency_score = max(0.0, 12.0 * (1.0 - age / lifetime))
        factors["freshness"] = round(recency_score, 2)

        trust_score = 10.0 * int(article["trust_score"]) / 100.0
        factors["source_trust"] = round(trust_score, 2)
        topics = json.loads(article["topics_json"])
        preference = affinity["category"].get(article["category"], 0.0) + affinity["source"].get(article["source_id"], 0.0)
        preference += sum(affinity["topic"].get(topic, 0.0) for topic in topics)
        preference = max(-10.0, min(8.0, preference))
        factors["interaction_preference"] = preference
        total = skill_score + role_score + difficulty_score + recency_score + trust_score + preference
        return max(0.0, min(100.0, total)), factors

    def _interaction_affinity(self, rows):
        result = {"category": defaultdict(float), "source": defaultdict(float), "topic": defaultdict(float)}
        delta_map = {"save": 2.5, "unsave": -1.0, "dismiss": -3.0, "report": -6.0, "add_to_plan": 4.0}
        for row in rows:
            delta = delta_map.get(row["action"], 0.0)
            result["category"][row["category"]] += delta
            result["source"][row["source_id"]] += delta * 0.5
            for topic in json.loads(row["topics_json"]): result["topic"][topic] += delta * 0.4
        return result

    def _diverse_select(self, candidates):
        selected = []
        source_counts: Counter[str] = Counter()
        category_counts: Counter[str] = Counter()
        for candidate in candidates:
            article = candidate[1]
            if source_counts[article["source_id"]] >= self.per_source_limit: continue
            if category_counts[article["category"]] >= self.per_category_limit: continue
            selected.append(candidate); source_counts[article["source_id"]] += 1; category_counts[article["category"]] += 1
            if len(selected) >= self.daily_limit: break
        return selected

    def _explanation(self, article, current_step, pathway_skill_ids: set[str], skill_names: dict[str, str], target_role: str, factors: dict) -> str:
        article_skills = [row["skill_id"] for row in self.repository.article_skills(article["id"])]
        active_skill = current_step["skill_id"] if current_step else None
        pieces: list[str] = []
        if active_skill and active_skill in article_skills:
            pieces.append(f"{current_step['name']} is your current pathway step")
        else:
            related = next((skill for skill in article_skills if skill in pathway_skill_ids), None)
            if related:
                pieces.append(f"it supports your {skill_names.get(related, related)} pathway milestone")
        if float(factors.get("role_alignment", 0)) >= 15:
            pieces.append(f"it is explicitly relevant to your {target_role} target")
        pieces.append(f"the {article['difficulty']} difficulty fits your current learning stage")
        pieces.append(f"the source is approved with a {int(article['trust_score'])}/100 trust score")
        return "This matters because " + ", and ".join(pieces) + "."

    def _pathway_context(self, active):
        rows = self.pathways.steps(active["id"])
        current = next((row for row in rows if row["state"] == "in_progress"), None)
        if current is None: current = next((row for row in rows if row["state"] == "available"), None)
        if current is None: current = next((row for row in rows if row["state"] not in {"completed", "credited"}), None)
        step = FeedPathwayStep(id=current["id"], skill_id=current["skill_id"], name=current["name"], state=current["state"], proficiency=int(current["proficiency"])) if current else None
        return FeedPathwayContext(pathway_id=active["id"], pathway_version=int(active["version"]), target_role=active["target_role"], current_step=step), current, rows

    def _ingestion_status(self) -> FeedIngestionStatus:
        runs = self.repository.latest_ingestion_runs()
        if not runs:
            return FeedIngestionStatus(state="never_run", message="Approved-source ingestion has not run yet.")
        latest_attempt = max(self._parse(row["started_at"]) for row in runs)
        successes = [self._parse(row["completed_at"]) for row in runs if row["status"] == "succeeded" and row["completed_at"]]
        failed = [row for row in runs if row["status"] == "failed"]
        return FeedIngestionStatus(
            state="degraded" if failed else "healthy", last_success_at=max(successes) if successes else None,
            last_attempt_at=latest_attempt, failed_sources=len(failed),
            message=(f"{len(failed)} approved source(s) failed their latest ingestion attempt." if failed else "Approved-source ingestion is healthy."),
        )

    def _plan_start(self, request: AddToPlanRequest, duration: int, timezone_name: str, now: datetime) -> datetime:
        try: zone = ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError: zone = timezone.utc
        blocks = [(self._utc(block.start_at), self._utc(block.end_at)) for block in request.existing_blocks]
        if request.preferred_start_at:
            start = self._utc(request.preferred_start_at); end = start + timedelta(minutes=duration)
            if start <= now: raise HTTPException(status_code=422, detail="Planner start must be in the future.")
            if any(start < b_end and end > b_start for b_start, b_end in blocks):
                raise HTTPException(status_code=409, detail="The requested study block overlaps an existing planner item.")
            return start
        local_now = now.astimezone(zone)
        for day_offset in range(1, 8):
            local_day = (local_now + timedelta(days=day_offset)).date()
            for hour, minute in ((18, 0), (19, 0), (20, 0)):
                local_start = datetime.combine(local_day, datetime.min.time(), tzinfo=zone).replace(hour=hour, minute=minute)
                start = local_start.astimezone(timezone.utc); end = start + timedelta(minutes=duration)
                if not any(start < b_end and end > b_start for b_start, b_end in blocks): return start
        raise HTTPException(status_code=409, detail="No conflict-free evening study slot was found in the next seven days. Open Planner and choose a time manually.")

    def _feed_date(self, active, now: datetime) -> str:
        if not active: return now.date().isoformat()
        try: zone = ZoneInfo(active["timezone"])
        except ZoneInfoNotFoundError: zone = timezone.utc
        return now.astimezone(zone).date().isoformat()

    @staticmethod
    def _canonicalize(url: str, allowed_domains: set[str]) -> str | None:
        try: parts = urlsplit(url.strip())
        except ValueError: return None
        if parts.scheme.lower() != "https" or not parts.hostname or parts.username or parts.password: return None
        host = parts.hostname.lower().rstrip(".")
        if not any(host == domain or host.endswith(f".{domain}") for domain in allowed_domains): return None
        query = []
        for key, value in parse_qsl(parts.query, keep_blank_values=True):
            lower = key.lower()
            if lower in TRACKING_QUERY_KEYS or any(lower.startswith(prefix) for prefix in TRACKING_QUERY_PREFIXES): continue
            query.append((key, value))
        query.sort()
        path = re.sub(r"/{2,}", "/", parts.path or "/")
        if path != "/": path = path.rstrip("/")
        try:
            port = parts.port
        except ValueError:
            return None
        netloc = host if not port or port == 443 else f"{host}:{port}"
        return urlunsplit(("https", netloc, path, urlencode(query), ""))

    @staticmethod
    def _plain_text(value: str, limit: int) -> str:
        if limit <= 0: return ""
        text = re.sub(r"<[^>]+>", " ", value)
        text = " ".join(text.split())
        return text[:limit]

    @staticmethod
    def _unsafe(value: str) -> bool:
        lower = value.lower()
        return any(marker in lower for marker in UNSAFE_TEXT_MARKERS)

    @staticmethod
    def _slug(value: str) -> str:
        return re.sub(r"[^a-z0-9]+", "-", value.strip().lower()).strip("-")

    @staticmethod
    def _safe_code(value: str) -> str:
        cleaned = re.sub(r"[^a-z0-9_\-]+", "_", value.lower())[:80]
        return cleaned or "upstream_failure"

    @staticmethod
    def _safe_error(value: str) -> str:
        text = " ".join(value.split())
        return text[:300] or "Approved source ingestion failed."

    @staticmethod
    def _utc(value: datetime) -> datetime:
        if value.tzinfo is None: return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)

    @staticmethod
    def _parse(value: str) -> datetime:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed.astimezone(timezone.utc)
