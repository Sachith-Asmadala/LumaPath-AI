import { proxyFocus } from "@/features/focus/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { return proxyFocus(request, "/v1/focus-sessions/active"); }
