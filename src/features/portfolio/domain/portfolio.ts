export type VerificationStatus = "self_reported" | "observed" | "not_demonstrated";
export type RecommendationStatus = "proposed" | "accepted" | "dismissed";

export interface PortfolioFacts {
  technologies: string[];
  languages: string[];
  topics: string[];
  has_readme: boolean;
  has_tests: boolean;
  has_documentation: boolean;
  has_ci: boolean;
  has_docker: boolean;
  has_iac: boolean;
  has_kubernetes: boolean;
  has_monitoring: boolean;
  last_activity_at: string | null;
}

export interface PortfolioIndicator {
  key: string;
  label: string;
  points: number;
  max_points: number;
  satisfied: boolean;
  evidence: string;
}

export interface PortfolioSkillEvidence {
  skill_id: string;
  skill_name: string;
  status: VerificationStatus;
  confidence: number;
  evidence: string[];
  source_type: "manual_project" | "repository_snapshot";
  source_timestamp: string;
}

export interface PortfolioRecommendation {
  id: string;
  kind: "improvement" | "description" | "project_idea";
  priority: "high" | "medium" | "low";
  title: string;
  rationale: string;
  evidence_refs: string[];
  editable_text: string | null;
  status: RecommendationStatus;
}

export interface ExternalRepository {
  id: string;
  provider: string;
  external_repository_id: string;
  full_name: string;
  repository_url: string;
  live_demo_url: string | null;
  visibility: string;
  access_status: "active" | "revoked";
  collected_at: string;
  imported_at: string;
  revoked_at: string | null;
  stale: boolean;
  facts: PortfolioFacts;
}

export interface PortfolioAnalysis {
  id: string;
  project_id: string;
  target_role: string;
  source_kind: "manual" | "repository";
  source_repository_id: string | null;
  source_timestamp: string;
  analyzed_at: string;
  completeness_score: number;
  indicators: PortfolioIndicator[];
  demonstrated_skills: PortfolioSkillEvidence[];
  not_demonstrated_skills: PortfolioSkillEvidence[];
  recommendations: PortfolioRecommendation[];
  factual_description: string;
  stale: boolean;
  disclaimer: string;
}

export interface PortfolioProject {
  id: string;
  owner_id: string;
  title: string;
  description: string;
  target_role: string;
  project_url: string | null;
  live_demo_url: string | null;
  facts: PortfolioFacts;
  created_at: string;
  updated_at: string;
  repositories: ExternalRepository[];
  latest_analysis: PortfolioAnalysis | null;
}

export interface PortfolioProjectInput {
  title: string;
  description: string;
  target_role: string;
  project_url: string | null;
  live_demo_url: string | null;
  facts: PortfolioFacts;
}

export const emptyPortfolioFacts = (): PortfolioFacts => ({
  technologies: [], languages: [], topics: [], has_readme: false, has_tests: false,
  has_documentation: false, has_ci: false, has_docker: false, has_iac: false,
  has_kubernetes: false, has_monitoring: false, last_activity_at: null,
});

export function isPortfolioProject(value: unknown): value is PortfolioProject {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PortfolioProject>;
  return typeof item.id === "string" && typeof item.title === "string" && typeof item.target_role === "string" && !!item.facts;
}
