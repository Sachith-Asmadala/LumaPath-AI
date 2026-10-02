import { proxyAnalytics } from "@/features/analytics/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyAnalytics(request, "/v1/analytics/sync"); }
