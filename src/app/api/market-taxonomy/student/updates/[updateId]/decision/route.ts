import { proxyStudentMarketTaxonomy } from "@/features/market-taxonomy/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{updateId:string}>}){const {updateId}=await params;return proxyStudentMarketTaxonomy(request,`/v1/market-taxonomy/student/updates/${encodeURIComponent(updateId)}/decision`);}
