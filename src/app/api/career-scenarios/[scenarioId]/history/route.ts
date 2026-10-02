import { proxyCareerScenarios } from "@/features/career-scenarios/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ scenarioId: string }> }) {
  const { scenarioId } = await params;
  return proxyCareerScenarios(request, `/v1/career-scenarios/${encodeURIComponent(scenarioId)}/history`);
}
