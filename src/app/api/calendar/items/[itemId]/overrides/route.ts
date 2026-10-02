import { proxyCalendar } from "@/features/calendar/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function PUT(request: Request, { params }: { params: Promise<{ itemId: string }> }) { const { itemId } = await params; return proxyCalendar(request, `/v1/calendar/items/${encodeURIComponent(itemId)}/overrides`); }
