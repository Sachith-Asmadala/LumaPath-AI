export interface CareerScenarioRole { id:string; name:string; version:string; level:string; description:string; quality_status:string; skill_count:number; }
export interface ScenarioPreferences { language:string; formats:string[]; }
export interface SnapshotEvidence { skill_id:string; skill_name:string; proficiency:number; confidence:number; credited:boolean; evidence_refs:string[]; uncertainty:string|null; }
export interface SkillComparison { skill_id:string; name:string; required_proficiency:number; current_proficiency:number; confidence:number; credited:boolean; shared:boolean; unique_to_role:boolean; prerequisites:string[]; remaining_prerequisites:string[]; estimated_minutes_min:number; estimated_minutes_max:number; evidence_refs:string[]; uncertainty:string|null; }
export type TargetFit="likely_fits"|"uncertain"|"unlikely"|"not_computable";
export interface DurationEstimate { weeks_min:number|null; weeks_max:number|null; weekly_learning_minutes:number; target_date:string|null; target_fit:TargetFit; available_weeks:number|null; explanation:string; }
export interface RouteResource { skill_id:string; resource_id:string; title:string; source:string; source_url:string|null; cost_type:string|null; price_usd:number|null; format:string|null; }
export interface CostRoute { route_type:"free"|"low_cost"|"certification_focused"; known_cost_min_usd:number; known_cost_max_usd:number|null; planning_budget_max_usd:number|null; unknown_price_count:number; resources:RouteResource[]; assumptions:string[]; missing_data:string[]; }
export interface RoleScenarioResult { role_id:string; role_name:string; role_version:string; shared_skill_ids:string[]; unique_skill_ids:string[]; transferable_skill_ids:string[]; remaining_skill_ids:string[]; skills:SkillComparison[]; effort_hours_min:number; effort_hours_max:number; duration:DurationEstimate; routes:CostRoute[]; reusable_evidence:SnapshotEvidence[]; assumptions:string[]; missing_data:string[]; }
export interface ScenarioInputs { role_ids:string[]; taxonomy_version:string; active_pathway_id:string|null; active_pathway_version:number|null; active_target_role:string|null; weekly_learning_minutes:number; target_date:string|null; preferences:ScenarioPreferences; context_refreshed:boolean; }
export interface ScenarioResult { id:string; scenario_id:string; created_at:string; inputs:ScenarioInputs; shared_skill_ids:string[]; roles:RoleScenarioResult[]; assumptions:string[]; uncertainty:string[]; active_pathway_unchanged:boolean; disclaimer:string; }
export interface ScenarioView { id:string; status:"disposable"|"saved"; role_ids:string[]; created_at:string; saved_at:string|null; latest_result:ScenarioResult; }
export interface SwitchDraftResponse { scenario_id:string; result_id:string; target_role:string; draft_pathway_id:string; draft_pathway_version:number; draft_status:string; active_pathway_id:string|null; active_pathway_version:number|null; active_pathway_unchanged:boolean; transferable_skill_ids:string[]; approval_required:boolean; explanation:string; }

export async function scenarioRequest<T>(path:string,studentId:string,init?:RequestInit):Promise<T>{
 const response=await fetch(path,{...init,cache:"no-store",headers:{"X-Luma-Student-Id":studentId,...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers??{})}});
 const body=await response.json().catch(()=>({})); if(!response.ok)throw new Error(body.detail??"Career scenario request failed."); return body as T;
}
