import { proxyStudentMarketTaxonomy } from "@/features/market-taxonomy/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request){return proxyStudentMarketTaxonomy(request,"/v1/market-taxonomy/student/updates");}
