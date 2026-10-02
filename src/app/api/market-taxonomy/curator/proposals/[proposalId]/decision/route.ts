import { proxyCuratorMarketTaxonomy } from "@/features/market-taxonomy/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{proposalId:string}>}){const {proposalId}=await params;return proxyCuratorMarketTaxonomy(request,`/v1/market-taxonomy/proposals/${encodeURIComponent(proposalId)}/decision`);}
