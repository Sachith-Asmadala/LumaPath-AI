import { proxyInstitutionalAnalytics } from "@/features/institutional-analytics/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ cohortId: string }> }) {
  const { cohortId } = await context.params;
  return proxyInstitutionalAnalytics(request, `/v1/institutional-analytics/cohorts/${encodeURIComponent(cohortId)}/refresh`);
}
