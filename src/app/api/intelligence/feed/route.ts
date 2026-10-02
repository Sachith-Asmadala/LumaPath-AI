import { proxyIntelligence } from "@/features/intelligence/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyIntelligence(request, "/v1/intelligence/feed"); }
