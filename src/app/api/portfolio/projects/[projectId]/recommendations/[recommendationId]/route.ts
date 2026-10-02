import { proxyPortfolio } from "@/features/portfolio/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; recommendationId: string }> }) { const { projectId, recommendationId } = await params; return proxyPortfolio(request, `/v1/portfolio/projects/${encodeURIComponent(projectId)}/recommendations/${encodeURIComponent(recommendationId)}`); }
