import { proxyCalendar } from "@/features/calendar/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyCalendar(request, "/v1/calendar/connections"); }
