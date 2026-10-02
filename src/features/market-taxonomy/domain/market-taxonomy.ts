export type SignalLabel = "emerging" | "stable" | "declining";
export type ProposalStatus = "draft" | "review" | "approved" | "rejected";

export interface MarketGovernance {
  methodology_version: string;
  minimum_sample_size: number;
  minimum_source_count: number;
  publication_confidence: number;
  emerging_delta_threshold: number;
  declining_delta_threshold: number;
  source_rules: string[];
  ai_rule: string;
}

export interface MarketSource {
  id: string; name: string; source_type: string; canonical_url: string; licensing_policy: string;
  trust_score: number; status: string; bias_review_status: string; regions: string[];
  retention_days: number; max_age_days: number; created_at: string; updated_at: string;
}

export interface SignalObservation {
  id: string; source_id: string; source_name: string; source_type: "job_aggregate" | "certification_objectives" | "technology_source"; period_start: string; period_end: string;
  observed_at: string; sample_size: number; skill_share: number; provenance_url: string;
}

export interface SkillSignal {
  id: string; role_id: string; skill_id: string; profile_scope: "international" | "regional"; region_code: string | null;
  label: SignalLabel; delta: number; recent_share: number; prior_share: number; sample_size: number; source_count: number;
  confidence: number; recency_days: number; methodology_version: string; methodology: string; source_ids: string[];
  observation_ids: string[]; observations: SignalObservation[]; publication_eligible: boolean; limitations: string[];
  created_at: string; expires_at: string;
}

export interface ChangeProposal {
  id: string; signal_id: string; base_version: string; candidate_version: string | null; role_id: string; role_name: string; skill_id: string; skill_name: string;
  profile_scope: "international" | "regional"; region_code: string | null; change_type: string;
  current_required_proficiency: number | null; proposed_required_proficiency: number | null; impact_level: "low" | "high";
  status: ProposalStatus; observed_signal: SignalLabel; signal_confidence: number; rationale: string; created_by: string;
  created_at: string; decided_at: string | null; decision_rationale: string | null; resulting_version: string | null;
}

export interface TaxonomyVersion {
  version: string; status: "draft" | "review" | "approved" | "retired"; profile_scope: "international" | "regional";
  region_code: string | null; parent_version: string | null; methodology_version: string; change_summary: string;
  created_by: string; created_at: string; approved_by: string | null; approved_at: string | null; retired_at: string | null; is_default: boolean;
}

export interface ProfileSkill { skill_id: string; name: string; required_proficiency: number; estimated_minutes: number; prerequisites: string[]; }
export interface ProfileRole { role_id: string; role_name: string; version: string; profile_scope: "international" | "regional"; region_code: string | null; skills: ProfileSkill[]; }
export interface ProfileComparison { role_id: string; international: ProfileRole; regional: ProfileRole | null; notes: string[]; }

export interface ImpactChange {
  skill_id: string; skill_name: string; change: string; before_required_proficiency: number | null;
  after_required_proficiency: number | null; completed_credit_preserved: boolean;
}
export interface StudentTaxonomyUpdate {
  id: string; pathway_id: string; target_role: string; from_version: string; to_version: string; proposal_id: string;
  explanation: string; changes: ImpactChange[]; status: "pending" | "kept_current" | "recalculation_drafted" | "dismissed";
  created_at: string; decided_at: string | null; draft_pathway_id: string | null;
}

export interface CareerRoleOption { id: string; name: string; version: string; }

export function isArrayOfObjects(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null);
}
