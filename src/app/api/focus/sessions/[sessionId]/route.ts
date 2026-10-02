import { proxyFocus } from "@/features/focus/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyFocus(request, `/v1/focus-sessions/${encodeURIComponent(sessionId)}`);
}
