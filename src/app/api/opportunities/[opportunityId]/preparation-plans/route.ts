import { proxyOpportunities } from "@/features/opportunities/server/fastapi-proxy";
export async function POST(request:Request,{params}:{params:Promise<{opportunityId:string}>}){const {opportunityId}=await params;return proxyOpportunities(request,`/v1/opportunities/${encodeURIComponent(opportunityId)}/preparation-plans`);}
