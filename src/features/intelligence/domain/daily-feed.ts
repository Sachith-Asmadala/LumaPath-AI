export type ContentCategory = "learning_article" | "official_release" | "security_update" | "industry_news" | "certification_change";
export type FeedView = "today" | "saved" | "planned";

export interface FeedSource {
  id: string;
  name: string;
  source_type: string;
  trust_score: number;
  terms_url: string;
}

export interface FeedPathwayStep {
  id: string;
  skill_id: string;
  name: string;
  state: string;
  proficiency: number;
}

export interface FeedPathwayContext {
  pathway_id: string;
  pathway_version: number;
  target_role: string;
  current_step: FeedPathwayStep | null;
}

export interface FeedIngestionStatus {
  state: "healthy" | "degraded" | "never_run";
  last_success_at: string | null;
  last_attempt_at: string | null;
  failed_sources: number;
  message: string;
}

export interface DailyFeedItem {
  recommendation_id: string;
  article_id: string;
  category: ContentCategory;
  category_label: string;
  title: string;
  excerpt: string;
  canonical_url: string;
  source: FeedSource;
  published_at: string;
  expires_at: string;
  fresh: boolean;
  topics: string[];
  skills: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  reading_minutes: number;
  relevance_score: number;
  why_this_matters: string;
  ranking_version: string;
  explanation_version: string;
  interaction_state: "new" | "saved" | "planned";
}

export interface DailyFeedResponse {
  state: "ready" | "no_pathway" | "no_fresh_content" | "ingestion_failure";
  message: string;
  feed_date: string;
  generated_at: string;
  pathway: FeedPathwayContext | null;
  ingestion: FeedIngestionStatus;
  items: DailyFeedItem[];
  freshness_policy: string;
}

export interface FeedInteractionResponse {
  article_id: string;
  action: "save" | "unsave" | "dismiss" | "report";
  state: "new" | "saved" | "dismissed" | "reported";
  feed_invalidated: boolean;
  message: string;
}

export interface PlannerHandoff {
  article_id: string;
  recommendation_id: string;
  title: string;
  start_at: string;
  end_at: string;
  duration_minutes: number;
  category: "Career";
  description: string;
  source: string;
  source_url: string;
  ranking_version: string;
  explanation_version: string;
  idempotent: boolean;
}
