import { proxyCalendar } from "@/features/calendar/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyCalendar(request, "/v1/calendar/imports/preview"); }
