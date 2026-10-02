import { proxyStudyAssistant } from "@/features/assistant/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request) { return proxyStudyAssistant(request, "/v1/study-assistant/respond"); }
