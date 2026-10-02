import { proxyStudentMarketTaxonomy } from "@/features/market-taxonomy/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request,{params}:{params:Promise<{roleId:string}>}){const {roleId}=await params;return proxyStudentMarketTaxonomy(request,`/v1/market-taxonomy/student/profile-comparison/${encodeURIComponent(roleId)}`);}
