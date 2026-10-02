import { proxyPortfolio } from "@/features/portfolio/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; repositoryId: string }> }) { const { projectId, repositoryId } = await params; return proxyPortfolio(request, `/v1/portfolio/projects/${encodeURIComponent(projectId)}/repositories/${encodeURIComponent(repositoryId)}/revoke`); }
