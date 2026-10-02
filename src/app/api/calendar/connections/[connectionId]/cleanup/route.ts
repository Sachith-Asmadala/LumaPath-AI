import { proxyCalendar } from "@/features/calendar/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) { const { connectionId } = await params; return proxyCalendar(request, `/v1/calendar/connections/${encodeURIComponent(connectionId)}/cleanup`); }
