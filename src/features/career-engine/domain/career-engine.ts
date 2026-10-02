import type { DemoState } from "@/data/demo/types";

export interface CareerRoleSummaryView { id:string; name:string; version:string; level:string; description:string; quality_status:string; skill_count:number; }
export interface RoleSkillRequirementView { skill_id:string; name:string; required_proficiency:number; prerequisites:string[]; estimated_minutes:number; recommended_evidence:string[]; }
export interface CareerRoleDetailView extends CareerRoleSummaryView { skills:RoleSkillRequirementView[]; }
export type EvidenceSource="self_assessment"|"quiz"|"certificate"|"manual_project"|"repository"|"live_demo"|"mentor_validation"|"assessment"|"cv"|"pathway_completion";
export interface SkillEvidenceView { id:string; source_type:EvidenceSource; verification_status:"self_reported"|"observed"|"verified"|"student_confirmed"; proficiency:number; confidence:number; source_ref:string; source_label:string; observed_at:string; }
export interface StudentSkillView { skill_id:string; name:string; proficiency:number; confidence:number; required_proficiency:number; gap:number; meets_requirement:boolean; evidence:SkillEvidenceView[]; uncertainty:string|null; }
export interface SkillAssessmentView { id:string; target_role:string; taxonomy_version:string; created_at:string; skills:StudentSkillView[]; gap_order:string[]; conflicting_skills:string[]; disclaimer:string; }
export interface SkillResourceView { id:string; skill_id:string; title:string; source:string; source_url:string|null; resource_type:"course"|"certificate"|"tutorial"|"project"; quality_score:number; cost_type:string|null; price_usd:number|null; language:string|null; format:string|null; estimated_minutes:number|null; fit_score:number; ranking_factors:string[]; metadata_complete:boolean; quality_note:string; }
export interface SkillResourcesView { skill_id:string; taxonomy_version:string; resources:SkillResourceView[]; missing_metadata_warning:boolean; }

const baselineIdByName:Record<string,string>={Linux:"linux",Git:"git",Networking:"networking",Docker:"docker","CI/CD":"cicd",Cloud:"cloud"};

export function buildAssessmentPayload(state:DemoState,role:CareerRoleDetailView){
 const allowed=new Set(role.skills.map((skill)=>skill.skill_id));
 const self_assessments=state.careerSkills.filter((skill)=>allowed.has(skill.id)).map((skill)=>({skill_id:skill.id,proficiency:Math.max(0,Math.min(100,skill.proficiency)),confidence:0.35}));
 const quiz_evidence=state.assessment?Object.entries(state.assessment.skillScores).flatMap(([name,score])=>{const skill_id=baselineIdByName[name]; return skill_id&&allowed.has(skill_id)?[{skill_id,score,quiz_id:`baseline:${state.assessment?.overallScore ?? 0}:${skill_id}`}]:[];}):[];
 return {target_role:role.name,self_assessments,quiz_evidence,certificate_evidence:[],include_portfolio_evidence:true,include_cv_evidence:true};
}

export async function careerRequest<T>(path:string,studentId:string,init?:RequestInit):Promise<T>{
 const response=await fetch(path,{...init,cache:"no-store",headers:{"X-Luma-Student-Id":studentId,...(init?.body?{"Content-Type":"application/json"}:{}),...(init?.headers??{})}});
 const body=await response.json().catch(()=>({})); if(!response.ok)throw new Error(body.detail??"Career engine request failed."); return body as T;
}
