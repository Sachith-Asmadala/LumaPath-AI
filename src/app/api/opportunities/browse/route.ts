import { proxyOpportunities } from "@/features/opportunities/server/fastapi-proxy";
export async function POST(request:Request){return proxyOpportunities(request,"/v1/opportunities/browse");}
