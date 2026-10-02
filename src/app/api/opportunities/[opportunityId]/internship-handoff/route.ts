import { proxyOpportunities } from "@/features/opportunities/server/fastapi-proxy";
export async function GET(request:Request,{params}:{params:Promise<{opportunityId:string}>}){const {opportunityId}=await params;return proxyOpportunities(request,`/v1/opportunities/${encodeURIComponent(opportunityId)}/internship-handoff`);}
