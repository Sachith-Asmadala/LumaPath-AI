import type { AchievementDashboard, AchievementPreferenceUpdate } from "@/features/achievements/domain/achievements";

class AchievementApiError extends Error { constructor(message:string, readonly status?:number){ super(message); this.name="AchievementApiError"; } }
async function api(path:string, studentId:string, init:RequestInit={}):Promise<AchievementDashboard>{
  const controller=new AbortController(); const timeout=window.setTimeout(()=>controller.abort(),12000);
  try{
    const headers=new Headers(init.headers); headers.set("X-Luma-Student-Id",studentId); if(init.body) headers.set("Content-Type","application/json");
    const response=await fetch(path,{...init,headers,signal:controller.signal,cache:"no-store"});
    const body=await response.json().catch(()=>null) as (AchievementDashboard & {detail?:string})|null;
    if(!response.ok) throw new AchievementApiError(body?.detail ?? `Achievement request failed (${response.status}).`,response.status);
    return body as AchievementDashboard;
  }catch(error){
    if(error instanceof AchievementApiError) throw error;
    if(error instanceof DOMException && error.name==="AbortError") throw new AchievementApiError("Achievement service timed out. No progress was fabricated.");
    throw new AchievementApiError("Achievement service is unavailable. Your tasks, plans and evidence are unchanged.");
  }finally{ window.clearTimeout(timeout); }
}
export const getAchievements=(studentId:string)=>api("/api/achievements",studentId);
export const evaluateAchievements=(studentId:string)=>api("/api/achievements/evaluate",studentId,{method:"POST"});
export const updateAchievementPreferences=(studentId:string,input:AchievementPreferenceUpdate)=>api("/api/achievements/preferences",studentId,{method:"PUT",body:JSON.stringify(input)});
