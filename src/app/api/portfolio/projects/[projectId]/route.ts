import { proxyPortfolio } from "@/features/portfolio/server/fastapi-proxy";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return proxyPortfolio(request, `/v1/portfolio/projects/${encodeURIComponent(projectId)}`); }
export async function PUT(request: Request, { params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return proxyPortfolio(request, `/v1/portfolio/projects/${encodeURIComponent(projectId)}`); }
export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) { const { projectId } = await params; return proxyPortfolio(request, `/v1/portfolio/projects/${encodeURIComponent(projectId)}`); }
