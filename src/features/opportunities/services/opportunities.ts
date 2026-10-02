import { apiErrorMessage } from "@/features/subscriptions/entitlements";
import type {
  ApplicationTracking,
  InternshipHandoff,
  OpportunityBrowseResponse,
  OpportunityCategory,
  OpportunityContext,
  OpportunityTrackingStatus,
  PreparationApproval,
  PreparationApprovalItem,
  PreparationPlan,
  PreparationPlanAction,
} from "@/features/opportunities/domain/opportunities";

export class OpportunityApiError extends Error { constructor(message:string,readonly status?:number){super(message);this.name="OpportunityApiError";} }

async function api(path:string,studentId:string,init:RequestInit={}){
  const controller=new AbortController(); const timer=window.setTimeout(()=>controller.abort(),12_000);
  try {
    const headers=new Headers(init.headers); headers.set("X-Luma-Student-Id",studentId); if(init.body) headers.set("Content-Type","application/json");
    const response=await fetch(path,{...init,headers,signal:controller.signal,cache:"no-store"}); const body=await response.json().catch(()=>null) as {detail?:string}|null;
    if(!response.ok) throw new OpportunityApiError(apiErrorMessage(body, `Opportunity request failed (${response.status}).`),response.status); return body;
  } catch(error){
    if(error instanceof OpportunityApiError) throw error;
    if(error instanceof DOMException&&error.name==="AbortError") throw new OpportunityApiError("Opportunity service timed out. No feedback, application state or plan data was changed.");
    throw new OpportunityApiError("Opportunity service is unavailable. Start the LumaPath API and try again.");
  } finally{window.clearTimeout(timer);}
}

export async function browseOpportunities(studentId:string,payload:{context?:OpportunityContext;categories?:OpportunityCategory[]}):Promise<OpportunityBrowseResponse>{ return api("/api/opportunities/browse",studentId,{method:"POST",body:JSON.stringify(payload)}) as Promise<OpportunityBrowseResponse>; }
export async function opportunityInteraction(studentId:string,id:string,action:"save"|"unsave"|"dismiss"|"report",reason?:string){ return api(`/api/opportunities/${encodeURIComponent(id)}/interactions`,studentId,{method:"POST",body:JSON.stringify({action,reason})}); }
export async function opportunityPlanAction(studentId:string,id:string,payload:Record<string,unknown>):Promise<PreparationPlanAction>{ return api(`/api/opportunities/${encodeURIComponent(id)}/plan-action`,studentId,{method:"POST",body:JSON.stringify(payload)}) as Promise<PreparationPlanAction>; }
export async function proposeOpportunityPreparation(studentId:string,id:string,payload:{eligibility_evaluation_id:string;timezone:string;daily_available_minutes:number;existing_blocks:{id:string;start_at:string;end_at:string}[]}):Promise<PreparationPlan>{ return api(`/api/opportunities/${encodeURIComponent(id)}/preparation-plans`,studentId,{method:"POST",body:JSON.stringify(payload)}) as Promise<PreparationPlan>; }
export async function approveOpportunityPreparation(studentId:string,id:string,planId:string,payload:{confirmed:boolean;items:PreparationApprovalItem[];existing_blocks:{id:string;start_at:string;end_at:string}[]}):Promise<PreparationApproval>{ return api(`/api/opportunities/${encodeURIComponent(id)}/preparation-plans/${encodeURIComponent(planId)}/approve`,studentId,{method:"POST",body:JSON.stringify(payload)}) as Promise<PreparationApproval>; }
export async function updateOpportunityTracking(studentId:string,id:string,payload:{status:OpportunityTrackingStatus;result?:string|null;follow_up_at?:string|null}):Promise<ApplicationTracking>{ return api(`/api/opportunities/${encodeURIComponent(id)}/tracking`,studentId,{method:"PUT",body:JSON.stringify(payload)}) as Promise<ApplicationTracking>; }
export async function opportunityInternshipHandoff(studentId:string,id:string):Promise<InternshipHandoff>{ return api(`/api/opportunities/${encodeURIComponent(id)}/internship-handoff`,studentId) as Promise<InternshipHandoff>; }
