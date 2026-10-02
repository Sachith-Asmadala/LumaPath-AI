import { proxyAnalytics } from "@/features/analytics/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ metric: string }> }) {
  const { metric } = await context.params;
  return proxyAnalytics(request, `/v1/analytics/metrics/${encodeURIComponent(metric)}`);
}
