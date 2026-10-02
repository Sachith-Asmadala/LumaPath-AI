import { proxyInstitutionalAnalytics } from "@/features/institutional-analytics/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyInstitutionalAnalytics(request, "/v1/institutional-analytics/cohorts"); }
