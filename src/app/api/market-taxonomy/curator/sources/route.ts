import { proxyCuratorMarketTaxonomy } from "@/features/market-taxonomy/server/fastapi-proxy";
export const dynamic="force-dynamic";
export async function GET(request:Request){return proxyCuratorMarketTaxonomy(request,"/v1/market-taxonomy/sources");}
