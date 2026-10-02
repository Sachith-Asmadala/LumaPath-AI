import { proxyCalendar } from "@/features/calendar/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) { const { runId } = await params; return proxyCalendar(request, `/v1/calendar/sync-runs/${encodeURIComponent(runId)}/commit`); }
