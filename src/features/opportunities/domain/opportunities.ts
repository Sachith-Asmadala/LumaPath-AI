export type OpportunityCategory = "internship" | "hackathon" | "competition" | "workshop" | "scholarship" | "certification" | "university_event";
export type EligibilityStatus = "met" | "unmet" | "unknown";
export type OpportunityTrackingStatus = "interested" | "preparing" | "applied" | "follow_up" | "result";

export interface RankingFactor { key:string; label:string; points:number; max_points:number; explanation:string; }
export interface RequirementEvidence { source_type:"pathway"|"evidence_passport"|"student_context"|"student_profile"; label:string; reference:string; verification:string|null; }
export interface EligibilityCheck { requirement_id:string; key:string; label:string; kind:"skill"|"profile"; status:EligibilityStatus; explanation:string; evidence:RequirementEvidence[]; source_text:string; source_reference:string; required:boolean; }
export interface SourceValidation { validation_id:string; status:"trusted"|"untrusted"|"stale"|"expired"|"quarantined"|"reported"; last_verified_at:string; freshness_expires_at:string; opportunity_expires_on:string|null; detail:string; }
export interface ApplicationTracking { id:string; opportunity_id:string; status:OpportunityTrackingStatus; result:string|null; follow_up_at:string|null; source_validation_id:string|null; source_status:SourceValidation["status"]; active_deadline_alerts_allowed:boolean; updated_at:string; }

export interface OpportunityItem {
  id:string; category:OpportunityCategory; title:string; provider:string; summary:string; starts_on:string|null; closes_on:string|null;
  location_mode:string; location:string|null; cost_type:string; cost_amount:number|null; currency:string|null; required_skills:string[]; useful_skills:string[];
  source_url:string; source_name:string; source_checked_at:string; freshness_status:"fresh"|"stale"; trust_status:"verified"|"curated"|"untrusted"|"quarantined";
  source_validation:SourceValidation; requirement_version:string; application_steps:string[];
  sponsored:boolean; sponsor_name:string|null; rank_score:number|null; ranking_factors:RankingFactor[]; strengths:string[]; skill_gaps:string[];
  eligibility_status:EligibilityStatus; eligibility_checks:EligibilityCheck[]; eligibility_evaluation_id:string; missing_eligibility_data:string[]; why_fit:string|null; feedback_effect:string|null;
  saved:boolean; dismissed:boolean; reported:boolean; tracking:ApplicationTracking|null;
}

export interface OpportunityBrowseResponse { personalized:boolean; generated_at:string; catalogue_version:string; eligibility_engine_version:string; items:OpportunityItem[]; excluded_expired:number; excluded_untrusted:number; excluded_stale:number; message:string; }
export interface OpportunityContext {
  target_role?:string|null; readiness_score?:number|null; skills:{skill_id:string;level:number;demonstrated:boolean}[];
  preferences:{preferred_types:OpportunityCategory[];location_modes:("online"|"onsite"|"hybrid")[];cost_preference:"free_only"|"paid_ok"|"any"};
  eligibility:{student_status?:"undergraduate"|"graduate"|"other"|null;country?:string|null;academic_year?:string|null};
}

export interface PreparationPlanAction { opportunity_id:string; action_id:string; title:string; start_at:string; end_at:string; category:"Career"; source:string; description:string; idempotency_key:string; }
export interface PreparationChecklistItem { id:string; requirement_id:string|null; kind:"gap"|"verification"|"application_step"; title:string; rationale:string; estimated_minutes:number; suggested_start_at:string|null; suggested_end_at:string|null; editable:boolean; scheduled:boolean; }
export interface PreparationPlan { id:string; opportunity_id:string; status:"draft"|"approved"|"invalidated"; proposal_version:string; requirement_version:string; eligibility_evaluation_id:string; source_validation_id:string; deadline:string|null; generated_at:string; approved_at:string|null; items:PreparationChecklistItem[]; warnings:string[]; }
export interface PreparationApprovalItem { item_id:string; include:boolean; title:string; duration_minutes:number; start_at:string|null; }
export interface PreparationPlannerAction { plan_item_id:string; action_id:string; title:string; start_at:string; end_at:string; category:"Career"; source:string; description:string; idempotency_key:string; }
export interface PreparationApproval { plan_id:string; opportunity_id:string; status:"approved"; newly_approved:boolean; actions:PreparationPlannerAction[]; warnings:string[]; }
export interface InternshipHandoff { opportunity_id:string; source_reference:string; company:string; role:string; source_url:string; deadline:string|null; requirements:string[]; }
export const OPPORTUNITY_CATEGORIES: OpportunityCategory[]=["internship","hackathon","competition","workshop","scholarship","certification","university_event"];
export const OPPORTUNITY_TRACKING_STATUSES: OpportunityTrackingStatus[]=["interested","preparing","applied","follow_up","result"];
