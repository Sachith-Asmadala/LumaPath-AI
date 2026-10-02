import { proxyStudyAssistant } from "@/features/assistant/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  return proxyStudyAssistant(request, `/v1/study-assistant/sessions/${encodeURIComponent(sessionId)}/feedback`);
}
